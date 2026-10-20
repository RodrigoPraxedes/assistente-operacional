-- Rotina em mais de um setor (ex.: café da manhã vale para a empresa inteira).
-- setor_ids passa a ser a fonte; setor_id fica só como legado (não é mais lido pelo app).
alter table public.rotinas add column setor_ids uuid[] not null default '{}';
update public.rotinas set setor_ids = array[setor_id] where setor_id is not null;
create index rotinas_setor_ids on public.rotinas using gin (setor_ids);
