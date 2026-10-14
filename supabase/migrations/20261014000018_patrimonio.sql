-- =============================================================================
-- Módulo Patrimônio
-- =============================================================================
-- Móveis e equipamentos da empresa e a trajetória de cada um: compra,
-- manutenção, mudança de unidade, venda e aposentadoria.
--
-- O item de patrimônio é a mesma tabela `equipamentos` que os chamados já usam
-- (chamados.equipamento_id). Assim todo chamado aberto para o item entra no
-- histórico dele, sem cadastro duplicado.
--
-- Situação: em uso, em manutenção, parado, vendido ou aposentado. Vendido e
-- aposentado tiram o item da lista de abertura de chamados (ativo = false).
-- Cada mudança fica em patrimonio_eventos.
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('patrimonio.gerenciar', 'Patrimônio', 'Cadastrar móveis e equipamentos e registrar compra, manutenção, venda e baixa', false, 70);

-- Gerentes já existentes (empresas novas recebem pelo criar_empresa)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, 'patrimonio.gerenciar', 'empresa' from public.perfis p where p.nome = 'Gerente'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Dados do item
-- -----------------------------------------------------------------------------
alter table public.equipamentos
  add column tipo text not null default 'equipamento' check (tipo in ('equipamento', 'movel', 'outro')),
  add column situacao text not null default 'em_uso'
    check (situacao in ('em_uso', 'em_manutencao', 'parado', 'vendido', 'aposentado')),
  add column data_compra date,
  add column valor_compra numeric(12, 2),
  add column comprado_de text,
  add column nota_fiscal text,
  add column garantia_ate date,
  add column foto_path text check (foto_path is null or split_part(foto_path, '/', 1) = empresa_id::text),
  add column updated_at timestamptz not null default now();

-- quem estava inativo vira aposentado
update public.equipamentos set situacao = 'aposentado' where not ativo;

-- ativo acompanha a situação (o resto do app filtra por ativo)
create or replace function public.tg_equipamentos_situacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.ativo := new.situacao not in ('vendido', 'aposentado');
  new.updated_at := now();
  return new;
end;
$$;

create trigger equipamentos_situacao
  before insert or update on public.equipamentos
  for each row execute function public.tg_equipamentos_situacao();

-- -----------------------------------------------------------------------------
-- Histórico (trajetória)
-- -----------------------------------------------------------------------------
create table public.patrimonio_eventos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  equipamento_id uuid not null references public.equipamentos (id) on delete cascade,
  tipo text not null check (tipo in ('manutencao', 'transferencia', 'situacao', 'venda', 'aposentadoria', 'observacao')),
  data date not null default current_date,
  valor numeric(12, 2),
  descricao text,
  situacao_nova text,
  unidade_origem_id uuid references public.unidades (id) on delete set null,
  unidade_destino_id uuid references public.unidades (id) on delete set null,
  membro_id uuid references public.membros (id) on delete set null,
  membro_nome text,
  created_at timestamptz not null default now()
);
create index on public.patrimonio_eventos (equipamento_id, data desc, created_at desc);

-- Registra um acontecimento e já aplica o efeito no item:
--   venda / aposentadoria  → situação vendido / aposentado
--   transferencia          → muda a unidade
--   situacao               → muda a situação (em uso, em manutenção, parado)
--   manutencao / observacao → só anota (manutenção com valor = custo)
create or replace function public.registrar_evento_patrimonio(
  p_equipamento uuid,
  p_tipo text,
  p_data date default null,
  p_valor numeric default null,
  p_descricao text default null,
  p_situacao text default null,
  p_unidade uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.equipamentos;
  v_membro public.membros;
  v_situacao text;
  v_evento uuid;
begin
  select * into v_item from public.equipamentos where id = p_equipamento;
  if v_item.id is null or not public.tem_permissao(v_item.empresa_id, 'patrimonio.gerenciar') then
    raise exception 'Você não tem permissão para alterar o patrimônio';
  end if;
  select * into v_membro from public.membros where id = public.meu_membro_id(v_item.empresa_id);

  if p_tipo not in ('manutencao', 'transferencia', 'situacao', 'venda', 'aposentadoria', 'observacao') then
    raise exception 'Tipo de registro inválido';
  end if;
  if p_tipo = 'transferencia' then
    if p_unidade is null or not exists (select 1 from public.unidades where id = p_unidade and empresa_id = v_item.empresa_id) then
      raise exception 'Escolha a unidade de destino';
    end if;
    if p_unidade is not distinct from v_item.unidade_id then
      raise exception 'O item já está nesta unidade';
    end if;
  end if;
  if p_tipo = 'situacao' and coalesce(p_situacao, '') not in ('em_uso', 'em_manutencao', 'parado') then
    raise exception 'Escolha a nova situação';
  end if;
  if p_tipo in ('observacao', 'manutencao') and coalesce(trim(p_descricao), '') = '' then
    raise exception 'Descreva o que aconteceu';
  end if;

  v_situacao := case p_tipo
    when 'venda' then 'vendido'
    when 'aposentadoria' then 'aposentado'
    when 'situacao' then p_situacao
  end;

  insert into public.patrimonio_eventos (
    empresa_id, equipamento_id, tipo, data, valor, descricao, situacao_nova,
    unidade_origem_id, unidade_destino_id, membro_id, membro_nome
  ) values (
    v_item.empresa_id, v_item.id, p_tipo, coalesce(p_data, current_date), p_valor, nullif(trim(p_descricao), ''), v_situacao,
    case when p_tipo = 'transferencia' then v_item.unidade_id end,
    case when p_tipo = 'transferencia' then p_unidade end,
    v_membro.id, v_membro.nome
  ) returning id into v_evento;

  if v_situacao is not null then
    update public.equipamentos set situacao = v_situacao where id = v_item.id;
  end if;
  if p_tipo = 'transferencia' then
    update public.equipamentos set unidade_id = p_unidade where id = v_item.id;
  end if;

  return v_evento;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
-- quem gerencia patrimônio ou chamados cadastra itens (antes era só chamados)
drop policy equipamentos_write on public.equipamentos;
create policy equipamentos_write on public.equipamentos for all to authenticated
  using (public.tem_permissao(empresa_id, 'patrimonio.gerenciar') or public.tem_permissao(empresa_id, 'chamados.gerenciar'))
  with check (
    (public.tem_permissao(empresa_id, 'patrimonio.gerenciar') or public.tem_permissao(empresa_id, 'chamados.gerenciar'))
    and (unidade_id is null or exists (select 1 from public.unidades u where u.id = unidade_id and u.empresa_id = equipamentos.empresa_id))
  );

alter table public.patrimonio_eventos enable row level security;
create policy patrimonio_eventos_select on public.patrimonio_eventos for select to authenticated
  using (public.eh_membro(empresa_id));
-- gravação só pela função registrar_evento_patrimonio; apagar um registro errado é de quem gerencia
create policy patrimonio_eventos_delete on public.patrimonio_eventos for delete to authenticated
  using (public.tem_permissao(empresa_id, 'patrimonio.gerenciar'));

grant execute on function
  public.registrar_evento_patrimonio(uuid, text, date, numeric, text, text, uuid)
to authenticated;
