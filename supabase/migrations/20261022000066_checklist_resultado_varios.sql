-- =============================================================================
-- Check-list: "Recebe o resultado" com várias pessoas
-- =============================================================================
-- Um caminho só para o aviso de check-list concluído: a lista de pessoas no
-- próprio check-list (checklist_modelos.resultado_membros). resultado_membro_id
-- continua existindo e guarda a primeira da lista (lembretes, contato para
-- dúvidas e link wa.me já usam esse campo).
-- As regras antigas de WhatsApp > Destinatários (whatsapp_gatilhos) cujo
-- destinatário é um colaborador viram pessoas da lista e são removidas; as de
-- números de fora da equipe continuam valendo (o gatilho ainda as lê).
-- =============================================================================

alter table public.checklist_modelos
  add column if not exists resultado_membros uuid[] not null default '{}';

-- Mantém resultado_membro_id (a primeira) e a lista juntos, antes de gravar
create or replace function public.tg_checklist_resultados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.resultado_membros is not distinct from old.resultado_membros
       and new.resultado_membro_id is not distinct from old.resultado_membro_id then
      return new;
    end if;
    if new.resultado_membros is not distinct from old.resultado_membros then
      -- só o campo antigo foi trocado: ele passa a ser o único
      new.resultado_membros := case when new.resultado_membro_id is null then '{}' else array[new.resultado_membro_id] end;
    end if;
  elsif cardinality(new.resultado_membros) = 0 and new.resultado_membro_id is not null then
    new.resultado_membros := array[new.resultado_membro_id];
  end if;

  -- sem nulos nem repetidos, na ordem escolhida
  new.resultado_membros := coalesce((
    select array_agg(x order by pos)
    from (
      select x, min(pos) as pos
      from unnest(new.resultado_membros) with ordinality as u (x, pos)
      where x is not null
      group by x
    ) s
  ), '{}');
  new.resultado_membro_id := new.resultado_membros[1];
  return new;
end;
$$;

drop trigger if exists checklist_modelos_resultados on public.checklist_modelos;
create trigger checklist_modelos_resultados before insert or update on public.checklist_modelos
  for each row execute function public.tg_checklist_resultados();

-- Quem já recebia (campo antigo) entra na lista
update public.checklist_modelos
   set resultado_membros = array[resultado_membro_id]
 where resultado_membro_id is not null and cardinality(resultado_membros) = 0;

-- Regras antigas com colaborador viram pessoas da lista
update public.checklist_modelos m
   set resultado_membros = m.resultado_membros || coalesce((
     select array_agg(distinct t.membro_id)
     from public.whatsapp_gatilhos g
     join public.whatsapp_contatos t on t.id = g.contato_id
     where g.modelo_id = m.id and g.ativo and t.membro_id is not null
       and not (t.membro_id = any(m.resultado_membros))
   ), '{}')
 where exists (
   select 1 from public.whatsapp_gatilhos g
   join public.whatsapp_contatos t on t.id = g.contato_id
   where g.modelo_id = m.id and g.ativo and t.membro_id is not null
 );

delete from public.whatsapp_gatilhos g
 using public.whatsapp_contatos t
 where t.id = g.contato_id and t.membro_id is not null;

-- Aviso de check-list concluído: lista do check-list + regras antigas restantes
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
  v_membros uuid[];
  v_conexao uuid;
  r record;
begin
  select coalesce(a.checklist_auto, false) into v_auto
  from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  select resultado_membros into v_membros from public.checklist_modelos where id = new.modelo_id;

  v_texto := format(
    E'*Check-list concluído ✅*\n%s\nUnidade: %s\nEnviado por: %s às %s%s',
    new.modelo_nome,
    coalesce(v_unidade, '-'),
    new.executor_nome,
    to_char(new.enviado_em at time zone v_fuso, 'DD/MM HH24:MI'),
    case when new.qtd_nao > 0 then format(E'\nItens com "Não": %s', new.qtd_nao) else '' end
  );

  -- conexão preferida da unidade (a real vem antes do Ensaio)
  v_conexao := public.whatsapp_conexao_para(new.empresa_id, new.unidade_id);

  for r in
    select distinct on (x.contato_id) x.empresa_id, x.conexao_id, x.contato_id
    from (
      select g.empresa_id,
             case when c.provedor = 'simulacao' then coalesce(v_conexao, g.conexao_id) else g.conexao_id end as conexao_id,
             g.contato_id
      from public.whatsapp_gatilhos g
      join public.whatsapp_conexoes c on c.id = g.conexao_id
      join public.whatsapp_contatos t on t.id = g.contato_id and t.ativo
      where g.modelo_id = new.modelo_id and g.ativo
        and (c.unidade_id is null or c.unidade_id = new.unidade_id)
      union all
      -- quem recebe o resultado (lista do check-list), se tiver WhatsApp autorizado
      select new.empresa_id, v_conexao, (
               select t.id from public.whatsapp_contatos t
               where t.empresa_id = new.empresa_id and t.membro_id = u.membro and t.ativo
               order by t.autorizado_em desc limit 1
             )
      from unnest(coalesce(v_membros, '{}')) as u (membro)
      where v_conexao is not null
    ) x
    join public.whatsapp_conexoes c2 on c2.id = x.conexao_id
    where x.contato_id is not null
    order by x.contato_id, (c2.provedor <> 'simulacao') desc
  loop
    if coalesce(v_auto, false) then
      perform public.whatsapp_enfileirar_contato(
        r.empresa_id, r.conexao_id, r.contato_id, v_texto, 'checklist', new.id,
        'checklist:' || new.id || ':' || r.contato_id
      );
    elsif not exists (
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

