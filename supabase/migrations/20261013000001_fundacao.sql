-- =============================================================================
-- Fundação: usuários, empresas, unidades, setores, membros, perfis e permissões
-- =============================================================================
-- Modelo multi-tenant: toda tabela de negócio carrega empresa_id e as políticas
-- RLS checam se o usuário logado é membro ativo daquela empresa.
--
-- Hierarquia: Empresa > Unidade > Setor
--   * Unidade = loja/filial (ex.: Mercado Souza - Bangu). Empresa única = 1 unidade.
--   * Setor   = área de trabalho (Cozinha, Salão...). É da empresa e vale para
--               todas as unidades; o registro (tarefa, check-list) leva unidade E setor.
--
-- Um mesmo login pode ser membro de várias empresas (tabela membros). Um membro
-- também pode existir sem login (colaborador geral que só usa o QR Code + PIN).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- Usuários (dados pessoais de quem tem login), 1:1 com auth.users
-- -----------------------------------------------------------------------------
create table public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  email text,
  telefone text,
  created_at timestamptz not null default now()
);

create or replace function public.tg_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.usuarios (id, nome, email, telefone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(coalesce(new.email, ''), '@', 1)),
    new.email,
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_novo_usuario();

-- -----------------------------------------------------------------------------
-- Empresas, unidades, setores
-- -----------------------------------------------------------------------------
create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  fuso_horario text not null default 'America/Sao_Paulo',
  criado_por uuid references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.unidades (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  endereco text,
  -- token do QR Code público da central de check-lists desta unidade
  qr_token text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.unidades (empresa_id);

create table public.setores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  cor text not null default '#64748b',
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

-- -----------------------------------------------------------------------------
-- Permissões: catálogo fixo (módulo × ação). Perfil = caixinhas marcadas.
-- Escopo (quando a permissão usa escopo): proprias < setor < unidade < empresa
-- -----------------------------------------------------------------------------
create table public.permissoes (
  chave text primary key,
  modulo text not null,
  descricao text not null,
  usa_escopo boolean not null default false,
  ordem int not null default 0
);

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('config.empresa',          'Configurações', 'Editar dados da empresa e unidades',         false, 10),
  ('config.setores',          'Configurações', 'Cadastrar setores e categorias',             false, 11),
  ('config.membros',          'Configurações', 'Cadastrar e editar colaboradores',           false, 12),
  ('config.perfis',           'Configurações', 'Criar e editar perfis de acesso',            false, 13),
  ('config.status',           'Configurações', 'Personalizar status do Kanban',              false, 14),
  ('tarefas.ver',             'Tarefas',       'Ver tarefas',                                true,  20),
  ('tarefas.criar',           'Tarefas',       'Criar/solicitar tarefas',                    false, 21),
  ('tarefas.mudar_status',    'Tarefas',       'Mover tarefas no Kanban',                    true,  22),
  ('tarefas.concluir',        'Tarefas',       'Marcar tarefas como concluídas',             false, 23),
  ('tarefas.excluir',         'Tarefas',       'Excluir tarefas',                            false, 24),
  ('checklist.executar',      'Check-list',    'Preencher check-lists',                      false, 30),
  ('checklist.ver_execucoes', 'Check-list',    'Ver check-lists preenchidos',                true,  31),
  ('checklist.editar_modelo', 'Check-list',    'Criar e editar modelos de check-list',       false, 32);

create table public.perfis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null,
  descricao text,
  created_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table public.perfil_permissoes (
  perfil_id uuid not null references public.perfis (id) on delete cascade,
  permissao text not null references public.permissoes (chave) on delete cascade,
  escopo text not null default 'empresa'
    check (escopo in ('proprias', 'setor', 'unidade', 'empresa')),
  primary key (perfil_id, permissao)
);

-- -----------------------------------------------------------------------------
-- Membros: vínculo pessoa ↔ empresa (cargo, perfil e setor ficam aqui)
-- -----------------------------------------------------------------------------
create table public.membros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  usuario_id uuid references public.usuarios (id) on delete set null,
  nome text not null,
  cargo text,
  telefone text,
  email text,
  perfil_id uuid references public.perfis (id) on delete set null,
  setor_id uuid references public.setores (id) on delete set null,
  -- true = acesso a todas as unidades (atuais e futuras)
  todas_unidades boolean not null default false,
  -- dono tem todas as permissões, sempre (evita a empresa ficar sem acesso)
  dono boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (empresa_id, usuario_id)
);
create index on public.membros (usuario_id);
create index on public.membros (empresa_id);
create index on public.membros (lower(email));

