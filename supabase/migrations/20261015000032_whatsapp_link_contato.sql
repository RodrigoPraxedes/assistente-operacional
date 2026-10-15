-- =============================================================================
-- WhatsApp: link do app opcional por tipo de aviso + contato para dúvidas
-- =============================================================================
-- Link em toda mensagem pesa contra o número na Evolution (não oficial). Cada
-- tipo de aviso automático passa a ter a chave "Incluir link" na aba Automações:
--   link_tarefa     tarefa atribuída           (padrão: ligado)
--   link_conclusao  tarefa concluída           (padrão: desligado)
--   link_checklist  check-list concluído       (padrão: desligado)
--   link_lembrete   lembrete de check-list     (padrão: ligado, é por ali que abre)
--   link_resumo     resumo do dia              (padrão: desligado)
-- A decisão fica gravada na mensagem (whatsapp_mensagens.com_link) quando ela é
-- criada, para o texto enviado e a conferência de "desconhecido" baterem mesmo
-- que a chave mude depois. Mensagens já existentes mantêm o link.
--
-- contato_duvidas (padrão: ligado) acrescenta "Dúvidas: Nome · +55 ..." com o
-- celular do cadastro de quem originou o aviso. O WhatsApp deixa o número
-- clicável sozinho, sem link:
--   tarefa atribuída     → quem atribuiu
--   tarefa concluída     → quem concluiu
--   check-list concluído → quem preencheu
--   lembrete             → quem recebe o resultado do check-list
-- Fica de fora quando a pessoa não tem celular ou é o próprio destinatário.
-- =============================================================================

alter table public.whatsapp_automacoes
  add column link_tarefa boolean not null default true,
  add column link_conclusao boolean not null default false,
  add column link_checklist boolean not null default false,
  add column link_lembrete boolean not null default true,
  add column link_resumo boolean not null default false,
  add column contato_duvidas boolean not null default true;

alter table public.whatsapp_mensagens
  add column com_link boolean not null default true;

-- "+55 11 91234-5678" a partir do que estiver no cadastro (null se não der)
create or replace function public.whatsapp_telefone_legivel(p_telefone text)
returns text
language sql
immutable
set search_path = ''
as $$
  with d as (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as n),
       c as (select case when length(n) in (10, 11) then '55' || n else n end as n from d)
  select case when length(n) between 12 and 13
    then '+' || left(n, 2) || ' ' || substr(n, 3, 2) || ' ' || substr(n, 5, length(n) - 8) || '-' || right(n, 4)
  end
  from c
$$;
revoke execute on function public.whatsapp_telefone_legivel(text) from public, anon, authenticated;
grant execute on function public.whatsapp_telefone_legivel(text) to service_role;

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
  return new;
end;
$$;

create trigger whatsapp_mensagem_nova
  before insert on public.whatsapp_mensagens
  for each row execute function public.tg_whatsapp_mensagem_nova();
