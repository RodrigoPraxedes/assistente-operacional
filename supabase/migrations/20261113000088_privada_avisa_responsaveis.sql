-- Tarefa privada também avisa os responsáveis.
--
-- Antes, os gatilhos de "tarefa atribuída" (WhatsApp e push) saíam sem fazer nada quando a
-- tarefa era privada, então o responsável só descobria abrindo o app. A privacidade continua
-- valendo: o aviso vai só para cada responsável (nunca para grupo) e só ele, quem criou e
-- quem é ciente enxergam a tarefa. Cientes seguem sem aviso em tarefa privada.
-- Mesmas funções das migrations 69 (WhatsApp) e 73 (push), sem a saída por "new.privado".

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
  v_equip text;
  v_novos uuid[];
  v_pessoa uuid;
  v_outros text;
begin
  if cardinality(new.responsaveis) = 0 then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.responsaveis is not distinct from old.responsaveis then
    return null;
  end if;
  if new.origem in ('checklist', 'contagem') then
    return null;
  end if;
  if not exists (select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.aviso_tarefa) then
    return null;
  end if;
  if exists (select 1 from public.status s where s.id = new.status_id and s.tipo in ('concluido', 'cancelado')) then
    return null;
  end if;

  select coalesce(array_agg(x), '{}') into v_novos
  from unnest(new.responsaveis) as x
  where tg_op = 'INSERT' or not (x = any(old.responsaveis));

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  if new.origem = 'chamado' then
    select e.nome into v_equip
    from public.chamados c join public.equipamentos e on e.id = c.equipamento_id
    where c.tarefa_id = new.id;
  end if;

  foreach v_pessoa in array v_novos loop
    continue when v_pessoa = v_quem and new.origem <> 'acao';

    select string_agg(split_part(trim(m.nome), ' ', 1), ', ' order by u.pos) into v_outros
    from unnest(new.responsaveis) with ordinality as u (x, pos)
    join public.membros m on m.id = u.x
    where u.x <> v_pessoa;

    perform public.whatsapp_enfileirar_automatica(
      new.empresa_id, new.unidade_id, v_pessoa,
      format(
        E'*Nova tarefa para você* 📌\n\n%s%s%s%s%s%s%s',
        new.titulo,
        case when v_equip is not null then E'\n*Equipamento:* ' || v_equip else '' end,
        case when new.origem = 'acao' and new.ocorrencia_em is not null
          then E'\n*Quando:* ' || to_char(new.ocorrencia_em at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when new.prazo is not null
          then E'\n*Prazo:* ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when v_unidade is not null then E'\n*Unidade:* ' || v_unidade else '' end,
        case when v_outros is not null then E'\n*Junto com:* ' || v_outros else '' end,
        case when v_quem_nome is not null then E'\n*Atribuída por:* ' || v_quem_nome else '' end
      ),
      'tarefa', new.id,
      'tarefa:' || new.id || ':' || v_pessoa
    );
  end loop;
  return null;
exception
  when others then
    raise warning 'whatsapp_tarefa_atribuida: %', sqlerrm;
    return null;
end;
$$;



create or replace function public.tg_push_tarefa_atribuida()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quem uuid;
  v_quem_nome text;
  v_fuso text;
  v_pessoa uuid;
  v_novos uuid[];
begin
  if cardinality(new.responsaveis) = 0 then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.responsaveis is not distinct from old.responsaveis then
    return null;
  end if;
  if new.origem in ('checklist', 'contagem') then
    return null;
  end if;
  if not exists (select 1 from public.empresas e where e.id = new.empresa_id and e.push_tarefa) then
    return null;
  end if;
  if exists (select 1 from public.status s where s.id = new.status_id and s.tipo in ('concluido', 'cancelado')) then
    return null;
  end if;

  select coalesce(array_agg(x), '{}') into v_novos
  from unnest(new.responsaveis) as x
  where tg_op = 'INSERT' or not (x = any(old.responsaveis));

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;

  foreach v_pessoa in array v_novos loop
    continue when v_pessoa = v_quem and new.origem <> 'acao';
    -- só enfileira para quem tem aparelho inscrito
    continue when not exists (select 1 from public.push_inscricoes i where i.membro_id = v_pessoa);

    insert into public.push_fila (empresa_id, membro_id, tipo, titulo, corpo, url, chave)
    values (
      new.empresa_id, v_pessoa, 'tarefa', 'Nova tarefa para você',
      new.titulo
        || case when new.prazo is not null
             then ' · prazo ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end
        || case when v_quem_nome is not null then ' · por ' || v_quem_nome else '' end,
      case when new.origem = 'chamado'
        then '/e/' || new.empresa_id || '/chamados/' || new.id
        else '/e/' || new.empresa_id || '/tarefas/' || new.id end,
      'tarefa:' || new.id || ':' || v_pessoa || ':' || extract(epoch from clock_timestamp())::bigint
    )
    on conflict (chave) do nothing;
  end loop;
  return null;
exception
  when others then
    raise warning 'push_tarefa_atribuida: %', sqlerrm;
    return null;
end;
$$;
