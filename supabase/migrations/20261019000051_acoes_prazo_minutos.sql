-- Prazo da ação em minutos depois do horário (permite "vence às 18:00").
alter table public.acoes
  add column prazo_minutos int not null default 480 check (prazo_minutos >= 0);

update public.acoes set prazo_minutos = prazo_horas * 60;
