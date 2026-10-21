-- =============================================================================
-- WhatsApp: lembrar de concluir a tarefa no app
-- =============================================================================
-- Não dá para concluir pelo WhatsApp, então:
--   1) o aviso de tarefa atribuída termina com "Ao terminar, conclua pelo link."
--      (ou "conclua no app." quando a chave "Incluir link" da tarefa está desligada);
--   2) novo aviso "Prazo venceu e a tarefa segue aberta" (origem 'prazo'), gerado
--      pelo relógio /api/cron/whatsapp. Chave: aviso_prazo (padrão ligado) e
--      link_prazo (padrão ligado). Sai uma vez por tarefa, prazo e pessoa (a chave
--      da mensagem leva o prazo: prazo editado pode avisar de novo).
-- =============================================================================

alter table public.whatsapp_automacoes
  add column aviso_prazo boolean not null default true,
  add column link_prazo boolean not null default true;

alter table public.whatsapp_mensagens drop constraint whatsapp_mensagens_origem_check;
alter table public.whatsapp_mensagens add constraint whatsapp_mensagens_origem_check
  check (origem in ('manual', 'teste', 'checklist', 'tarefa', 'resumo', 'conclusao', 'boasvindas', 'lembrete', 'prazo'));

create or replace function public.tg_whatsapp_mensagem_nova()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.whatsapp_automacoes%rowtype;
  v_pessoa uuid;
  v_destino uuid;
  v_nome text;
  v_tel text;
begin
  if new.origem not in ('tarefa', 'conclusao', 'checklist', 'lembrete', 'resumo', 'prazo') then
    return new;
  end if;
  select * into a from public.whatsapp_automacoes x where x.empresa_id = new.empresa_id;
  new.com_link := case new.origem
    when 'tarefa' then coalesce(a.link_tarefa, true)
    when 'conclusao' then coalesce(a.link_conclusao, false)
    when 'checklist' then coalesce(a.link_checklist, false)
    when 'lembrete' then coalesce(a.link_lembrete, true)
    when 'resumo' then coalesce(a.link_resumo, false)
    when 'prazo' then coalesce(a.link_prazo, true)
  end;

  if coalesce(a.contato_duvidas, true) and new.origem_id is not null then
    begin
      if new.origem = 'tarefa' then
        select coalesce(public.meu_membro_id(t.empresa_id), t.criado_por) into v_pessoa
        from public.tarefas t where t.id = new.origem_id;
      elsif new.origem = 'conclusao' then
        select coalesce(public.meu_membro_id(t.empresa_id), t.responsavel_id) into v_pessoa
        from public.tarefas t where t.id = new.origem_id;
      elsif new.origem = 'checklist' then
        select e.executor_id into v_pessoa from public.checklist_execucoes e where e.id = new.origem_id;
      elsif new.origem = 'lembrete' then
        select m.resultado_membro_id into v_pessoa
        from public.tarefas t join public.checklist_modelos m on m.id = t.origem_id
        where t.id = new.origem_id;
      end if;
      select c.membro_id into v_destino from public.whatsapp_contatos c where c.id = new.contato_id;
      if v_pessoa is not null and v_pessoa is distinct from v_destino then
        select m.nome, public.whatsapp_telefone_legivel(m.telefone) into v_nome, v_tel
        from public.membros m where m.id = v_pessoa;
        if v_tel is not null then
          new.texto := left(new.texto || E'\nDúvidas: ' || v_nome || ' · ' || v_tel, 2000);
        end if;
      end if;
    exception
      -- o contato é um extra: nunca impede o aviso
      when others then
        raise warning 'whatsapp_mensagem_nova: %', sqlerrm;
    end;
  end if;

  -- lembrete de concluir só na tarefa atribuída (a de "ciente" tem outra chave)
  if new.origem = 'tarefa' and new.chave like 'tarefa:%' then
    new.texto := left(
      new.texto || E'\nAo terminar, conclua ' || case when new.com_link then 'pelo link.' else 'no app.' end,
      2000
    );
  end if;
  return new;
end;
$$;
