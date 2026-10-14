-- =============================================================================
-- WhatsApp: avisos internos entre colaboradores
-- =============================================================================
-- Provedores:
--   simulacao  = ensaio com dados fictícios (nada sai do app)
--   evolution  = Evolution API v2.3.7 via Baileys (WhatsApp Web, NÃO é a API oficial)
--   meta_cloud = API oficial da Meta (WhatsApp Cloud API) — reservado para depois
--
-- Quem pode o quê:
--   whatsapp.gerenciar = conectar número, autorizar destinatários, confirmar envios
--   whatsapp.avisos    = preparar rascunhos (não confirma nem mexe na conexão)
--
-- Segredos (chave global da Evolution, segredo do webhook) ficam SÓ nas variáveis
-- de ambiente do servidor. O QR Code nunca é gravado no banco.
-- Eventos e o envio da fila são gravados pelo servidor (service_role).
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('whatsapp.gerenciar', 'WhatsApp', 'Conectar número, autorizar destinatários e confirmar envios', false, 70),
  ('whatsapp.avisos',    'WhatsApp', 'Preparar rascunhos de avisos pelo WhatsApp',                  false, 71);

-- perfis "Gestor" já existentes (empresas novas recebem tudo pelo criar_empresa)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, k.chave, 'empresa'
from public.perfis p
cross join (values ('whatsapp.gerenciar'), ('whatsapp.avisos')) as k (chave)
where p.nome = 'Gestor'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Conexões (uma por empresa ou por unidade)
-- -----------------------------------------------------------------------------
create table public.whatsapp_conexoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- null = vale para a empresa toda
  unidade_id uuid references public.unidades (id) on delete cascade,
  provedor text not null check (provedor in ('simulacao', 'evolution', 'meta_cloud')),
  -- nome da instância no provedor: gerado pelo banco, ninguém escolhe
  instancia text not null unique,
  status text not null default 'desconectado'
    check (status in ('desconectado', 'conectando', 'conectado', 'atencao')),
  numero_mascarado text,
  ultimo_contato_em timestamptz,
  ultimo_erro text,
  -- começa pausado: nada é enviado até o responsável liberar
  envio_pausado boolean not null default true,
  webhook_configurado_em timestamptz,
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index whatsapp_conexoes_local
  on public.whatsapp_conexoes (empresa_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Pode ver/usar a conexão: permissão na empresa + acesso à unidade dela
create or replace function public.whatsapp_pode(p_conexao uuid, p_chave text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.whatsapp_conexoes c
    where c.id = p_conexao
      and public.eh_membro(c.empresa_id)
      and public.tem_permissao(c.empresa_id, p_chave)
      and (c.unidade_id is null or public.tem_acesso_unidade(c.unidade_id))
  )
$$;
revoke execute on function public.whatsapp_pode(uuid, text) from public, anon;
grant execute on function public.whatsapp_pode(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Destinatários autorizados (só quem gerencia cadastra = autoriza)
-- -----------------------------------------------------------------------------
create table public.whatsapp_contatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  membro_id uuid references public.membros (id) on delete set null,
  nome text not null check (char_length(trim(nome)) between 1 and 120),
  -- DDI + DDD + número, só dígitos (ex.: 5521999998888)
  telefone text not null check (telefone ~ '^[0-9]{12,13}$'),
  ativo boolean not null default true,
  autorizado_por uuid references public.membros (id) on delete set null,
  autorizado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (empresa_id, telefone)
);

-- -----------------------------------------------------------------------------
-- Regras: "quando o check-list X for enviado, preparar um rascunho para Y"
-- (nunca envia sozinho nesta fase: só prepara o rascunho)
-- -----------------------------------------------------------------------------
create table public.whatsapp_gatilhos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  conexao_id uuid not null references public.whatsapp_conexoes (id) on delete cascade,
  modelo_id uuid not null references public.checklist_modelos (id) on delete cascade,
  contato_id uuid not null references public.whatsapp_contatos (id) on delete cascade,
  ativo boolean not null default true,
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (modelo_id, contato_id)
);

