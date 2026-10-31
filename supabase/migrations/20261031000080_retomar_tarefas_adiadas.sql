-- =============================================================================
-- Tarefa adiada volta sozinha ao status anterior no dia da nova data
-- =============================================================================
-- Chamada pelo relógio (/api/cron/whatsapp). No dia da nova data (no fuso da
-- empresa) a tarefa adiada volta ao status de onde saiu (status_anterior_id),
-- registrando no histórico "Retomada automaticamente". Devolve o que retomou
-- para o relógio avisar os responsáveis (WhatsApp e push).
-- =============================================================================

create or replace function public.retomar_tarefas_adiadas()
returns table (id uuid, empresa_id uuid, titulo text, prazo timestamptz, origem text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  perform set_config('app.sistema', 'on', true);
  perform set_config('app.comentario', 'Retomada automaticamente (chegou a nova data)', true);
  for r in
    select t.id as tid, t.empresa_id as eid, t.titulo as ttitulo, t.prazo as tprazo, t.origem as torigem,
           t.status_anterior_id as anterior
    from public.tarefas t
    join public.status s on s.id = t.status_id and s.tipo = 'adiado'
    join public.empresas e on e.id = t.empresa_id
    where t.status_anterior_id is not null
      and t.prazo is not null
      and (t.prazo at time zone e.fuso_horario)::date <= (now() at time zone e.fuso_horario)::date
    limit 500
  loop
    update public.tarefas set status_id = r.anterior where public.tarefas.id = r.tid;
    id := r.tid; empresa_id := r.eid; titulo := r.ttitulo; prazo := r.tprazo; origem := r.torigem;
    return next;
  end loop;
  perform set_config('app.sistema', '', true);
  perform set_config('app.comentario', '', true);
end;
$$;
revoke execute on function public.retomar_tarefas_adiadas() from public, anon, authenticated;
grant execute on function public.retomar_tarefas_adiadas() to service_role;
