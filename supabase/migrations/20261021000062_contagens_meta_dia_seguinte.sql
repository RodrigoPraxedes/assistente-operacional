-- =============================================================================
-- Contagens: "Meta é para o dia seguinte" (por item)
-- =============================================================================
-- Quem prepara com antecedência (ex.: farofa embalada hoje para amanhã) digita
-- no editor a necessidade de cada dia da operação (Dom 450, Sáb 230...). Com a
-- caixinha marcada no item, a contagem de hoje usa a meta de AMANHÃ para
-- calcular a sugestão. A meta usada fica gravada em contagem_valores.meta.
-- Migration idempotente: pode rodar de novo sem erro.
-- =============================================================================

alter table public.contagem_itens add column if not exists meta_dia_seguinte boolean not null default false;

-- Registro: igual ao da migration 61, com a meta do dia seguinte
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
    empresa_id, contagem_id, unidade_id, data_ref, turno, executor_id, executor_nome, canal, observacao
  ) values (
    v_contagem.empresa_id, v_contagem.id, p_unidade, p_data, v_turno, p_executor, v_nome, p_canal,
    nullif(left(trim(coalesce(p_observacao, '')), 1000), '')
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
    if v_contagem.pede_vai_fazer and v_qtd is not null then
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
    end if;

    insert into public.contagem_valores (registro_id, item_id, empresa_id, quantidade, meta, a_fazer, vai_fazer)
    values (v_registro, v_item.id, v_contagem.empresa_id, v_qtd, v_meta, v_sugestao, v_vai);
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
          case when coalesce(v.vai_fazer, v.a_fazer) > 0
            then format(' · %s %s', lower(v_contagem.rotulo_falta), trim_scale(coalesce(v.vai_fazer, v.a_fazer))::text)
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

-- Central pública: o item diz se a meta é a do dia seguinte
create or replace function public.qr_contagem(p_token text, p_contagem uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao, 'turnos', to_jsonb(c.turnos),
    'usa_meta', c.usa_meta, 'rotulo_falta', c.rotulo_falta, 'pede_vai_fazer', c.pede_vai_fazer,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'nome', i.nome, 'unidade_medida', i.unidade_medida, 'metas', to_jsonb(i.metas),
        'meta_dia_seguinte', i.meta_dia_seguinte
      ) order by i.ordem, i.created_at)
      from public.contagem_itens i where i.contagem_id = c.id and i.ativo
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.empresas e on e.id = u.empresa_id and e.situacao = 'ativa'
  join public.contagens c on c.empresa_id = u.empresa_id
  where u.qr_token = p_token and u.ativo
    and c.id = p_contagem and c.ativo and c.publico_qr
    and (c.unidade_id is null or c.unidade_id = u.id)
$$;
