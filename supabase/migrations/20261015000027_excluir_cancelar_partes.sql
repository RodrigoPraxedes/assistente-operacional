-- =============================================================================
-- 1) Quem criou pode excluir a própria tarefa avulsa ou manutenção
-- 2) Cancelada guarda quando foi cancelada (o Kanban esconde depois de 48 h)
-- 3) Tarefa com vários responsáveis: cada um marca "minha parte feita";
--    quando todos marcam, a tarefa vai sozinha para Concluído. Enquanto falta
--    alguém, um responsável não conclui direto (quem criou e quem não está na
--    lista, com permissão de concluir, ainda podem).
-- =============================================================================

alter table public.tarefas add column cancelada_em timestamptz;
alter table public.tarefas add column partes_feitas uuid[] not null default '{}';

update public.tarefas t set cancelada_em = t.updated_at
from public.status s
where s.id = t.status_id and s.tipo = 'cancelado';

-- -----------------------------------------------------------------------------
-- Antes de gravar: data do cancelamento, partes ao reabrir, conclusão em conjunto
-- -----------------------------------------------------------------------------
create or replace function public.tg_tarefas_conjunto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_eu uuid;
begin
  select tipo into v_tipo from public.status where id = new.status_id;

  if v_tipo = 'cancelado' then
    if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
      new.cancelada_em := now();
    end if;
  else
    new.cancelada_em := null;
  end if;

  -- só valem as partes de quem ainda é responsável
  new.partes_feitas := coalesce((
    select array_agg(x) from unnest(new.partes_feitas) as x where x = any(new.responsaveis)
  ), '{}');

  if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
    if v_tipo = 'concluido' then
      v_eu := public.meu_membro_id(new.empresa_id);
      if current_setting('app.sistema', true) is distinct from 'on'
         and v_eu is not null
         and cardinality(new.responsaveis) > 1
         and v_eu = any(new.responsaveis)
         and v_eu is distinct from new.criado_por
         and not (new.responsaveis <@ new.partes_feitas) then
        raise exception 'Tarefa em conjunto: marque "minha parte feita". Ela conclui quando todos marcarem.';
      end if;
    elsif v_tipo in ('aberto', 'em_andamento') then
      -- reaberta: todo mundo marca de novo
      new.partes_feitas := '{}';
    end if;
  end if;
  return new;
end;
$$;

-- nome depois de "tarefas_responsaveis": os gatilhos "before" rodam em ordem
-- alfabética e este precisa da lista de responsáveis já acertada
create trigger tarefas_sincroniza_conjunto before insert or update on public.tarefas
  for each row execute function public.tg_tarefas_conjunto();

-- -----------------------------------------------------------------------------
-- Marcar / desmarcar minha parte
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

-- -----------------------------------------------------------------------------
-- Excluir: quem tem a permissão, ou quem criou (tarefa avulsa ou manutenção)
-- -----------------------------------------------------------------------------
drop policy tarefas_delete on public.tarefas;
create policy tarefas_delete on public.tarefas for delete to authenticated
  using (
    (
      public.tem_permissao(empresa_id, 'tarefas.excluir')
      or (origem in ('avulsa', 'chamado') and criado_por = public.meu_membro_id(empresa_id))
    )
    and public.pode_acessar(empresa_id, 'tarefas.ver', unidade_id, setor_id,
      public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
    and public.ve_privado(empresa_id, privado, public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
  );
