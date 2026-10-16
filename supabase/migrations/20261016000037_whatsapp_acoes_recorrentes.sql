-- =============================================================================
-- WhatsApp: ação recorrente avisa na criação da tarefa e X minutos antes
-- =============================================================================
-- Causa do "ação recorrente não manda mensagem": o gatilho de tarefa atribuída
-- ignorava de propósito a origem 'acao' (e 'checklist') no INSERT, achando que o
-- resumo do dia bastava. Agora:
--   1. a ocorrência gerada de uma ação avisa o(s) responsável(is) quando nasce
--      (mesma chave "Tarefa atribuída"); e, como é o sistema que gera, avisa
--      mesmo quem criou a ação e é o próprio responsável;
--   2. lembrete_acao: X minutos antes do horário da ocorrência (padrão 30), feito
--      pelo relógio (src/lib/whatsapp-api/automacoes.ts → gerarLembretesAcoes).
-- Check-list continua só no resumo e no lembrete próprio.
-- =============================================================================

alter table public.whatsapp_automacoes
  add column lembrete_acao boolean not null default true,
  add column lembrete_acao_minutos int not null default 30 check (lembrete_acao_minutos between 1 and 720);

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
  v_novos uuid[];
  v_pessoa uuid;
  v_outros text;
begin
  if cardinality(new.responsaveis) = 0 or new.privado then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.responsaveis is not distinct from old.responsaveis then
    return null;
  end if;
  if tg_op = 'INSERT' and new.origem = 'checklist' then
    return null;
  end if;
  if not exists (select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.aviso_tarefa) then
    return null;
  end if;
  if exists (select 1 from public.status s where s.id = new.status_id and s.tipo in ('concluido', 'cancelado')) then
    return null;
  end if;

  -- só quem entrou agora (quem já estava não recebe de novo)
  select coalesce(array_agg(x), '{}') into v_novos
  from unnest(new.responsaveis) as x
  where tg_op = 'INSERT' or not (x = any(old.responsaveis));

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;

  foreach v_pessoa in array v_novos loop
    -- não avisa quem atribuiu a si mesmo (ocorrência de ação é gerada pelo sistema: avisa)
    continue when v_pessoa = v_quem and new.origem <> 'acao';

    select string_agg(split_part(trim(m.nome), ' ', 1), ', ' order by u.pos) into v_outros
    from unnest(new.responsaveis) with ordinality as u (x, pos)
    join public.membros m on m.id = u.x
    where u.x <> v_pessoa;

    perform public.whatsapp_enfileirar_automatica(
      new.empresa_id, new.unidade_id, v_pessoa,
      format(
        E'*Nova tarefa para você*\n%s%s%s%s%s%s',
        new.titulo,
        case when new.origem = 'acao' and new.ocorrencia_em is not null
          then E'\nQuando: ' || to_char(new.ocorrencia_em at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when new.prazo is not null
          then E'\nPrazo: ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when v_unidade is not null then E'\nUnidade: ' || v_unidade else '' end,
        case when v_outros is not null then E'\nJunto com: ' || v_outros else '' end,
        case when v_quem_nome is not null then E'\nAtribuída por: ' || v_quem_nome else '' end
      ),
      'tarefa', new.id,
      'tarefa:' || new.id || ':' || v_pessoa
    );
  end loop;
  return null;
exception
  -- o aviso nunca pode impedir de salvar a tarefa
  when others then
    raise warning 'whatsapp_tarefa_atribuida: %', sqlerrm;
    return null;
end;
$$;

-- "Dúvidas" do lembrete: quem recebe o resultado (check-list) ou quem criou a ação
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