-- -----------------------------------------------------------------------------
-- Mensagens enviadas (rascunho → na fila → aceito → entregue → lido)
-- -----------------------------------------------------------------------------
create table public.whatsapp_mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  conexao_id uuid not null references public.whatsapp_conexoes (id) on delete cascade,
  -- chave de idempotência do pedido: o mesmo formulário enviado 2x vira 1 mensagem
  pedido_id uuid not null unique,
  contato_id uuid not null references public.whatsapp_contatos (id) on delete restrict,
  texto text not null check (char_length(texto) between 1 and 2000),
  origem text not null default 'manual' check (origem in ('manual', 'teste', 'checklist')),
  origem_id uuid,
  situacao text not null default 'rascunho' check (situacao in (
    'rascunho', 'na_fila', 'enviando', 'aceito', 'entregue', 'lido', 'falhou', 'desconhecido', 'cancelado'
  )),
  mensagem_externa_id text,
  tentativas int not null default 0,
  proxima_tentativa_em timestamptz,
  erro text,
  solicitado_por uuid references public.membros (id) on delete set null,
  confirmado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  confirmado_em timestamptz,
  enviado_em timestamptz,
  aceito_em timestamptz,
  entregue_em timestamptz,
  lido_em timestamptz,
  falhou_em timestamptz,
  updated_at timestamptz not null default now()
);
create index on public.whatsapp_mensagens (empresa_id, created_at desc);
create index on public.whatsapp_mensagens (situacao, proxima_tentativa_em) where situacao in ('na_fila', 'enviando');
create unique index whatsapp_mensagens_externa
  on public.whatsapp_mensagens (conexao_id, mensagem_externa_id) where mensagem_externa_id is not null;

-- -----------------------------------------------------------------------------
-- Eventos recebidos pelo webhook (resumo sem conteúdo pessoal)
-- -----------------------------------------------------------------------------
create table public.whatsapp_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  conexao_id uuid not null references public.whatsapp_conexoes (id) on delete cascade,
  -- identificador externo + conexão = chave de deduplicação
  evento_externo_id text not null,
  tipo text not null,
  situacao text not null default 'recebido'
    check (situacao in ('recebido', 'processado', 'ignorado', 'falhou')),
  repeticoes int not null default 0,
  resumo jsonb not null default '{}'::jsonb,
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  unique (conexao_id, evento_externo_id)
);
create index on public.whatsapp_eventos (empresa_id, recebido_em desc);
create index on public.whatsapp_eventos (situacao) where situacao = 'recebido';

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.whatsapp_conexoes enable row level security;
alter table public.whatsapp_contatos enable row level security;
alter table public.whatsapp_gatilhos enable row level security;
alter table public.whatsapp_mensagens enable row level security;
alter table public.whatsapp_eventos enable row level security;

-- conexões: escrita só pelas funções abaixo (o nome da instância não pode ser trocado)
create policy whatsapp_conexoes_select on public.whatsapp_conexoes for select to authenticated
  using (public.whatsapp_pode(id, 'whatsapp.gerenciar') or public.whatsapp_pode(id, 'whatsapp.avisos'));

create policy whatsapp_contatos_select on public.whatsapp_contatos for select to authenticated
  using (
    public.eh_membro(empresa_id)
    and (public.tem_permissao(empresa_id, 'whatsapp.gerenciar') or public.tem_permissao(empresa_id, 'whatsapp.avisos'))
  );
create policy whatsapp_contatos_write on public.whatsapp_contatos for all to authenticated
  using (public.eh_membro(empresa_id) and public.tem_permissao(empresa_id, 'whatsapp.gerenciar'))
  with check (
    public.eh_membro(empresa_id) and public.tem_permissao(empresa_id, 'whatsapp.gerenciar')
    and (membro_id is null or exists (
      select 1 from public.membros m where m.id = membro_id and m.empresa_id = whatsapp_contatos.empresa_id
    ))
  );

create policy whatsapp_gatilhos_select on public.whatsapp_gatilhos for select to authenticated
  using (public.whatsapp_pode(conexao_id, 'whatsapp.gerenciar'));
create policy whatsapp_gatilhos_write on public.whatsapp_gatilhos for all to authenticated
  using (public.whatsapp_pode(conexao_id, 'whatsapp.gerenciar'))
  with check (
    public.whatsapp_pode(conexao_id, 'whatsapp.gerenciar')
    and exists (select 1 from public.whatsapp_conexoes c where c.id = conexao_id and c.empresa_id = whatsapp_gatilhos.empresa_id)
    and exists (select 1 from public.whatsapp_contatos t where t.id = contato_id and t.empresa_id = whatsapp_gatilhos.empresa_id)
    and exists (select 1 from public.checklist_modelos m where m.id = modelo_id and m.empresa_id = whatsapp_gatilhos.empresa_id)
  );

