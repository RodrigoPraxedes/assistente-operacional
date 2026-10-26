-- Ação recorrente: opção de contar a próxima ocorrência a partir da data da
-- conclusão (em vez do calendário). Padrão: calendário (false).
alter table public.acoes
  add column if not exists contar_da_conclusao boolean not null default false;
