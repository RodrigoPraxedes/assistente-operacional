-- =============================================================================
-- Privado ou público em tarefas, ações e alertas
-- =============================================================================
-- Item público (padrão): segue as regras de sempre (perfil, unidade, setor).
-- Item privado: só aparece para quem criou e para o responsável, nem para o
-- dono da empresa. Vale para o Kanban, a Agenda do app e o feed do Google
-- Agenda (o feed só traz o que a pessoa é responsável).
--
-- Ação ou alerta privado: o cadastro só é visto por quem criou e pelo(s)
-- responsável(is) e só quem criou edita. As tarefas que eles geram nascem
-- privadas, com "criado_por" = quem criou a ação/alerta.
-- Só quem criou pode trocar entre privado e público.
-- =============================================================================

alter table public.tarefas add column privado boolean not null default false;
alter table public.acoes add column privado boolean not null default false;
alter table public.alertas add column privado boolean not null default false;

-- Público, ou sou quem criou / o responsável. Para "só quem criou", passe
-- p_responsavel = null.
create or replace function public.ve_privado(p_empresa uuid, p_privado boolean, p_responsavel uuid, p_criado_por uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not coalesce(p_privado, false)
    or coalesce(public.meu_membro_id(p_empresa) in (p_responsavel, p_criado_por), false)
$$;

-- Alerta visível: sou membro e ele é público, ou criei, ou sou responsável
-- (do alerta ou de algum aviso). Função à parte para alertas e avisos não se
-- consultarem pelas políticas um do outro (evita recursão).
create or replace function public.ve_alerta(p_alerta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.alertas a
    where a.id = p_alerta
      and public.eh_membro(a.empresa_id)
      and (
        public.ve_privado(a.empresa_id, a.privado, a.responsavel_id, a.criado_por)
        or exists (
          select 1 from public.alerta_avisos v
          where v.alerta_id = a.id and v.responsavel_id = public.meu_membro_id(a.empresa_id)
        )
      )
  )
$$;

grant execute on function
  public.ve_privado(uuid, boolean, uuid, uuid),
  public.ve_alerta(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Só quem criou troca entre privado e público
-- -----------------------------------------------------------------------------
create or replace function public.tg_protege_privado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_eu uuid;
begin
  if new.privado is not distinct from old.privado
     or current_setting('app.sistema', true) = 'on' or auth.uid() is null then
    return new;
  end if;
  v_eu := public.meu_membro_id(new.empresa_id);
  if old.criado_por is null then
    -- registro antigo sem autor: quem marca como privado passa a ser o dono dele
    new.criado_por := v_eu;
  elsif old.criado_por is distinct from v_eu then
    raise exception 'Só quem criou pode mudar entre privado e público';
  end if;
  return new;
end;
$$;

create trigger tarefas_protege_privado before update on public.tarefas
  for each row execute function public.tg_protege_privado();
create trigger acoes_protege_privado before update on public.acoes
  for each row execute function public.tg_protege_privado();
create trigger alertas_protege_privado before update on public.alertas
  for each row execute function public.tg_protege_privado();

-- -----------------------------------------------------------------------------
-- Ação/alerta mudou de privado para público (ou o contrário): as tarefas já
-- geradas acompanham.
-- -----------------------------------------------------------------------------
create or replace function public.tg_privado_nas_tarefas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.privado is not distinct from old.privado then
    return new;
  end if;
  perform set_config('app.sistema', 'on', true);
  if tg_table_name = 'acoes' then
    update public.tarefas t
       set privado = new.privado, criado_por = coalesce(t.criado_por, new.criado_por)
     where t.origem = 'acao' and t.origem_id = new.id;
  else
    update public.tarefas t
       set privado = new.privado, criado_por = coalesce(t.criado_por, new.criado_por)
     where t.origem = 'alerta'
       and t.origem_id in (select v.id from public.alerta_avisos v where v.alerta_id = new.id);
  end if;
  perform set_config('app.sistema', '', true);
  return new;
end;
$$;

create trigger acoes_privado_nas_tarefas after update on public.acoes
  for each row execute function public.tg_privado_nas_tarefas();
create trigger alertas_privado_nas_tarefas after update on public.alertas
  for each row execute function public.tg_privado_nas_tarefas();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
drop policy tarefas_select on public.tarefas;
drop policy tarefas_update on public.tarefas;
drop policy tarefas_delete on public.tarefas;

create policy tarefas_select on public.tarefas for select to authenticated
  using (
    public.pode_acessar(empresa_id, 'tarefas.ver', unidade_id, setor_id, responsavel_id, criado_por)
    and public.ve_privado(empresa_id, privado, responsavel_id, criado_por)
  );
create policy tarefas_update on public.tarefas for update to authenticated
  using (
    public.pode_acessar(empresa_id, 'tarefas.mudar_status', unidade_id, setor_id, responsavel_id, criado_por)
    and public.ve_privado(empresa_id, privado, responsavel_id, criado_por)
  )
  with check (
    public.pode_acessar(empresa_id, 'tarefas.mudar_status', unidade_id, setor_id, responsavel_id, criado_por)
    and public.ve_privado(empresa_id, privado, responsavel_id, criado_por)
  );
create policy tarefas_delete on public.tarefas for delete to authenticated
  using (
    public.tem_permissao(empresa_id, 'tarefas.excluir')
    and public.pode_acessar(empresa_id, 'tarefas.ver', unidade_id, setor_id, responsavel_id, criado_por)
    and public.ve_privado(empresa_id, privado, responsavel_id, criado_por)
  );
-- histórico, comentários e fotos já seguem a tarefa (consultam public.tarefas)

drop policy acoes_select on public.acoes;
drop policy acoes_write on public.acoes;
create policy acoes_select on public.acoes for select to authenticated
  using (public.eh_membro(empresa_id) and public.ve_privado(empresa_id, privado, responsavel_id, criado_por));
create policy acoes_write on public.acoes for all to authenticated
  using (public.tem_permissao(empresa_id, 'acoes.editar') and public.ve_privado(empresa_id, privado, null, criado_por))
  with check (public.tem_permissao(empresa_id, 'acoes.editar') and public.ve_privado(empresa_id, privado, null, criado_por));

drop policy alertas_select on public.alertas;
drop policy alertas_write on public.alertas;
create policy alertas_select on public.alertas for select to authenticated
  using (public.ve_alerta(id));
create policy alertas_write on public.alertas for all to authenticated
  using (public.tem_permissao(empresa_id, 'alertas.editar') and public.ve_privado(empresa_id, privado, null, criado_por))
  with check (public.tem_permissao(empresa_id, 'alertas.editar') and public.ve_privado(empresa_id, privado, null, criado_por));

drop policy alerta_avisos_select on public.alerta_avisos;
drop policy alerta_avisos_write on public.alerta_avisos;
create policy alerta_avisos_select on public.alerta_avisos for select to authenticated
  using (public.ve_alerta(alerta_id));
-- o aviso precisa ser da mesma empresa do alerta, e o alerta editável por mim
create policy alerta_avisos_write on public.alerta_avisos for all to authenticated
  using (
    public.tem_permissao(empresa_id, 'alertas.editar')
    and exists (
      select 1 from public.alertas a
      where a.id = alerta_id and public.ve_privado(a.empresa_id, a.privado, null, a.criado_por)
    )
  )
  with check (
    public.tem_permissao(empresa_id, 'alertas.editar')
    and exists (
      select 1 from public.alertas a
      where a.id = alerta_id and a.empresa_id = alerta_avisos.empresa_id
        and public.ve_privado(a.empresa_id, a.privado, null, a.criado_por)
    )
  );
