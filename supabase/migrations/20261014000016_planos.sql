-- =============================================================================
-- Módulo PMLP: Planos de Médio e Longo Prazo
-- =============================================================================
-- Um plano é um projeto mais demorado (médio: 3 a 6 meses; longo: 6 a 12),
-- ex.: reforma do letreiro. Ele é dividido em etapas (ideia base, pesquisa de
-- profissionais, orçamentos, compra de material, locação de equipamento...).
--
-- Cada etapa É uma tarefa (origem = 'plano', origem_id = id do plano): usa o
-- mesmo Kanban, status, histórico e comentários. A tabela plano_etapas guarda
-- só o que é da etapa: ordem e início previsto.
--
-- Etapas em cascata: uma etapa pode depender de outras. Enquanto alguma delas
-- não estiver concluída (ou cancelada), a etapa não pode ir para "em
-- andamento" nem ser concluída.
--
-- Força-tarefa: além do responsável (da tarefa), cada etapa tem uma equipe.
-- Quem está na equipe vê o plano e pode mover a etapa no Kanban.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('planos.ver',    'Planos (PMLP)', 'Ver todos os planos de médio e longo prazo',    false, 55),
  ('planos.editar', 'Planos (PMLP)', 'Criar e editar planos e suas etapas',           false, 56);

-- perfis já existentes (empresas novas: o Gerente recebe tudo pelo criar_empresa)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, k.chave, 'empresa' from public.perfis p
cross join (values ('planos.ver'), ('planos.editar')) as k (chave)
where p.nome = 'Gerente'
on conflict do nothing;

insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, 'planos.ver', 'empresa' from public.perfis p where p.nome = 'Líder de setor'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Nova origem de tarefa: 'plano'
-- -----------------------------------------------------------------------------
alter table public.tarefas drop constraint tarefas_origem_check;
alter table public.tarefas add constraint tarefas_origem_check
  check (origem in ('avulsa', 'checklist', 'acao', 'chamado', 'alerta', 'plano'));

alter table public.status drop constraint status_modulo_check;
alter table public.status add constraint status_modulo_check
  check (modulo in ('avulsa', 'checklist', 'acao', 'chamado', 'alerta', 'plano'));

create index if not exists tarefas_origem_id_idx on public.tarefas (origem, origem_id);

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.planos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  setor_id uuid references public.setores (id) on delete set null,
  categoria_id uuid references public.categorias (id) on delete set null,
  nome text not null check (length(trim(nome)) > 0),
  objetivo text,
  horizonte text not null default 'medio' check (horizonte in ('medio', 'longo')),
  inicio date,
  fim_previsto date,
  -- coordenador do plano
  responsavel_id uuid references public.membros (id) on delete set null,
  situacao text not null default 'planejamento'
    check (situacao in ('planejamento', 'em_andamento', 'pausado', 'concluido', 'cancelado')),
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fim_previsto is null or inicio is null or fim_previsto >= inicio)
);
create index on public.planos (empresa_id);

create table public.plano_etapas (
  tarefa_id uuid primary key references public.tarefas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  plano_id uuid not null references public.planos (id) on delete cascade,
  ordem int not null default 0,
  inicio_previsto date
);
create index on public.plano_etapas (plano_id, ordem);

