-- Check-list: o lembrete "X min antes" pode ir para um GRUPO do WhatsApp (líderes),
-- além de (ou em vez de) os responsáveis. Quem estiver disponível no grupo realiza.
alter table public.checklist_modelos
  add column if not exists lembrete_grupo_id uuid references public.whatsapp_contatos (id) on delete set null,
  add column if not exists lembrete_so_grupo boolean not null default false;
