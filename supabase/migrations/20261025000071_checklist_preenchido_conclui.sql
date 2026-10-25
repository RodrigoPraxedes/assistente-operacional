-- =============================================================================
-- Check-list preenchido por qualquer via sempre conclui a tarefa
-- =============================================================================
-- Causa: o preenchimento só conciliava com tarefa ainda aberta. Se o check-list
-- era enviado depois do relógio cancelá-lo ("Não realizado no tempo", 30 min
-- após o prazo), a tarefa ficava cancelada mesmo com o envio feito.
--   1) _registrar_execucao (link, QR, app) também reaproveita a tarefa cancelada
--      pelo relógio nas últimas 36h e a conclui; escolhe a ocorrência mais
--      próxima do momento do envio (vários horários no mesmo dia).
--   2) cancelar_checklists_atrasados não cancela check-list/contagem que já tem
--      envio para a mesma ocorrência: conclui no lugar.
--   3) Reparo: cancelamentos das últimas 36h que têm envio correspondente voltam
--      a Concluído.
-- Com 2+ responsáveis o envio conclui para todos (quem fizer primeiro vale):
-- a conclusão pelo envio roda como sistema e ignora as "partes".
-- =============================================================================

drop function if exists public._registrar_execucao(uuid, uuid, uuid, text, jsonb, text, text);

