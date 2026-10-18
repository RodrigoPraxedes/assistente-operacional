-- =============================================================================
-- Admin Master: cadastro direto de usuários e exclusão de empresa pendente
-- =============================================================================
-- * O login (e-mail + senha, já confirmado) é criado no servidor pela API admin
--   do Supabase; estas funções só acham o usuário e o vinculam à empresa.
-- * Empresa "Aguardando aprovação" pode ser rejeitada (excluída com tudo dela).
-- =============================================================================

-- Usuário com login pelo e-mail (null se não existe)
create or replace function public.admin_usuario_por_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  return (select u.id from auth.users u where lower(u.email) = lower(trim(p_email)) limit 1);
end;
$$;

-- Vincula um usuário a uma empresa existente (p_empresa) ou cria uma empresa
-- nova (p_nova_empresa) já ativa, com ele como dono.
-- p_acesso: 'completo' (perfil com mais permissões) ou 'colaborador'.
create or replace function public.admin_vincular_usuario(
  p_usuario uuid,
  p_empresa uuid default null,
  p_nova_empresa text default null,
  p_unidade text default null,
  p_acesso text default 'colaborador'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario public.usuarios;
  v_empresa uuid;
  v_perfil uuid;
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  select * into v_usuario from public.usuarios where id = p_usuario;
  if v_usuario.id is null then
    raise exception 'Usuário não encontrado';
  end if;

  perform set_config('app.sistema', 'on', true);
  -- a senha foi definida pelo Admin Master (ver logins_criados, mais abaixo)
  delete from public.logins_criados where usuario_id = p_usuario;

  if p_empresa is null then
    -- cria como Admin Master (nasce ativa) e passa a posição de dono ao usuário
    v_empresa := public.criar_empresa(p_nova_empresa, p_unidade);
    update public.membros
       set usuario_id = p_usuario,
           nome = coalesce(nullif(v_usuario.nome, ''), 'Dono'),
           email = v_usuario.email,
           telefone = v_usuario.telefone
     where empresa_id = v_empresa and usuario_id = auth.uid() and dono;
    update public.empresas set criado_por = p_usuario where id = v_empresa;
    perform set_config('app.sistema', 'off', true);
    return v_empresa;
  end if;

  if not exists (select 1 from public.empresas where id = p_empresa) then
    raise exception 'Empresa não encontrada';
  end if;
  v_empresa := p_empresa;

  -- já participa: só reativa
  update public.membros set ativo = true
   where empresa_id = v_empresa and usuario_id = p_usuario;
  if found then
    perform set_config('app.sistema', 'off', true);
    return v_empresa;
  end if;

  -- convite pendente com o mesmo e-mail: liga ao login
  update public.membros m
     set usuario_id = p_usuario, ativo = true
   where m.id = (
     select m2.id from public.membros m2
     where m2.empresa_id = v_empresa and m2.usuario_id is null
       and lower(m2.email) = lower(v_usuario.email)
     order by m2.created_at
     limit 1
   );
  if found then
    perform set_config('app.sistema', 'off', true);
    return v_empresa;
  end if;

  if p_acesso = 'completo' then
    select p.id into v_perfil from public.perfis p
    where p.empresa_id = v_empresa
    order by (select count(*) from public.perfil_permissoes pp where pp.perfil_id = p.id) desc, p.created_at
    limit 1;
  else
    select p.id into v_perfil from public.perfis p
    where p.empresa_id = v_empresa and p.nome = 'Colaborador'
    limit 1;
  end if;

  insert into public.membros (empresa_id, usuario_id, nome, email, telefone, cargo, perfil_id, todas_unidades)
  values (
    v_empresa, p_usuario,
    coalesce(nullif(v_usuario.nome, ''), split_part(coalesce(v_usuario.email, ''), '@', 1)),
    v_usuario.email, v_usuario.telefone,
    case when p_acesso = 'completo' then 'Gestor' else null end,
    v_perfil, p_acesso = 'completo'
  );
  perform set_config('app.sistema', 'off', true);
  return v_empresa;
end;
$$;

-- Rejeitar empresa que ainda aguarda aprovação: apaga a empresa e tudo dela.
-- Os logins continuam existindo (a pessoa pode cadastrar outra empresa).
create or replace function public.admin_excluir_empresa_pendente(p_empresa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  if not exists (select 1 from public.empresas where id = p_empresa and situacao = 'pendente') then
    raise exception 'Só dá para excluir empresa que ainda aguarda aprovação';
  end if;
  -- mensagens antes dos contatos (contato_id é "on delete restrict")
  delete from public.whatsapp_mensagens where empresa_id = p_empresa;
  delete from public.empresas where id = p_empresa;
end;
$$;

grant execute on function
  public.admin_usuario_por_email(text),
  public.admin_vincular_usuario(uuid, uuid, text, text, text),
  public.admin_excluir_empresa_pendente(uuid)
to authenticated;

-- =============================================================================
-- Quem cadastra colaboradores (config.membros) cria o login do colaborador com
-- senha, já confirmado. Só para e-mail sem conta em uso: nunca troca a senha de
-- quem já usa o app.
-- =============================================================================

-- Logins criados por uma empresa: quem criou conhece a senha, então esse login
-- não é vinculado sozinho a convites de outras empresas (o Admin Master pode).
-- Sem políticas: só as funções do banco leem e escrevem.
create table public.logins_criados (
  usuario_id uuid primary key references public.usuarios (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.logins_criados enable row level security;

-- Confere se dá para criar o acesso e devolve o e-mail (e o login existente
-- sem uso, se houver: e-mail nunca confirmado e sem empresa)
create or replace function public.acesso_membro_preparar(p_membro uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros;
  v_usuario uuid;
  v_confirmado timestamptz;
begin
  select * into v_membro from public.membros where id = p_membro;
  if v_membro.id is null
     or not public.empresa_liberada(v_membro.empresa_id)
     or not public.tem_permissao(v_membro.empresa_id, 'config.membros') then
    raise exception 'Sem permissão para criar acesso deste colaborador';
  end if;
  if v_membro.usuario_id is not null then
    raise exception 'Este colaborador já tem acesso ao app';
  end if;
  if coalesce(trim(v_membro.email), '') = '' then
    raise exception 'Cadastre o e-mail do colaborador antes de criar o acesso';
  end if;

  select u.id, u.email_confirmed_at into v_usuario, v_confirmado
  from auth.users u where lower(u.email) = lower(trim(v_membro.email))
  limit 1;
  if v_usuario is not null and (
    v_confirmado is not null
    or exists (select 1 from public.membros m where m.usuario_id = v_usuario)
    or exists (select 1 from public.admins_master a where a.usuario_id = v_usuario)
  ) then
    raise exception 'Este e-mail já tem conta no app. A pessoa entra com a senha dela e é vinculada sozinha; se não for, fale com o administrador do sistema.';
  end if;

  return jsonb_build_object('email', lower(trim(v_membro.email)), 'usuario_id', v_usuario, 'nome', v_membro.nome);
end;
$$;

-- Liga o login recém-criado ao colaborador
create or replace function public.acesso_membro_vincular(p_membro uuid, p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros;
begin
  select * into v_membro from public.membros where id = p_membro;
  if v_membro.id is null
     or not public.empresa_liberada(v_membro.empresa_id)
     or not public.tem_permissao(v_membro.empresa_id, 'config.membros') then
    raise exception 'Sem permissão para criar acesso deste colaborador';
  end if;
  if v_membro.usuario_id is not null then
    raise exception 'Este colaborador já tem acesso ao app';
  end if;
  if not exists (
    select 1 from auth.users u where u.id = p_usuario and lower(u.email) = lower(trim(v_membro.email))
  ) then
    raise exception 'O login não corresponde ao e-mail do colaborador';
  end if;
  if exists (select 1 from public.membros m where m.usuario_id = p_usuario) then
    raise exception 'Este login já participa de uma empresa';
  end if;

  update public.membros set usuario_id = p_usuario where id = p_membro;
  insert into public.logins_criados (usuario_id, empresa_id)
  values (p_usuario, v_membro.empresa_id)
  on conflict (usuario_id) do update set empresa_id = excluded.empresa_id, created_at = now();
end;
$$;

-- Admin Master definiu a senha: a empresa que criou o login não a conhece mais
create or replace function public.admin_senha_definida(p_usuario uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.eh_admin_master() then
    raise exception 'Acesso restrito ao Admin Master';
  end if;
  delete from public.logins_criados where usuario_id = p_usuario;
end;
$$;

-- Mesma função da migration 1, mas login criado por uma empresa só é vinculado
-- a convites dessa mesma empresa
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
     )
     and not exists (
       select 1 from public.logins_criados lc
       where lc.usuario_id = auth.uid() and lc.empresa_id <> m.empresa_id
     );
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

grant execute on function
  public.acesso_membro_preparar(uuid),
  public.acesso_membro_vincular(uuid, uuid),
  public.admin_senha_definida(uuid)
to authenticated;
