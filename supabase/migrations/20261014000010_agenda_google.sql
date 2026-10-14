-- =============================================================================
-- Eventos do Google na Agenda do app
-- =============================================================================
-- Cada pessoa pode colar o "endereço secreto no formato iCal" da própria agenda
-- do Google. O app lê esse endereço e mostra os eventos dela na tela Agenda,
-- junto com tarefas e turnos. O endereço dá acesso à agenda pessoal: só a
-- própria pessoa vê e altera (nem o dono da empresa).
-- =============================================================================

create table public.agenda_google (
  membro_id uuid primary key references public.membros (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  url text not null check (url like 'https://calendar.google.com/calendar/ical/%'),
  updated_at timestamptz not null default now()
);

alter table public.agenda_google enable row level security;

create policy agenda_google_dono on public.agenda_google for all to authenticated
  using (membro_id = public.meu_membro_id(empresa_id))
  with check (
    membro_id = public.meu_membro_id(empresa_id)
    and exists (select 1 from public.membros m where m.id = membro_id and m.empresa_id = agenda_google.empresa_id)
  );
