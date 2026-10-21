-- =============================================================================
-- Contagens com agenda e WhatsApp (como o check-list)
-- =============================================================================
-- Uma contagem pode ganhar horário (um por turno), tolerância, repetição,
-- responsáveis, lembrete antes e "recebe o resultado". Com a agenda ligada:
--   - vira tarefa no Kanban (origem 'contagem'), uma por horário, gerada pelo
--     mesmo motor de recorrência do check-list;
--   - o responsável recebe o lembrete no WhatsApp X minutos antes;
--   - ao contar, a tarefa do dia/turno é concluída sozinha;
--   - não contada 30 min depois do prazo: cancelada ("Não realizado no tempo");
--   - quem recebe o resultado ganha o resumo da contagem no WhatsApp.
-- Migration idempotente: pode rodar de novo sem erro.
-- =============================================================================

alter table public.contagens
  add column if not exists agendada boolean not null default false,
  -- um horário por turno, na mesma ordem de "turnos" (sem turno: um só)
  add column if not exists horarios time[] not null default '{}',
  add column if not exists recorrencia text not null default 'FREQ=DAILY',
  add column if not exists tolerancia_minutos int not null default 30,
  add column if not exists lembrete_minutos int not null default 30,
  add column if not exists responsaveis uuid[] not null default '{}',
  add column if not exists resultado_membro_id uuid references public.membros (id) on delete set null;

