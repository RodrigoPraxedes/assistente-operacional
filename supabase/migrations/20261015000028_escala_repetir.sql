-- =============================================================================
-- Escalas: repetir automaticamente a semana de um colaborador
-- =============================================================================
-- Quem monta a escala liga "Repetir toda semana" na linha da pessoa. A semana
-- aberta vira o modelo (seg a dom) e o sistema preenche as semanas seguintes,
-- sempre 8 semanas à frente (o relógio /api/cron/whatsapp estende todo dia).
-- Só preenche dias em branco: o que foi marcado à mão nunca é sobrescrito.
-- Desligar apaga os dias futuros gerados que ninguém alterou.
-- =============================================================================

alter table public.escalas add column automatica boolean not null default false;

-- dia gerado que alguém alterou (na grade ou por troca) deixa de ser automático
create or replace function public.tg_escala_alterada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.automatica and (
    old.membro_id <> new.membro_id or old.tipo <> new.tipo or old.turno_id is distinct from new.turno_id
  ) then
    new.automatica := false;
  end if;
  return new;
end;
$$;

create trigger escalas_alterada
  before update on public.escalas
  for each row execute function public.tg_escala_alterada();

create table public.escala_repeticoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  unidade_id uuid not null references public.unidades (id) on delete cascade,
  setor_id uuid references public.setores (id) on delete set null,
  membro_id uuid not null unique references public.membros (id) on delete cascade,
  -- segunda-feira da semana modelo
  semana_base date not null,
  -- 7 valores (seg..dom): '' (em branco), 'folga', 'ferias', 'falta' ou o id do turno
  valores jsonb not null,
  criado_por uuid references public.membros (id) on delete set null,
  -- último dia em que o relógio estendeu (roda a cada minuto, estende 1x por dia)
  estendida_em date,
  created_at timestamptz not null default now()
);
create index on public.escala_repeticoes (empresa_id);

alter table public.escala_repeticoes enable row level security;
create policy escala_repeticoes_select on public.escala_repeticoes for select to authenticated
  using (public.eh_membro(empresa_id));
-- escrita só pelas funções abaixo

-- -----------------------------------------------------------------------------
-- Preenche os dias em branco de hoje (ou da semana seguinte à modelo) até
-- 8 semanas à frente. Interna: chamada pelas funções abaixo.
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_repeticao_escala(p_rep uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.escala_repeticoes;
  v_hoje date;
  v_dia date;
  v_valor text;
  v_n integer := 0;
begin
  select * into r from public.escala_repeticoes where id = p_rep;
  if r.id is null or not exists (
    select 1 from public.membros m where m.id = r.membro_id and m.ativo
  ) then
    return 0;
  end if;
  select (now() at time zone e.fuso_horario)::date into v_hoje from public.empresas e where e.id = r.empresa_id;

  v_dia := greatest(r.semana_base + 7, v_hoje);
  while v_dia <= v_hoje + 56 loop
    v_valor := coalesce(r.valores ->> ((v_dia - r.semana_base) % 7), '');
    if v_valor <> ''
       and (v_valor in ('folga', 'ferias', 'falta') or exists (
         select 1 from public.turnos t where t.id::text = v_valor and t.empresa_id = r.empresa_id and t.ativo
       ))
       and not exists (select 1 from public.escalas e where e.membro_id = r.membro_id and e.data = v_dia) then
      insert into public.escalas (empresa_id, unidade_id, setor_id, membro_id, data, tipo, turno_id, criado_por, automatica)
      values (
        r.empresa_id, r.unidade_id,
        (select m.setor_id from public.membros m where m.id = r.membro_id),
        r.membro_id, v_dia,
        case when v_valor in ('folga', 'ferias', 'falta') then v_valor else 'turno' end,
        case when v_valor in ('folga', 'ferias', 'falta') then null else v_valor::uuid end,
        r.criado_por, true
      );
      v_n := v_n + 1;
    end if;
    v_dia := v_dia + 1;
  end loop;
  update public.escala_repeticoes set estendida_em = v_hoje where id = r.id;
  return v_n;
end;
$$;

revoke execute on function public.aplicar_repeticao_escala(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Ligar (com a semana p_semana como modelo) ou desligar a repetição
-- -----------------------------------------------------------------------------
create or replace function public.repetir_escala(p_empresa uuid, p_unidade uuid, p_membro uuid, p_semana date, p_ativo boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros;
  v_segunda date := p_semana - ((extract(isodow from p_semana)::int) - 1);
  v_hoje date;
  v_valores jsonb;
  v_id uuid;
begin
  select * into v_membro from public.membros m where m.id = p_membro and m.empresa_id = p_empresa;
  if v_membro.id is null then
    raise exception 'Colaborador não encontrado';
  end if;
  if not exists (select 1 from public.unidades u where u.id = p_unidade and u.empresa_id = p_empresa) then
    raise exception 'Unidade não encontrada';
  end if;
  if not public.pode_acessar(p_empresa, 'escalas.editar', p_unidade, v_membro.setor_id, null, null) then
    raise exception 'Você não pode alterar a escala de %', v_membro.nome;
  end if;
  select (now() at time zone e.fuso_horario)::date into v_hoje from public.empresas e where e.id = p_empresa;

  -- tira os dias futuros gerados antes (sem troca pendente), para o modelo novo valer
  delete from public.escalas e
   where e.membro_id = p_membro and e.automatica and e.data >= v_hoje
     and (not p_ativo or e.data > v_segunda + 6)
     and not exists (select 1 from public.escala_trocas t where t.escala_id = e.id and t.status = 'pendente');
  delete from public.escala_repeticoes where membro_id = p_membro;

  if not p_ativo then
    return 0;
  end if;

  select jsonb_agg(coalesce(
           (select case e.tipo when 'turno' then e.turno_id::text else e.tipo end
              from public.escalas e
             where e.membro_id = p_membro and e.unidade_id = p_unidade and e.data = v_segunda + i),
           '') order by i)
    into v_valores
    from generate_series(0, 6) i;
  if not exists (select 1 from jsonb_array_elements_text(v_valores) v where v <> '') then
    raise exception 'Preencha a semana de % antes de repetir', v_membro.nome;
  end if;

  insert into public.escala_repeticoes (empresa_id, unidade_id, setor_id, membro_id, semana_base, valores, criado_por)
  values (p_empresa, p_unidade, v_membro.setor_id, p_membro, v_segunda, v_valores, public.meu_membro_id(p_empresa))
  returning id into v_id;
  return public.aplicar_repeticao_escala(v_id);
end;
$$;

grant execute on function public.repetir_escala(uuid, uuid, uuid, date, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Relógio: mantém todas as repetições 8 semanas à frente
-- -----------------------------------------------------------------------------
create or replace function public.estender_escalas_repetidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_n integer := 0;
begin
  for v_id in
    select r.id from public.escala_repeticoes r join public.empresas e on e.id = r.empresa_id
    where r.estendida_em is distinct from (now() at time zone e.fuso_horario)::date
  loop
    v_n := v_n + public.aplicar_repeticao_escala(v_id);
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.estender_escalas_repetidas() from public, anon, authenticated;
grant execute on function public.estender_escalas_repetidas() to service_role;
