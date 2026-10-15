-- =============================================================================
-- Plano privado ou público
-- =============================================================================
-- Público (padrão): segue como antes. Veem o plano quem tem "Ver planos" ou
-- "Criar e editar planos" (Gestor, Líder de setor, dono), o coordenador, quem
-- criou e quem é responsável ou está na equipe de alguma etapa.
-- Privado: só quem criou, o coordenador e quem é responsável ou está na equipe
-- de alguma etapa. Nem o dono vê.
--
-- Plano privado só é editado por quem criou e pelo coordenador (com permissão
-- de editar planos) e só quem criou o exclui ou troca entre privado e público.
-- As etapas (tarefas) acompanham o plano: nascem e ficam privadas junto com
-- ele, então somem do Kanban de quem não participa.
-- =============================================================================

alter table public.planos add column privado boolean not null default false;

-- plano privado? (para as políticas de tarefas, sem passar pela RLS de planos)
create or replace function public.plano_privado(p_plano uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select privado from public.planos where id = p_plano), false)
$$;

-- posso editar o plano (e as etapas dele)?
create or replace function public.edito_plano(p_plano uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.planos p
    where p.id = p_plano
      and public.tem_permissao(p.empresa_id, 'planos.editar')
      and public.ve_privado(p.empresa_id, p.privado, p.responsavel_id, p.criado_por)
  )
$$;

create or replace function public.pode_ver_plano(p_plano uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plano public.planos;
  v_eu uuid;
begin
  select * into v_plano from public.planos where id = p_plano;
  if v_plano.id is null then
    return false;
  end if;
  v_eu := public.meu_membro_id(v_plano.empresa_id);
  if v_eu is null then
    return false;
  end if;
  return (
      not v_plano.privado
      and (public.tem_permissao(v_plano.empresa_id, 'planos.ver')
           or public.tem_permissao(v_plano.empresa_id, 'planos.editar'))
    )
    or v_eu in (v_plano.responsavel_id, v_plano.criado_por)
    or public.participo_do_plano(p_plano);
end;
$$;

grant execute on function public.plano_privado(uuid), public.edito_plano(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS de planos
-- -----------------------------------------------------------------------------
drop policy planos_select on public.planos;
drop policy planos_update on public.planos;
drop policy planos_delete on public.planos;

create policy planos_select on public.planos for select to authenticated
  using (
    (
      not privado
      and (public.tem_permissao(empresa_id, 'planos.ver') or public.tem_permissao(empresa_id, 'planos.editar'))
    )
    or public.meu_membro_id(empresa_id) in (responsavel_id, criado_por)
    or public.participo_do_plano(id)
  );
create policy planos_update on public.planos for update to authenticated
  using (
    public.tem_permissao(empresa_id, 'planos.editar')
    and public.ve_privado(empresa_id, privado, responsavel_id, criado_por)
  )
  with check (
    public.tem_permissao(empresa_id, 'planos.editar')
    and (unidade_id is null or public.tem_acesso_unidade(unidade_id))
  );
create policy planos_delete on public.planos for delete to authenticated
  using (
    public.tem_permissao(empresa_id, 'planos.editar')
    and public.ve_privado(empresa_id, privado, null, criado_por)
  );

-- só quem criou troca entre privado e público (mesma regra das tarefas)
create trigger planos_protege_privado before update on public.planos
  for each row execute function public.tg_protege_privado();

-- -----------------------------------------------------------------------------
-- Etapas acompanham o plano
-- -----------------------------------------------------------------------------
create or replace function public.tg_planos_privado_nas_etapas()
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
  update public.tarefas t
     set privado = new.privado, criado_por = coalesce(t.criado_por, new.criado_por)
   where t.origem = 'plano' and t.origem_id = new.id;
  perform set_config('app.sistema', '', true);
  return new;
end;
$$;

create trigger planos_privado_nas_etapas after update on public.planos
  for each row execute function public.tg_planos_privado_nas_etapas();

-- etapa de plano privado: quem vê o plano vê a etapa e a equipe pode movê-la.
-- Em plano público, etapa marcada como privada segue só as regras de tarefas.
drop policy tarefas_select_plano on public.tarefas;
drop policy tarefas_update_equipe on public.tarefas;
create policy tarefas_select_plano on public.tarefas for select to authenticated
  using (
    origem = 'plano'
    and (not privado or public.plano_privado(origem_id))
    and public.pode_ver_plano(origem_id)
  );
create policy tarefas_update_equipe on public.tarefas for update to authenticated
  using (
    origem = 'plano'
    and (not privado or public.plano_privado(origem_id))
    and public.estou_na_etapa(id)
  )
  with check (
    origem = 'plano'
    and (not privado or public.plano_privado(origem_id))
    and public.estou_na_etapa(id)
  );

-- -----------------------------------------------------------------------------
-- Funções das etapas: respeitam o plano privado e criam a etapa já privada
-- -----------------------------------------------------------------------------
create or replace function public.salvar_etapa(
  p_plano uuid,
  p_etapa uuid,
  p_titulo text,
  p_descricao text default null,
  p_responsavel uuid default null,
  p_inicio date default null,
  p_prazo timestamptz default null,
  p_depende uuid[] default '{}',
  p_equipe uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano public.planos;
  v_eu uuid;
  v_tarefa uuid := p_etapa;
begin
  select * into v_plano from public.planos where id = p_plano;
  if v_plano.id is null or not public.edito_plano(p_plano) then
    raise exception 'Você não tem permissão para editar este plano';
  end if;
  v_eu := public.meu_membro_id(v_plano.empresa_id);
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'Dê um nome para a etapa';
  end if;
  if p_responsavel is not null
     and not exists (select 1 from public.membros where id = p_responsavel and empresa_id = v_plano.empresa_id) then
    raise exception 'Responsável inválido';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_equipe, '{}')) m
    where not exists (select 1 from public.membros where id = m and empresa_id = v_plano.empresa_id)
  ) then
    raise exception 'Membro da equipe inválido';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_depende, '{}')) d
    where not exists (select 1 from public.plano_etapas where tarefa_id = d and plano_id = p_plano)
  ) then
    raise exception 'Dependência inválida';
  end if;

  if v_tarefa is null then
    insert into public.tarefas (
      empresa_id, unidade_id, setor_id, categoria_id, titulo, descricao, origem, origem_id,
      status_id, responsavel_id, criado_por, prazo, privado
    ) values (
      v_plano.empresa_id, v_plano.unidade_id, v_plano.setor_id, v_plano.categoria_id,
      trim(p_titulo), nullif(trim(p_descricao), ''), 'plano', p_plano,
      public.status_inicial(v_plano.empresa_id), p_responsavel, v_eu, p_prazo, v_plano.privado
    ) returning id into v_tarefa;

    insert into public.plano_etapas (tarefa_id, empresa_id, plano_id, ordem, inicio_previsto)
    values (
      v_tarefa, v_plano.empresa_id, p_plano,
      coalesce((select max(ordem) + 1 from public.plano_etapas where plano_id = p_plano), 1),
      p_inicio
    );
  else
    if not exists (select 1 from public.plano_etapas where tarefa_id = v_tarefa and plano_id = p_plano) then
      raise exception 'Etapa não encontrada';
    end if;
    update public.tarefas
       set titulo = trim(p_titulo),
           descricao = nullif(trim(p_descricao), ''),
           responsavel_id = p_responsavel,
           prazo = p_prazo
     where id = v_tarefa;
    update public.plano_etapas set inicio_previsto = p_inicio where tarefa_id = v_tarefa;
    delete from public.plano_etapa_dependencias where etapa_id = v_tarefa;
    delete from public.plano_etapa_equipe where etapa_id = v_tarefa;
  end if;

  insert into public.plano_etapa_dependencias (etapa_id, depende_de, empresa_id)
  select v_tarefa, d, v_plano.empresa_id from (select distinct unnest(coalesce(p_depende, '{}')) as d) x;

  insert into public.plano_etapa_equipe (etapa_id, membro_id, empresa_id)
  select v_tarefa, m, v_plano.empresa_id from (select distinct unnest(coalesce(p_equipe, '{}')) as m) x;

  return v_tarefa;
