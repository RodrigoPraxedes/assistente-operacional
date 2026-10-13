-- =============================================================================
-- Módulo Escalas
-- =============================================================================
-- Turnos: os horários de trabalho de cada empresa (Abertura 06h-14h,
-- Fechamento 14h-22h, Plantão noturno 22h-06h...). Podem valer para todas as
-- unidades ou só para uma.
--
-- Escala: uma linha por pessoa por dia, dizendo o que ela faz naquele dia na
-- unidade: um turno, folga, férias ou falta. Montada pela grade semanal.
--
-- Trocas: o colaborador pede para passar o turno de um dia a um colega; quem
-- monta a escala aprova ou recusa. Aprovada, o colega assume o turno e, se ele
-- tinha algo marcado no mesmo dia (outro turno ou folga), os dois trocam.
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('escalas.editar', 'Escalas', 'Montar a escala, cadastrar turnos e aprovar trocas', true, 60);

-- Gerentes montam a escala da empresa toda; líderes, a do seu setor
-- (empresas novas: Gerente recebe pelo criar_empresa, Líder pelo gatilho abaixo)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, 'escalas.editar', case p.nome when 'Gerente' then 'empresa' else 'setor' end
from public.perfis p where p.nome in ('Gerente', 'Líder de setor')
on conflict do nothing;

create or replace function public.tg_empresa_nova_escalas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfil_permissoes (perfil_id, permissao, escopo)
  select p.id, 'escalas.editar', 'setor' from public.perfis p
  where p.empresa_id = new.empresa_id and p.nome = 'Líder de setor'
  on conflict do nothing;
  return new;
end;
$$;

create trigger membros_empresa_nova_escalas
  after insert on public.membros
  for each row when (new.dono)
  execute function public.tg_empresa_nova_escalas();

-- -----------------------------------------------------------------------------
-- Turnos
-- -----------------------------------------------------------------------------
create table public.turnos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- null = vale para todas as unidades
  unidade_id uuid references public.unidades (id) on delete cascade,
  nome text not null,
  -- fim menor que o início = termina no dia seguinte (ex.: 22:00 às 06:00)
  inicio time not null,
  fim time not null,
  cor text not null default '#2563eb',
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.turnos (empresa_id);

-- -----------------------------------------------------------------------------
-- Escala (pessoa × dia)
-- -----------------------------------------------------------------------------
create table public.escalas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  -- setor da pessoa quando foi escalada (é o que o líder de setor alcança)
  setor_id uuid references public.setores (id) on delete set null,
  membro_id uuid not null references public.membros (id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('turno', 'folga', 'ferias', 'falta')),
  turno_id uuid references public.turnos (id) on delete cascade,
  observacao text,
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((tipo = 'turno') = (turno_id is not null)),
  -- deferrable para a troca poder inverter duas pessoas no mesmo dia
  constraint escalas_membro_data_key unique (membro_id, data) deferrable initially immediate
);
create index on public.escalas (empresa_id, unidade_id, data);

-- -----------------------------------------------------------------------------
-- Pedidos de troca
-- -----------------------------------------------------------------------------
create table public.escala_trocas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  escala_id uuid not null references public.escalas (id) on delete cascade,
  -- quem estava escalado e quem vai assumir
  solicitante_id uuid not null references public.membros (id) on delete cascade,
  substituto_id uuid not null references public.membros (id) on delete cascade,
  motivo text,
  status text not null default 'pendente'
    check (status in ('pendente', 'aprovada', 'recusada', 'cancelada')),
  pedido_por uuid references public.membros (id) on delete set null,
  decidido_por uuid references public.membros (id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now()
);
create index on public.escala_trocas (empresa_id, status);
create unique index escala_trocas_uma_pendente on public.escala_trocas (escala_id) where status = 'pendente';

-- -----------------------------------------------------------------------------
-- RLS: todo mundo da empresa vê a escala (como o quadro na parede);
-- editar exige escalas.editar no alcance (empresa, unidade ou setor).
-- Trocas são só leitura direta; pedir e responder passam pelas funções abaixo.
-- -----------------------------------------------------------------------------
alter table public.turnos enable row level security;
alter table public.escalas enable row level security;
alter table public.escala_trocas enable row level security;

