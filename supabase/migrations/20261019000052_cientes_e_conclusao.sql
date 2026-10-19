-- =============================================================================
-- "Avisar também (ciente)" e a chave "Todos precisam concluir"
-- =============================================================================
-- Antes, para avisar uma segunda pessoa era preciso pô-la como responsável, e a
-- tarefa em conjunto (migration 27) só concluía quando todos marcassem a parte.
--   1) cientes: pessoas que só ficam sabendo (recebem o WhatsApp de atribuição,
--      lembrete de ação e conclusão e enxergam a tarefa), sem ser responsáveis:
--      não contam nas partes e não movem nem concluem a tarefa.
--   2) todos_concluem: nas tarefas com 2+ responsáveis, ligado = todos marcam a
--      parte (comportamento da migration 27); desligado = qualquer responsável
--      conclui e fecha para todos. O que já existe fica ligado; o que nascer
--      daqui em diante nasce desligado (check-list segue ligado pelo app).
-- =============================================================================

alter table public.tarefas add column cientes uuid[] not null default '{}';
alter table public.acoes add column cientes uuid[] not null default '{}';
alter table public.alerta_avisos add column cientes uuid[] not null default '{}';

alter table public.tarefas add column todos_concluem boolean not null default true;
alter table public.acoes add column todos_concluem boolean not null default true;
alter table public.alerta_avisos add column todos_concluem boolean not null default true;

alter table public.tarefas alter column todos_concluem set default false;
alter table public.acoes alter column todos_concluem set default false;
alter table public.alerta_avisos alter column todos_concluem set default false;

create index tarefas_cientes on public.tarefas using gin (cientes);

-- -----------------------------------------------------------------------------
-- Cientes: sem nulos, repetidos nem responsáveis; só gente da própria empresa.
-- O nome começa com "z" para rodar depois de tg_responsaveis (ordem alfabética).
-- -----------------------------------------------------------------------------
create or replace function public.tg_cientes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.cientes := coalesce((
    select array_agg(x order by pos)
    from (
      select x, min(pos) as pos
      from unnest(new.cientes) with ordinality as u (x, pos)
      where x is not null and not (x = any(new.responsaveis))
      group by x
    ) s
  ), '{}');

  if exists (
    select 1 from unnest(new.cientes) as x
    where not exists (select 1 from public.membros m where m.id = x and m.empresa_id = new.empresa_id)
  ) then
    raise exception 'Pessoa a avisar não encontrada nesta empresa';
  end if;
  return new;
end;
$$;

create trigger tarefas_z_cientes before insert or update on public.tarefas
  for each row execute function public.tg_cientes();
create trigger acoes_z_cientes before insert or update on public.acoes
  for each row execute function public.tg_cientes();
create trigger alerta_avisos_z_cientes before insert or update on public.alerta_avisos
  for each row execute function public.tg_cientes();

-- -----------------------------------------------------------------------------
-- Quem é ciente enxerga a tarefa e a ação (só leitura: as regras de alteração
-- continuam valendo só para responsáveis e quem tem permissão)
-- -----------------------------------------------------------------------------
create policy tarefas_select_ciente on public.tarefas for select to authenticated
  using (public.eh_membro(empresa_id) and public.meu_membro_id(empresa_id) = any(cientes));

create policy acoes_select_ciente on public.acoes for select to authenticated
  using (public.eh_membro(empresa_id) and public.meu_membro_id(empresa_id) = any(cientes));

