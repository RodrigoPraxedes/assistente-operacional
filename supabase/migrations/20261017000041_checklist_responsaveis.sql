-- =============================================================================
-- Check-list com vários responsáveis
-- =============================================================================
-- checklist_modelos ganha "responsaveis" (responsavel_id continua como o primeiro).
-- Trocar os responsáveis do modelo atualiza as tarefas ainda abertas, de hoje em
-- diante; quem sai da lista deixa de ver o check-list nos resumos e lembretes.
-- Quem só "recebe o resultado" (resultado_membro_id) não entra na lista.
-- =============================================================================

alter table public.checklist_modelos add column responsaveis uuid[] not null default '{}';
update public.checklist_modelos set responsaveis = array[responsavel_id] where responsavel_id is not null;

create trigger checklist_modelos_responsaveis before insert or update on public.checklist_modelos
  for each row execute function public.tg_responsaveis();

create or replace function public.tg_responsaveis_nas_tarefas_checklist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.responsaveis is not distinct from old.responsaveis then
    return null;
  end if;
  -- só tarefas abertas que ainda não passaram do dia (execuções preenchidas ficam como estão)
  update public.tarefas t
     set responsaveis = new.responsaveis
   where t.origem = 'checklist'
     and t.origem_id = new.id
     and t.concluida_em is null
     and t.responsaveis is distinct from new.responsaveis
     and coalesce(t.prazo, t.ocorrencia_em) >= date_trunc('day', now() - interval '1 day')
     and exists (
       select 1 from public.status s
       where s.id = t.status_id and s.tipo not in ('concluido', 'cancelado')
     );
  return null;
end;
$$;

create trigger checklist_modelos_responsaveis_nas_tarefas after update of responsaveis on public.checklist_modelos
  for each row execute function public.tg_responsaveis_nas_tarefas_checklist();

-- Corrige o que já ficou errado: o modelo já tem outro responsável, mas a tarefa aberta
-- continua no nome antigo.
update public.tarefas t
   set responsaveis = m.responsaveis
  from public.checklist_modelos m
 where t.origem = 'checklist'
   and t.origem_id = m.id
   and t.concluida_em is null
   and t.responsaveis is distinct from m.responsaveis
   and coalesce(t.prazo, t.ocorrencia_em) >= date_trunc('day', now() - interval '1 day')
   and exists (
     select 1 from public.status s
     where s.id = t.status_id and s.tipo not in ('concluido', 'cancelado')
   );
