-- =============================================================================
-- Contagens: "Nova remessa" (complemento no mesmo turno)
-- =============================================================================
-- Ex.: colocou 20 frangos para assar e, depois, mais 10. A pessoa conta de novo
-- no mesmo dia/turno marcando "Nova remessa": só o campo da ação (Assar) é
-- obrigatório e o "Tem" é opcional. O registro fica marcado (remessa) e, na soma
-- por dia, a ação soma todas as remessas. Migration idempotente.
-- =============================================================================

alter table public.contagem_registros add column if not exists remessa boolean not null default false;

-- assinaturas antigas saem (ganham o parâmetro p_remessa)
drop function if exists public.enviar_contagem(uuid, uuid, date, text, jsonb, text);
drop function if exists public.qr_enviar_contagem(text, uuid, text, date, text, jsonb, text);
drop function if exists public._registrar_contagem(uuid, uuid, uuid, text, text, date, text, jsonb, text);

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
          E'*%s ✅*\n%s%s\n%sPor: %s às %s\n\n%s',
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

create or replace function public.enviar_contagem(
  p_contagem uuid,
  p_unidade uuid,
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
  v_empresa uuid;
  v_membro uuid;
begin
  select empresa_id into v_empresa from public.contagens where id = p_contagem;
  v_membro := public.meu_membro_id(v_empresa);
  if v_membro is null then
    raise exception 'Sem acesso a esta contagem';
  end if;
  return public._registrar_contagem(p_contagem, p_unidade, v_membro, null, 'app', p_data, p_turno, p_valores, p_observacao, p_remessa);
end;
$$;

create or replace function public.qr_enviar_contagem(
  p_token text,
  p_contagem uuid,
  p_nome text,
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
  v_unidade public.unidades;
begin
  select * into v_unidade from public.unidades where qr_token = p_token and ativo;
  if v_unidade.id is null then
    raise exception 'QR Code inválido';
  end if;
  if public.qr_contagem(p_token, p_contagem) is null then
    raise exception 'Contagem indisponível nesta unidade';
  end if;
  return public._registrar_contagem(p_contagem, v_unidade.id, null, p_nome, 'qr', p_data, p_turno, p_valores, p_observacao, p_remessa);
end;
$$;

revoke execute on function
  public._registrar_contagem(uuid, uuid, uuid, text, text, date, text, jsonb, text, boolean),
  public.qr_enviar_contagem(text, uuid, text, date, text, jsonb, text, boolean)
from public, anon, authenticated;

grant execute on function
  public._registrar_contagem(uuid, uuid, uuid, text, text, date, text, jsonb, text, boolean),
  public.qr_enviar_contagem(text, uuid, text, date, text, jsonb, text, boolean)
to service_role;

grant execute on function public.enviar_contagem(uuid, uuid, date, text, jsonb, text, boolean) to authenticated;
