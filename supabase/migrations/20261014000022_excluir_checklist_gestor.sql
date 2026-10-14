-- =============================================================================
-- 1) Perfil padrão "Gerente" passa a se chamar "Gestor"
-- 2) Excluir check-list (o histórico de preenchimentos continua)
-- =============================================================================

update public.perfis p set nome = 'Gestor'
where p.nome = 'Gerente'
  and not exists (select 1 from public.perfis o where o.empresa_id = p.empresa_id and o.nome = 'Gestor');

-- Empresas novas já nascem com "Gestor" (mesma função da migration 2, só o nome)
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
  values (v_empresa, 'Gestor', 'Acesso completo à empresa') returning id into v_gerente;
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

-- Admin Master entra com o perfil de acesso completo, qualquer que seja o nome
-- (mesma função da migration 11; antes procurava o perfil "Gerente" pelo nome)
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
  select p.id into v_gerente from public.perfis p
  where p.empresa_id = p_empresa
  order by (select count(*) from public.perfil_permissoes pp where pp.perfil_id = p.id) desc, p.created_at
  limit 1;

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

-- -----------------------------------------------------------------------------
-- Excluir check-list: os preenchimentos já enviados ficam (guardam nome e itens
-- próprios); somem o modelo, os itens e as tarefas ainda em aberto dele.
-- -----------------------------------------------------------------------------
alter table public.checklist_execucoes alter column modelo_id drop not null;
alter table public.checklist_execucoes drop constraint checklist_execucoes_modelo_id_fkey;
alter table public.checklist_execucoes
  add constraint checklist_execucoes_modelo_id_fkey
  foreign key (modelo_id) references public.checklist_modelos (id) on delete set null;

create or replace function public.excluir_checklist(p_modelo uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.checklist_modelos where id = p_modelo;
  if v_empresa is null or not public.tem_permissao(v_empresa, 'checklist.editar_modelo') then
    raise exception 'Você não tem permissão para excluir check-lists';
  end if;

  perform set_config('app.sistema', 'on', true);
  delete from public.tarefas t
  using public.status s
  where s.id = t.status_id
    and t.empresa_id = v_empresa and t.origem = 'checklist' and t.origem_id = p_modelo
    and s.tipo in ('aberto', 'em_andamento', 'adiado');
  perform set_config('app.sistema', '', true);

  delete from public.checklist_modelos where id = p_modelo;
end;
$$;

revoke execute on function public.excluir_checklist(uuid) from public, anon;
grant execute on function public.excluir_checklist(uuid) to authenticated;
