-- =============================================================================
-- WhatsApp: celular de quem atribuiu na própria linha "Atribuída por"
-- =============================================================================
-- No aviso de tarefa atribuída o contato vinha numa linha "Dúvidas" repetindo o
-- nome. Agora fica "Atribuída por: Nome · +55 ..." (clicável no WhatsApp). Demais
-- avisos seguem com a linha "Dúvidas". Respeita a chave "Contato para dúvidas".
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
  if new.origem not in ('tarefa', 'conclusao', 'checklist', 'lembrete', 'resumo') then
    return new;
  end if;
  select * into a from public.whatsapp_automacoes x where x.empresa_id = new.empresa_id;
  new.com_link := case new.origem
    when 'tarefa' then coalesce(a.link_tarefa, true)
    when 'conclusao' then coalesce(a.link_conclusao, false)
    when 'checklist' then coalesce(a.link_checklist, false)
    when 'lembrete' then coalesce(a.link_lembrete, true)
    when 'resumo' then coalesce(a.link_resumo, false)
  end;

  if not coalesce(a.contato_duvidas, true) or new.origem_id is null then
    return new;
  end if;
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
      select coalesce(m.resultado_membro_id, case when t.origem = 'acao' then t.criado_por end) into v_pessoa
      from public.tarefas t left join public.checklist_modelos m on m.id = t.origem_id and t.origem = 'checklist'
      where t.id = new.origem_id;
    end if;
    select c.membro_id into v_destino from public.whatsapp_contatos c where c.id = new.contato_id;
    if v_pessoa is not null and v_pessoa is distinct from v_destino then
      select m.nome, public.whatsapp_telefone_legivel(m.telefone) into v_nome, v_tel
      from public.membros m where m.id = v_pessoa;
      if v_tel is not null then
        -- aviso de tarefa já traz "Atribuída por: Nome": põe o celular nessa linha
        if new.origem = 'tarefa' and position(E'\nAtribuída por: ' || v_nome in new.texto) > 0 then
          new.texto := left(replace(new.texto, E'\nAtribuída por: ' || v_nome, E'\nAtribuída por: ' || v_nome || ' · ' || v_tel), 2000);
        else
          new.texto := left(new.texto || E'\nDúvidas: ' || v_nome || ' · ' || v_tel, 2000);
        end if;
      end if;
    end if;
  exception
    -- o contato é um extra: nunca impede o aviso
    when others then
      raise warning 'whatsapp_mensagem_nova: %', sqlerrm;
  end;
  return new;
end;
$$;
