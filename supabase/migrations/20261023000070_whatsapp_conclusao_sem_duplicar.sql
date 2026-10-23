-- Aviso de "Tarefa concluída" duplicado.
--
-- Quem criou a tarefa recebe o aviso de conclusão (tg_whatsapp_tarefa_concluida) e quem está
-- como ciente também (tg_whatsapp_tarefa_ciente_concluida), com chaves diferentes. Quando a
-- mesma pessoa criou a tarefa e é ciente, as duas chaves passavam e ela recebia a mensagem
-- duas vezes. Agora o ciente que também é o criador não recebe a segunda cópia.
-- Conclusão: o ciente também fica sabendo (mesma regra do aviso ao criador)
create or replace function public.tg_whatsapp_tarefa_ciente_concluida()
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
  v_pessoa uuid;
begin
  if new.concluida_em is null or old.concluida_em is not null
     or cardinality(new.cientes) = 0 or new.privado or new.origem = 'checklist' then
    return null;
  end if;
  if not exists (select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.aviso_conclusao) then
    return null;
  end if;

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.responsavel_id);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;

  foreach v_pessoa in array new.cientes loop
    continue when v_pessoa = v_quem or v_pessoa = new.criado_por;
    perform public.whatsapp_enfileirar_automatica(
      new.empresa_id, new.unidade_id, v_pessoa,
      format(
        E'*Tarefa concluída ✅*\n%s%s%s',
        new.titulo,
        E'\nConcluída' || coalesce(' por ' || v_quem_nome, '') || ' em '
          || to_char(new.concluida_em at time zone v_fuso, 'DD/MM HH24:MI'),
        case when v_unidade is not null then E'\nUnidade: ' || v_unidade else '' end
      ),
      'conclusao', new.id,
      'conclusao:' || new.id || ':' || v_pessoa || ':' || to_char(new.concluida_em, 'YYYYMMDDHH24MISS')
    );
  end loop;
  return null;
exception
  when others then
    raise warning 'whatsapp_tarefa_ciente_concluida: %', sqlerrm;
    return null;
end;
$$;
