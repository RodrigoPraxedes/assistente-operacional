-- =============================================================================
-- Rotinas e Funções
-- =============================================================================
-- Funções: orientação de quem responde por uma atividade (Caixa, Cozinheiro,
-- Líder de salão...). Não é a pessoa nem o perfil de acesso: serve para cruzar
-- informações. Opcional nos colaboradores.
--
-- Rotinas: cronograma de referência da operação (atividades-chave em horários
-- fixos, nos dias da semana marcados). Só consulta: não gera tarefas. Quem
-- gera tarefa continua sendo a Ação recorrente.
-- Todos da empresa veem; quem tem rotinas.editar cadastra.
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('config.funcoes', 'Configurações', 'Cadastrar funções da equipe',          false, 12),
  ('rotinas.editar', 'Rotinas',       'Cadastrar e editar as rotinas da operação', false, 26);

-- perfis "Gestor" já existentes (empresas novas recebem tudo pelo criar_empresa)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, k.chave, 'empresa'
from public.perfis p
cross join (values ('config.funcoes'), ('rotinas.editar')) as k (chave)
where p.nome = 'Gestor'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Funções
-- -----------------------------------------------------------------------------
create table public.funcoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index funcoes_nome on public.funcoes (empresa_id, lower(nome));

alter table public.membros add column funcao_id uuid references public.funcoes (id) on delete set null;

-- -----------------------------------------------------------------------------
-- Rotinas
-- -----------------------------------------------------------------------------
create table public.rotinas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  -- instrução e passo a passo (um passo por linha)
  descricao text,
  horario time not null,
  -- dias da semana em que vale: 1 = segunda ... 7 = domingo
  dias smallint[] not null default '{1,2,3,4,5,6,7}'
    check (cardinality(dias) > 0 and dias <@ array[1, 2, 3, 4, 5, 6, 7]::smallint[]),
  setor_id uuid references public.setores (id) on delete set null,
  funcao_id uuid references public.funcoes (id) on delete set null,
  -- null = vale para todas as unidades
  unidade_id uuid references public.unidades (id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.rotinas (empresa_id, horario);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.funcoes enable row level security;
alter table public.rotinas enable row level security;

create policy funcoes_select on public.funcoes for select to authenticated
  using (public.eh_membro(empresa_id));
create policy funcoes_write on public.funcoes for all to authenticated
  using (public.tem_permissao(empresa_id, 'config.funcoes'))
  with check (public.tem_permissao(empresa_id, 'config.funcoes'));

create policy rotinas_select on public.rotinas for select to authenticated
  using (public.eh_membro(empresa_id));
create policy rotinas_write on public.rotinas for all to authenticated
  using (public.tem_permissao(empresa_id, 'rotinas.editar'))
  with check (public.tem_permissao(empresa_id, 'rotinas.editar'));
