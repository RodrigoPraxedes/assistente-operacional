-- =============================================================================
-- Quem cadastra colaboradores (config.membros) redefine a senha de qualquer
-- colaborador da empresa que esqueceu a dele. Travas: a pessoa só participa
-- desta empresa (senão a troca daria acesso a outras), não é o dono nem Admin
-- Master, e não é quem está pedindo (esse usa Minha conta).
-- Depois da troca o login volta para logins_criados: a empresa conhece a
-- senha, então ele não é vinculado sozinho a convites de outras empresas até a
-- pessoa trocar a senha em Minha conta.
-- =============================================================================

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

-- Chamada depois que o servidor trocou a senha
create or replace function public.acesso_membro_senha_redefinida(p_membro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_empresa uuid;
begin
  v_usuario := public.acesso_membro_senha_liberada(p_membro);
  if v_usuario is null then
    raise exception 'Sem permissão para trocar a senha deste colaborador';
  end if;
  select empresa_id into v_empresa from public.membros where id = p_membro;
  insert into public.logins_criados (usuario_id, empresa_id)
  values (v_usuario, v_empresa)
  on conflict (usuario_id) do update set empresa_id = excluded.empresa_id, created_at = now();
end;
$$;

grant execute on function public.acesso_membro_senha_redefinida(uuid) to authenticated;
