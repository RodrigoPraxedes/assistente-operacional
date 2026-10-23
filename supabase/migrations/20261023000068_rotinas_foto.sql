-- Foto ilustrativa opcional da rotina (como a atividade deve ficar/ser feita).
-- Fica no bucket anexos, em {empresa_id}/rotinas/; a limpeza de 30 dias não toca nela.
alter table public.rotinas
  add column if not exists foto_path text
  check (foto_path is null or split_part(foto_path, '/', 1) = empresa_id::text);