create policy whatsapp_mensagens_select on public.whatsapp_mensagens for select to authenticated
  using (public.whatsapp_pode(conexao_id, 'whatsapp.gerenciar') or public.whatsapp_pode(conexao_id, 'whatsapp.avisos'));
-- rascunho: quem prepara grava; confirmar é pela função whatsapp_confirmar
create policy whatsapp_mensagens_insert on public.whatsapp_mensagens for insert to authenticated
  with check (
    situacao = 'rascunho'
    and origem in ('manual', 'teste')
    and solicitado_por = public.meu_membro_id(empresa_id)
    and confirmado_por is null and mensagem_externa_id is null and tentativas = 0
    and (public.whatsapp_pode(conexao_id, 'whatsapp.gerenciar') or public.whatsapp_pode(conexao_id, 'whatsapp.avisos'))
    and exists (select 1 from public.whatsapp_conexoes c where c.id = conexao_id and c.empresa_id = whatsapp_mensagens.empresa_id)
    and exists (
      select 1 from public.whatsapp_contatos t
      where t.id = contato_id and t.empresa_id = whatsapp_mensagens.empresa_id and t.ativo
    )
  );

create policy whatsapp_eventos_select on public.whatsapp_eventos for select to authenticated
  using (public.whatsapp_pode(conexao_id, 'whatsapp.gerenciar'));

-- -----------------------------------------------------------------------------
-- Funções para quem está logado
-- -----------------------------------------------------------------------------

-- Cria a conexão (o banco gera o nome da instância)
create or replace function public.whatsapp_criar_conexao(p_empresa uuid, p_unidade uuid, p_provedor text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.eh_membro(p_empresa) and public.tem_permissao(p_empresa, 'whatsapp.gerenciar')) then
    raise exception 'Você não tem permissão para conectar o WhatsApp';
  end if;
  if p_unidade is not null and not exists (
    select 1 from public.unidades u where u.id = p_unidade and u.empresa_id = p_empresa
  ) then
    raise exception 'Unidade inválida';
  end if;
  if p_unidade is not null and not public.tem_acesso_unidade(p_unidade) then
    raise exception 'Você não tem acesso a esta unidade';
  end if;
  if p_provedor not in ('simulacao', 'evolution') then
    raise exception 'Esta modalidade ainda não está disponível';
  end if;

  insert into public.whatsapp_conexoes (empresa_id, unidade_id, provedor, instancia, criado_por)
  values (
    p_empresa, p_unidade, p_provedor,
    'ao-' || replace(gen_random_uuid()::text, '-', ''),
    public.meu_membro_id(p_empresa)
  )
  returning id into v_id;
  return v_id;
exception
  when unique_violation then
    raise exception 'Já existe uma conexão para este local';
end;
$$;

