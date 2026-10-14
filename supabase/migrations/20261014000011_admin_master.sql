-- =============================================================================
-- Admin Master: perfil acima das empresas (dono da plataforma)
-- =============================================================================
-- * Vê todas as empresas e pode entrar em qualquer uma (vira membro com acesso
--   total, marcado como admin_master, e pode sair depois).
-- * Aprova empresas novas: quem não é Admin Master cadastra e a empresa fica
--   "pendente" até ser aprovada.
-- * Suspende e reativa empresas (ex.: mensalidade em atraso). Empresa pendente
--   ou suspensa fica bloqueada para os membros, no app, no QR Code e na agenda.
-- * Define quantas unidades cada empresa pode ter (limite_unidades).
-- * Promove e remove outros Admin Master.
-- =============================================================================

create table public.admins_master (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  criado_por uuid references public.usuarios (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admins_master enable row level security;

create or replace function public.eh_admin_master()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins_master a where a.usuario_id = auth.uid())
$$;

create policy admins_master_select on public.admins_master for select to authenticated
  using (public.eh_admin_master());

-- Primeiro Admin Master: o Rodrigo (pelo e-mail do login)
insert into public.admins_master (usuario_id)
select id from public.usuarios where lower(email) = 'praxedeslousano@gmail.com'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Empresas: situação e limite de unidades
-- -----------------------------------------------------------------------------
alter table public.empresas
  add column situacao text not null default 'pendente'
    check (situacao in ('pendente', 'ativa', 'suspensa')),
  add column motivo_suspensao text,
  add column situacao_em timestamptz not null default now(),
  add column limite_unidades int not null default 1 check (limite_unidades >= 1);

-- as que já existem continuam funcionando, com limite = unidades ativas de hoje
update public.empresas e
   set situacao = 'ativa',
       limite_unidades = greatest(1, (
         select count(*) from public.unidades u where u.empresa_id = e.id and u.ativo
       ));

create or replace function public.empresa_liberada(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.empresas e where e.id = p_empresa and e.situacao = 'ativa')
$$;

-- Empresa nova: ativa se quem criou é Admin Master; senão aguarda aprovação.
-- Situação e limite só mudam pelo Admin Master (nem o dono mexe).
create or replace function public.tg_empresas_situacao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not public.eh_admin_master() then
      new.situacao := 'pendente';
      new.limite_unidades := 1;
      new.motivo_suspensao := null;
    end if;
    new.situacao_em := now();
    return new;
  end if;

  if (new.situacao, new.limite_unidades, new.motivo_suspensao)
       is distinct from (old.situacao, old.limite_unidades, old.motivo_suspensao)
     and not public.eh_admin_master()
     and current_setting('app.sistema', true) is distinct from 'on' then
    raise exception 'Só o Admin Master altera a situação e o limite de unidades da empresa';
  end if;
  if new.situacao is distinct from old.situacao then
    new.situacao_em := now();
  end if;
  return new;
end;
$$;

create trigger empresas_situacao
  before insert or update on public.empresas
  for each row execute function public.tg_empresas_situacao();

-- Unidades ativas não passam do limite contratado (Admin Master pode tudo)
create or replace function public.tg_unidades_limite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite int;
  v_ativas int;
begin
  if not new.ativo or (tg_op = 'UPDATE' and old.ativo) or public.eh_admin_master() then
    return new;
  end if;
  select limite_unidades into v_limite from public.empresas where id = new.empresa_id;
  select count(*) into v_ativas from public.unidades
   where empresa_id = new.empresa_id and ativo and id <> new.id;
  if v_ativas >= v_limite then
    raise exception 'Limite de % unidade(s) atingido. Para liberar mais, fale com o administrador do sistema.', v_limite;
  end if;
  return new;
end;
$$;

create trigger unidades_limite
  before insert or update on public.unidades
  for each row execute function public.tg_unidades_limite();

-- -----------------------------------------------------------------------------
-- Membro Admin Master: acesso total quando entra numa empresa
-- -----------------------------------------------------------------------------
alter table public.membros add column admin_master boolean not null default false;

create or replace function public.tg_membros_protege_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.admin_master is distinct from (case when tg_op = 'INSERT' then false else old.admin_master end)
     and current_setting('app.sistema', true) is distinct from 'on' then
    raise exception 'O campo admin_master não pode ser alterado por aqui';
  end if;
  return new;
end;
$$;

create trigger membros_protege_admin
  before insert or update on public.membros
  for each row execute function public.tg_membros_protege_admin();

-- -----------------------------------------------------------------------------
-- Funções de acesso: empresa precisa estar ativa (Admin Master entra mesmo
-- suspensa, para resolver). Admin Master membro tem todas as permissões.
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
    and (public.empresa_liberada(p_empresa) or public.eh_admin_master())
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
  ) and (public.empresa_liberada(p_empresa) or public.eh_admin_master())
$$;

create or replace function public.escopo_permissao(p_empresa uuid, p_chave text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when m.dono or m.admin_master then 'empresa'
    else (
      select pp.escopo from public.perfil_permissoes pp
      where pp.perfil_id = m.perfil_id and pp.permissao = p_chave
    )
  end
  from public.membros m
  where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and m.ativo
    and (public.empresa_liberada(p_empresa) or public.eh_admin_master())
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
      and (public.empresa_liberada(u.empresa_id) or public.eh_admin_master())
      and (
        m.todas_unidades or m.dono or m.admin_master
        or exists (
          select 1 from public.membro_unidades mu
          where mu.membro_id = m.id and mu.unidade_id = u.id
        )
      )
  )
$$;

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
  if not (public.empresa_liberada(p_empresa) or public.eh_admin_master()) then
    return false;
  end if;

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