create table public.membro_unidades (
  membro_id uuid not null references public.membros (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  primary key (membro_id, unidade_id)
);

-- PIN de 4 dígitos usado no QR Code. Tabela sem políticas: só funções do
-- servidor (security definer) leem ou escrevem.
create table public.membro_pins (
  membro_id uuid primary key references public.membros (id) on delete cascade,
  pin_hash text not null,
  tentativas_falhas int not null default 0,
  bloqueado_ate timestamptz,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Funções auxiliares de permissão (usadas pelas políticas RLS)
-- -----------------------------------------------------------------------------
create or replace function public.meu_membro_id(p_empresa uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.membros m
  where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and m.ativo
$$;

create or replace function public.eh_membro(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membros m
    where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and m.ativo
  )
$$;

-- Retorna o escopo da permissão para o usuário logado, ou null se não tiver.
create or replace function public.escopo_permissao(p_empresa uuid, p_chave text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.dono then 'empresa'
    else (
      select pp.escopo from public.perfil_permissoes pp
      where pp.perfil_id = m.perfil_id and pp.permissao = p_chave
    )
  end
  from public.membros m
  where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and m.ativo
$$;

create or replace function public.tem_permissao(p_empresa uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.escopo_permissao(p_empresa, p_chave) is not null, false)
$$;

create or replace function public.tem_acesso_unidade(p_unidade uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.unidades u
    join public.membros m on m.empresa_id = u.empresa_id
    where u.id = p_unidade
      and m.usuario_id = auth.uid()
      and m.ativo
      and (
        m.todas_unidades or m.dono
        or exists (
          select 1 from public.membro_unidades mu
          where mu.membro_id = m.id and mu.unidade_id = u.id
        )
      )
  )
$$;

-- Decide se o usuário logado alcança um registro com base no escopo da permissão.
create or replace function public.pode_acessar(
  p_empresa uuid,
  p_chave text,
  p_unidade uuid,
  p_setor uuid,
  p_responsavel uuid,
  p_criado_por uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_escopo text;
  v_membro public.membros;
begin
  select * into v_membro from public.membros m
  where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and m.ativo;
  if v_membro.id is null then
    return false;
  end if;

  -- o que é meu (sou responsável ou criei) sempre posso alcançar se tenho a permissão
  v_escopo := public.escopo_permissao(p_empresa, p_chave);
  if v_escopo is null then
    return false;
  end if;
  if v_membro.id in (p_responsavel, p_criado_por) then
    return true;
  end if;

  return case v_escopo
    when 'empresa' then true
    when 'unidade' then p_unidade is not null and public.tem_acesso_unidade(p_unidade)
    when 'setor' then p_setor is not null and p_setor = v_membro.setor_id
      and (p_unidade is null or public.tem_acesso_unidade(p_unidade))
    else false
  end;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.empresas enable row level security;
alter table public.unidades enable row level security;
alter table public.setores enable row level security;
alter table public.categorias enable row level security;
alter table public.permissoes enable row level security;
alter table public.perfis enable row level security;
alter table public.perfil_permissoes enable row level security;
alter table public.membros enable row level security;
alter table public.membro_unidades enable row level security;
alter table public.membro_pins enable row level security;

-- usuarios: vejo a mim e quem trabalha comigo em alguma empresa
create policy usuarios_select on public.usuarios for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.membros m
      where m.usuario_id = usuarios.id and public.eh_membro(m.empresa_id)
    )
  );
create policy usuarios_update on public.usuarios for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- empresas (criação só pela função criar_empresa)
create policy empresas_select on public.empresas for select to authenticated
  using (public.eh_membro(id));
create policy empresas_update on public.empresas for update to authenticated
  using (public.tem_permissao(id, 'config.empresa'))
  with check (public.tem_permissao(id, 'config.empresa'));

-- unidades
create policy unidades_select on public.unidades for select to authenticated
  using (public.eh_membro(empresa_id));
create policy unidades_write on public.unidades for all to authenticated
  using (public.tem_permissao(empresa_id, 'config.empresa'))
  with check (public.tem_permissao(empresa_id, 'config.empresa'));

-- setores e categorias
create policy setores_select on public.setores for select to authenticated
  using (public.eh_membro(empresa_id));
create policy setores_write on public.setores for all to authenticated
  using (public.tem_permissao(empresa_id, 'config.setores'))
  with check (public.tem_permissao(empresa_id, 'config.setores'));

create policy categorias_select on public.categorias for select to authenticated
  using (public.eh_membro(empresa_id));
create policy categorias_write on public.categorias for all to authenticated
  using (public.tem_permissao(empresa_id, 'config.setores'))
  with check (public.tem_permissao(empresa_id, 'config.setores'));

-- catálogo de permissões: leitura para todos logados
create policy permissoes_select on public.permissoes for select to authenticated using (true);

-- perfis
create policy perfis_select on public.perfis for select to authenticated
  using (public.eh_membro(empresa_id));
create policy perfis_write on public.perfis for all to authenticated
  using (public.tem_permissao(empresa_id, 'config.perfis'))
  with check (public.tem_permissao(empresa_id, 'config.perfis'));

create policy perfil_permissoes_select on public.perfil_permissoes for select to authenticated
  using (exists (
    select 1 from public.perfis p where p.id = perfil_id and public.eh_membro(p.empresa_id)
  ));
create policy perfil_permissoes_write on public.perfil_permissoes for all to authenticated
  using (exists (
    select 1 from public.perfis p
    where p.id = perfil_id and public.tem_permissao(p.empresa_id, 'config.perfis')
  ))
  with check (exists (
    select 1 from public.perfis p
    where p.id = perfil_id and public.tem_permissao(p.empresa_id, 'config.perfis')
  ));

-- membros: todos da empresa veem a lista; editar exige config.membros
create policy membros_select on public.membros for select to authenticated
  using (public.eh_membro(empresa_id));
create policy membros_insert on public.membros for insert to authenticated
  with check (public.tem_permissao(empresa_id, 'config.membros') and not dono);
create policy membros_update on public.membros for update to authenticated
  using (public.tem_permissao(empresa_id, 'config.membros'))
  with check (public.tem_permissao(empresa_id, 'config.membros'));
create policy membros_delete on public.membros for delete to authenticated
  using (public.tem_permissao(empresa_id, 'config.membros') and not dono);

create policy membro_unidades_select on public.membro_unidades for select to authenticated
  using (exists (
    select 1 from public.membros m where m.id = membro_id and public.eh_membro(m.empresa_id)
  ));
create policy membro_unidades_write on public.membro_unidades for all to authenticated
  using (exists (
    select 1 from public.membros m
    where m.id = membro_id and public.tem_permissao(m.empresa_id, 'config.membros')
  ))
  with check (exists (
    select 1 from public.membros m
    join public.unidades u on u.id = unidade_id and u.empresa_id = m.empresa_id
    where m.id = membro_id and public.tem_permissao(m.empresa_id, 'config.membros')
  ));

-- Impede que alguém tire o próprio "dono" ou promova outro a dono pela API.
create or replace function public.tg_membros_protege_dono()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.dono is distinct from old.dono and current_setting('app.sistema', true) is distinct from 'on' then
    raise exception 'O campo dono não pode ser alterado por aqui';
  end if;
  if old.dono and (not new.ativo) then
    raise exception 'O dono da empresa não pode ser inativado';
  end if;
  return new;
end;
$$;

create trigger membros_protege_dono
  before update on public.membros
  for each row execute function public.tg_membros_protege_dono();

-- -----------------------------------------------------------------------------
-- Definir PIN de um membro (quem tem config.membros, ou o próprio membro)
-- -----------------------------------------------------------------------------
create or replace function public.definir_pin(p_membro uuid, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros;
begin
  select * into v_membro from public.membros where id = p_membro;
  if v_membro.id is null then
    raise exception 'Membro não encontrado';
  end if;
  if not (
    public.tem_permissao(v_membro.empresa_id, 'config.membros')
    or v_membro.usuario_id = auth.uid()
  ) then
    raise exception 'Sem permissão para definir o PIN';
  end if;
  if p_pin !~ '^\d{4}$' then
    raise exception 'O PIN deve ter 4 dígitos';
  end if;

  insert into public.membro_pins (membro_id, pin_hash)
  values (p_membro, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict (membro_id) do update
    set pin_hash = excluded.pin_hash, tentativas_falhas = 0, bloqueado_ate = null, updated_at = now();
end;
$$;

-- Lista quais membros já têm PIN (sem expor o hash)
create or replace function public.membros_com_pin(p_empresa uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select mp.membro_id from public.membro_pins mp
  join public.membros m on m.id = mp.membro_id
  where m.empresa_id = p_empresa and public.eh_membro(p_empresa)
$$;

-- -----------------------------------------------------------------------------
-- Convites: um membro cadastrado com e-mail é vinculado ao login de mesmo
-- e-mail quando a pessoa entra no app. (Exige confirmação de e-mail ligada.)
-- -----------------------------------------------------------------------------
create or replace function public.vincular_convites()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_qtd int;
begin
  select u.email into v_email from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then
    return 0;
  end if;

  update public.membros m
     set usuario_id = auth.uid()
   where m.usuario_id is null
     and lower(m.email) = lower(v_email)
     and not exists (
       select 1 from public.membros m2
       where m2.empresa_id = m.empresa_id and m2.usuario_id = auth.uid()
     );
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;
