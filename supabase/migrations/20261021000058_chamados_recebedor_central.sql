-- Recebedor central de chamados: com a chave ligada, todo chamado novo cai nos
-- recebedores escolhidos em Configurações, que podem delegar a outros membros.
alter table public.empresas
  add column if not exists chamados_central_ativo boolean not null default false,
  add column if not exists chamados_central uuid[] not null default '{}';

-- Mesma função da migration 6, com os recebedores centrais como responsáveis
create or replace function public._criar_chamado(
  p_empresa uuid,
  p_titulo text,
  p_descricao text,
  p_unidade uuid,
  p_setor uuid,
  p_categoria uuid,
  p_prioridade text,
  p_equipamento uuid,
  p_local text,
  p_responsavel uuid,
  p_fornecedor uuid,
  p_criado_por uuid,
  p_aberto_por_nome text,
  p_execucao uuid,
  p_fotos text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sla jsonb;
  v_horas numeric;
  v_tarefa uuid;
  v_foto text;
  v_central_ativo boolean;
  v_central uuid[];
  v_responsaveis uuid[];
begin
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'Descreva o problema';
  end if;
  if p_unidade is not null and not exists (select 1 from public.unidades where id = p_unidade and empresa_id = p_empresa) then
    raise exception 'Unidade inválida';
  end if;
  if p_equipamento is not null and not exists (select 1 from public.equipamentos where id = p_equipamento and empresa_id = p_empresa) then
    raise exception 'Equipamento inválido';
  end if;
  if p_fornecedor is not null and not exists (select 1 from public.fornecedores where id = p_fornecedor and empresa_id = p_empresa) then
    raise exception 'Fornecedor inválido';
  end if;
  if p_responsavel is not null and not exists (select 1 from public.membros where id = p_responsavel and empresa_id = p_empresa) then
    raise exception 'Responsável inválido';
  end if;

  select sla_chamados, chamados_central_ativo, chamados_central
    into v_sla, v_central_ativo, v_central
  from public.empresas where id = p_empresa;
  v_horas := nullif(v_sla ->> coalesce(p_prioridade, 'media'), '')::numeric;

  -- recebedor central ativo: ele vale no lugar do responsável escolhido na abertura
  select coalesce(array_agg(m.id order by u.pos), '{}') into v_responsaveis
  from unnest(coalesce(v_central, '{}')) with ordinality as u (id, pos)
  join public.membros m on m.id = u.id and m.empresa_id = p_empresa and m.ativo;
  if not coalesce(v_central_ativo, false) or cardinality(v_responsaveis) = 0 then
    v_responsaveis := case when p_responsavel is null then '{}' else array[p_responsavel] end;
  end if;

  perform set_config('app.sistema', 'on', true);
  insert into public.tarefas (
    empresa_id, unidade_id, setor_id, categoria_id, titulo, descricao, origem,
    status_id, responsaveis, criado_por, prazo
  ) values (
    p_empresa, p_unidade, p_setor, p_categoria, trim(p_titulo), nullif(trim(p_descricao), ''), 'chamado',
    public.status_inicial(p_empresa), v_responsaveis, p_criado_por,
    case when v_horas is not null then now() + make_interval(secs => v_horas * 3600) end
  ) returning id into v_tarefa;
  perform set_config('app.sistema', '', true);

  insert into public.chamados (tarefa_id, empresa_id, prioridade, equipamento_id, local, fornecedor_id, aberto_por_nome, execucao_id)
  values (v_tarefa, p_empresa, coalesce(p_prioridade, 'media'), p_equipamento, nullif(trim(p_local), ''), p_fornecedor, p_aberto_por_nome, p_execucao);

  foreach v_foto in array coalesce(p_fotos, '{}') loop
    if split_part(v_foto, '/', 1) <> p_empresa::text then
      raise exception 'Foto inválida';
    end if;
    insert into public.chamado_fotos (tarefa_id, empresa_id, path, membro_id) values (v_tarefa, p_empresa, v_foto, p_criado_por);
  end loop;

  return v_tarefa;
end;
$$;

-- Delegar ou compartilhar: o recebedor central (ou quem gerencia chamados) troca a lista de responsáveis
create or replace function public.delegar_chamado(p_tarefa uuid, p_responsaveis uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_eu uuid;
  v_pode boolean;
begin
  select empresa_id into v_empresa from public.tarefas where id = p_tarefa and origem = 'chamado';
  if v_empresa is null then
    raise exception 'Chamado não encontrado';
  end if;
  v_eu := public.meu_membro_id(v_empresa);
  select public.tem_permissao(v_empresa, 'chamados.gerenciar')
      or v_eu = any(e.chamados_central) into v_pode
  from public.empresas e where e.id = v_empresa;
  if v_eu is null or not coalesce(v_pode, false) then
    raise exception 'Você não tem permissão para delegar este chamado';
  end if;
  if cardinality(coalesce(p_responsaveis, '{}')) = 0 then
    raise exception 'Escolha quem vai acompanhar o chamado';
  end if;
  update public.tarefas set responsaveis = p_responsaveis where id = p_tarefa;
end;
$$;
grant execute on function public.delegar_chamado(uuid, uuid[]) to authenticated;
