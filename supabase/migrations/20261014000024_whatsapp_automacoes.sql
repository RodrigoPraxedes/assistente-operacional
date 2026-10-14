-- =============================================================================
-- WhatsApp: automações que enviam sozinhas (sem confirmar na tela)
-- =============================================================================
--   aviso_tarefa = alguém recebeu uma tarefa → mensagem para ele com prazo e link
--   resumo_dia   = de manhã, uma mensagem por pessoa: turno de hoje, tarefas do
--                  dia e atrasadas
--
-- Proteções do número (API não oficial):
--   - só vai para destinatários autorizados e ligados a um colaborador;
--   - limite diário de envios automáticos por conexão: passou do limite, a
--     mensagem vira rascunho e alguém decide na aba Avisos;
--   - a conexão pausada segura tudo (como os avisos manuais);
--   - a fila espaça os envios (src/lib/whatsapp-api/fila.ts);
--   - chave única por automação: a mesma tarefa/resumo nunca sai duas vezes.
-- Tarefas privadas não geram aviso nem aparecem pelo título no resumo
-- (quem gerencia o WhatsApp vê o texto das mensagens).
-- =============================================================================

create table public.whatsapp_automacoes (
  empresa_id uuid primary key references public.empresas (id) on delete cascade,
  aviso_tarefa boolean not null default false,
  resumo_dia boolean not null default false,
  -- horário local (fuso da empresa) em que o resumo sai
  resumo_hora time not null default '07:00',
  limite_diario int not null default 150 check (limite_diario between 1 and 1000),
  -- último dia (local) em que os resumos foram gerados: evita gerar duas vezes
  resumo_gerado_em date,
  atualizado_por uuid references public.membros (id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_automacoes enable row level security;
create policy whatsapp_automacoes_select on public.whatsapp_automacoes for select to authenticated
  using (public.eh_membro(empresa_id) and public.tem_permissao(empresa_id, 'whatsapp.gerenciar'));
create policy whatsapp_automacoes_write on public.whatsapp_automacoes for all to authenticated
  using (public.eh_membro(empresa_id) and public.tem_permissao(empresa_id, 'whatsapp.gerenciar'))
  with check (public.eh_membro(empresa_id) and public.tem_permissao(empresa_id, 'whatsapp.gerenciar'));

-- novas origens + chave de idempotência das automações
alter table public.whatsapp_mensagens drop constraint whatsapp_mensagens_origem_check;
alter table public.whatsapp_mensagens add constraint whatsapp_mensagens_origem_check
  check (origem in ('manual', 'teste', 'checklist', 'tarefa', 'resumo'));
alter table public.whatsapp_mensagens add column chave text;
create unique index whatsapp_mensagens_chave on public.whatsapp_mensagens (chave) where chave is not null;

-- -----------------------------------------------------------------------------
-- Enfileira uma mensagem automática para um colaborador.
-- Retorna o id (null = sem destinatário/conexão, ou já existia).
-- -----------------------------------------------------------------------------
create or replace function public.whatsapp_enfileirar_automatica(
  p_empresa uuid, p_unidade uuid, p_membro uuid, p_texto text, p_origem text, p_origem_id uuid, p_chave text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contato uuid;
  v_conexao uuid;
  v_limite int;
  v_hoje int;
  v_id uuid;
begin
  select t.id into v_contato
  from public.whatsapp_contatos t
  where t.empresa_id = p_empresa and t.membro_id = p_membro and t.ativo
  order by t.autorizado_em desc
  limit 1;
  if v_contato is null then
    return null;
  end if;

  -- número da unidade da tarefa; senão o da empresa toda; senão o de outra unidade
  select c.id into v_conexao
  from public.whatsapp_conexoes c
  where c.empresa_id = p_empresa
  order by (c.unidade_id = p_unidade) desc nulls last, (c.unidade_id is null) desc, c.created_at
  limit 1;
  if v_conexao is null then
    return null;
  end if;

  select a.limite_diario into v_limite from public.whatsapp_automacoes a where a.empresa_id = p_empresa;
  select count(*) into v_hoje
  from public.whatsapp_mensagens m
  where m.conexao_id = v_conexao and m.origem in ('tarefa', 'resumo')
    and m.created_at > now() - interval '24 hours';

  insert into public.whatsapp_mensagens (
    empresa_id, conexao_id, pedido_id, contato_id, texto, origem, origem_id, chave,
    situacao, proxima_tentativa_em, confirmado_em, erro
  )
  select
    p_empresa, v_conexao, gen_random_uuid(), v_contato, left(p_texto, 2000), p_origem, p_origem_id, p_chave,
    case when v_hoje >= coalesce(v_limite, 150) then 'rascunho' else 'na_fila' end,
    case when v_hoje >= coalesce(v_limite, 150) then null else now() end,
    case when v_hoje >= coalesce(v_limite, 150) then null else now() end,
    case when v_hoje >= coalesce(v_limite, 150)
      then 'Limite diário de envios automáticos atingido: confirme se quiser enviar.' end
  on conflict (chave) where chave is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.whatsapp_enfileirar_automatica(uuid, uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_enfileirar_automatica(uuid, uuid, uuid, text, text, uuid, text) to service_role;

-- -----------------------------------------------------------------------------
-- Gatilho: tarefa atribuída → aviso para o responsável
--   - tarefa nova com responsável, ou responsável trocado;
--   - rotina de check-list e de ação recorrente fica de fora (vai no resumo);
--   - não avisa quem atribuiu a si mesmo, tarefa privada nem tarefa já fechada.
-- -----------------------------------------------------------------------------
create or replace function public.tg_whatsapp_tarefa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem uuid;
  v_quem_nome text;
  v_fuso text;
  v_unidade text;
begin
  if new.responsavel_id is null or new.privado then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.responsavel_id is not distinct from old.responsavel_id then
    return null;
  end if;
  if tg_op = 'INSERT' and new.origem in ('checklist', 'acao') then
    return null;
  end if;
  if not exists (select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.aviso_tarefa) then
    return null;
  end if;
  if exists (select 1 from public.status s where s.id = new.status_id and s.tipo in ('concluido', 'cancelado')) then
    return null;
  end if;

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  if v_quem = new.responsavel_id then
    return null;
  end if;
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;

  perform public.whatsapp_enfileirar_automatica(
    new.empresa_id, new.unidade_id, new.responsavel_id,
    format(
      E'*Nova tarefa para você*\n%s%s%s%s',
      new.titulo,
      case when new.prazo is not null
        then E'\nPrazo: ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
      case when v_unidade is not null then E'\nUnidade: ' || v_unidade else '' end,
      case when v_quem_nome is not null then E'\nAtribuída por: ' || v_quem_nome else '' end
    ),
    'tarefa', new.id,
    'tarefa:' || new.id || ':' || new.responsavel_id
  );
  return null;
exception
  -- o aviso nunca pode impedir de salvar a tarefa
  when others then
    raise warning 'whatsapp_tarefa_atribuida: %', sqlerrm;
    return null;
end;
$$;

create trigger whatsapp_tarefa_atribuida
  after insert or update of responsavel_id on public.tarefas
  for each row execute function public.tg_whatsapp_tarefa_atribuida();
