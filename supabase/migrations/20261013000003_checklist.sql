-- =============================================================================
-- Módulo Check-list
-- =============================================================================
-- modelo   = o formulário cadastrado (itens, horário preferencial, recorrência)
-- execução = cada vez que alguém preenche (guarda a versão e uma cópia dos itens)
--
-- Dois canais de preenchimento:
--   * app  : colaborador logado
--   * qr   : link público por unidade (QR Code), executor escolhe o nome + PIN
--
-- A recorrência (RRULE, o mesmo formato do Google Agenda) gera tarefas no
-- Kanban com origem = 'checklist'. Ao enviar a execução, a tarefa do dia é
-- concluída automaticamente.
-- =============================================================================

create table public.checklist_modelos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- null = vale para todas as unidades da empresa
  unidade_id uuid references public.unidades (id) on delete cascade,
  setor_id uuid references public.setores (id) on delete set null,
  categoria_id uuid references public.categorias (id) on delete set null,
  responsavel_id uuid references public.membros (id) on delete set null,
  nome text not null,
  descricao text,
  horario_preferencial time not null default '08:00',
  -- minutos depois do horário em que a tarefa passa a contar como atrasada
  tolerancia_minutos int not null default 30 check (tolerancia_minutos >= 0),
  -- regra de recorrência no formato RRULE (sem DTSTART). Ex.: FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR
  recorrencia text not null default 'FREQ=DAILY',
  -- disponível na central pública (QR Code) da unidade
  publico_qr boolean not null default true,
  -- telefone (só números, com DDI) que recebe o resumo pelo WhatsApp
  whatsapp_destino text,
  versao int not null default 1,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, empresa_id)
);
create index on public.checklist_modelos (empresa_id);

create table public.checklist_itens (
  id uuid primary key default gen_random_uuid(),
  modelo_id uuid not null,
  empresa_id uuid not null,
  ordem int not null default 0,
  texto text not null,
  -- sim_nao: Sim / Não / Em processo / N/A
  tipo_resposta text not null default 'sim_nao' check (tipo_resposta in ('sim_nao', 'numero', 'texto')),
  obrigatorio boolean not null default true,
  permite_foto boolean not null default true,
  foto_obrigatoria_se_nao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (modelo_id, empresa_id) references public.checklist_modelos (id, empresa_id) on delete cascade
);
create index on public.checklist_itens (modelo_id, ordem);

create table public.checklist_execucoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  setor_id uuid references public.setores (id) on delete set null,
  modelo_id uuid not null references public.checklist_modelos (id) on delete cascade,
  modelo_versao int not null,
  modelo_nome text not null,
  tarefa_id uuid references public.tarefas (id) on delete set null,
  executor_id uuid references public.membros (id) on delete set null,
  executor_nome text not null,
  canal text not null check (canal in ('app', 'qr')),
  observacao text,
  qtd_nao int not null default 0,
  enviado_em timestamptz not null default now()
);
create index on public.checklist_execucoes (empresa_id, enviado_em desc);
create index on public.checklist_execucoes (modelo_id, enviado_em desc);

create table public.checklist_respostas (
  id uuid primary key default gen_random_uuid(),
  execucao_id uuid not null references public.checklist_execucoes (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  item_id uuid references public.checklist_itens (id) on delete set null,
  ordem int not null,
  item_texto text not null,
  tipo_resposta text not null,
  resposta text check (resposta in ('sim', 'nao', 'em_processo', 'na')),
  valor_numero numeric,
  valor_texto text,
  observacao text,
  foto_path text
);
create index on public.checklist_respostas (execucao_id, ordem);

-- Toda mudança nos itens aumenta a versão do modelo (as execuções antigas
-- guardam a própria cópia dos itens, então editar não bagunça o histórico)
create or replace function public.tg_checklist_itens_versao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.checklist_modelos
     set versao = versao + 1
   where id = coalesce(new.modelo_id, old.modelo_id);
  return null;
end;
$$;

create trigger checklist_itens_versao
  after insert or update or delete on public.checklist_itens
  for each row execute function public.tg_checklist_itens_versao();

-- -----------------------------------------------------------------------------
-- Registro de uma execução (uso interno; chamado pelas funções de envio)
-- p_respostas: [{ "item_id", "resposta", "valor_numero", "valor_texto", "observacao", "foto_path" }]
-- -----------------------------------------------------------------------------
create or replace function public._registrar_execucao(
  p_modelo uuid,
  p_unidade uuid,
  p_executor uuid,
  p_canal text,
  p_respostas jsonb,
  p_observacao text
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
  v_fuso text;
  v_exec uuid;
  v_item record;
  v_resp jsonb;
  v_qtd_nao int := 0;
  v_tarefa uuid;
  v_concluido uuid;
begin
  select * into v_modelo from public.checklist_modelos where id = p_modelo and ativo;
  select * into v_unidade from public.unidades where id = p_unidade and ativo;
  select * into v_executor from public.membros where id = p_executor and ativo;

  if v_modelo.id is null or v_unidade.id is null or v_executor.id is null then
    raise exception 'Check-list, unidade ou executor inválido';
  end if;
  if v_unidade.empresa_id <> v_modelo.empresa_id or v_executor.empresa_id <> v_modelo.empresa_id then
    raise exception 'Dados de empresas diferentes';
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
    v_executor.id, v_executor.nome, p_canal, nullif(trim(p_observacao), '')
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
    );
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
    perform set_config('app.comentario', 'Check-list enviado por ' || v_executor.nome, true);
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

-- Envio pelo app (usuário logado)
create or replace function public.enviar_checklist(
  p_modelo uuid,
  p_unidade uuid,
  p_respostas jsonb,
  p_observacao text default null
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
  select empresa_id into v_empresa from public.checklist_modelos where id = p_modelo;
  v_membro := public.meu_membro_id(v_empresa);
  if v_membro is null or not public.tem_permissao(v_empresa, 'checklist.executar') then
    raise exception 'Você não tem permissão para preencher check-lists';
  end if;
  if not public.tem_acesso_unidade(p_unidade) then
    raise exception 'Você não tem acesso a esta unidade';
  end if;
  return public._registrar_execucao(p_modelo, p_unidade, v_membro, 'app', p_respostas, p_observacao);
end;
$$;

-- -----------------------------------------------------------------------------
-- Canal público (QR Code por unidade)
-- -----------------------------------------------------------------------------

-- Central da unidade: check-lists disponíveis e colaboradores (com PIN)
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
        'horario_preferencial', to_char(cm.horario_preferencial, 'HH24:MI')
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
  where u.qr_token = p_token and u.ativo
$$;

-- Itens de um check-list da central
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
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'texto', i.texto, 'tipo_resposta', i.tipo_resposta,
        'obrigatorio', i.obrigatorio, 'permite_foto', i.permite_foto,
        'foto_obrigatoria_se_nao', i.foto_obrigatoria_se_nao
      ) order by i.ordem, i.created_at)
      from public.checklist_itens i where i.modelo_id = cm.id and i.ativo
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.checklist_modelos cm on cm.empresa_id = u.empresa_id
  where u.qr_token = p_token and u.ativo
    and cm.id = p_modelo and cm.ativo and cm.publico_qr
    and (cm.unidade_id is null or cm.unidade_id = u.id)
