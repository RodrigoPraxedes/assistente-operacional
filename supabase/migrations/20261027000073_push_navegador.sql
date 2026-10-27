-- Notificações push no navegador/PWA (Web Push), além do WhatsApp.
--  * push_inscricoes: um registro por aparelho/navegador de cada colaborador.
--  * push_fila: avisos a enviar; o relógio /api/cron/whatsapp envia e marca.
--  * empresas.push_tarefa / push_prazo: chave por tipo de aviso.
-- O aviso de "tarefa atribuída" nasce num gatilho (mesmas regras do aviso de WhatsApp);
-- o de "prazo venceu" é gerado pelo relógio (src/lib/push.ts).

alter table public.empresas
  add column if not exists push_tarefa boolean not null default true,
  add column if not exists push_prazo boolean not null default true;

create table if not exists public.push_inscricoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null references public.membros (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
create index if not exists push_inscricoes_membro_idx on public.push_inscricoes (membro_id);
alter table public.push_inscricoes enable row level security;

drop policy if exists push_inscricoes_proprias on public.push_inscricoes;
create policy push_inscricoes_proprias on public.push_inscricoes
  for all to authenticated
  using (public.eh_membro(empresa_id) and membro_id = public.meu_membro_id(empresa_id))
  with check (public.eh_membro(empresa_id) and membro_id = public.meu_membro_id(empresa_id));

create table if not exists public.push_fila (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid not null references public.membros (id) on delete cascade,
  tipo text not null,
  titulo text not null,
  corpo text not null,
  url text not null,
  chave text not null unique,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists push_fila_pendentes_idx on public.push_fila (criado_em) where enviado_em is null;
-- sem política: só o servidor (service_role) lê e grava
alter table public.push_fila enable row level security;

create or replace function public.tg_push_tarefa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem uuid;
  v_quem_nome text;
  v_fuso text;
  v_pessoa uuid;
  v_novos uuid[];
begin
  if cardinality(new.responsaveis) = 0 or new.privado then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.responsaveis is not distinct from old.responsaveis then
    return null;
  end if;
  if new.origem in ('checklist', 'contagem') then
    return null;
  end if;
  if not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.push_tarefa) then
    return null;
  end if;
  if exists (select 1 from public.status s where s.id = new.status_id and s.tipo in ('concluido', 'cancelado')) then
    return null;
  end if;

  select coalesce(array_agg(x), '{}') into v_novos
  from unnest(new.responsaveis) as x
  where tg_op = 'INSERT' or not (x = any(old.responsaveis));

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;

  foreach v_pessoa in array v_novos loop
    continue when v_pessoa = v_quem and new.origem <> 'acao';
    -- só enfileira para quem tem aparelho inscrito
    continue when not exists (select 1 from public.push_inscricoes i where i.membro_id = v_pessoa);

    insert into public.push_fila (empresa_id, membro_id, tipo, titulo, corpo, url, chave)
    values (
      new.empresa_id, v_pessoa, 'tarefa', 'Nova tarefa para você',
      new.titulo
        || case when new.prazo is not null
             then ' · prazo ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end
        || case when v_quem_nome is not null then ' · por ' || v_quem_nome else '' end,
      case when new.origem = 'chamado'
        then '/e/' || new.empresa_id || '/chamados/' || new.id
        else '/e/' || new.empresa_id || '/tarefas/' || new.id end,
      'tarefa:' || new.id || ':' || v_pessoa || ':' || extract(epoch from clock_timestamp())::bigint
    )
    on conflict (chave) do nothing;
  end loop;
  return null;
exception
  when others then
    raise warning 'push_tarefa_atribuida: %', sqlerrm;
    return null;
end;
$$;

drop trigger if exists tarefas_push_atribuida on public.tarefas;
create trigger tarefas_push_atribuida
  after insert or update of responsaveis on public.tarefas
  for each row execute function public.tg_push_tarefa_atribuida();