create policy turnos_select on public.turnos for select to authenticated
  using (public.eh_membro(empresa_id));
create policy turnos_write on public.turnos for all to authenticated
  using (public.tem_permissao(empresa_id, 'escalas.editar'))
  with check (
    public.tem_permissao(empresa_id, 'escalas.editar')
    and (unidade_id is null or exists (
      select 1 from public.unidades u where u.id = unidade_id and u.empresa_id = turnos.empresa_id
    ))
  );

create policy escalas_select on public.escalas for select to authenticated
  using (public.eh_membro(empresa_id));
create policy escalas_write on public.escalas for all to authenticated
  using (public.pode_acessar(empresa_id, 'escalas.editar', unidade_id, setor_id, null, null))
  with check (
    public.pode_acessar(empresa_id, 'escalas.editar', unidade_id, setor_id, null, null)
    and exists (select 1 from public.membros m where m.id = membro_id and m.empresa_id = escalas.empresa_id)
    and exists (select 1 from public.unidades u where u.id = unidade_id and u.empresa_id = escalas.empresa_id)
    and (turno_id is null or exists (
      select 1 from public.turnos t where t.id = turno_id and t.empresa_id = escalas.empresa_id
    ))
  );

create policy escala_trocas_select on public.escala_trocas for select to authenticated
  using (public.eh_membro(empresa_id));

