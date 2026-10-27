-- Contagem: o lembrete também (ou só) para um GRUPO do WhatsApp, como no check-list (mig 76).
alter table public.contagens
  add column if not exists lembrete_grupo_id uuid references public.whatsapp_contatos (id) on delete set null,
  add column if not exists lembrete_so_grupo boolean not null default false;
