-- =============================================================================
-- WhatsApp: avisos de conclusão
-- =============================================================================
--   aviso_conclusao = tarefa concluída → mensagem para quem criou a tarefa
--   checklist_auto  = check-list concluído → as regras "Avisos automáticos de
--                     check-list" (aba Destinatários) enviam sozinhas, sem
--                     confirmar (desligado = continua virando rascunho)
-- Mesmas proteções da migration 24 (limite diário, pausa, chave única).
-- =============================================================================

alter table public.whatsapp_automacoes
  add column aviso_conclusao boolean not null default false,
  add column checklist_auto boolean not null default false;

alter table public.whatsapp_mensagens drop constraint whatsapp_mensagens_origem_check;
alter table public.whatsapp_mensagens add constraint whatsapp_mensagens_origem_check
  check (origem in ('manual', 'teste', 'checklist', 'tarefa', 'resumo', 'conclusao'));

-- -----------------------------------------------------------------------------
-- Enfileira para um destinatário e conexão já escolhidos. Toda mensagem
-- automática tem chave; o limite diário conta as que saíram sozinhas.
-- -----------------------------------------------------------------------------
create or replace function public.whatsapp_enfileirar_contato(
  p_empresa uuid, p_conexao uuid, p_contato uuid, p_texto text, p_origem text, p_origem_id uuid, p_chave text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limite int;
  v_hoje int;
  v_cheio boolean;
  v_id uuid;
begin
  select a.limite_diario into v_limite from public.whatsapp_automacoes a where a.empresa_id = p_empresa;
  select count(*) into v_hoje
  from public.whatsapp_mensagens m
  where m.conexao_id = p_conexao and m.chave is not null and m.confirmado_por is null
    and m.situacao <> 'rascunho'
    and m.created_at > now() - interval '24 hours';
  v_cheio := v_hoje >= coalesce(v_limite, 150);

  insert into public.whatsapp_mensagens (
    empresa_id, conexao_id, pedido_id, contato_id, texto, origem, origem_id, chave,
    situacao, proxima_tentativa_em, confirmado_em, erro
  )
  values (
    p_empresa, p_conexao, gen_random_uuid(), p_contato, left(p_texto, 2000), p_origem, p_origem_id, p_chave,
    case when v_cheio then 'rascunho' else 'na_fila' end,
    case when v_cheio then null else now() end,
    case when v_cheio then null else now() end,
    case when v_cheio then 'Limite diário de envios automáticos atingido: confirme se quiser enviar.' end
  )
  on conflict (chave) where chave is not null do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.whatsapp_enfileirar_contato(uuid, uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_enfileirar_contato(uuid, uuid, uuid, text, text, uuid, text) to service_role;

-- Para um colaborador: acha o destinatário e a conexão e enfileira
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
begin
  select t.id into v_contato
  from public.whatsapp_contatos t
  where t.empresa_id = p_empresa and t.membro_id = p_membro and t.ativo
  order by t.autorizado_em desc
  limit 1;
  if v_contato is null then
    return null;
  end if;

  -- número da unidade; senão o da empresa toda; senão o de outra unidade
  select c.id into v_conexao
  from public.whatsapp_conexoes c
  where c.empresa_id = p_empresa
  order by (c.unidade_id = p_unidade) desc nulls last, (c.unidade_id is null) desc, c.created_at
  limit 1;
  if v_conexao is null then
    return null;
  end if;

  return public.whatsapp_enfileirar_contato(p_empresa, v_conexao, v_contato, p_texto, p_origem, p_origem_id, p_chave);
end;
$$;

-- -----------------------------------------------------------------------------
-- Gatilho: tarefa concluída → aviso para quem criou
--   - check-list fica de fora (tem o aviso próprio, abaixo);
--   - não avisa quem concluiu a própria tarefa nem tarefa privada.
-- -----------------------------------------------------------------------------
create or replace function public.tg_whatsapp_tarefa_concluida()
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
  if new.concluida_em is null or old.concluida_em is not null
     or new.criado_por is null or new.privado or new.origem = 'checklist' then
    return null;
  end if;
  if not exists (select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.aviso_conclusao) then
    return null;
  end if;

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.responsavel_id);
  if v_quem = new.criado_por then
    return null;
  end if;
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;

  perform public.whatsapp_enfileirar_automatica(
    new.empresa_id, new.unidade_id, new.criado_por,
    format(
      E'*Tarefa concluída ✅*\n%s%s%s',
      new.titulo,
      E'\nConcluída' || coalesce(' por ' || v_quem_nome, '') || ' em '
        || to_char(new.concluida_em at time zone v_fuso, 'DD/MM HH24:MI'),
      case when v_unidade is not null then E'\nUnidade: ' || v_unidade else '' end
    ),
    'conclusao', new.id,
    'conclusao:' || new.id || ':' || to_char(new.concluida_em, 'YYYYMMDDHH24MISS')
  );
  return null;
exception
  -- o aviso nunca pode impedir de salvar a tarefa
  when others then
    raise warning 'whatsapp_tarefa_concluida: %', sqlerrm;
    return null;
end;
$$;

create trigger whatsapp_tarefa_concluida
  after update of status_id on public.tarefas
  for each row execute function public.tg_whatsapp_tarefa_concluida();

-- -----------------------------------------------------------------------------
-- Check-list concluído: com checklist_auto ligado, as regras enviam sozinhas;
-- desligado, continua como antes (rascunho para alguém confirmar).
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
  r record;
begin
  select coalesce(a.checklist_auto, false) into v_auto
  from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id;

  for r in
    select g.empresa_id, g.conexao_id, g.contato_id, u.nome as unidade, e.fuso_horario
    from public.whatsapp_gatilhos g
    join public.whatsapp_conexoes c on c.id = g.conexao_id
    join public.whatsapp_contatos t on t.id = g.contato_id and t.ativo
    join public.empresas e on e.id = new.empresa_id
    left join public.unidades u on u.id = new.unidade_id
    where g.modelo_id = new.modelo_id and g.ativo
      and (c.unidade_id is null or c.unidade_id = new.unidade_id)
  loop
    v_texto := format(
      E'*Check-list concluído ✅*\n%s\nUnidade: %s\nEnviado por: %s às %s%s',
      new.modelo_nome,
      coalesce(r.unidade, '-'),
      new.executor_nome,
      to_char(new.enviado_em at time zone r.fuso_horario, 'DD/MM HH24:MI'),
      case when new.qtd_nao > 0 then format(E'\nItens com "Não": %s', new.qtd_nao) else '' end
    );
    if coalesce(v_auto, false) then
      perform public.whatsapp_enfileirar_contato(
        r.empresa_id, r.conexao_id, r.contato_id, v_texto, 'checklist', new.id,
        'checklist:' || new.id || ':' || r.contato_id
      );
    else
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
