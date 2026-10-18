-- =============================================================================
-- Trocar o e-mail de login
-- * Quem cadastra colaboradores (config.membros) troca o e-mail de login de um
--   colaborador da empresa. Mesmas travas da senha redefinida pelo gestor: a
--   pessoa só participa desta empresa, não é o dono nem Admin Master, e não é
--   quem está pedindo.
-- * O Admin Master troca o e-mail de qualquer login (painel /admin).
-- * O e-mail é trocado no servidor pela API admin do Supabase; um gatilho em
--   auth.users copia o e-mail novo para usuarios e membros.
-- =============================================================================

-- Mantém usuarios.email e membros.email iguais ao e-mail do login
create or replace function public.tg_usuario_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.usuarios set email = new.email where id = new.id;
  update public.membros set email = new.email where usuario_id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.tg_usuario_email();

-- Login do colaborador cujo e-mail quem chama pode trocar (null = não pode)
create or replace function public.acesso_membro_email_liberado(p_membro uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_membro public.membros;
begin
  select * into v_membro from public.membros where id = p_membro;
  if v_membro.id is null or v_membro.usuario_id is null
     or v_membro.usuario_id = auth.uid()
     or v_membro.dono
     or not public.empresa_liberada(v_membro.empresa_id)
     or not public.tem_permissao(v_membro.empresa_id, 'config.membros') then
    return null;
  end if;
  if exists (
    select 1 from public.membros m
    where m.usuario_id = v_membro.usuario_id and m.empresa_id <> v_membro.empresa_id
  ) or exists (
    select 1 from public.admins_master a where a.usuario_id = v_membro.usuario_id
  ) then
    return null;
  end if;
  return v_membro.usuario_id;
end;
$$;

-- Confere se o e-mail novo pode ser usado e devolve o login a trocar
create or replace function public.acesso_membro_email_preparar(p_membro uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  v_usuario := public.acesso_membro_email_liberado(p_membro);
  if v_usuario is null then
    raise exception 'Sem permissão para trocar o e-mail deste colaborador';
  end if;
  if exists (select 1 from auth.users u where lower(u.email) = lower(trim(p_email)) and u.id <> v_usuario) then
    raise exception 'Este e-mail já é usado por outro login do app';
  end if;
  return v_usuario;
end;
$$;

-- Chamada depois que o servidor trocou o e-mail: a empresa escolheu o e-mail,
-- então o login não é vinculado sozinho a convites de outras empresas com ele
create or replace function public.acesso_membro_email_trocado(p_membro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_empresa uuid;
begin
  v_usuario := public.acesso_membro_email_liberado(p_membro);
  if v_usuario is null then
    raise exception 'Sem permissão para trocar o e-mail deste colaborador';
  end if;
  select empresa_id into v_empresa from public.membros where id = p_membro;
  insert into public.logins_criados (usuario_id, empresa_id)
  values (v_usuario, v_empresa)
  on conflict (usuario_id) do update set empresa_id = excluded.empresa_id, created_at = now();
end;
$$;

grant execute on function
  public.acesso_membro_email_liberado(uuid),
  public.acesso_membro_email_preparar(uuid, text),
  public.acesso_membro_email_trocado(uuid)
to authenticated;