create or replace function public._registrar_execucao(
  p_modelo uuid,
  p_unidade uuid,
  p_executor uuid,
  p_canal text,
  p_respostas jsonb,
  p_observacao text,
  p_executor_nome text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_modelo public.checklist_modelos;
  v_unidade public.unidades;
  v_executor public.membros;
  v_executor_nome text;
  v_fuso text;
  v_exec uuid;
  v_item record;
  v_resp jsonb;
  v_qtd_nao int := 0;
  v_tarefa uuid;
  v_concluido uuid;
  v_resposta uuid;
  v_chamado uuid;
begin
  select * into v_modelo from public.checklist_modelos where id = p_modelo and ativo;
  select * into v_unidade from public.unidades where id = p_unidade and ativo;

  if v_modelo.id is null or v_unidade.id is null then
    raise exception 'Check-list ou unidade inválido';
  end if;
  if v_unidade.empresa_id <> v_modelo.empresa_id then
    raise exception 'Dados de empresas diferentes';
  end if;

  if p_executor is not null then
    select * into v_executor from public.membros where id = p_executor and ativo;
    if v_executor.id is null or v_executor.empresa_id <> v_modelo.empresa_id then
      raise exception 'Executor inválido';
    end if;
    v_executor_nome := v_executor.nome;
  else
    -- check-list aberto: só o nome digitado, sem vínculo com cadastro
    v_executor_nome := left(regexp_replace(trim(coalesce(p_executor_nome, '')), '\s+', ' ', 'g'), 80);
    if v_executor_nome = '' then
      raise exception 'Informe o seu nome';
    end if;
  end if;
  if v_modelo.unidade_id is not null and v_modelo.unidade_id <> p_unidade then
    raise exception 'Este check-list não pertence a esta unidade';
  end if;
  if jsonb_typeof(coalesce(p_respostas, '[]'::jsonb)) <> 'array' then
    raise exception 'Respostas em formato inválido';
  end if;

  insert into public.checklist_execucoes (
    empresa_id, unidade_id, setor_id, modelo_id, modelo_versao, modelo_nome,
    executor_id, executor_nome, canal, observacao
  ) values (
    v_modelo.empresa_id, p_unidade, v_modelo.setor_id, v_modelo.id, v_modelo.versao, v_modelo.nome,
    v_executor.id, v_executor_nome, p_canal, nullif(trim(p_observacao), '')
  ) returning id into v_exec;

  for v_item in
    select * from public.checklist_itens
    where modelo_id = v_modelo.id and ativo
    order by ordem, created_at
  loop
    select r.value into v_resp
    from jsonb_array_elements(coalesce(p_respostas, '[]'::jsonb)) as r (value)
    where r.value ->> 'item_id' = v_item.id::text
    limit 1;

    if v_item.tipo_resposta = 'sim_nao' then
      if coalesce(v_resp ->> 'resposta', '') = '' then
        if v_item.obrigatorio then
          raise exception 'Responda o item: %', v_item.texto;
        end if;
      elsif v_resp ->> 'resposta' not in ('sim', 'nao', 'em_processo', 'na') then
        raise exception 'Resposta inválida no item: %', v_item.texto;
      elsif v_resp ->> 'resposta' = 'na' and not v_item.permite_na then
        raise exception 'Este item não aceita N/A: %', v_item.texto;
      end if;
      if v_resp ->> 'resposta' = 'nao' then
        v_qtd_nao := v_qtd_nao + 1;
        if v_item.foto_obrigatoria_se_nao and coalesce(v_resp ->> 'foto_path', '') = '' then
          raise exception 'Foto obrigatória quando a resposta é Não: %', v_item.texto;
        end if;
      end if;
    elsif v_item.tipo_resposta = 'numero' then
      if v_item.obrigatorio and coalesce(v_resp ->> 'valor_numero', '') = '' then
        raise exception 'Informe o valor do item: %', v_item.texto;
      end if;
    elsif v_item.obrigatorio and coalesce(trim(v_resp ->> 'valor_texto'), '') = '' then
      raise exception 'Preencha o item: %', v_item.texto;
    end if;

    if coalesce(v_resp ->> 'foto_path', '') <> ''
       and split_part(v_resp ->> 'foto_path', '/', 1) <> v_modelo.empresa_id::text then
      raise exception 'Foto inválida no item: %', v_item.texto;
    end if;

    insert into public.checklist_respostas (
      execucao_id, empresa_id, item_id, ordem, item_texto, tipo_resposta,
      resposta, valor_numero, valor_texto, observacao, foto_path
    ) values (
      v_exec, v_modelo.empresa_id, v_item.id, v_item.ordem, v_item.texto, v_item.tipo_resposta,
      nullif(v_resp ->> 'resposta', ''),
      nullif(v_resp ->> 'valor_numero', '')::numeric,
      nullif(trim(v_resp ->> 'valor_texto'), ''),
      nullif(trim(v_resp ->> 'observacao'), ''),
      nullif(v_resp ->> 'foto_path', '')
    ) returning id into v_resposta;

    -- item "Não" que abre chamado
    if v_item.tipo_resposta = 'sim_nao' and v_resp ->> 'resposta' = 'nao' and v_item.abre_chamado_se_nao then
      v_chamado := public._criar_chamado(
        v_modelo.empresa_id,
        v_item.texto || ' — Não',
        concat_ws(E'\n',
          'Aberto pelo check-list "' || v_modelo.nome || '" (' || v_unidade.nome || ').',
          nullif(trim(v_resp ->> 'observacao'), '')),
        p_unidade, v_modelo.setor_id, v_modelo.categoria_id, v_item.prioridade_chamado,
        null, null, null, null,
        v_executor.id, v_executor_nome, v_exec,
        case when coalesce(v_resp ->> 'foto_path', '') <> '' then array[v_resp ->> 'foto_path'] else '{}' end
      );
      update public.checklist_respostas set chamado_id = v_chamado where id = v_resposta;
    end if;
  end loop;

  -- Conclui a tarefa do dia (gerada pela recorrência) desta unidade, se houver
  select fuso_horario into v_fuso from public.empresas where id = v_modelo.empresa_id;
  select t.id into v_tarefa
  from public.tarefas t
  join public.status s on s.id = t.status_id
  where t.origem = 'checklist'
    and t.origem_id = v_modelo.id
    and t.unidade_id = p_unidade
    and (
      s.tipo in ('aberto', 'em_andamento', 'adiado')
      -- preenchido depois do relógio ter cancelado ("Não realizado no tempo"): vale como feito
      or (s.tipo = 'cancelado' and t.cancelada_em > now() - interval '36 hours')
    )
    and t.ocorrencia_em > now() - interval '36 hours'
    and (t.ocorrencia_em at time zone v_fuso)::date <= (now() at time zone v_fuso)::date
  order by abs(extract(epoch from (t.ocorrencia_em - now()))), t.ocorrencia_em desc
  limit 1;

  if v_tarefa is not null then
    select id into v_concluido from public.status
    where empresa_id = v_modelo.empresa_id and tipo = 'concluido' and ativo
    order by ordem limit 1;

    perform set_config('app.sistema', 'on', true);
    perform set_config('app.comentario', 'Check-list enviado por ' || v_executor_nome, true);
    update public.tarefas set status_id = v_concluido where id = v_tarefa;
    perform set_config('app.comentario', '', true);
    perform set_config('app.sistema', '', true);
  end if;

  update public.checklist_execucoes
     set qtd_nao = v_qtd_nao, tarefa_id = v_tarefa
   where id = v_exec;

  return v_exec;
end;
$$;

revoke execute on function public._registrar_execucao(uuid, uuid, uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public._registrar_execucao(uuid, uuid, uuid, text, jsonb, text, text) to service_role;

-- -----------------------------------------------------------------------------
-- Relógio: concluir (em vez de cancelar) o que já foi preenchido
-- -----------------------------------------------------------------------------
create or replace function public._concluir_tarefas_preenchidas(p_janela interval)
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
  for r in
    select t.id, k.id as concluido,
           coalesce(x.executor_nome, y.nome) as quem, x.id as execucao, y.id as registro
    from public.tarefas t
    join public.status s on s.id = t.status_id
      and (s.tipo in ('aberto', 'em_andamento', 'adiado') or (s.tipo = 'cancelado' and t.cancelada_em > now() - p_janela))
    join lateral (
      select c.id from public.status c
      where c.empresa_id = t.empresa_id and c.tipo = 'concluido' and c.ativo and c.modulo is null
      order by c.ordem limit 1
    ) k on true
    left join lateral (
      select e.id, e.executor_nome from public.checklist_execucoes e
      where t.origem = 'checklist' and e.modelo_id = t.origem_id and e.unidade_id = t.unidade_id
        and e.enviado_em >= t.ocorrencia_em - interval '1 hour'
        and e.enviado_em <= coalesce(
          (select min(t2.ocorrencia_em) from public.tarefas t2
           where t2.origem = t.origem and t2.origem_id = t.origem_id
             and t2.unidade_id is not distinct from t.unidade_id and t2.ocorrencia_em > t.ocorrencia_em)
            - interval '1 hour',
          t.ocorrencia_em + interval '18 hours')
        and (e.tarefa_id is null or e.tarefa_id = t.id)
      order by e.enviado_em limit 1
    ) x on true
    left join lateral (
      select g.id, g.executor_nome as nome from public.contagem_registros g
      where t.origem = 'contagem' and g.contagem_id = t.origem_id and g.unidade_id is not distinct from t.unidade_id
        and g.tarefa_id = t.id
      limit 1
    ) y on true
    where t.origem in ('checklist', 'contagem')
      and t.prazo < now() - interval '30 minutes'
      and (x.id is not null or y.id is not null)
  loop
    perform set_config('app.comentario', 'Preenchido por ' || coalesce(r.quem, 'colaborador') || ' (reconhecido pelo envio)', true);
    update public.tarefas set status_id = r.concluido where id = r.id;
    if r.execucao is not null then
      update public.checklist_execucoes set tarefa_id = r.id where id = r.execucao;
    end if;
    v_total := v_total + 1;
  end loop;
  perform set_config('app.comentario', '', true);
  perform set_config('app.sistema', '', true);
  return v_total;
end;
$$;
revoke execute on function public._concluir_tarefas_preenchidas(interval) from public, anon, authenticated;
grant execute on function public._concluir_tarefas_preenchidas(interval) to service_role;

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
  -- o que já foi preenchido nunca é cancelado
  perform public._concluir_tarefas_preenchidas(interval '0 minutes');

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

-- Reparo: cancelados nas últimas 36h que tiveram envio
select public._concluir_tarefas_preenchidas(interval '36 hours');
