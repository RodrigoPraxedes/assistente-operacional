-- =============================================================================
-- Google Agenda (link de assinatura)
-- =============================================================================
-- Cada colaborador pode ter um link secreto de calendário (formato iCal, o
-- mesmo que Google Agenda, iPhone e Outlook leem). Ele adiciona o link uma vez
-- no Google Agenda e passa a ver as tarefas dele, as próximas ocorrências de
-- check-lists, ações e alertas e os turnos da escala.
--
-- Quem tem o link vê a agenda, sem login: por isso o token é longo, pode ser
-- trocado (o antigo para de funcionar) ou desligado.
--
-- O link é gerado pela própria pessoa (se ela entra no app) ou por quem
-- cadastra colaboradores (config.membros), que pode mandar pelo WhatsApp.
-- =============================================================================

create table public.agenda_links (
  membro_id uuid primary key references public.membros (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  -- última vez que um calendário buscou o link (mostra que está funcionando)
  acessado_em timestamptz
);
create index on public.agenda_links (empresa_id);

-- Leitura: a própria pessoa ou quem cadastra colaboradores. Gravar só pelas
-- funções abaixo; o feed público lê com a chave do servidor.
alter table public.agenda_links enable row level security;

create policy agenda_links_select on public.agenda_links for select to authenticated
  using (
    membro_id = public.meu_membro_id(empresa_id)
    or public.tem_permissao(empresa_id, 'config.membros')
  );

-- Cria o link ou troca por um novo (o antigo deixa de funcionar)
create or replace function public.gerar_link_agenda(p_membro uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membros;
  v_eu uuid;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select * into v_m from public.membros where id = p_membro;
  if v_m.id is null then
    raise exception 'Colaborador não encontrado';
  end if;
  v_eu := public.meu_membro_id(v_m.empresa_id);
  if v_eu is null or (v_eu <> v_m.id and not public.tem_permissao(v_m.empresa_id, 'config.membros')) then
    raise exception 'Você não pode criar o link de agenda deste colaborador';
  end if;

  insert into public.agenda_links (membro_id, empresa_id, token, criado_por)
  values (v_m.id, v_m.empresa_id, v_token, v_eu)
  on conflict (membro_id) do update
    set token = excluded.token, criado_por = excluded.criado_por,
        created_at = now(), acessado_em = null;
  return v_token;
end;
$$;

-- Desliga o link
create or replace function public.revogar_link_agenda(p_membro uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membros;
  v_eu uuid;
begin
  select * into v_m from public.membros where id = p_membro;
  if v_m.id is null then
    raise exception 'Colaborador não encontrado';
  end if;
  v_eu := public.meu_membro_id(v_m.empresa_id);
  if v_eu is null or (v_eu <> v_m.id and not public.tem_permissao(v_m.empresa_id, 'config.membros')) then
    raise exception 'Você não pode desligar o link de agenda deste colaborador';
  end if;
  delete from public.agenda_links where membro_id = p_membro;
end;
$$;

grant execute on function
  public.gerar_link_agenda(uuid),
  public.revogar_link_agenda(uuid)
to authenticated;
