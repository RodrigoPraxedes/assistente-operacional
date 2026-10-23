-- =============================================================================
-- WhatsApp: textos dos avisos com emojis e negrito
-- =============================================================================
--   - "Dúvidas:" em negrito (tg_whatsapp_mensagem_nova, corpo igual ao da 65);
--   - "Para seu conhecimento" com 💡, campos em negrito e sem "Avisado por" (o
--     contato de dúvidas já diz quem avisou);
--   - "Check-list concluído" com o nome do check-list em negrito;
--   - "Nova tarefa para você" com 📌, linha em branco depois do título e campos em negrito.
-- Os demais avisos (resumo, lembretes, prazo) são montados no código.
-- =============================================================================

create or replace function public.tg_whatsapp_mensagem_nova()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.whatsapp_automacoes%rowtype;
  v_pessoa uuid;
  v_destino uuid;
  v_nome text;
  v_tel text;
begin
  if new.origem not in ('tarefa', 'conclusao', 'checklist', 'lembrete', 'resumo', 'prazo', 'contagem') then
    return new;
  end if;
  select * into a from public.whatsapp_automacoes x where x.empresa_id = new.empresa_id;
  new.com_link := case new.origem
    when 'tarefa' then coalesce(a.link_tarefa, true)
    when 'conclusao' then coalesce(a.link_conclusao, false)
    when 'checklist' then coalesce(a.link_checklist, false)
    when 'contagem' then coalesce(a.link_checklist, false)
    when 'lembrete' then coalesce(a.link_lembrete, true)
    when 'resumo' then coalesce(a.link_resumo, false)
    when 'prazo' then coalesce(a.link_prazo, true)
  end;

  if coalesce(a.contato_duvidas, true) and new.origem_id is not null then
    begin
      if new.origem = 'tarefa' then
        select coalesce(public.meu_membro_id(t.empresa_id), t.criado_por) into v_pessoa
        from public.tarefas t where t.id = new.origem_id;
      elsif new.origem = 'conclusao' then
        select coalesce(public.meu_membro_id(t.empresa_id), t.responsavel_id) into v_pessoa
        from public.tarefas t where t.id = new.origem_id;
      elsif new.origem = 'checklist' then
        select e.executor_id into v_pessoa from public.checklist_execucoes e where e.id = new.origem_id;
      elsif new.origem = 'contagem' then
        select r.executor_id into v_pessoa from public.contagem_registros r where r.id = new.origem_id;
      elsif new.origem = 'lembrete' then
        select coalesce(m.resultado_membro_id, c.resultado_membro_id) into v_pessoa
        from public.tarefas t
        left join public.checklist_modelos m on m.id = t.origem_id and t.origem = 'checklist'
        left join public.contagens c on c.id = t.origem_id and t.origem = 'contagem'
        where t.id = new.origem_id;
      end if;
      select c.membro_id into v_destino from public.whatsapp_contatos c where c.id = new.contato_id;
      if v_pessoa is not null and v_pessoa is distinct from v_destino then
        select m.nome, public.whatsapp_telefone_legivel(m.telefone) into v_nome, v_tel
        from public.membros m where m.id = v_pessoa;
        if v_tel is not null then
          new.texto := left(new.texto || E'\n*Dúvidas:* ' || v_nome || ' · ' || v_tel, 2000);
        end if;
      end if;
    exception
      -- o contato é um extra: nunca impede o aviso
      when others then
        raise warning 'whatsapp_mensagem_nova: %', sqlerrm;
    end;
  end if;

  -- lembrete de concluir só na tarefa atribuída (a de "ciente" tem outra chave)
  if new.origem = 'tarefa' and new.chave like 'tarefa:%' then
    new.texto := left(
      new.texto || E'\n\n*_Quando concluir, sinalize no app como Concluído._*',
      2000
    );
  end if;
  return new;
end;
$$;


