-- Limpa tarefas de alerta repetidas (mesmo texto, prazo e unidade, vindas de avisos
-- diferentes). Fica uma por grupo, preferindo a que já tem andamento ou partes
-- feitas; só apaga cópias ainda abertas e sem progresso.
delete from public.tarefas t
using (
  select x.id,
         row_number() over (
           partition by x.empresa_id, x.unidade_id, lower(btrim(x.titulo)), x.prazo
           order by (s.tipo <> 'aberto' or cardinality(x.partes_feitas) > 0) desc, x.created_at, x.id
         ) as pos,
         (s.tipo = 'aberto' and cardinality(x.partes_feitas) = 0) as sem_progresso
  from public.tarefas x
  join public.status s on s.id = x.status_id
  where x.origem = 'alerta' and x.prazo is not null
) d
where t.id = d.id and d.pos > 1 and d.sem_progresso;
