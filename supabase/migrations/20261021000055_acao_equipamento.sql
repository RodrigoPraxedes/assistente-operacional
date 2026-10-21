-- Ação recorrente ligada a um item do Patrimônio (equipamento ou móvel).
-- As tarefas geradas herdam o vínculo.
alter table public.acoes
  add column equipamento_id uuid references public.equipamentos (id) on delete set null;
alter table public.tarefas
  add column equipamento_id uuid references public.equipamentos (id) on delete set null;

create index on public.acoes (equipamento_id) where equipamento_id is not null;
create index on public.tarefas (equipamento_id) where equipamento_id is not null;
