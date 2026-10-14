-- =============================================================================
-- Check-list aberto: quem preenche pelo QR Code digita o próprio nome, sem PIN.
-- Pensado para equipes grandes que não têm cadastro no app.
--   * usuarios: escolhe o nome na lista de colaboradores + PIN (como era)
--   * aberto  : nome digitado livremente; a execução guarda só o nome
-- Os check-lists que já existiam continuam "usuarios"; os novos nascem "aberto".
-- Também: N/A configurável por item e chamado de manutenção aberto pelo QR Code.
-- =============================================================================

alter table public.checklist_modelos
  add column modo_executor text not null default 'usuarios'
    check (modo_executor in ('aberto', 'usuarios'));
alter table public.checklist_modelos alter column modo_executor set default 'aberto';

-- Cada item Sim/Não escolhe se mostra a opção N/A (não se aplica)
alter table public.checklist_itens add column permite_na boolean not null default true;

-- -----------------------------------------------------------------------------
-- Registro da execução aceita executor sem cadastro (p_executor nulo + nome)
-- (mesma função da migration 6, com o executor opcional e o N/A por item)
-- -----------------------------------------------------------------------------
drop function public._registrar_execucao(uuid, uuid, uuid, text, jsonb, text);

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
    and s.tipo in ('aberto', 'em_andamento', 'adiado')
    and (t.ocorrencia_em at time zone v_fuso)::date <= (now() at time zone v_fuso)::date
  order by t.ocorrencia_em desc
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

-- -----------------------------------------------------------------------------
-- Central pública: cada check-list diz se pede nome livre ou nome + PIN
-- (mesmas funções da migration 11, com modo_executor acrescentado)
-- -----------------------------------------------------------------------------
create or replace function public.qr_central(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'unidade', jsonb_build_object('id', u.id, 'nome', u.nome),
    'empresa', jsonb_build_object('id', e.id, 'nome', e.nome),
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cm.id, 'nome', cm.nome, 'descricao', cm.descricao,
        'horario_preferencial', to_char(cm.horario_preferencial, 'HH24:MI'),
        'modo_executor', cm.modo_executor
      ) order by cm.horario_preferencial, cm.nome)
      from public.checklist_modelos cm
      where cm.empresa_id = u.empresa_id and cm.ativo and cm.publico_qr
        and (cm.unidade_id is null or cm.unidade_id = u.id)
    ), '[]'::jsonb),
    'colaboradores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome) order by m.nome)
      from public.membros m
      join public.membro_pins mp on mp.membro_id = m.id
      where m.empresa_id = u.empresa_id and m.ativo
        and (m.todas_unidades or m.dono or exists (
          select 1 from public.membro_unidades mu where mu.membro_id = m.id and mu.unidade_id = u.id
        ))
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.empresas e on e.id = u.empresa_id
  where u.qr_token = p_token and u.ativo and e.situacao = 'ativa'
$$;

create or replace function public.qr_modelo(p_token text, p_modelo uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', cm.id, 'nome', cm.nome, 'descricao', cm.descricao,
    'whatsapp_destino', cm.whatsapp_destino,
    'modo_executor', cm.modo_executor,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'texto', i.texto, 'tipo_resposta', i.tipo_resposta,
        'obrigatorio', i.obrigatorio, 'permite_foto', i.permite_foto,
        'foto_obrigatoria_se_nao', i.foto_obrigatoria_se_nao,
        'permite_na', i.permite_na
      ) order by i.ordem, i.created_at)
      from public.checklist_itens i where i.modelo_id = cm.id and i.ativo
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.empresas e on e.id = u.empresa_id and e.situacao = 'ativa'
  join public.checklist_modelos cm on cm.empresa_id = u.empresa_id
  where u.qr_token = p_token and u.ativo
    and cm.id = p_modelo and cm.ativo and cm.publico_qr
    and (cm.unidade_id is null or cm.unidade_id = u.id)
$$;