-- -----------------------------------------------------------------------------
-- Conclusão em conjunto só vale com "todos_concluem" ligado
-- (mesma função da migration 27, com essa condição a mais)
-- -----------------------------------------------------------------------------
create or replace function public.tg_tarefas_conjunto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_eu uuid;
begin
  select tipo into v_tipo from public.status where id = new.status_id;

  if v_tipo = 'cancelado' then
    if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
      new.cancelada_em := now();
    end if;
  else
    new.cancelada_em := null;
  end if;

  new.partes_feitas := coalesce((
    select array_agg(x) from unnest(new.partes_feitas) as x where x = any(new.responsaveis)
  ), '{}');

  if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id
     and new.origem = 'checklist' and v_tipo <> 'concluido'
     and current_setting('app.sistema', true) is distinct from 'on' then
    raise exception 'Check-list só pode ir para Concluído (feito ou não feito)';
  end if;

  if tg_op = 'UPDATE' and new.status_id is distinct from old.status_id then
    if v_tipo = 'concluido' then
      v_eu := public.meu_membro_id(new.empresa_id);
      if current_setting('app.sistema', true) is distinct from 'on'
         and new.todos_concluem
         and v_eu is not null
         and cardinality(new.responsaveis) > 1
         and v_eu = any(new.responsaveis)
         and v_eu is distinct from new.criado_por
         and not (new.responsaveis <@ new.partes_feitas) then
        raise exception 'Tarefa em conjunto: marque "minha parte feita". Ela conclui quando todos marcarem.';
      end if;
    elsif v_tipo in ('aberto', 'em_andamento') then
      new.partes_feitas := '{}';
    end if;
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ação ou aviso de alerta: mudar cientes / chave atualiza as tarefas abertas
-- -----------------------------------------------------------------------------
create or replace function public.tg_cientes_nas_tarefas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cientes is not distinct from old.cientes and new.todos_concluem is not distinct from old.todos_concluem then
    return null;
  end if;
  update public.tarefas t
     set cientes = new.cientes, todos_concluem = new.todos_concluem
   where t.origem = case when tg_table_name = 'acoes' then 'acao' else 'alerta' end
     and t.origem_id = new.id
     and t.concluida_em is null
     and (t.cientes is distinct from new.cientes or t.todos_concluem is distinct from new.todos_concluem)
     and exists (
       select 1 from public.status s
       where s.id = t.status_id and s.tipo not in ('concluido', 'cancelado')
     );
  return null;
end;
$$;

create trigger acoes_cientes_nas_tarefas after update of cientes, todos_concluem on public.acoes
  for each row execute function public.tg_cientes_nas_tarefas();
create trigger alerta_avisos_cientes_nas_tarefas after update of cientes, todos_concluem on public.alerta_avisos
  for each row execute function public.tg_cientes_nas_tarefas();

-- -----------------------------------------------------------------------------
-- WhatsApp: ciente que entrou recebe "para seu conhecimento"
-- -----------------------------------------------------------------------------
create or replace function public.tg_whatsapp_tarefa_ciente()
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
  v_resp text;
begin
  if cardinality(new.cientes) = 0 or new.privado then
    return null;
  end if;
  if tg_op = 'UPDATE' and new.cientes is not distinct from old.cientes then
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
  from unnest(new.cientes) as x
  where tg_op = 'INSERT' or not (x = any(old.cientes));

  v_quem := coalesce(public.meu_membro_id(new.empresa_id), new.criado_por);
  select nome into v_quem_nome from public.membros where id = v_quem;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  select string_agg(split_part(trim(m.nome), ' ', 1), ', ' order by u.pos) into v_resp
  from unnest(new.responsaveis) with ordinality as u (x, pos)
  join public.membros m on m.id = u.x;

  foreach v_pessoa in array v_novos loop
    continue when v_pessoa = v_quem and new.origem <> 'acao';

    perform public.whatsapp_enfileirar_automatica(
      new.empresa_id, new.unidade_id, v_pessoa,
      format(
        E'*Para seu conhecimento*\n%s%s%s%s%s%s',
        new.titulo,
        case when new.origem = 'acao' and new.ocorrencia_em is not null
          then E'\nQuando: ' || to_char(new.ocorrencia_em at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when new.prazo is not null
          then E'\nPrazo: ' || to_char(new.prazo at time zone v_fuso, 'DD/MM HH24:MI') else '' end,
        case when v_unidade is not null then E'\nUnidade: ' || v_unidade else '' end,
        case when v_resp is not null then E'\nResponsável: ' || v_resp else '' end,
        case when v_quem_nome is not null then E'\nAvisado por: ' || v_quem_nome else '' end
      ),
      'tarefa', new.id,
      'ciente:' || new.id || ':' || v_pessoa
    );
  end loop;
  return null;
exception
  when others then
    raise warning 'whatsapp_tarefa_ciente: %', sqlerrm;
    return null;
end;
$$;

create trigger whatsapp_tarefa_ciente
  after insert or update of cientes on public.tarefas
  for each row execute function public.tg_whatsapp_tarefa_ciente();

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
    continue when v_pessoa = v_quem;
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

create trigger whatsapp_tarefa_ciente_concluida
  after update of status_id on public.tarefas
  for each row execute function public.tg_whatsapp_tarefa_ciente_concluida();