alter table public.contagem_registros
  add column if not exists tarefa_id uuid references public.tarefas (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Origem nova nas tarefas e nas mensagens
-- -----------------------------------------------------------------------------
alter table public.tarefas drop constraint if exists tarefas_origem_check;
alter table public.tarefas add constraint tarefas_origem_check
  check (origem in ('avulsa', 'checklist', 'acao', 'chamado', 'alerta', 'plano', 'contagem'));

alter table public.status drop constraint if exists status_modulo_check;
alter table public.status add constraint status_modulo_check
  check (modulo in ('avulsa', 'checklist', 'acao', 'chamado', 'alerta', 'plano', 'contagem'));

alter table public.whatsapp_mensagens drop constraint if exists whatsapp_mensagens_origem_check;
alter table public.whatsapp_mensagens add constraint whatsapp_mensagens_origem_check
  check (origem in ('manual', 'teste', 'checklist', 'tarefa', 'resumo', 'conclusao', 'boasvindas', 'lembrete', 'prazo', 'contagem'));

-- -----------------------------------------------------------------------------
-- Responsáveis trocados: tarefas abertas de hoje em diante acompanham.
-- Agenda desligada, contagem inativa ou excluída: tarefas futuras ainda
-- abertas somem.
-- -----------------------------------------------------------------------------
create or replace function public.tg_contagem_nas_tarefas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or not (new.ativo and new.agendada) then
    delete from public.tarefas t
     where t.origem = 'contagem'
       and t.origem_id = old.id
       and t.concluida_em is null
       and (tg_op = 'DELETE' or t.ocorrencia_em > now());
    return null;
  end if;
  if new.responsaveis is distinct from old.responsaveis then
    update public.tarefas t
       set responsaveis = new.responsaveis
     where t.origem = 'contagem'
       and t.origem_id = new.id
       and t.concluida_em is null
       and t.responsaveis is distinct from new.responsaveis
       and coalesce(t.prazo, t.ocorrencia_em) >= date_trunc('day', now() - interval '1 day')
       and exists (
         select 1 from public.status s
         where s.id = t.status_id and s.tipo not in ('concluido', 'cancelado')
       );
  end if;
  return null;
end;
$$;

drop trigger if exists contagens_nas_tarefas on public.contagens;
create trigger contagens_nas_tarefas after update or delete on public.contagens
  for each row execute function public.tg_contagem_nas_tarefas();

-- -----------------------------------------------------------------------------
-- Registro: além do que já fazia (migration 59), conclui a tarefa do dia e
-- turno e manda o resultado no WhatsApp.
-- -----------------------------------------------------------------------------
create or replace function public._registrar_contagem(
  p_contagem uuid,
  p_unidade uuid,
  p_executor uuid,
  p_executor_nome text,
  p_canal text,
  p_data date,
  p_turno text,
  p_valores jsonb,
  p_observacao text default null
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
    empresa_id, contagem_id, unidade_id, data_ref, turno, executor_id, executor_nome, canal, observacao
  ) values (
    v_contagem.empresa_id, v_contagem.id, p_unidade, p_data, v_turno, p_executor, v_nome, p_canal,
    nullif(left(trim(coalesce(p_observacao, '')), 1000), '')
  ) returning id into v_registro;

  for v_item in
    select * from public.contagem_itens where contagem_id = v_contagem.id and ativo order by ordem, created_at
  loop
    select nullif(trim(r.value ->> 'quantidade'), '') into v_texto
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

    v_meta := case when v_contagem.usa_meta and v_item.metas is not null then v_item.metas[v_dia] end;

    insert into public.contagem_valores (registro_id, item_id, empresa_id, quantidade, meta, a_fazer)
    values (
      v_registro, v_item.id, v_contagem.empresa_id, v_qtd, v_meta,
      case when v_meta is not null and v_qtd is not null then greatest(v_meta - v_qtd, 0) end
    );
  end loop;

  if v_preenchidos = 0 then
    raise exception 'Preencha pelo menos uma quantidade';
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
          trim_scale(v.quantidade)::text || coalesce(' ' || i.unidade_medida, ''),
          case when v.a_fazer > 0
            then format(' · %s %s', lower(v_contagem.rotulo_falta), trim_scale(v.a_fazer)::text)
            else '' end),
        E'\n' order by i.ordem, i.created_at)
      into v_linhas
      from public.contagem_valores v
      join public.contagem_itens i on i.id = v.item_id
      where v.registro_id = v_registro and v.quantidade is not null;

      perform public.whatsapp_enfileirar_automatica(
        v_contagem.empresa_id, p_unidade, v_contagem.resultado_membro_id,
        left(format(
          E'*Contagem enviada ✅*\n%s%s\n%sPor: %s às %s\n\n%s',
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

-- -----------------------------------------------------------------------------
-- Contagem não feita: cancelada como o check-list (mesma função do relógio)
-- -----------------------------------------------------------------------------
create or replace function public.cancelar_checklists_atrasados()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_total int := 0;
begin
  perform set_config('app.sistema', 'on', true);
  perform set_config('app.comentario', 'Não realizado no tempo', true);
  for r in
    select t.id, c.id as cancelado
    from public.tarefas t
    join public.status s on s.id = t.status_id and s.tipo in ('aberto', 'em_andamento', 'adiado')
    join lateral (
      select c.id from public.status c
      where c.empresa_id = t.empresa_id and c.tipo = 'cancelado' and c.ativo and c.modulo is null
      order by c.ordem limit 1
    ) c on true
    where t.origem in ('checklist', 'contagem')
      and t.prazo < now() - interval '30 minutes'
  loop
    update public.tarefas set status_id = r.cancelado where id = r.id;
    v_total := v_total + 1;
  end loop;
  perform set_config('app.comentario', '', true);
  perform set_config('app.sistema', '', true);
  return v_total;
end;
$$;
revoke execute on function public.cancelar_checklists_atrasados() from public, anon, authenticated;
grant execute on function public.cancelar_checklists_atrasados() to service_role;

-- -----------------------------------------------------------------------------
-- Aviso "Nova tarefa": a tarefa diária da contagem fica de fora, como a do
-- check-list (o responsável recebe o lembrete). Corpo igual ao da migration 43.
-- -----------------------------------------------------------------------------
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
        E'*Nova tarefa para você*\n%s%s%s%s%s%s%s',
        new.titulo,
        case when v_equip is not null then E'\nEquipamento: ' || v_equip else '' end,
        case when new.origem = 'acao' and new.ocorrencia_em is not null
          then E'\nQuando: ' || to_char(new.ocorrencia_em at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when new.prazo is not null
          then E'\nPrazo: ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when v_unidade is not null then E'\nUnidade: ' || v_unidade else '' end,
        case when v_outros is not null then E'\nJunto com: ' || v_outros else '' end,
        case when v_quem_nome is not null then E'\nAtribuída por: ' || v_quem_nome else '' end
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

-- -----------------------------------------------------------------------------
-- Mensagem nova: o resultado da contagem segue a chave "Incluir link" do
-- check-list concluído; o lembrete da contagem mostra o contato de quem recebe
-- o resultado. Corpo igual ao da migration 57.
-- -----------------------------------------------------------------------------
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
          new.texto := left(new.texto || E'\nDúvidas: ' || v_nome || ' · ' || v_tel, 2000);
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
      new.texto || E'\nAo terminar, conclua ' || case when new.com_link then 'pelo link.' else 'no app.' end,
      2000
    );
  end if;
  return new;
end;
$$;
