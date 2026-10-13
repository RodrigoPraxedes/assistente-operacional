-- =============================================================================
-- Tarefas + Kanban (tabela única usada por todos os módulos)
-- =============================================================================
-- Cada módulo (check-list, ações recorrentes, chamados, alertas) cria linhas em
-- public.tarefas com um campo "origem". O Kanban é uma tela só, filtrável.
--
-- Status são personalizáveis por empresa, mas cada um tem um "tipo" fixo:
--   aberto | em_andamento | adiado | concluido | cancelado
-- O sistema usa o tipo para saber se a tarefa está atrasada, encerrada etc.
-- Adiar exige nova data e guarda o status anterior para poder "retornar".
-- =============================================================================

create table public.status (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('aberto', 'em_andamento', 'adiado', 'concluido', 'cancelado')),
  cor text not null default '#64748b',
  ordem int not null default 0,
  -- null = vale para todos os módulos; senão só para a origem indicada
  modulo text check (modulo in ('avulsa', 'checklist', 'acao', 'chamado', 'alerta')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.status (empresa_id, ordem);

create table public.tarefas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  setor_id uuid references public.setores (id) on delete set null,
  categoria_id uuid references public.categorias (id) on delete set null,
  titulo text not null,
  descricao text,
  origem text not null default 'avulsa'
    check (origem in ('avulsa', 'checklist', 'acao', 'chamado', 'alerta')),
  -- id do registro de origem (ex.: checklist_modelos.id)
  origem_id uuid,
  -- data/hora da ocorrência gerada pela recorrência (evita duplicar)
  ocorrencia_em timestamptz,
  status_id uuid not null references public.status (id),
  status_anterior_id uuid references public.status (id),
  responsavel_id uuid references public.membros (id) on delete set null,
  criado_por uuid references public.membros (id) on delete set null,
  prazo timestamptz,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.tarefas (empresa_id, status_id);
create index on public.tarefas (empresa_id, unidade_id);
create index on public.tarefas (responsavel_id);
create unique index tarefas_ocorrencia_unica
  on public.tarefas (origem, origem_id, unidade_id, ocorrencia_em)
  nulls not distinct
  where origem_id is not null and ocorrencia_em is not null;

create table public.tarefa_historico (
  id bigint generated always as identity primary key,
  tarefa_id uuid not null references public.tarefas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid references public.membros (id) on delete set null,
  acao text not null,
  status_de uuid references public.status (id) on delete set null,
  status_para uuid references public.status (id) on delete set null,
  prazo_de timestamptz,
  prazo_para timestamptz,
  comentario text,
  created_at timestamptz not null default now()
);
create index on public.tarefa_historico (tarefa_id, created_at);

-- -----------------------------------------------------------------------------
-- Regras de status (antes de gravar)
-- -----------------------------------------------------------------------------
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
    new.concluida_em := coalesce(new.concluida_em, now());
  else
    new.concluida_em := null;
  end if;

  return new;
end;
$$;

create trigger tarefas_regras
  before insert or update on public.tarefas
  for each row execute function public.tg_tarefas_regras();

-- -----------------------------------------------------------------------------
-- Histórico (depois de gravar). Comentário opcional via set_config('app.comentario').
-- -----------------------------------------------------------------------------
create or replace function public.tg_tarefas_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro uuid;
  v_comentario text := nullif(current_setting('app.comentario', true), '');
begin
  select id into v_membro from public.membros
  where empresa_id = new.empresa_id and usuario_id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.tarefa_historico (tarefa_id, empresa_id, membro_id, acao, status_para, prazo_para, comentario)
    values (new.id, new.empresa_id, coalesce(v_membro, new.criado_por), 'criada', new.status_id, new.prazo, v_comentario);
  elsif new.status_id is distinct from old.status_id
     or new.prazo is distinct from old.prazo
     or new.responsavel_id is distinct from old.responsavel_id then
    insert into public.tarefa_historico (
      tarefa_id, empresa_id, membro_id, acao, status_de, status_para, prazo_de, prazo_para, comentario
    ) values (
      new.id, new.empresa_id, v_membro,
      case
        when new.status_id is distinct from old.status_id then 'status'
        when new.prazo is distinct from old.prazo then 'prazo'
        else 'responsavel'
      end,
      old.status_id, new.status_id, old.prazo, new.prazo, v_comentario
    );
  end if;
  return new;
end;
$$;

create trigger tarefas_historico
  after insert or update on public.tarefas
  for each row execute function public.tg_tarefas_historico();

-- -----------------------------------------------------------------------------
-- Mover tarefa (usado pelo Kanban): muda status/prazo com comentário opcional
-- -----------------------------------------------------------------------------
create or replace function public.mover_tarefa(
  p_tarefa uuid,
  p_status uuid,
  p_prazo timestamptz default null,
  p_comentario text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform set_config('app.comentario', coalesce(p_comentario, ''), true);
  update public.tarefas
     set status_id = p_status,
         prazo = coalesce(p_prazo, prazo)
   where id = p_tarefa;
  if not found then
    raise exception 'Tarefa não encontrada ou sem permissão';
  end if;
  perform set_config('app.comentario', '', true);
end;
$$;

-- Retornar uma tarefa adiada ao status em que estava antes
create or replace function public.retornar_tarefa(p_tarefa uuid, p_comentario text default null)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_anterior uuid;
begin
  select status_anterior_id into v_anterior from public.tarefas where id = p_tarefa;
  if v_anterior is null then
    raise exception 'Esta tarefa não tem status anterior para retornar';
  end if;
  perform public.mover_tarefa(p_tarefa, v_anterior, null, p_comentario);
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.status enable row level security;
alter table public.tarefas enable row level security;
alter table public.tarefa_historico enable row level security;

create policy status_select on public.status for select to authenticated
  using (public.eh_membro(empresa_id));
create policy status_write on public.status for all to authenticated
  using (public.tem_permissao(empresa_id, 'config.status'))
  with check (public.tem_permissao(empresa_id, 'config.status'));

create policy tarefas_select on public.tarefas for select to authenticated
  using (public.pode_acessar(empresa_id, 'tarefas.ver', unidade_id, setor_id, responsavel_id, criado_por));
create policy tarefas_insert on public.tarefas for insert to authenticated
  with check (
    public.tem_permissao(empresa_id, 'tarefas.criar')
    and criado_por = public.meu_membro_id(empresa_id)
    and (unidade_id is null or public.tem_acesso_unidade(unidade_id))
  );
create policy tarefas_update on public.tarefas for update to authenticated
  using (public.pode_acessar(empresa_id, 'tarefas.mudar_status', unidade_id, setor_id, responsavel_id, criado_por))
  with check (public.pode_acessar(empresa_id, 'tarefas.mudar_status', unidade_id, setor_id, responsavel_id, criado_por));
create policy tarefas_delete on public.tarefas for delete to authenticated
  using (
    public.tem_permissao(empresa_id, 'tarefas.excluir')
    and public.pode_acessar(empresa_id, 'tarefas.ver', unidade_id, setor_id, responsavel_id, criado_por)
  );

create policy tarefa_historico_select on public.tarefa_historico for select to authenticated
  using (exists (select 1 from public.tarefas t where t.id = tarefa_id));

-- -----------------------------------------------------------------------------
-- Criar empresa: cria unidade inicial, perfis e status padrão, e o dono
-- -----------------------------------------------------------------------------
create or replace function public.criar_empresa(p_nome text, p_unidade text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_usuario public.usuarios;
  v_gerente uuid;
  v_lider uuid;
  v_colab uuid;
begin
  if auth.uid() is null then
    raise exception 'É preciso estar logado';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da empresa';
  end if;
  select * into v_usuario from public.usuarios where id = auth.uid();

  insert into public.empresas (nome, criado_por) values (trim(p_nome), auth.uid())
  returning id into v_empresa;

  insert into public.unidades (empresa_id, nome)
  values (v_empresa, coalesce(nullif(trim(p_unidade), ''), 'Matriz'));

  -- perfis padrão
  insert into public.perfis (empresa_id, nome, descricao)
  values (v_empresa, 'Gerente', 'Acesso completo à empresa') returning id into v_gerente;
  insert into public.perfis (empresa_id, nome, descricao)
  values (v_empresa, 'Líder de setor', 'Acompanha e conclui as tarefas do seu setor') returning id into v_lider;
  insert into public.perfis (empresa_id, nome, descricao)
  values (v_empresa, 'Colaborador', 'Vê e atualiza as próprias tarefas, preenche check-lists') returning id into v_colab;

  insert into public.perfil_permissoes (perfil_id, permissao, escopo)
  select v_gerente, chave, 'empresa' from public.permissoes;

  insert into public.perfil_permissoes (perfil_id, permissao, escopo) values
    (v_lider, 'tarefas.ver', 'setor'),
    (v_lider, 'tarefas.criar', 'empresa'),
    (v_lider, 'tarefas.mudar_status', 'setor'),
    (v_lider, 'tarefas.concluir', 'empresa'),
    (v_lider, 'checklist.executar', 'empresa'),
    (v_lider, 'checklist.ver_execucoes', 'setor');

  insert into public.perfil_permissoes (perfil_id, permissao, escopo) values
    (v_colab, 'tarefas.ver', 'proprias'),
    (v_colab, 'tarefas.mudar_status', 'proprias'),
    (v_colab, 'checklist.executar', 'empresa'),
    (v_colab, 'checklist.ver_execucoes', 'proprias');

  -- status padrão do Kanban
  insert into public.status (empresa_id, nome, tipo, cor, ordem) values
    (v_empresa, 'Solicitado',   'aberto',       '#64748b', 1),
    (v_empresa, 'Em andamento', 'em_andamento', '#2563eb', 2),
    (v_empresa, 'Concluído',    'concluido',    '#16a34a', 3),
    (v_empresa, 'Adiado',       'adiado',       '#d97706', 4),
    (v_empresa, 'Cancelado',    'cancelado',    '#dc2626', 5);

  insert into public.membros (empresa_id, usuario_id, nome, email, telefone, cargo, perfil_id, todas_unidades, dono)
  values (
    v_empresa, auth.uid(),
    coalesce(nullif(v_usuario.nome, ''), 'Dono'),
    v_usuario.email, v_usuario.telefone, 'Proprietário', v_gerente, true, true
  );

  return v_empresa;
end;
$$;

-- Status inicial (primeiro "aberto" na ordem) de uma empresa
create or replace function public.status_inicial(p_empresa uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.status
  where empresa_id = p_empresa and tipo = 'aberto' and ativo
  order by ordem limit 1
$$;
