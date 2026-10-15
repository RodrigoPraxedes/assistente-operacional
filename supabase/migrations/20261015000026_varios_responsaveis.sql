-- =============================================================================
-- Vários responsáveis numa tarefa (força-tarefa)
-- =============================================================================
-- tarefas, acoes e alerta_avisos ganham "responsaveis" (lista de membros).
-- "responsavel_id" continua existindo como o primeiro da lista, para o que
-- já usa uma pessoa só (planos, manutenções, check-lists, filtros antigos).
--   - gravar só responsavel_id (código antigo): a lista vira [ele];
--   - gravar responsaveis: responsavel_id passa a ser o primeiro.
-- Quem está na lista vê e move a tarefa como o responsável de sempre (inclusive
-- tarefa privada) e recebe o aviso de "tarefa atribuída" no WhatsApp.
-- Mudar os responsáveis de uma ação ou de um aviso de alerta atualiza também as
-- tarefas dele que ainda estão abertas.
-- =============================================================================

alter table public.tarefas add column responsaveis uuid[] not null default '{}';
alter table public.acoes add column responsaveis uuid[] not null default '{}';
alter table public.alerta_avisos add column responsaveis uuid[] not null default '{}';

update public.tarefas set responsaveis = array[responsavel_id] where responsavel_id is not null;
update public.acoes set responsaveis = array[responsavel_id] where responsavel_id is not null;
update public.alerta_avisos set responsaveis = array[responsavel_id] where responsavel_id is not null;

create index tarefas_responsaveis on public.tarefas using gin (responsaveis);

-- -----------------------------------------------------------------------------
-- Mantém responsavel_id e responsaveis juntos (antes de gravar)
-- -----------------------------------------------------------------------------
create or replace function public.tg_responsaveis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.responsaveis is not distinct from old.responsaveis
       and new.responsavel_id is not distinct from old.responsavel_id then
      return new;
    end if;
    if new.responsaveis is not distinct from old.responsaveis then
      -- só o responsável foi trocado: ele passa a ser o único
      new.responsaveis := case when new.responsavel_id is null then '{}' else array[new.responsavel_id] end;
    end if;
  elsif cardinality(new.responsaveis) = 0 and new.responsavel_id is not null then
    new.responsaveis := array[new.responsavel_id];
  end if;

  -- sem nulos nem repetidos, na ordem escolhida
  new.responsaveis := coalesce((
    select array_agg(x order by pos)
    from (
      select x, min(pos) as pos
      from unnest(new.responsaveis) with ordinality as u (x, pos)
      where x is not null
      group by x
    ) s
  ), '{}');

  if exists (
    select 1 from unnest(new.responsaveis) as x
    where not exists (select 1 from public.membros m where m.id = x and m.empresa_id = new.empresa_id)
  ) then
    raise exception 'Responsável não encontrado nesta empresa';
  end if;

  new.responsavel_id := new.responsaveis[1];
  return new;
end;
$$;

create trigger tarefas_responsaveis before insert or update on public.tarefas
  for each row execute function public.tg_responsaveis();
create trigger acoes_responsaveis before insert or update on public.acoes
  for each row execute function public.tg_responsaveis();
create trigger alerta_avisos_responsaveis before insert or update on public.alerta_avisos
  for each row execute function public.tg_responsaveis();

-- -----------------------------------------------------------------------------
-- Para as regras de acesso: se estou na lista, conto como "o responsável"
-- -----------------------------------------------------------------------------
create or replace function public.responsavel_eu(p_empresa uuid, p_responsavel uuid, p_responsaveis uuid[])
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.meu_membro_id(p_empresa) = any(p_responsaveis) then public.meu_membro_id(p_empresa)
    else p_responsavel
  end
$$;
grant execute on function public.responsavel_eu(uuid, uuid, uuid[]) to authenticated;

-- Alerta visível também para quem está em algum aviso
create or replace function public.ve_alerta(p_alerta uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.alertas a
    where a.id = p_alerta
      and public.eh_membro(a.empresa_id)
      and (
        public.ve_privado(a.empresa_id, a.privado, a.responsavel_id, a.criado_por)
        or exists (
          select 1 from public.alerta_avisos v
          where v.alerta_id = a.id and public.meu_membro_id(a.empresa_id) = any(v.responsaveis)
        )
      )
  )
$$;

drop policy tarefas_select on public.tarefas;
drop policy tarefas_update on public.tarefas;
drop policy tarefas_delete on public.tarefas;