-- -----------------------------------------------------------------------------
-- Envio pela central pública de um check-list aberto (nome digitado, sem PIN).
-- Só o servidor (service_role) chama; check-lists "usuarios" continuam exigindo
-- qr_enviar_checklist com PIN.
-- -----------------------------------------------------------------------------
create or replace function public.qr_enviar_checklist_aberto(
  p_token text,
  p_modelo uuid,
  p_nome text,
  p_respostas jsonb,
  p_observacao text default null
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
  if coalesce(public.qr_modelo(p_token, p_modelo) ->> 'modo_executor', '') <> 'aberto' then
    raise exception 'Este check-list pede nome e PIN';
  end if;

  return public._registrar_execucao(p_modelo, v_unidade.id, null, 'qr', p_respostas, p_observacao, p_nome);
end;
$$;

-- -----------------------------------------------------------------------------
-- Chamado de manutenção pela central pública (QR Code), sem login: a pessoa
-- digita o nome, diz o que está com problema e onde. A gestão acompanha em
-- Chamados, como os abertos pelo app.
-- -----------------------------------------------------------------------------
-- Opções do formulário: setores da empresa e equipamentos em uso na unidade
create or replace function public.qr_dados_chamado(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'setores', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) order by s.nome)
      from public.setores s where s.empresa_id = u.empresa_id and s.ativo
    ), '[]'::jsonb),
    'equipamentos', coalesce((
      select jsonb_agg(jsonb_build_object('id', q.id, 'nome', q.nome) order by q.nome)
      from public.equipamentos q
      where q.empresa_id = u.empresa_id and q.ativo
        and (q.unidade_id is null or q.unidade_id = u.id)
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.empresas e on e.id = u.empresa_id
  where u.qr_token = p_token and u.ativo and e.situacao = 'ativa'
$$;

-- Abertura. Só o servidor (service_role) chama, depois de subir as fotos.
create or replace function public.qr_abrir_chamado(
  p_token text,
  p_nome text,
  p_titulo text,
  p_descricao text default null,
  p_setor uuid default null,
  p_equipamento uuid default null,
  p_local text default null,
  p_fotos text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidade public.unidades;
  v_nome text;
begin
  select u.* into v_unidade
  from public.unidades u join public.empresas e on e.id = u.empresa_id
  where u.qr_token = p_token and u.ativo and e.situacao = 'ativa';
  if v_unidade.id is null then
    raise exception 'QR Code inválido';
  end if;

  v_nome := left(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), 80);
  if v_nome = '' then
    raise exception 'Informe o seu nome';
  end if;
  if p_setor is not null and not exists (
    select 1 from public.setores where id = p_setor and empresa_id = v_unidade.empresa_id and ativo
  ) then
    raise exception 'Área inválida';
  end if;
  if p_equipamento is not null and not exists (
    select 1 from public.equipamentos
    where id = p_equipamento and empresa_id = v_unidade.empresa_id and ativo
      and (unidade_id is null or unidade_id = v_unidade.id)
  ) then
    raise exception 'Equipamento inválido';
  end if;

  return public._criar_chamado(
    v_unidade.empresa_id, left(p_titulo, 200), p_descricao, v_unidade.id, p_setor, null, 'media',
    p_equipamento, left(p_local, 120), null, null, null, v_nome, null, coalesce(p_fotos[1:5], '{}')
  );
end;
$$;

grant execute on function public.qr_dados_chamado(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Permissões. O "alter default privileges ... in schema" da migration 4 não tira
-- o execute que o Postgres dá a PUBLIC em toda função nova; então funções
-- internas criadas depois dela ficaram chamáveis pela API. Fecha essas e corta
-- o padrão global, para que as próximas funções nasçam fechadas de verdade.
-- -----------------------------------------------------------------------------
alter default privileges revoke execute on functions from public;

revoke execute on function
  public._registrar_execucao(uuid, uuid, uuid, text, jsonb, text, text),
  public.qr_enviar_checklist_aberto(text, uuid, text, jsonb, text),
  public.qr_abrir_chamado(text, text, text, text, uuid, uuid, text, text[]),
  public._criar_chamado(uuid, text, text, uuid, uuid, uuid, text, uuid, text, uuid, uuid, uuid, text, uuid, text[]),
  public._tipos_servico_padrao(uuid)
from public, anon, authenticated;

grant execute on function
  public._registrar_execucao(uuid, uuid, uuid, text, jsonb, text, text),
  public.qr_enviar_checklist_aberto(text, uuid, text, jsonb, text),
  public.qr_abrir_chamado(text, text, text, text, uuid, uuid, text, text[])
to service_role;
