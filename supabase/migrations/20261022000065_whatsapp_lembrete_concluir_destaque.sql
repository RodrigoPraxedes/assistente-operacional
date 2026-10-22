-- =============================================================================
-- WhatsApp: lembrete de concluir em negrito e itálico
-- =============================================================================
-- A linha final do aviso de tarefa atribuída passa de "Ao terminar, conclua
-- pelo link." para "*_Quando concluir, sinalize no app como Concluído._*" (negrito
-- e itálico no WhatsApp), em linha separada. Corpo igual ao da migration 60.
-- =============================================================================

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
  if new.origem not in ('tarefa', 'conclusao', 'checklist', 'lembrete', 'resumo', 'prazo', 'contagem') then
    return new;
  end if;
  select * into a from public.whatsapp_automacoes x where x.empresa_id = new.empresa_id;
  new.com_link := case new.origem
    when 'tarefa' then coalesce(a.link_tarefa, true)
    when 'conclusao' then coalesce(a.link_conclusao, false)
    when 'checklist' then coalesce(a.link_checklist, false)
    when 'contagem' then coalesce(a.link_checklist, false)
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
      elsif new.origem = 'contagem' then
        select r.executor_id into v_pessoa from public.contagem_registros r where r.id = new.origem_id;
      elsif new.origem = 'lembrete' then
        select coalesce(m.resultado_membro_id, c.resultado_membro_id) into v_pessoa
        from public.tarefas t
        left join public.checklist_modelos m on m.id = t.origem_id and t.origem = 'checklist'
        left join public.contagens c on c.id = t.origem_id and t.origem = 'contagem'
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
      new.texto || E'\n\n*_Quando concluir, sinalize no app como Concluído._*',
      2000
    );
  end if;
  return new;
end;
$$;