create policy tarefas_select on public.tarefas for select to authenticated
  using (
    public.pode_acessar(empresa_id, 'tarefas.ver', unidade_id, setor_id,
      public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
    and public.ve_privado(empresa_id, privado, public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
  );
create policy tarefas_update on public.tarefas for update to authenticated
  using (
    public.pode_acessar(empresa_id, 'tarefas.mudar_status', unidade_id, setor_id,
      public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
    and public.ve_privado(empresa_id, privado, public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
  )
  with check (
    public.pode_acessar(empresa_id, 'tarefas.mudar_status', unidade_id, setor_id,
      public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
    and public.ve_privado(empresa_id, privado, public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
  );
create policy tarefas_delete on public.tarefas for delete to authenticated
  using (
    public.tem_permissao(empresa_id, 'tarefas.excluir')
    and public.pode_acessar(empresa_id, 'tarefas.ver', unidade_id, setor_id,
      public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
    and public.ve_privado(empresa_id, privado, public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
  );

drop policy acoes_select on public.acoes;
create policy acoes_select on public.acoes for select to authenticated
  using (
    public.eh_membro(empresa_id)
    and public.ve_privado(empresa_id, privado, public.responsavel_eu(empresa_id, responsavel_id, responsaveis), criado_por)
  );

-- -----------------------------------------------------------------------------
-- Histórico: trocar a lista de responsáveis também fica registrado
-- -----------------------------------------------------------------------------
create or replace function public.tg_tarefas_historico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro uuid;
  v_comentario text := nullif(current_setting('app.comentario', true), '');
begin
  select id into v_membro from public.membros
  where empresa_id = new.empresa_id and usuario_id = auth.uid();

  if tg_op = 'INSERT' then
    insert into public.tarefa_historico (tarefa_id, empresa_id, membro_id, acao, status_para, prazo_para, comentario)
    values (new.id, new.empresa_id, coalesce(v_membro, new.criado_por), 'criada', new.status_id, new.prazo, v_comentario);
  elsif new.status_id is distinct from old.status_id
     or new.prazo is distinct from old.prazo
     or new.responsaveis is distinct from old.responsaveis then
    insert into public.tarefa_historico (
      tarefa_id, empresa_id, membro_id, acao, status_de, status_para, prazo_de, prazo_para, comentario
    ) values (
      new.id, new.empresa_id, v_membro,
      case
        when new.status_id is distinct from old.status_id then 'status'
        when new.prazo is distinct from old.prazo then 'prazo'
        else 'responsavel'
      end,
      old.status_id, new.status_id, old.prazo, new.prazo, v_comentario
    );
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ação ou aviso de alerta com outros responsáveis: as tarefas abertas acompanham
-- -----------------------------------------------------------------------------
create or replace function public.tg_responsaveis_nas_tarefas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista uuid[] := new.responsaveis;
begin
  if new.responsaveis is not distinct from old.responsaveis then
    return null;
  end if;
  if tg_table_name = 'alerta_avisos' and cardinality(v_lista) = 0 then
    -- aviso sem responsável usa o padrão do alerta
    select coalesce(array_remove(array[a.responsavel_id], null), '{}') into v_lista
    from public.alertas a where a.id = new.alerta_id;
  end if;

  update public.tarefas t
     set responsaveis = v_lista
   where t.origem = case when tg_table_name = 'acoes' then 'acao' else 'alerta' end
     and t.origem_id = new.id
     and t.concluida_em is null
     and t.responsaveis is distinct from v_lista
     and exists (
       select 1 from public.status s
       where s.id = t.status_id and s.tipo not in ('concluido', 'cancelado')
     );
  return null;
end;
$$;

create trigger acoes_responsaveis_nas_tarefas after update of responsaveis on public.acoes
  for each row execute function public.tg_responsaveis_nas_tarefas();
create trigger alerta_avisos_responsaveis_nas_tarefas after update of responsaveis on public.alerta_avisos
  for each row execute function public.tg_responsaveis_nas_tarefas();

-- -----------------------------------------------------------------------------
-- WhatsApp: "tarefa atribuída" vai para cada responsável que entrou na lista
-- -----------------------------------------------------------------------------
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
  if tg_op = 'INSERT' and new.origem in ('checklist', 'acao') then
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
    -- não avisa quem atribuiu a si mesmo
    continue when v_pessoa = v_quem;

    select string_agg(split_part(trim(m.nome), ' ', 1), ', ' order by u.pos) into v_outros
    from unnest(new.responsaveis) with ordinality as u (x, pos)
    join public.membros m on m.id = u.x
    where u.x <> v_pessoa;

    perform public.whatsapp_enfileirar_automatica(
      new.empresa_id, new.unidade_id, v_pessoa,
      format(
        E'*Nova tarefa para você*\n%s%s%s%s%s',
        new.titulo,
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

drop trigger whatsapp_tarefa_atribuida on public.tarefas;
create trigger whatsapp_tarefa_atribuida
  after insert or update of responsavel_id, responsaveis on public.tarefas
  for each row execute function public.tg_whatsapp_tarefa_atribuida();