-- Pausar / liberar envios
create or replace function public.whatsapp_pausar(p_conexao uuid, p_pausado boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.whatsapp_pode(p_conexao, 'whatsapp.gerenciar') then
    raise exception 'Você não tem permissão para alterar esta conexão';
  end if;
  update public.whatsapp_conexoes
     set envio_pausado = p_pausado, updated_at = now()
   where id = p_conexao;
end;
$$;

-- Estado lido do provedor pela tela (status vem do servidor do app, não do navegador)
create or replace function public.whatsapp_atualizar_estado(
  p_conexao uuid, p_status text, p_numero text, p_erro text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.whatsapp_pode(p_conexao, 'whatsapp.gerenciar') then
    raise exception 'Você não tem permissão para alterar esta conexão';
  end if;
  update public.whatsapp_conexoes
     set status = p_status,
         numero_mascarado = coalesce(p_numero, numero_mascarado),
         ultimo_erro = p_erro,
         ultimo_contato_em = case when p_erro is null then now() else ultimo_contato_em end,
         updated_at = now()
   where id = p_conexao;
end;
$$;

create or replace function public.whatsapp_marcar_webhook(p_conexao uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.whatsapp_pode(p_conexao, 'whatsapp.gerenciar') then
    raise exception 'Você não tem permissão para alterar esta conexão';
  end if;
  update public.whatsapp_conexoes set webhook_configurado_em = now(), updated_at = now() where id = p_conexao;
end;
$$;

-- Cancelar um rascunho (quem preparou ou quem gerencia)
create or replace function public.whatsapp_cancelar(p_mensagem uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.whatsapp_mensagens;
begin
  select * into v from public.whatsapp_mensagens where id = p_mensagem;
  if v.id is null or not (
    public.whatsapp_pode(v.conexao_id, 'whatsapp.gerenciar')
    or (public.whatsapp_pode(v.conexao_id, 'whatsapp.avisos') and v.solicitado_por = public.meu_membro_id(v.empresa_id))
  ) then
    raise exception 'Você não tem permissão para cancelar este aviso';
  end if;
  update public.whatsapp_mensagens
     set situacao = 'cancelado', updated_at = now()
   where id = p_mensagem and situacao = 'rascunho';
  if not found then
    raise exception 'Só dá para cancelar um rascunho';
  end if;
end;
$$;

-- Confirmar: rascunho → na fila. Uma confirmação = uma mensagem (o update só
-- acontece uma vez porque exige situacao = 'rascunho').
create or replace function public.whatsapp_confirmar(p_mensagem uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.whatsapp_mensagens;
  v_pausado boolean;
begin
  select * into v from public.whatsapp_mensagens where id = p_mensagem;
  if v.id is null or not public.whatsapp_pode(v.conexao_id, 'whatsapp.gerenciar') then
    raise exception 'Só o responsável pelo WhatsApp pode confirmar envios';
  end if;
  select envio_pausado into v_pausado from public.whatsapp_conexoes where id = v.conexao_id;
  if v_pausado then
    raise exception 'O envio está pausado nesta conexão. Libere os envios antes de confirmar.';
  end if;
  if not exists (select 1 from public.whatsapp_contatos t where t.id = v.contato_id and t.ativo) then
    raise exception 'Este destinatário não está mais autorizado';
  end if;

  update public.whatsapp_mensagens
     set situacao = 'na_fila',
         confirmado_por = public.meu_membro_id(v.empresa_id),
         confirmado_em = now(),
         proxima_tentativa_em = now(),
         updated_at = now()
   where id = p_mensagem and situacao = 'rascunho';
  if not found then
    raise exception 'Este aviso já foi confirmado';
  end if;
end;
$$;

-- Resultado desconhecido (timeout): uma pessoa decide, nunca o sistema sozinho
--   'reenviar' → volta para a fila (nova tentativa)
--   'enviada'  → conferiu no celular (ou o app achou no provedor) que saiu
--   'falhou'   → desiste
create or replace function public.whatsapp_resolver_pendencia(p_mensagem uuid, p_acao text, p_externo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.whatsapp_mensagens;
begin
  select * into v from public.whatsapp_mensagens where id = p_mensagem;
  if v.id is null or not public.whatsapp_pode(v.conexao_id, 'whatsapp.gerenciar') then
    raise exception 'Só o responsável pelo WhatsApp pode resolver pendências';
  end if;
  update public.whatsapp_mensagens
     set situacao = case p_acao when 'reenviar' then 'na_fila' when 'enviada' then 'aceito' else 'falhou' end,
         proxima_tentativa_em = case when p_acao = 'reenviar' then now() end,
         aceito_em = case when p_acao = 'enviada' then now() else aceito_em end,
         falhou_em = case when p_acao = 'falhou' then now() else falhou_em end,
         erro = case when p_acao = 'enviada' then null else erro end,
         mensagem_externa_id = case when p_acao = 'enviada' then coalesce(p_externo, mensagem_externa_id) else mensagem_externa_id end,
         updated_at = now()
   where id = p_mensagem and situacao = 'desconhecido' and p_acao in ('reenviar', 'enviada', 'falhou');
  if not found then
    raise exception 'Este aviso não está pendente';
  end if;
end;
$$;

revoke execute on function public.whatsapp_criar_conexao(uuid, uuid, text) from public, anon;
revoke execute on function public.whatsapp_pausar(uuid, boolean) from public, anon;
revoke execute on function public.whatsapp_atualizar_estado(uuid, text, text, text) from public, anon;
revoke execute on function public.whatsapp_marcar_webhook(uuid) from public, anon;
revoke execute on function public.whatsapp_cancelar(uuid) from public, anon;
revoke execute on function public.whatsapp_confirmar(uuid) from public, anon;
revoke execute on function public.whatsapp_resolver_pendencia(uuid, text, text) from public, anon;
grant execute on function public.whatsapp_criar_conexao(uuid, uuid, text) to authenticated;
grant execute on function public.whatsapp_pausar(uuid, boolean) to authenticated;
grant execute on function public.whatsapp_atualizar_estado(uuid, text, text, text) to authenticated;
grant execute on function public.whatsapp_marcar_webhook(uuid) to authenticated;
grant execute on function public.whatsapp_cancelar(uuid) to authenticated;
grant execute on function public.whatsapp_confirmar(uuid) to authenticated;
grant execute on function public.whatsapp_resolver_pendencia(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Funções do servidor (service_role): webhook e fila
-- -----------------------------------------------------------------------------

-- Grava o evento uma vez só. Repetido: só conta a repetição. Retorna (id, novo).
create or replace function public.whatsapp_registrar_evento(
  p_conexao uuid, p_externo text, p_tipo text, p_resumo jsonb
)
returns table (id uuid, novo boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  insert into public.whatsapp_eventos as e (empresa_id, conexao_id, evento_externo_id, tipo, resumo)
  select c.empresa_id, c.id, p_externo, p_tipo, coalesce(p_resumo, '{}'::jsonb)
  from public.whatsapp_conexoes c where c.id = p_conexao
  on conflict (conexao_id, evento_externo_id)
  do update set repeticoes = e.repeticoes + 1
  returning e.id, (e.xmax = 0);
end;
$$;

-- Reserva uma mensagem da fila para envio (atômico: só um processo pega).
-- Não reserva se a conexão estiver pausada ou desconectada.
create or replace function public.whatsapp_reservar_envio(p_mensagem uuid)
returns table (
  id uuid, empresa_id uuid, texto text, origem text, origem_id uuid, pedido_id uuid, tentativas int,
  provedor text, instancia text, telefone text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  update public.whatsapp_mensagens m
     set situacao = 'enviando', tentativas = m.tentativas + 1, enviado_em = now(), updated_at = now()
    from public.whatsapp_conexoes c, public.whatsapp_contatos t
   where m.id = p_mensagem
     and m.situacao = 'na_fila'
     and (m.proxima_tentativa_em is null or m.proxima_tentativa_em <= now())
     and c.id = m.conexao_id and not c.envio_pausado
     and t.id = m.contato_id and t.ativo
  returning m.id, m.empresa_id, m.texto, m.origem, m.origem_id, m.pedido_id, m.tentativas,
            c.provedor, c.instancia, t.telefone;
end;
$$;

revoke execute on function public.whatsapp_registrar_evento(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.whatsapp_reservar_envio(uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_registrar_evento(uuid, text, text, jsonb) to service_role;
grant execute on function public.whatsapp_reservar_envio(uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Gatilho: check-list enviado → rascunho para cada destinatário da regra
-- (ex.: "Relatório do fechamento pronto para revisão"). Só rascunho: alguém
-- com whatsapp.gerenciar confirma antes de sair.
-- -----------------------------------------------------------------------------
create or replace function public.tg_whatsapp_checklist_enviado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.whatsapp_mensagens (empresa_id, conexao_id, pedido_id, contato_id, texto, origem, origem_id)
  select g.empresa_id, g.conexao_id, gen_random_uuid(), g.contato_id,
         format(
           E'*%s pronto para revisão*\nUnidade: %s\nEnviado por: %s às %s%s',
           new.modelo_nome,
           coalesce(u.nome, '-'),
           new.executor_nome,
           to_char(new.enviado_em at time zone e.fuso_horario, 'DD/MM HH24:MI'),
           case when new.qtd_nao > 0 then format(E'\nItens com "Não": %s', new.qtd_nao) else '' end
         ),
         'checklist', new.id
  from public.whatsapp_gatilhos g
  join public.whatsapp_conexoes c on c.id = g.conexao_id
  join public.whatsapp_contatos t on t.id = g.contato_id and t.ativo
  join public.empresas e on e.id = new.empresa_id
  left join public.unidades u on u.id = new.unidade_id
  where g.modelo_id = new.modelo_id and g.ativo
    and (c.unidade_id is null or c.unidade_id = new.unidade_id);
  return null;
end;
$$;

create trigger whatsapp_checklist_enviado
  after insert on public.checklist_execucoes
  for each row execute function public.tg_whatsapp_checklist_enviado();
