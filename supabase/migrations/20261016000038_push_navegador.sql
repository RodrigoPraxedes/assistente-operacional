-- Notificações push no navegador/app instalado: uma linha por aparelho do usuário.
create table public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index on public.push_inscricoes (usuario_id);

alter table public.push_inscricoes enable row level security;

create policy push_inscricoes_proprias on public.push_inscricoes
  for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

grant select, insert, update, delete on public.push_inscricoes to authenticated;