$$;

-- Confere o PIN contando tentativas: 5 erros bloqueiam por 15 minutos.
-- Retorna 'ok' | 'invalido' | 'bloqueado'. Não lança erro para não desfazer a contagem.
create or replace function public.qr_validar_pin(p_token text, p_membro uuid, p_pin text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin public.membro_pins;
begin
  select mp.* into v_pin
  from public.membro_pins mp
  join public.membros m on m.id = mp.membro_id and m.ativo
  join public.unidades u on u.empresa_id = m.empresa_id and u.qr_token = p_token and u.ativo
  where mp.membro_id = p_membro
    and (m.todas_unidades or m.dono or exists (
      select 1 from public.membro_unidades mu where mu.membro_id = m.id and mu.unidade_id = u.id
    ));

  if v_pin.membro_id is null then
    return 'invalido';
  end if;
  if v_pin.bloqueado_ate is not null and v_pin.bloqueado_ate > now() then
    return 'bloqueado';
  end if;

  if v_pin.pin_hash = extensions.crypt(coalesce(p_pin, ''), v_pin.pin_hash) then
    update public.membro_pins set tentativas_falhas = 0, bloqueado_ate = null where membro_id = p_membro;
    return 'ok';
  end if;

  update public.membro_pins
     set tentativas_falhas = tentativas_falhas + 1,
         bloqueado_ate = case when tentativas_falhas + 1 >= 5 then now() + interval '15 minutes' end
   where membro_id = p_membro;
  return case when v_pin.tentativas_falhas + 1 >= 5 then 'bloqueado' else 'invalido' end;
end;
$$;

-- Envio pela central pública. Só o servidor (service_role) chama, depois de
-- qr_validar_pin, para que as tentativas de PIN sejam sempre contadas.
create or replace function public.qr_enviar_checklist(
  p_token text,
  p_modelo uuid,
  p_membro uuid,
  p_pin text,
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
  v_pin_hash text;
begin
  select * into v_unidade from public.unidades where qr_token = p_token and ativo;
  if v_unidade.id is null then
    raise exception 'QR Code inválido';
  end if;
  if public.qr_modelo(p_token, p_modelo) is null then
    raise exception 'Check-list indisponível nesta unidade';
  end if;

  select mp.pin_hash into v_pin_hash
  from public.membro_pins mp join public.membros m on m.id = mp.membro_id
  where mp.membro_id = p_membro and m.empresa_id = v_unidade.empresa_id
    and (mp.bloqueado_ate is null or mp.bloqueado_ate <= now());
  if v_pin_hash is null or v_pin_hash <> extensions.crypt(coalesce(p_pin, ''), v_pin_hash) then
    raise exception 'PIN inválido';
  end if;

  return public._registrar_execucao(p_modelo, v_unidade.id, p_membro, 'qr', p_respostas, p_observacao);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.checklist_modelos enable row level security;
alter table public.checklist_itens enable row level security;
alter table public.checklist_execucoes enable row level security;
alter table public.checklist_respostas enable row level security;

create policy checklist_modelos_select on public.checklist_modelos for select to authenticated
  using (public.eh_membro(empresa_id));
create policy checklist_modelos_write on public.checklist_modelos for all to authenticated
  using (public.tem_permissao(empresa_id, 'checklist.editar_modelo'))
  with check (public.tem_permissao(empresa_id, 'checklist.editar_modelo'));

create policy checklist_itens_select on public.checklist_itens for select to authenticated
  using (public.eh_membro(empresa_id));
create policy checklist_itens_write on public.checklist_itens for all to authenticated
  using (public.tem_permissao(empresa_id, 'checklist.editar_modelo'))
  with check (public.tem_permissao(empresa_id, 'checklist.editar_modelo'));

-- execuções só entram pelas funções de envio; leitura conforme escopo
create policy checklist_execucoes_select on public.checklist_execucoes for select to authenticated
  using (public.pode_acessar(empresa_id, 'checklist.ver_execucoes', unidade_id, setor_id, executor_id, executor_id));

create policy checklist_respostas_select on public.checklist_respostas for select to authenticated
  using (exists (select 1 from public.checklist_execucoes e where e.id = execucao_id));
