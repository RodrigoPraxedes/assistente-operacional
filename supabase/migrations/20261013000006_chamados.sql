-- =============================================================================
-- Módulo Chamados de manutenção
-- =============================================================================
-- Um chamado É uma tarefa (origem = 'chamado'): usa o mesmo Kanban, status,
-- histórico e permissões de tarefas. A tabela chamados guarda só o que é
-- específico: número, prioridade, equipamento/local, fornecedor e custo.
--
-- Prazo (SLA) calculado pela prioridade, configurável por empresa.
-- Item de check-list respondido "Não" pode abrir chamado automaticamente.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('chamados.abrir',     'Chamados', 'Abrir chamados de manutenção',                      false, 50),
  ('chamados.gerenciar', 'Chamados', 'Definir prioridade, fornecedor e custo; cadastrar equipamentos', false, 51);

insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, 'chamados.abrir', 'empresa' from public.perfis p
where p.nome in ('Gerente', 'Líder de setor', 'Colaborador')
on conflict do nothing;

insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, 'chamados.gerenciar', 'empresa' from public.perfis p where p.nome = 'Gerente'
on conflict do nothing;

-- SLA em horas por prioridade
alter table public.empresas
  add column sla_chamados jsonb not null
  default '{"urgente": 4, "alta": 24, "media": 72, "baixa": 168}'::jsonb;

-- -----------------------------------------------------------------------------
-- Cadastros: equipamentos e fornecedores
-- -----------------------------------------------------------------------------
create table public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  setor_id uuid references public.setores (id) on delete set null,
  nome text not null,
  codigo text, -- patrimônio / número de série
  marca text,
  modelo text,
  observacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.equipamentos (empresa_id);

create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  especialidade text, -- ex.: refrigeração, elétrica
  telefone text,
  email text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.fornecedores (empresa_id);

-- -----------------------------------------------------------------------------
-- Chamados (1:1 com tarefas)
-- -----------------------------------------------------------------------------
create table public.chamados (
  tarefa_id uuid primary key references public.tarefas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  numero bigint generated always as identity,
  prioridade text not null default 'media' check (prioridade in ('baixa', 'media', 'alta', 'urgente')),
  equipamento_id uuid references public.equipamentos (id) on delete set null,
  local text,
  fornecedor_id uuid references public.fornecedores (id) on delete set null,
  custo numeric(12, 2),
  aberto_por_nome text,
  -- quando aberto por um item "Não" de check-list
  execucao_id uuid references public.checklist_execucoes (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.chamados (empresa_id, numero desc);
create index on public.chamados (equipamento_id);

create table public.chamado_fotos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.chamados (tarefa_id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  path text not null,
  membro_id uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = empresa_id::text)
);
create index on public.chamado_fotos (tarefa_id);

-- Comentários valem para qualquer tarefa (chamados usam muito)
create table public.tarefa_comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid references public.membros (id) on delete set null,
  texto text not null check (length(trim(texto)) > 0),
  created_at timestamptz not null default now()
);
create index on public.tarefa_comentarios (tarefa_id, created_at);

-- check-list: item "Não" pode abrir chamado
alter table public.checklist_itens
  add column abre_chamado_se_nao boolean not null default false,
  add column prioridade_chamado text not null default 'media'
    check (prioridade_chamado in ('baixa', 'media', 'alta', 'urgente'));
alter table public.checklist_respostas
  add column chamado_id uuid references public.chamados (tarefa_id) on delete set null;

