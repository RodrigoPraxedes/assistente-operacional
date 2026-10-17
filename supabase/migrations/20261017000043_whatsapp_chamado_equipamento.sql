-- Aviso de tarefa atribuída: chamado com equipamento atrelado mostra "Equipamento: <nome>".
-- (Só muda o gatilho; ver 37 para o corpo original.)
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
        E'*Nova tarefa para você*\n%s%s%s%s%s%s%s',
        new.titulo,
        case when v_equip is not null then E'\nEquipamento: ' || v_equip else '' end,
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
  when others then
    raise warning 'whatsapp_tarefa_atribuida: %', sqlerrm;
    return null;
end;
$$;
