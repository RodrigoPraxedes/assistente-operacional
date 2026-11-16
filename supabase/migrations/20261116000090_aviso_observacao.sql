-- Observação por tarefa secundária (aviso) de uma Ação com vencimento:
-- texto livre dizendo o que fazer; vai para a descrição da tarefa criada.
alter table public.alerta_avisos add column if not exists observacao text;
