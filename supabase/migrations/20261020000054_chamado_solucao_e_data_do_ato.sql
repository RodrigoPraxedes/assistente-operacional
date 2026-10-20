-- Chamado: descrição da solução e data/hora do ato (registro pode ser retroativo).
alter table public.chamados add column if not exists solucao text;

-- app.quando (definido por mover_tarefa) vale para concluida_em e para o histórico
create or replace function public.tg_tarefas_regras()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo_novo text;
  v_tipo_antigo text;
  v_sistema boolean := current_setting('app.sistema', true) = 'on' or auth.uid() is null;
begin
  select tipo into v_tipo_novo from public.status
  where id = new.status_id and empresa_id = new.empresa_id;
  if v_tipo_novo is null then
    raise exception 'Status inválido para esta empresa';
  end if;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    if new.status_id is distinct from old.status_id then
      select tipo into v_tipo_antigo from public.status where id = old.status_id;

      if v_tipo_novo = 'adiado' then
        if new.prazo is null or new.prazo is not distinct from old.prazo then
          raise exception 'Para adiar é preciso informar uma nova data';
        end if;
        -- guarda o status de onde saiu para poder retornar
        if v_tipo_antigo <> 'adiado' then
          new.status_anterior_id := old.status_id;
        end if;
      elsif v_tipo_antigo = 'adiado' then
        new.status_anterior_id := null;
      end if;
    end if;
  end if;

  if v_tipo_novo = 'concluido' then
    if not v_sistema and (tg_op = 'INSERT' or old.status_id is distinct from new.status_id)
       and not public.tem_permissao(new.empresa_id, 'tarefas.concluir') then
      raise exception 'Você não tem permissão para concluir tarefas';
    end if;
    new.concluida_em := coalesce(new.concluida_em, nullif(current_setting('app.quando', true), '')::timestamptz, now());
  else
    new.concluida_em := null;
  end if;

  return new;
end;
$$;

create or replace function public.tg_tarefas_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro uuid;
  v_comentario text := nullif(current_setting('app.comentario', true), '');
  v_quando timestamptz := coalesce(nullif(current_setting('app.quando', true), '')::timestamptz, now());
begin
  select id into v_membro from public.membros
  where empresa_id = new.empresa_id and usuario_id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.tarefa_historico (tarefa_id, empresa_id, membro_id, acao, status_para, prazo_para, comentario)
    values (new.id, new.empresa_id, coalesce(v_membro, new.criado_por), 'criada', new.status_id, new.prazo, v_comentario);
  elsif new.status_id is distinct from old.status_id
     or new.prazo is distinct from old.prazo
     or new.responsaveis is distinct from old.responsaveis then
    insert into public.tarefa_historico (
      tarefa_id, empresa_id, membro_id, acao, status_de, status_para, prazo_de, prazo_para, comentario, created_at
    ) values (
      new.id, new.empresa_id, v_membro,
      case
        when new.status_id is distinct from old.status_id then 'status'
        when new.prazo is distinct from old.prazo then 'prazo'
        else 'responsavel'
      end,
      old.status_id, new.status_id, old.prazo, new.prazo, v_comentario, v_quando
    );
  end if;
  return new;
end;
$$;

-- mover_tarefa ganha a data/hora do ato (p_quando, opcional, nunca no futuro)
drop function if exists public.mover_tarefa(uuid, uuid, timestamptz, text);
create or replace function public.mover_tarefa(
  p_tarefa uuid,
  p_status uuid,
  p_prazo timestamptz default null,
  p_comentario text default null,
  p_quando timestamptz default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_quando is not null and p_quando > now() + interval '5 minutes' then
    raise exception 'A data do ato não pode estar no futuro';
  end if;
  perform set_config('app.comentario', coalesce(p_comentario, ''), true);
  perform set_config('app.quando', coalesce(p_quando::text, ''), true);
  update public.tarefas
     set status_id = p_status,
         prazo = coalesce(p_prazo, prazo)
   where id = p_tarefa;
  if not found then
    raise exception 'Tarefa não encontrada ou sem permissão';
  end if;
  perform set_config('app.comentario', '', true);
  perform set_config('app.quando', '', true);
end;
$$;
grant execute on function public.mover_tarefa(uuid, uuid, timestamptz, text, timestamptz) to authenticated;

-- Solução e custo gravados junto com a mudança de status por quem pode mudar status
-- (chamados.gerenciar não é exigido; chamar depois de mover_tarefa, que confere o acesso pelo RLS)
create or replace function public.registrar_solucao_chamado(p_tarefa uuid, p_solucao text, p_custo numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.tarefas
  where id = p_tarefa and origem = 'chamado';
  if v_empresa is null or not public.tem_permissao(v_empresa, 'tarefas.mudar_status') then
    raise exception 'Chamado não encontrado ou sem permissão';
  end if;
  update public.chamados
     set solucao = coalesce(nullif(trim(p_solucao), ''), solucao),
         custo = coalesce(p_custo, custo)
   where tarefa_id = p_tarefa;
end;
$$;
grant execute on function public.registrar_solucao_chamado(uuid, text, numeric) to authenticated;
