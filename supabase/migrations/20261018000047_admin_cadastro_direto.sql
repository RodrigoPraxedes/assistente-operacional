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
