-- =============================================================================
-- Tarefa com foto para concluir
-- Ao criar, quem cria marca "Exigir foto para concluir". A tarefa só vai para
-- Concluído depois que alguém envia uma foto tirada na hora. Em tarefa com
-- vários responsáveis, cada um envia a sua foto ao marcar a própria parte.
-- =============================================================================

alter table public.tarefas add column exige_foto boolean not null default false;

create table public.tarefa_fotos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  path text not null,
  membro_id uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  check (split_part(path, '/', 1) = empresa_id::text)
);
create index on public.tarefa_fotos (tarefa_id);

alter table public.tarefa_fotos enable row level security;

-- vê as fotos quem vê a tarefa (a subconsulta passa pela RLS de tarefas)
create policy tarefa_fotos_select on public.tarefa_fotos for select to authenticated
  using (exists (select 1 from public.tarefas t where t.id = tarefa_id and t.empresa_id = tarefa_fotos.empresa_id));

-- envia foto quem vê a tarefa, sempre em nome próprio, e só enquanto ela está aberta
create policy tarefa_fotos_insert on public.tarefa_fotos for insert to authenticated
  with check (
    membro_id = public.meu_membro_id(empresa_id)
    and exists (
      select 1 from public.tarefas t
      where t.id = tarefa_id and t.empresa_id = tarefa_fotos.empresa_id
        and t.concluida_em is null and t.cancelada_em is null
    )
  );

grant select, insert on public.tarefa_fotos to authenticated;

-- -----------------------------------------------------------------------------
-- Concluir exige foto (o sistema, ao fechar a tarefa em conjunto, já conferiu
-- a foto de cada parte em marcar_minha_parte)
-- -----------------------------------------------------------------------------
create or replace function public.tg_tarefas_exige_foto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.exige_foto
     and new.status_id is distinct from old.status_id
     and current_setting('app.sistema', true) is distinct from 'on'
     and exists (select 1 from public.status s where s.id = new.status_id and s.tipo = 'concluido')
     and not exists (select 1 from public.tarefa_fotos f where f.tarefa_id = new.id) then
    raise exception 'Esta tarefa pede uma foto para concluir. Abra a tarefa e envie a foto.';
  end if;
  return new;
end;
$$;

create trigger tarefas_exige_foto before update on public.tarefas
  for each row execute function public.tg_tarefas_exige_foto();

-- -----------------------------------------------------------------------------
-- Marcar minha parte: com foto exigida, só marca quem já enviou a sua
-- (mesma função da migration 27, com a conferência da foto)
-- -----------------------------------------------------------------------------
create or replace function public.marcar_minha_parte(p_tarefa uuid, p_feita boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tarefas;
  v_eu uuid;
  v_concluido uuid;
begin
  select * into v_t from public.tarefas where id = p_tarefa for update;
  if v_t.id is null or not public.empresa_liberada(v_t.empresa_id) then
    raise exception 'Tarefa não encontrada';
  end if;
  v_eu := public.meu_membro_id(v_t.empresa_id);
  if v_eu is null or not (v_eu = any(v_t.responsaveis)) then
    raise exception 'Só quem é responsável marca a própria parte';
  end if;
  if cardinality(v_t.responsaveis) < 2 then
    raise exception 'Só tarefas com mais de um responsável têm partes';
  end if;
  if v_t.concluida_em is not null or v_t.cancelada_em is not null then
    raise exception 'Esta tarefa já foi encerrada';
  end if;
  if p_feita and v_t.exige_foto
     and not exists (select 1 from public.tarefa_fotos f where f.tarefa_id = p_tarefa and f.membro_id = v_eu) then
    raise exception 'Esta tarefa pede uma foto: envie a sua para marcar a sua parte.';
  end if;

  update public.tarefas
     set partes_feitas = case when p_feita
           then array_append(array_remove(partes_feitas, v_eu), v_eu)
           else array_remove(partes_feitas, v_eu) end
   where id = p_tarefa
  returning * into v_t;

  if p_feita and v_t.responsaveis <@ v_t.partes_feitas then
    select id into v_concluido from public.status
    where empresa_id = v_t.empresa_id and tipo = 'concluido' and ativo and modulo is null
    order by ordem limit 1;
    if v_concluido is not null then
      perform set_config('app.sistema', 'on', true);
      update public.tarefas set status_id = v_concluido where id = p_tarefa;
      perform set_config('app.sistema', '', true);
      return true;
    end if;
  end if;
  return false;
end;
$$;
grant execute on function public.marcar_minha_parte(uuid, boolean) to authenticated;
