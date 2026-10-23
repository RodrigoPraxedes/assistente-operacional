-- =============================================================================
-- WhatsApp: textos dos avisos com emojis e negrito
-- =============================================================================
--   - "Dúvidas:" em negrito (tg_whatsapp_mensagem_nova, corpo igual ao da 65);
--   - "Para seu conhecimento" com 💡, campos em negrito e sem "Avisado por" (o
--     contato de dúvidas já diz quem avisou);
--   - "Check-list concluído" com o nome do check-list em negrito;
--   - "Contagem enviada" / "Nova remessa" no mesmo desenho do check-list concluído
--     (corpo igual ao de _registrar_contagem da migration 64);
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

create or replace function public._registrar_contagem(
  p_contagem uuid,
  p_unidade uuid,
  p_executor uuid,
  p_executor_nome text,
  p_canal text,
  p_data date,
  p_turno text,
  p_valores jsonb,
  p_observacao text default null,
  p_remessa boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contagem public.contagens;
  v_unidade public.unidades;
  v_nome text;
  v_fuso text;
  v_hoje date;
  v_dia int;
  v_turno text;
  v_registro uuid;
  v_item record;
  v_texto text;
  v_qtd numeric;
  v_meta numeric;
  v_texto_vai text;
  v_vai numeric;
  v_sugestao numeric;
  v_preenchidos int := 0;
  v_hora time;
  v_tarefa uuid;
  v_concluido uuid;
  v_linhas text;
begin
  select * into v_contagem from public.contagens where id = p_contagem and ativo;
  if v_contagem.id is null then
    raise exception 'Contagem indisponível';
  end if;
  if p_unidade is not null then
    select * into v_unidade from public.unidades where id = p_unidade and ativo;
    if v_unidade.id is null or v_unidade.empresa_id <> v_contagem.empresa_id then
      raise exception 'Unidade inválida';
    end if;
  end if;
  if v_contagem.unidade_id is not null and v_contagem.unidade_id is distinct from p_unidade then
    raise exception 'Esta contagem não pertence a esta unidade';
  end if;

  if p_executor is not null then
    select nome into v_nome from public.membros
    where id = p_executor and empresa_id = v_contagem.empresa_id and ativo;
    if v_nome is null then
      raise exception 'Executor inválido';
    end if;
  else
    v_nome := left(regexp_replace(trim(coalesce(p_executor_nome, '')), '\s+', ' ', 'g'), 80);
    if v_nome = '' then
      raise exception 'Informe o seu nome';
    end if;
  end if;

  select fuso_horario into v_fuso from public.empresas where id = v_contagem.empresa_id;
  v_hoje := (now() at time zone v_fuso)::date;
  if p_data is null or p_data > v_hoje + 1 or p_data < v_hoje - 31 then
    raise exception 'Data da contagem inválida';
  end if;
  v_dia := extract(isodow from p_data)::int;

  v_turno := nullif(trim(coalesce(p_turno, '')), '');
  if cardinality(v_contagem.turnos) > 0 and (v_turno is null or not v_turno = any (v_contagem.turnos)) then
    raise exception 'Escolha o turno';
  end if;
  if cardinality(v_contagem.turnos) = 0 then
    v_turno := null;
  end if;
  if jsonb_typeof(coalesce(p_valores, '[]'::jsonb)) <> 'array' then
    raise exception 'Valores em formato inválido';
  end if;

  insert into public.contagem_registros (
    empresa_id, contagem_id, unidade_id, data_ref, turno, executor_id, executor_nome, canal, observacao, remessa
  ) values (
    v_contagem.empresa_id, v_contagem.id, p_unidade, p_data, v_turno, p_executor, v_nome, p_canal,
    nullif(left(trim(coalesce(p_observacao, '')), 1000), ''), coalesce(p_remessa, false)
  ) returning id into v_registro;

  for v_item in
    select * from public.contagem_itens where contagem_id = v_contagem.id and ativo order by ordem, created_at
  loop
    select nullif(trim(r.value ->> 'quantidade'), ''), nullif(trim(r.value ->> 'vai_fazer'), '') into v_texto, v_texto_vai
    from jsonb_array_elements(coalesce(p_valores, '[]'::jsonb)) as r (value)
    where r.value ->> 'item_id' = v_item.id::text
    limit 1;

    v_qtd := null;
    if v_texto is not null then
      begin
        v_qtd := replace(v_texto, ',', '.')::numeric;
      exception when others then
        raise exception 'Quantidade inválida em: %', v_item.nome;
      end;
      if v_qtd < 0 then
        raise exception 'Quantidade negativa em: %', v_item.nome;
      end if;
      v_preenchidos := v_preenchidos + 1;
    end if;

    -- item que se prepara para o dia seguinte: a meta é a de amanhã
    v_meta := case when v_contagem.usa_meta and v_item.metas is not null
      then v_item.metas[case when v_item.meta_dia_seguinte then extract(isodow from p_data + 1)::int else v_dia end]
    end;
    v_sugestao := case when v_meta is not null and v_qtd is not null then greatest(v_meta - v_qtd, 0) end;

    -- quanto a pessoa vai fazer (embalar, produzir...): em branco = aceita a sugestão
    v_vai := null;
    if v_contagem.pede_vai_fazer and (v_qtd is not null or (p_remessa and v_texto_vai is not null)) then
      if v_texto_vai is not null then
        begin
          v_vai := replace(v_texto_vai, ',', '.')::numeric;
        exception when others then
          raise exception 'Quantidade inválida em: % (%)', v_item.nome, v_contagem.rotulo_falta;
        end;
        if v_vai < 0 then
          raise exception 'Quantidade negativa em: % (%)', v_item.nome, v_contagem.rotulo_falta;
        end if;
      else
        v_vai := v_sugestao;
      end if;
      if v_qtd is null then
        v_preenchidos := v_preenchidos + 1;
      end if;
    end if;

    insert into public.contagem_valores (registro_id, item_id, empresa_id, quantidade, meta, a_fazer, vai_fazer)
    values (v_registro, v_item.id, v_contagem.empresa_id, v_qtd, v_meta, v_sugestao, v_vai);
  end loop;

  if v_preenchidos = 0 then
    raise exception '%', case when p_remessa then 'Informe o que vai fazer em pelo menos um item' else 'Preencha pelo menos uma quantidade' end;
  end if;

  -- Conclui a tarefa da agenda: mesmo dia, mesma unidade e, com turnos, o horário daquele turno
  if v_contagem.agendada then
    v_hora := case
      when v_turno is not null then v_contagem.horarios[array_position(v_contagem.turnos, v_turno)]
      else v_contagem.horarios[1]
    end;
    select t.id into v_tarefa
    from public.tarefas t
    join public.status s on s.id = t.status_id
    where t.origem = 'contagem'
      and t.origem_id = v_contagem.id
      and t.unidade_id is not distinct from p_unidade
      and s.tipo in ('aberto', 'em_andamento', 'adiado')
      and (t.ocorrencia_em at time zone v_fuso)::date = p_data
      and (v_hora is null or (t.ocorrencia_em at time zone v_fuso)::time = v_hora)
    order by t.ocorrencia_em
    limit 1;

    if v_tarefa is not null then
      select id into v_concluido from public.status
      where empresa_id = v_contagem.empresa_id and tipo = 'concluido' and ativo
      order by ordem limit 1;

      perform set_config('app.sistema', 'on', true);
      perform set_config('app.comentario', 'Contagem enviada por ' || v_nome, true);
      update public.tarefas set status_id = v_concluido where id = v_tarefa;
      perform set_config('app.comentario', '', true);
      perform set_config('app.sistema', '', true);
      update public.contagem_registros set tarefa_id = v_tarefa where id = v_registro;
    end if;
  end if;

  -- Resultado no WhatsApp para quem foi escolhido (o aviso nunca impede a contagem)
  if v_contagem.resultado_membro_id is not null then
    begin
      select string_agg(
        format(E'• %s: %s%s',
          i.nome,
          coalesce(trim_scale(v.quantidade)::text || coalesce(' ' || i.unidade_medida, ''), '—'),
          case when coalesce(v.vai_fazer, v.a_fazer) > 0
            then format(' · %s %s', lower(v_contagem.rotulo_falta), trim_scale(coalesce(v.vai_fazer, v.a_fazer))::text)
            else '' end),
        E'\n' order by i.ordem, i.created_at)
      into v_linhas
      from public.contagem_valores v
      join public.contagem_itens i on i.id = v.item_id
      where v.registro_id = v_registro and (v.quantidade is not null or v.vai_fazer is not null);

      perform public.whatsapp_enfileirar_automatica(
        v_contagem.empresa_id, p_unidade, v_contagem.resultado_membro_id,
        left(format(
          E'*%s* ✅\n\n*%s*%s\n%sEnviado por: %s às %s\n\n%s',
          case when p_remessa then 'Nova remessa' else 'Contagem enviada' end,
          v_contagem.nome,
          coalesce(' · ' || v_turno, ''),
          coalesce('Unidade: ' || v_unidade.nome || E'\n', ''),
          v_nome,
          to_char(now() at time zone v_fuso, 'DD/MM HH24:MI'),
          coalesce(v_linhas, '')
        ), 2000),
        'contagem', v_registro,
        'contagem:' || v_registro
      );
    exception
      when others then
        raise warning 'whatsapp_contagem: %', sqlerrm;
    end;
  end if;

  return v_registro;
end;
$$;