-- Central pública do QR: some quando a empresa não está ativa
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
  join public.empresas e on e.id = u.empresa_id and e.situacao = 'ativa'
  join public.checklist_modelos cm on cm.empresa_id = u.empresa_id
  where u.qr_token = p_token and u.ativo
    and cm.id = p_modelo and cm.ativo and cm.publico_qr
    and (cm.unidade_id is null or cm.unidade_id = u.id)
$$;

-- -----------------------------------------------------------------------------
-- Telas do usuário: minhas empresas com a situação (para avisar suspensão)
-- -----------------------------------------------------------------------------
create or replace function public.minhas_empresas()
returns table (id uuid, nome text, cargo text, situacao text, motivo_suspensao text)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.nome, m.cargo, e.situacao, e.motivo_suspensao
  from public.membros m
  join public.empresas e on e.id = m.empresa_id
  where m.usuario_id = auth.uid() and m.ativo
  order by e.nome
$$;

-- -----------------------------------------------------------------------------
-- Painel do Admin Master
-- -----------------------------------------------------------------------------
create or replace function public.admin_empresas()
returns table (
  id uuid,
  nome text,
  situacao text,
  motivo_suspensao text,
  situacao_em timestamptz,
  limite_unidades int,
  unidades_ativas int,
  membros_ativos int,
  dono_nome text,
  dono_email text,
  sou_membro boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  return query
  select e.id, e.nome, e.situacao, e.motivo_suspensao, e.situacao_em, e.limite_unidades,
    (select count(*)::int from public.unidades u where u.empresa_id = e.id and u.ativo),
    (select count(*)::int from public.membros m where m.empresa_id = e.id and m.ativo and not m.admin_master),
    d.nome, d.email,
    exists (select 1 from public.membros m where m.empresa_id = e.id and m.usuario_id = auth.uid() and m.ativo),
    e.created_at
  from public.empresas e
  left join lateral (
    select m.nome, coalesce(m.email, us.email) as email
    from public.membros m left join public.usuarios us on us.id = m.usuario_id
    where m.empresa_id = e.id and m.dono
    limit 1
  ) d on true
  order by case e.situacao when 'pendente' then 0 when 'suspensa' then 1 else 2 end, e.nome;
end;
$$;

create or replace function public.admin_definir_situacao(p_empresa uuid, p_situacao text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  if p_situacao not in ('ativa', 'suspensa') then
    raise exception 'Situação inválida';
  end if;
  update public.empresas
     set situacao = p_situacao,
         motivo_suspensao = case when p_situacao = 'suspensa' then nullif(trim(p_motivo), '') end
   where id = p_empresa;
end;
$$;

create or replace function public.admin_definir_limite(p_empresa uuid, p_limite int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ativas int;
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  select count(*) into v_ativas from public.unidades where empresa_id = p_empresa and ativo;
  if p_limite is null or p_limite < greatest(1, v_ativas) then
    raise exception 'O limite não pode ser menor que as % unidade(s) ativas da empresa', v_ativas;
  end if;
  update public.empresas set limite_unidades = p_limite where id = p_empresa;
end;
$$;

-- Entrar numa empresa: vira membro com acesso total (aparece como Admin Master)
create or replace function public.admin_entrar_empresa(p_empresa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_gerente uuid;
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  select * into v_usuario from public.usuarios where id = auth.uid();
  select id into v_gerente from public.perfis where empresa_id = p_empresa and nome = 'Gerente';

  perform set_config('app.sistema', 'on', true);
  update public.membros
     set ativo = true,
         admin_master = not dono,
         todas_unidades = true
   where empresa_id = p_empresa and usuario_id = auth.uid();
  if not found then
    insert into public.membros (empresa_id, usuario_id, nome, email, cargo, perfil_id, todas_unidades, admin_master)
    values (
      p_empresa, auth.uid(), coalesce(nullif(v_usuario.nome, ''), 'Admin Master'),
      v_usuario.email, 'Admin Master', v_gerente, true, true
    );
  end if;
  perform set_config('app.sistema', 'off', true);
end;
$$;

-- Sair de uma empresa em que entrou como Admin Master (dono não sai)
create or replace function public.admin_sair_empresa(p_empresa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  update public.membros set ativo = false
   where empresa_id = p_empresa and usuario_id = auth.uid() and admin_master and not dono;
end;
$$;

create or replace function public.admin_listar()
returns table (usuario_id uuid, nome text, email text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  return query
  select a.usuario_id, u.nome, u.email, a.created_at
  from public.admins_master a join public.usuarios u on u.id = a.usuario_id
  order by u.nome;
end;
$$;

create or replace function public.admin_promover(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  select id into v_usuario from public.usuarios where lower(email) = lower(trim(p_email));
  if v_usuario is null then
    raise exception 'Nenhum login com esse e-mail. A pessoa precisa criar a conta no app primeiro.';
  end if;
  insert into public.admins_master (usuario_id, criado_por) values (v_usuario, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.admin_remover(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  if p_usuario = auth.uid() then
    raise exception 'Você não pode remover a si mesmo';
  end if;
  delete from public.admins_master where usuario_id = p_usuario;
end;
$$;

grant execute on function
  public.eh_admin_master(),
  public.empresa_liberada(uuid),
  public.minhas_empresas(),
  public.admin_empresas(),
  public.admin_definir_situacao(uuid, text, text),
  public.admin_definir_limite(uuid, int),
  public.admin_entrar_empresa(uuid),
  public.admin_sair_empresa(uuid),
  public.admin_listar(),
  public.admin_promover(text),
  public.admin_remover(uuid)
to authenticated;
