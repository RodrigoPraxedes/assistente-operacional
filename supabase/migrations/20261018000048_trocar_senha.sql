-- =============================================================================
-- Trocar senha
-- * Qualquer pessoa troca a própria senha em Minha conta (no app, com a senha
--   atual). Daí em diante a empresa que criou o login não conhece mais a senha.
-- * Quem cadastra colaboradores troca a senha de um login que a própria empresa
--   criou (Acesso ao app), enquanto a pessoa não trocou a senha dela e não
--   participa de outra empresa.
-- =============================================================================

create or replace function public.minha_senha_trocada()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.logins_criados where usuario_id = auth.uid()
$$;

-- Login do colaborador cuja senha quem chama pode trocar (null = não pode)
create or replace function public.acesso_membro_senha_liberada(p_membro uuid)
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
     or not public.empresa_liberada(v_membro.empresa_id)
     or not public.tem_permissao(v_membro.empresa_id, 'config.membros') then
    return null;
  end if;
  if not exists (
    select 1 from public.logins_criados lc
    where lc.usuario_id = v_membro.usuario_id and lc.empresa_id = v_membro.empresa_id
  ) then
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

grant execute on function
  public.minha_senha_trocada(),
  public.acesso_membro_senha_liberada(uuid)
to authenticated;
