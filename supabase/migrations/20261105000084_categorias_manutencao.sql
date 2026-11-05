-- Categoria "de manutenção": as ações recorrentes dessas categorias aparecem
-- também em Manutenções › Ações recorrentes (sem duplicar cadastro).
alter table public.categorias
  add column if not exists manutencao boolean not null default false;

-- ponto de partida: categorias que já têm "manuten" no nome
update public.categorias
   set manutencao = true
 where not manutencao
   and lower(nome) like '%manuten%';