-- -----------------------------------------------------------------------------
-- Salvar a grade: lista de células {membro, data, valor}.
-- valor: '' (apagar), 'folga', 'ferias', 'falta' ou o id do turno.
-- Roda com as permissões de quem chama (RLS vale).
-- -----------------------------------------------------------------------------
create or replace function public.salvar_escala(p_empresa uuid, p_unidade uuid, p_celulas jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c jsonb;
  v_membro public.membros;
  v_data date;
  v_valor text;
  v_tipo text;
  v_turno uuid;
  v_eu uuid := public.meu_membro_id(p_empresa);
begin
  for c in select * from jsonb_array_elements(coalesce(p_celulas, '[]'::jsonb)) loop
    select * into v_membro from public.membros m
    where m.id = (c ->> 'membro')::uuid and m.empresa_id = p_empresa;
    if v_membro.id is null then
      raise exception 'Colaborador não encontrado';
    end if;
    v_data := (c ->> 'data')::date;
    v_valor := coalesce(c ->> 'valor', '');

    if not public.pode_acessar(p_empresa, 'escalas.editar', p_unidade, v_membro.setor_id, null, null) then
      raise exception 'Você não pode alterar a escala de %', v_membro.nome;
    end if;

    if v_valor = '' then
      delete from public.escalas where membro_id = v_membro.id and data = v_data;
      continue;
    end if;

    if v_valor in ('folga', 'ferias', 'falta') then
      v_tipo := v_valor;
      v_turno := null;
    else
      v_tipo := 'turno';
      v_turno := v_valor::uuid;
    end if;

    update public.escalas
       set unidade_id = p_unidade, setor_id = v_membro.setor_id, tipo = v_tipo,
           turno_id = v_turno, updated_at = now()
     where membro_id = v_membro.id and data = v_data;
    if not found then
      insert into public.escalas (empresa_id, unidade_id, setor_id, membro_id, data, tipo, turno_id, criado_por)
      values (p_empresa, p_unidade, v_membro.setor_id, v_membro.id, v_data, v_tipo, v_turno, v_eu);
    end if;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Pedir troca: o próprio escalado (ou quem monta a escala) indica o colega
-- -----------------------------------------------------------------------------
create or replace function public.pedir_troca(p_escala uuid, p_substituto uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.escalas;
  v_eu uuid;
  v_fuso text;
  v_id uuid;
begin
  select * into v_e from public.escalas where id = p_escala;
  if v_e.id is null then
    raise exception 'Dia da escala não encontrado';
  end if;
  v_eu := public.meu_membro_id(v_e.empresa_id);
  if v_eu is null then
    raise exception 'Sem acesso a esta empresa';
  end if;
  if v_e.membro_id <> v_eu
     and not public.pode_acessar(v_e.empresa_id, 'escalas.editar', v_e.unidade_id, v_e.setor_id, null, null) then
    raise exception 'Só quem está escalado pode pedir a troca deste turno';
  end if;
  if v_e.tipo <> 'turno' then
    raise exception 'Só dá para trocar dias de trabalho';
  end if;

  select fuso_horario into v_fuso from public.empresas where id = v_e.empresa_id;
  if v_e.data < (now() at time zone v_fuso)::date then
    raise exception 'Este dia já passou';
  end if;

  if p_substituto = v_e.membro_id or not exists (
    select 1 from public.membros m
    where m.id = p_substituto and m.empresa_id = v_e.empresa_id and m.ativo
  ) then
    raise exception 'Escolha outro colaborador para assumir o turno';
  end if;
  if exists (select 1 from public.escala_trocas t where t.escala_id = p_escala and t.status = 'pendente') then
    raise exception 'Já existe um pedido de troca aguardando para este dia';
  end if;

  insert into public.escala_trocas (empresa_id, escala_id, solicitante_id, substituto_id, motivo, pedido_por)
  values (v_e.empresa_id, p_escala, v_e.membro_id, p_substituto, nullif(trim(p_motivo), ''), v_eu)
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Responder troca: 'aprovar' ou 'recusar' (quem monta a escala) ou
-- 'cancelar' (quem pediu ou quem estava escalado)
-- -----------------------------------------------------------------------------
create or replace function public.responder_troca(p_troca uuid, p_acao text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.escala_trocas;
  v_e public.escalas;
  v_outra uuid;
  v_eu uuid;
  v_editor boolean;
begin
  select * into v_t from public.escala_trocas where id = p_troca for update;
  if v_t.id is null then
    raise exception 'Pedido de troca não encontrado';
  end if;
  if v_t.status <> 'pendente' then
    raise exception 'Este pedido já foi respondido';
  end if;
  select * into v_e from public.escalas where id = v_t.escala_id for update;
  v_eu := public.meu_membro_id(v_t.empresa_id);
  v_editor := public.pode_acessar(v_e.empresa_id, 'escalas.editar', v_e.unidade_id, v_e.setor_id, null, null);

  if p_acao = 'cancelar' then
    if v_eu is null or (v_eu not in (v_t.solicitante_id, v_t.pedido_por) and not v_editor) then
      raise exception 'Só quem pediu pode cancelar';
    end if;
    update public.escala_trocas
       set status = 'cancelada', decidido_por = v_eu, decidido_em = now()
     where id = p_troca;
    return;
  end if;

  if p_acao not in ('aprovar', 'recusar') then
    raise exception 'Ação inválida';
  end if;
  if not v_editor then
    raise exception 'Você não pode aprovar trocas desta escala';
  end if;

  if p_acao = 'aprovar' then
    if v_e.membro_id <> v_t.solicitante_id then
      raise exception 'A escala deste dia mudou depois do pedido; faça um novo pedido';
    end if;
    -- se o colega já tinha algo no dia (turno, folga...), os dois trocam
    set constraints public.escalas_membro_data_key deferred;
    select id into v_outra from public.escalas
    where membro_id = v_t.substituto_id and data = v_e.data;
    update public.escalas set membro_id = v_t.substituto_id, updated_at = now() where id = v_e.id;
    if v_outra is not null then
      update public.escalas set membro_id = v_t.solicitante_id, updated_at = now() where id = v_outra;
    end if;
    set constraints public.escalas_membro_data_key immediate;
  end if;

  update public.escala_trocas
     set status = case p_acao when 'aprovar' then 'aprovada' else 'recusada' end,
         decidido_por = v_eu, decidido_em = now()
   where id = p_troca;
end;
$$;

grant execute on function
  public.salvar_escala(uuid, uuid, jsonb),
  public.pedir_troca(uuid, uuid, text),
  public.responder_troca(uuid, text)
to authenticated;