-- -----------------------------------------------------------------------------
-- Criação de chamado (uso interno): tarefa + chamado na mesma transação
-- -----------------------------------------------------------------------------
create or replace function public._criar_chamado(
  p_empresa uuid,
  p_titulo text,
  p_descricao text,
  p_unidade uuid,
  p_setor uuid,
  p_categoria uuid,
  p_prioridade text,
  p_equipamento uuid,
  p_local text,
  p_responsavel uuid,
  p_fornecedor uuid,
  p_criado_por uuid,
  p_aberto_por_nome text,
  p_execucao uuid,
  p_fotos text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sla jsonb;
  v_horas numeric;
  v_tarefa uuid;
  v_foto text;
begin
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'Descreva o problema';
  end if;
  if p_unidade is not null and not exists (select 1 from public.unidades where id = p_unidade and empresa_id = p_empresa) then
    raise exception 'Unidade inválida';
  end if;
  if p_equipamento is not null and not exists (select 1 from public.equipamentos where id = p_equipamento and empresa_id = p_empresa) then
    raise exception 'Equipamento inválido';
  end if;
  if p_fornecedor is not null and not exists (select 1 from public.fornecedores where id = p_fornecedor and empresa_id = p_empresa) then
    raise exception 'Fornecedor inválido';
  end if;
  if p_responsavel is not null and not exists (select 1 from public.membros where id = p_responsavel and empresa_id = p_empresa) then
    raise exception 'Responsável inválido';
  end if;

  select sla_chamados into v_sla from public.empresas where id = p_empresa;
  v_horas := nullif(v_sla ->> coalesce(p_prioridade, 'media'), '')::numeric;

  perform set_config('app.sistema', 'on', true);
  insert into public.tarefas (
    empresa_id, unidade_id, setor_id, categoria_id, titulo, descricao, origem,
    status_id, responsavel_id, criado_por, prazo
  ) values (
    p_empresa, p_unidade, p_setor, p_categoria, trim(p_titulo), nullif(trim(p_descricao), ''), 'chamado',
    public.status_inicial(p_empresa), p_responsavel, p_criado_por,
    case when v_horas is not null then now() + make_interval(secs => v_horas * 3600) end
  ) returning id into v_tarefa;
  perform set_config('app.sistema', '', true);

  insert into public.chamados (tarefa_id, empresa_id, prioridade, equipamento_id, local, fornecedor_id, aberto_por_nome, execucao_id)
  values (v_tarefa, p_empresa, coalesce(p_prioridade, 'media'), p_equipamento, nullif(trim(p_local), ''), p_fornecedor, p_aberto_por_nome, p_execucao);

  foreach v_foto in array coalesce(p_fotos, '{}') loop
    if split_part(v_foto, '/', 1) <> p_empresa::text then
      raise exception 'Foto inválida';
    end if;
    insert into public.chamado_fotos (tarefa_id, empresa_id, path, membro_id) values (v_tarefa, p_empresa, v_foto, p_criado_por);
  end loop;

  return v_tarefa;
end;
$$;

-- Abrir chamado pelo app
create or replace function public.abrir_chamado(
  p_empresa uuid,
  p_titulo text,
  p_descricao text default null,
  p_unidade uuid default null,
  p_setor uuid default null,
  p_categoria uuid default null,
  p_prioridade text default 'media',
  p_equipamento uuid default null,
  p_local text default null,
  p_responsavel uuid default null,
  p_fornecedor uuid default null,
  p_fotos text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros;
  v_gerencia boolean;
begin
  select * into v_membro from public.membros where id = public.meu_membro_id(p_empresa);
  if v_membro.id is null or not public.tem_permissao(p_empresa, 'chamados.abrir') then
    raise exception 'Você não tem permissão para abrir chamados';
  end if;
  if p_unidade is not null and not public.tem_acesso_unidade(p_unidade) then
    raise exception 'Você não tem acesso a esta unidade';
  end if;
  -- só quem gerencia escolhe responsável e fornecedor na abertura
  v_gerencia := public.tem_permissao(p_empresa, 'chamados.gerenciar');

  return public._criar_chamado(
    p_empresa, p_titulo, p_descricao, p_unidade, p_setor, p_categoria, p_prioridade, p_equipamento, p_local,
    case when v_gerencia then p_responsavel end,
    case when v_gerencia then p_fornecedor end,
    v_membro.id, v_membro.nome, null, p_fotos
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Execução de check-list: agora abre chamado para itens "Não" marcados
-- (mesma função da migration 3, com o bloco de chamado acrescentado)
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
  v_resposta uuid;
  v_chamado uuid;
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
        v_executor.id, v_executor.nome, v_exec,
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

-- -----------------------------------------------------------------------------
-- Empresas novas: perfis padrão Líder e Colaborador também abrem chamados.
-- O dono é o último registro que criar_empresa grava, e só ele cria membro dono.
-- -----------------------------------------------------------------------------
create or replace function public.tg_empresa_nova_chamados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfil_permissoes (perfil_id, permissao, escopo)
  select p.id, 'chamados.abrir', 'empresa' from public.perfis p
  where p.empresa_id = new.empresa_id and p.nome in ('Líder de setor', 'Colaborador')
  on conflict do nothing;
  return new;
end;
$$;

create trigger membros_empresa_nova_chamados
  after insert on public.membros
  for each row when (new.dono)
  execute function public.tg_empresa_nova_chamados();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.equipamentos enable row level security;
alter table public.fornecedores enable row level security;
alter table public.chamados enable row level security;
alter table public.chamado_fotos enable row level security;
alter table public.tarefa_comentarios enable row level security;

create policy equipamentos_select on public.equipamentos for select to authenticated
  using (public.eh_membro(empresa_id));
create policy equipamentos_write on public.equipamentos for all to authenticated
  using (public.tem_permissao(empresa_id, 'chamados.gerenciar'))
  with check (public.tem_permissao(empresa_id, 'chamados.gerenciar'));

create policy fornecedores_select on public.fornecedores for select to authenticated
  using (public.eh_membro(empresa_id));
create policy fornecedores_write on public.fornecedores for all to authenticated
  using (public.tem_permissao(empresa_id, 'chamados.gerenciar'))
  with check (public.tem_permissao(empresa_id, 'chamados.gerenciar'));

-- chamado visível = tarefa visível (a política de tarefas decide)
create policy chamados_select on public.chamados for select to authenticated
  using (exists (select 1 from public.tarefas t where t.id = tarefa_id));
create policy chamados_update on public.chamados for update to authenticated
  using (public.tem_permissao(empresa_id, 'chamados.gerenciar') and exists (select 1 from public.tarefas t where t.id = tarefa_id))
  with check (
    public.tem_permissao(empresa_id, 'chamados.gerenciar')
    and (equipamento_id is null or exists (select 1 from public.equipamentos e where e.id = equipamento_id and e.empresa_id = chamados.empresa_id))
    and (fornecedor_id is null or exists (select 1 from public.fornecedores f where f.id = fornecedor_id and f.empresa_id = chamados.empresa_id))
  );

create policy chamado_fotos_select on public.chamado_fotos for select to authenticated
  using (exists (select 1 from public.tarefas t where t.id = tarefa_id));
create policy chamado_fotos_insert on public.chamado_fotos for insert to authenticated
  with check (
    exists (select 1 from public.tarefas t where t.id = tarefa_id and t.empresa_id = chamado_fotos.empresa_id)
    and membro_id = public.meu_membro_id(empresa_id)
  );

create policy tarefa_comentarios_select on public.tarefa_comentarios for select to authenticated
  using (exists (select 1 from public.tarefas t where t.id = tarefa_id));
create policy tarefa_comentarios_insert on public.tarefa_comentarios for insert to authenticated
  with check (
    exists (select 1 from public.tarefas t where t.id = tarefa_id and t.empresa_id = tarefa_comentarios.empresa_id)
    and membro_id = public.meu_membro_id(empresa_id)
  );

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
grant execute on function
  public.abrir_chamado(uuid, text, text, uuid, uuid, uuid, text, uuid, text, uuid, uuid, text[])
to authenticated;
