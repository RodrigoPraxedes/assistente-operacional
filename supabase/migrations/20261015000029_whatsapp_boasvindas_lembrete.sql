-- =============================================================================
-- WhatsApp: boas-vindas, lembrete de check-list e quem recebe o resultado
-- =============================================================================
--   boas_vindas       = destinatário autorizado → mensagem pedindo para salvar o
--                       número (contato salvo também ajuda a não bloquear o número)
--   lembrete_checklist = X minutos antes do check-list, o responsável recebe um
--                       lembrete para puxar a equipe (feito pelo relógio,
--                       src/lib/whatsapp-api/automacoes.ts)
--   checklist_modelos.resultado_membro_id = quem recebe o resultado quando o
--                       check-list é concluído (além das regras da aba Destinatários)
-- =============================================================================

alter table public.whatsapp_automacoes
  add column boas_vindas boolean not null default false,
  add column lembrete_checklist boolean not null default false;

alter table public.checklist_modelos
  add column lembrete_minutos int not null default 30 check (lembrete_minutos between 0 and 720),
  add column resultado_membro_id uuid references public.membros (id) on delete set null;

alter table public.whatsapp_mensagens drop constraint whatsapp_mensagens_origem_check;
alter table public.whatsapp_mensagens add constraint whatsapp_mensagens_origem_check
  check (origem in ('manual', 'teste', 'checklist', 'tarefa', 'resumo', 'conclusao', 'boasvindas', 'lembrete'));

-- Conexão usada para um colaborador: a da unidade; senão a da empresa toda; senão outra
create or replace function public.whatsapp_conexao_para(p_empresa uuid, p_unidade uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.whatsapp_conexoes c
  where c.empresa_id = p_empresa
  order by (c.unidade_id = p_unidade) desc nulls last, (c.unidade_id is null) desc, c.created_at
  limit 1
$$;
revoke execute on function public.whatsapp_conexao_para(uuid, uuid) from public, anon, authenticated;
grant execute on function public.whatsapp_conexao_para(uuid, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- Boas-vindas: uma vez por destinatário (a chave impede repetir ao reativar)
-- -----------------------------------------------------------------------------
create or replace function public.tg_whatsapp_boas_vindas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conexao uuid;
  v_empresa text;
begin
  if not new.ativo or not exists (
    select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.boas_vindas
  ) then
    return null;
  end if;
  v_conexao := public.whatsapp_conexao_para(new.empresa_id, null);
  if v_conexao is null then
    return null;
  end if;
  select nome into v_empresa from public.empresas where id = new.empresa_id;

  perform public.whatsapp_enfileirar_contato(
    new.empresa_id, v_conexao, new.id,
    format(
      E'Olá, %s! 👋\nEste é o WhatsApp do *Atalaia*, o sistema de avisos da %s.\nPor aqui você vai receber avisos de tarefas, check-lists e o resumo do seu dia.\n\n*Salve este número nos seus contatos* para não perder nenhum aviso.',
      split_part(trim(new.nome), ' ', 1), v_empresa
    ),
    'boasvindas', null,
    'boasvindas:' || new.id
  );
  return null;
exception
  when others then
    raise warning 'whatsapp_boas_vindas: %', sqlerrm;
    return null;
end;
$$;

create trigger whatsapp_boas_vindas
  after insert on public.whatsapp_contatos
  for each row execute function public.tg_whatsapp_boas_vindas();

-- -----------------------------------------------------------------------------
-- Check-list concluído: regras da aba Destinatários + quem recebe o resultado
-- (definido no próprio check-list). Ligado = envia sozinho; desligado = rascunho.
-- -----------------------------------------------------------------------------
create or replace function public.tg_whatsapp_checklist_enviado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto boolean;
  v_texto text;
  v_fuso text;
  v_unidade text;
  v_membro uuid;
  v_contato uuid;
  v_conexao uuid;
  r record;
begin
  select coalesce(a.checklist_auto, false) into v_auto
  from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  select resultado_membro_id into v_membro from public.checklist_modelos where id = new.modelo_id;

  v_texto := format(
    E'*Check-list concluído ✅*\n%s\nUnidade: %s\nEnviado por: %s às %s%s',
    new.modelo_nome,
    coalesce(v_unidade, '-'),
    new.executor_nome,
    to_char(new.enviado_em at time zone v_fuso, 'DD/MM HH24:MI'),
    case when new.qtd_nao > 0 then format(E'\nItens com "Não": %s', new.qtd_nao) else '' end
  );

  -- quem recebe o resultado, se tiver WhatsApp autorizado
  if v_membro is not null then
    select t.id into v_contato
    from public.whatsapp_contatos t
    where t.empresa_id = new.empresa_id and t.membro_id = v_membro and t.ativo
    order by t.autorizado_em desc
    limit 1;
    v_conexao := public.whatsapp_conexao_para(new.empresa_id, new.unidade_id);
  end if;

  for r in
    select g.empresa_id, g.conexao_id, g.contato_id
    from public.whatsapp_gatilhos g
    join public.whatsapp_conexoes c on c.id = g.conexao_id
    join public.whatsapp_contatos t on t.id = g.contato_id and t.ativo
    where g.modelo_id = new.modelo_id and g.ativo
      and (c.unidade_id is null or c.unidade_id = new.unidade_id)
    union
    select new.empresa_id, v_conexao, v_contato
    where v_contato is not null and v_conexao is not null
  loop
    if coalesce(v_auto, false) then
      perform public.whatsapp_enfileirar_contato(
        r.empresa_id, r.conexao_id, r.contato_id, v_texto, 'checklist', new.id,
        'checklist:' || new.id || ':' || r.contato_id
      );
    elsif not exists (
      -- a mesma pessoa numa regra e como "recebe o resultado": um rascunho só
      select 1 from public.whatsapp_mensagens m
      where m.origem = 'checklist' and m.origem_id = new.id and m.contato_id = r.contato_id
    ) then
      insert into public.whatsapp_mensagens (empresa_id, conexao_id, pedido_id, contato_id, texto, origem, origem_id)
      values (r.empresa_id, r.conexao_id, gen_random_uuid(), r.contato_id, v_texto, 'checklist', new.id);
    end if;
  end loop;
  return null;
exception
  -- o aviso nunca pode impedir de enviar o check-list
  when others then
    raise warning 'whatsapp_checklist_enviado: %', sqlerrm;
    return null;
end;
$$;