end;
$$;

create or replace function public.excluir_etapa(p_etapa uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plano uuid;
begin
  select plano_id into v_plano from public.plano_etapas where tarefa_id = p_etapa;
  if v_plano is null or not public.edito_plano(v_plano) then
    raise exception 'Você não tem permissão para excluir esta etapa';
  end if;
  delete from public.tarefas where id = p_etapa;
end;
$$;

-- muda a etapa de lugar na lista (troca com a vizinha de cima ou de baixo)
create or replace function public.mover_etapa(p_etapa uuid, p_direcao int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.plano_etapas;
  v_vizinha public.plano_etapas;
begin
  select * into v_e from public.plano_etapas where tarefa_id = p_etapa;
  if v_e.tarefa_id is null or not public.edito_plano(v_e.plano_id) then
    raise exception 'Você não tem permissão para editar este plano';
  end if;
  if p_direcao < 0 then
    select * into v_vizinha from public.plano_etapas
    where plano_id = v_e.plano_id and (ordem, tarefa_id) < (v_e.ordem, v_e.tarefa_id)
    order by ordem desc, tarefa_id desc limit 1;
  else
    select * into v_vizinha from public.plano_etapas
    where plano_id = v_e.plano_id and (ordem, tarefa_id) > (v_e.ordem, v_e.tarefa_id)
    order by ordem, tarefa_id limit 1;
  end if;
  if v_vizinha.tarefa_id is null then
    return;
  end if;
  -- ordens iguais: abre espaço antes de trocar
  if v_vizinha.ordem = v_e.ordem then
    v_vizinha.ordem := v_e.ordem + sign(p_direcao)::int;
  end if;
  update public.plano_etapas set ordem = v_vizinha.ordem where tarefa_id = v_e.tarefa_id;
  update public.plano_etapas set ordem = v_e.ordem where tarefa_id = v_vizinha.tarefa_id;
end;
$$;