create or replace function public.tg_whatsapp_tarefa_ciente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem uuid;
  v_quem_nome text;
  v_fuso text;
  v_unidade text;
  v_novos uuid[];
  v_pessoa uuid;
  v_resp text;
begin
  if cardinality(new.cientes) = 0 or new.privado then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.cientes is not distinct from old.cientes then
    return null;
  end if;
  if tg_op = 'INSERT' and new.origem = 'checklist' then
    return null;
  end if;
  if not exists (select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.aviso_tarefa) then
    return null;
  end if;
  if exists (select 1 from public.status s where s.id = new.status_id and s.tipo in ('concluido', 'cancelado')) then
    return null;
  end if;

  select coalesce(array_agg(x), '{}') into v_novos
  from unnest(new.cientes) as x
  where tg_op = 'INSERT' or not (x = any(old.cientes));

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  select string_agg(split_part(trim(m.nome), ' ', 1), ', ' order by u.pos) into v_resp
  from unnest(new.responsaveis) with ordinality as u (x, pos)
  join public.membros m on m.id = u.x;

  foreach v_pessoa in array v_novos loop
    continue when v_pessoa = v_quem and new.origem <> 'acao';

    perform public.whatsapp_enfileirar_automatica(
      new.empresa_id, new.unidade_id, v_pessoa,
      format(
        E'*Para seu conhecimento* 💡\n\n%s%s%s%s%s',
        new.titulo,
        case when new.origem = 'acao' and new.ocorrencia_em is not null
          then E'\n*Quando:* ' || to_char(new.ocorrencia_em at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when new.prazo is not null
          then E'\n*Prazo:* ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when v_unidade is not null then E'\n*Unidade:* ' || v_unidade else '' end,
        case when v_resp is not null then E'\n*Responsável:* ' || v_resp else '' end
      ),
      'tarefa', new.id,
      'ciente:' || new.id || ':' || v_pessoa
    );
  end loop;
  return null;
exception
  when others then
    raise warning 'whatsapp_tarefa_ciente: %', sqlerrm;
    return null;
end;
$$;

create or replace function public.tg_whatsapp_checklist_enviado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto boolean;
  v_texto text;
  v_fuso text;
  v_unidade text;
  v_membros uuid[];
  v_conexao uuid;
  r record;
begin
  select coalesce(a.checklist_auto, false) into v_auto
  from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  select resultado_membros into v_membros from public.checklist_modelos where id = new.modelo_id;

  v_texto := format(
    E'*Check-list concluído* ✅\n\n*%s*\nUnidade: %s\nEnviado por: %s às %s%s',
    new.modelo_nome,
    coalesce(v_unidade, '-'),
    new.executor_nome,
    to_char(new.enviado_em at time zone v_fuso, 'DD/MM HH24:MI'),
    case when new.qtd_nao > 0 then format(E'\nItens com "Não": %s', new.qtd_nao) else '' end
  );

  -- conexão preferida da unidade (a real vem antes do Ensaio)
  v_conexao := public.whatsapp_conexao_para(new.empresa_id, new.unidade_id);

  for r in
    select distinct on (x.contato_id) x.empresa_id, x.conexao_id, x.contato_id
    from (
      select g.empresa_id,
             case when c.provedor = 'simulacao' then coalesce(v_conexao, g.conexao_id) else g.conexao_id end as conexao_id,
             g.contato_id
      from public.whatsapp_gatilhos g
      join public.whatsapp_conexoes c on c.id = g.conexao_id
      join public.whatsapp_contatos t on t.id = g.contato_id and t.ativo
      where g.modelo_id = new.modelo_id and g.ativo
        and (c.unidade_id is null or c.unidade_id = new.unidade_id)
      union all
      -- quem recebe o resultado (lista do check-list), se tiver WhatsApp autorizado
      select new.empresa_id, v_conexao, (
               select t.id from public.whatsapp_contatos t
               where t.empresa_id = new.empresa_id and t.membro_id = u.membro and t.ativo
               order by t.autorizado_em desc limit 1
             )
      from unnest(coalesce(v_membros, '{}')) as u (membro)
      where v_conexao is not null
    ) x
    join public.whatsapp_conexoes c2 on c2.id = x.conexao_id
    where x.contato_id is not null
    order by x.contato_id, (c2.provedor <> 'simulacao') desc
  loop
    if coalesce(v_auto, false) then
      perform public.whatsapp_enfileirar_contato(
        r.empresa_id, r.conexao_id, r.contato_id, v_texto, 'checklist', new.id,
        'checklist:' || new.id || ':' || r.contato_id
      );
    elsif not exists (
      select 1 from public.whatsapp_mensagens m
      where m.origem = 'checklist' and m.origem_id = new.id and m.contato_id = r.contato_id
    ) then
      insert into public.whatsapp_mensagens (empresa_id, conexao_id, pedido_id, contato_id, texto, origem, origem_id)
      values (r.empresa_id, r.conexao_id, gen_random_uuid(), r.contato_id, v_texto, 'checklist', new.id);
    end if;
  end loop;
  return null;
exception
  -- o aviso nunca pode impedir de enviar o check-list
  when others then
    raise warning 'whatsapp_checklist_enviado: %', sqlerrm;
    return null;
end;
$$;



create or replace function public.tg_whatsapp_tarefa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem uuid;
  v_quem_nome text;
  v_fuso text;
  v_unidade text;
  v_equip text;
  v_novos uuid[];
  v_pessoa uuid;
  v_outros text;
begin
  if cardinality(new.responsaveis) = 0 or new.privado then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.responsaveis is not distinct from old.responsaveis then
    return null;
  end if;
  if tg_op = 'INSERT' and new.origem in ('checklist', 'contagem') then
    return null;
  end if;
  if not exists (select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.aviso_tarefa) then
    return null;
  end if;
  if exists (select 1 from public.status s where s.id = new.status_id and s.tipo in ('concluido', 'cancelado')) then
    return null;
  end if;

  select coalesce(array_agg(x), '{}') into v_novos
  from unnest(new.responsaveis) as x
  where tg_op = 'INSERT' or not (x = any(old.responsaveis));

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  if new.origem = 'chamado' then
    select e.nome into v_equip
    from public.chamados c join public.equipamentos e on e.id = c.equipamento_id
    where c.tarefa_id = new.id;
  end if;

  foreach v_pessoa in array v_novos loop
    continue when v_pessoa = v_quem and new.origem <> 'acao';

    select string_agg(split_part(trim(m.nome), ' ', 1), ', ' order by u.pos) into v_outros
    from unnest(new.responsaveis) with ordinality as u (x, pos)
    join public.membros m on m.id = u.x
    where u.x <> v_pessoa;

    perform public.whatsapp_enfileirar_automatica(
      new.empresa_id, new.unidade_id, v_pessoa,
      format(
        E'*Nova tarefa para você* 📌\n\n%s%s%s%s%s%s%s',
        new.titulo,
        case when v_equip is not null then E'\n*Equipamento:* ' || v_equip else '' end,
        case when new.origem = 'acao' and new.ocorrencia_em is not null
          then E'\n*Quando:* ' || to_char(new.ocorrencia_em at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when new.prazo is not null
          then E'\n*Prazo:* ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when v_unidade is not null then E'\n*Unidade:* ' || v_unidade else '' end,
        case when v_outros is not null then E'\n*Junto com:* ' || v_outros else '' end,
        case when v_quem_nome is not null then E'\n*Atribuída por:* ' || v_quem_nome else '' end
      ),
      'tarefa', new.id,
      'tarefa:' || new.id || ':' || v_pessoa
    );
  end loop;
  return null;
exception
  when others then
    raise warning 'whatsapp_tarefa_atribuida: %', sqlerrm;
    return null;
end;
$$;