create table public.plano_etapa_dependencias (
  etapa_id uuid not null references public.plano_etapas (tarefa_id) on delete cascade,
  depende_de uuid not null references public.plano_etapas (tarefa_id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  primary key (etapa_id, depende_de),
  check (etapa_id <> depende_de)
);
create index on public.plano_etapa_dependencias (depende_de);

create table public.plano_etapa_equipe (
  etapa_id uuid not null references public.plano_etapas (tarefa_id) on delete cascade,
  membro_id uuid not null references public.membros (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  primary key (etapa_id, membro_id)
);
create index on public.plano_etapa_equipe (membro_id);

-- -----------------------------------------------------------------------------
-- Regras
-- -----------------------------------------------------------------------------

-- excluir o plano apaga as tarefas das etapas (senão ficariam soltas no Kanban)
create or replace function public.tg_planos_excluir_tarefas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.tarefas where origem = 'plano' and origem_id = old.id;
  return old;
end;
$$;

create trigger planos_excluir_tarefas
  before delete on public.planos
  for each row execute function public.tg_planos_excluir_tarefas();

create or replace function public.tg_planos_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger planos_updated
  before update on public.planos
  for each row execute function public.tg_planos_updated();

-- dependência só entre etapas do mesmo plano e sem ciclo (A → B → A)
create or replace function public.tg_dependencia_valida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select plano_id from public.plano_etapas where tarefa_id = new.etapa_id)
     is distinct from (select plano_id from public.plano_etapas where tarefa_id = new.depende_de) then
    raise exception 'A etapa só pode depender de etapas do mesmo plano';
  end if;

  if exists (
    with recursive cadeia (id) as (
      select d.depende_de from public.plano_etapa_dependencias d where d.etapa_id = new.depende_de
      union
      select d.depende_de from public.plano_etapa_dependencias d join cadeia c on d.etapa_id = c.id
    )
    select 1 from cadeia where id = new.etapa_id
  ) then
    raise exception 'Dependência circular: uma etapa não pode depender, mesmo indiretamente, de si mesma';
  end if;
  return new;
end;
$$;

create trigger dependencia_valida
  before insert or update on public.plano_etapa_dependencias
  for each row execute function public.tg_dependencia_valida();

-- etapa em cascata: só começa ou conclui depois das etapas de que depende
create or replace function public.tg_tarefas_etapa_liberada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_pendente text;
begin
  if new.origem <> 'plano' or new.status_id is not distinct from old.status_id then
    return new;
  end if;
  select tipo into v_tipo from public.status where id = new.status_id;
  if v_tipo not in ('em_andamento', 'concluido') then
    return new;
  end if;

  select t.titulo into v_pendente
  from public.plano_etapa_dependencias d
  join public.tarefas t on t.id = d.depende_de
  join public.status s on s.id = t.status_id
  where d.etapa_id = new.id and s.tipo not in ('concluido', 'cancelado')
  limit 1;

  if v_pendente is not null then
    raise exception 'Esta etapa depende de "%", que ainda não foi concluída', v_pendente;
  end if;
  return new;
end;
$$;

create trigger tarefas_etapa_liberada
  before update on public.tarefas
  for each row execute function public.tg_tarefas_etapa_liberada();

-- -----------------------------------------------------------------------------
-- Quem vê um plano: quem tem planos.ver/planos.editar, o coordenador, quem
-- criou, e quem é responsável ou está na equipe de alguma etapa
-- -----------------------------------------------------------------------------
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
  return public.tem_permissao(v_plano.empresa_id, 'planos.ver')
    or public.tem_permissao(v_plano.empresa_id, 'planos.editar')
    or v_eu in (v_plano.responsavel_id, v_plano.criado_por)
    or public.participo_do_plano(p_plano);
end;
$$;

-- sou responsável ou estou na equipe de alguma etapa do plano
create or replace function public.participo_do_plano(p_plano uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plano_etapas e
    join public.tarefas t on t.id = e.tarefa_id
    where e.plano_id = p_plano and t.responsavel_id = public.meu_membro_id(e.empresa_id)
  ) or exists (
    select 1 from public.plano_etapas e
    join public.plano_etapa_equipe q on q.etapa_id = e.tarefa_id
    where e.plano_id = p_plano and q.membro_id = public.meu_membro_id(e.empresa_id)
  )
$$;

create or replace function public.estou_na_etapa(p_tarefa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.plano_etapa_equipe q
    where q.etapa_id = p_tarefa and q.membro_id = public.meu_membro_id(q.empresa_id)
  )
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.planos enable row level security;
alter table public.plano_etapas enable row level security;
alter table public.plano_etapa_dependencias enable row level security;
alter table public.plano_etapa_equipe enable row level security;

-- (sem consultar o próprio plano: assim o insert ... returning já enxerga a linha nova)
create policy planos_select on public.planos for select to authenticated
  using (
    public.tem_permissao(empresa_id, 'planos.ver')
    or public.tem_permissao(empresa_id, 'planos.editar')
    or public.meu_membro_id(empresa_id) in (responsavel_id, criado_por)
    or public.participo_do_plano(id)
  );
create policy planos_insert on public.planos for insert to authenticated
  with check (
    public.tem_permissao(empresa_id, 'planos.editar')
    and criado_por = public.meu_membro_id(empresa_id)
    and (unidade_id is null or public.tem_acesso_unidade(unidade_id))
  );
create policy planos_update on public.planos for update to authenticated
  using (public.tem_permissao(empresa_id, 'planos.editar'))
  with check (
    public.tem_permissao(empresa_id, 'planos.editar')
    and (unidade_id is null or public.tem_acesso_unidade(unidade_id))
  );
create policy planos_delete on public.planos for delete to authenticated
  using (public.tem_permissao(empresa_id, 'planos.editar'));

-- etapas, dependências e equipe: leitura por quem vê o plano;
-- gravação pelas funções salvar_etapa / excluir_etapa
create policy plano_etapas_select on public.plano_etapas for select to authenticated
  using (public.pode_ver_plano(plano_id));
create policy plano_etapa_dependencias_select on public.plano_etapa_dependencias for select to authenticated
  using (exists (select 1 from public.plano_etapas e where e.tarefa_id = etapa_id));
create policy plano_etapa_equipe_select on public.plano_etapa_equipe for select to authenticated
  using (exists (select 1 from public.plano_etapas e where e.tarefa_id = etapa_id));

-- tarefas das etapas: visíveis a quem vê o plano; a equipe pode movê-las
-- (etapa marcada como privada segue só as regras normais de tarefas)
create policy tarefas_select_plano on public.tarefas for select to authenticated
  using (origem = 'plano' and not privado and public.pode_ver_plano(origem_id));
create policy tarefas_update_equipe on public.tarefas for update to authenticated
  using (origem = 'plano' and not privado and public.estou_na_etapa(id))
  with check (origem = 'plano' and not privado and public.estou_na_etapa(id));

-- -----------------------------------------------------------------------------
-- Criar / editar etapa (tarefa + etapa + dependências + equipe de uma vez)
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
  if v_plano.id is null or not public.tem_permissao(v_plano.empresa_id, 'planos.editar') then
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
      status_id, responsavel_id, criado_por, prazo
    ) values (
      v_plano.empresa_id, v_plano.unidade_id, v_plano.setor_id, v_plano.categoria_id,
      trim(p_titulo), nullif(trim(p_descricao), ''), 'plano', p_plano,
      public.status_inicial(v_plano.empresa_id), p_responsavel, v_eu, p_prazo
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
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.plano_etapas where tarefa_id = p_etapa;
  if v_empresa is null or not public.tem_permissao(v_empresa, 'planos.editar') then
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
  if v_e.tarefa_id is null or not public.tem_permissao(v_e.empresa_id, 'planos.editar') then
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

-- -----------------------------------------------------------------------------
-- Permissões de execução
-- -----------------------------------------------------------------------------
grant execute on function
  public.pode_ver_plano(uuid),
  public.participo_do_plano(uuid),
  public.estou_na_etapa(uuid),
  public.salvar_etapa(uuid, uuid, text, text, uuid, date, timestamptz, uuid[], uuid[]),
  public.excluir_etapa(uuid),
  public.mover_etapa(uuid, int)
to authenticated;
