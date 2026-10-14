-- =============================================================================
-- Prestadores de serviço
-- =============================================================================
-- Quem executa serviços na empresa (pedreiro, eletricista, encanador...).
-- Reaproveita a tabela fornecedores dos chamados: o prestador escolhido no
-- chamado é o mesmo do cadastro, então o histórico de quem atendeu cada
-- chamado continua valendo.
--
-- Tipos de serviço: lista por empresa, já vem com uma sugestão e a empresa
-- cadastra mais. Um prestador pode ter vários tipos.
-- A função definir_tipos_prestador checa permissão por tem_permissao, que já
-- bloqueia empresa suspensa (empresa_liberada, migration 11).
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('prestadores.gerenciar', 'Prestadores', 'Cadastrar prestadores de serviço e tipos de serviço', false, 52);

-- quem já cadastrava fornecedores nos chamados continua podendo
-- (empresas novas: Gerente recebe tudo pelo criar_empresa)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select pp.perfil_id, 'prestadores.gerenciar', 'empresa' from public.perfil_permissoes pp
where pp.permissao = 'chamados.gerenciar'
on conflict do nothing;

-- segundo telefone (opcional)
alter table public.fornecedores add column telefone2 text;

-- -----------------------------------------------------------------------------
-- Tipos de serviço
-- -----------------------------------------------------------------------------
create table public.tipos_servico (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index tipos_servico_nome on public.tipos_servico (empresa_id, lower(nome));

create table public.fornecedor_tipos (
  fornecedor_id uuid not null references public.fornecedores (id) on delete cascade,
  tipo_id uuid not null references public.tipos_servico (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  primary key (fornecedor_id, tipo_id)
);
create index on public.fornecedor_tipos (tipo_id);

-- lista sugerida
create or replace function public._tipos_servico_padrao(p_empresa uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.tipos_servico (empresa_id, nome)
  select p_empresa, n from unnest(array[
    'Pedreiro', 'Eletricista', 'Encanador', 'Faz tudo', 'Serralheiro',
    'Circuito interno (CFTV)', 'Rede e internet', 'Pintor', 'Refrigeração', 'Marceneiro'
  ]) as n
  on conflict do nothing;
$$;

select public._tipos_servico_padrao(id) from public.empresas;

create or replace function public.tg_empresa_nova_tipos_servico()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._tipos_servico_padrao(new.id);
  return new;
end;
$$;

create trigger empresas_tipos_servico
  after insert on public.empresas
  for each row execute function public.tg_empresa_nova_tipos_servico();

-- a "especialidade" escrita à mão nos fornecedores vira tipo de serviço
insert into public.tipos_servico (empresa_id, nome)
select distinct empresa_id, trim(especialidade) from public.fornecedores
where coalesce(trim(especialidade), '') <> ''
on conflict do nothing;

insert into public.fornecedor_tipos (fornecedor_id, tipo_id, empresa_id)
select f.id, t.id, f.empresa_id
from public.fornecedores f
join public.tipos_servico t on t.empresa_id = f.empresa_id and lower(t.nome) = lower(trim(f.especialidade))
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Salvar os tipos de um prestador de uma vez
-- -----------------------------------------------------------------------------
create or replace function public.definir_tipos_prestador(p_fornecedor uuid, p_tipos uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
begin
  select empresa_id into v_empresa from public.fornecedores where id = p_fornecedor;
  if v_empresa is null or not public.tem_permissao(v_empresa, 'prestadores.gerenciar') then
    raise exception 'Você não tem permissão para editar prestadores';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_tipos, '{}')) as x (id)
    where not exists (select 1 from public.tipos_servico t where t.id = x.id and t.empresa_id = v_empresa)
  ) then
    raise exception 'Tipo de serviço inválido';
  end if;

  delete from public.fornecedor_tipos where fornecedor_id = p_fornecedor;
  insert into public.fornecedor_tipos (fornecedor_id, tipo_id, empresa_id)
  select p_fornecedor, x.id, v_empresa from unnest(coalesce(p_tipos, '{}')) as x (id)
  on conflict do nothing;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS: todos da empresa veem (para ligar para o prestador); quem gerencia edita
-- -----------------------------------------------------------------------------
alter table public.tipos_servico enable row level security;
alter table public.fornecedor_tipos enable row level security;

create policy tipos_servico_select on public.tipos_servico for select to authenticated
  using (public.eh_membro(empresa_id));
create policy tipos_servico_write on public.tipos_servico for all to authenticated
  using (public.tem_permissao(empresa_id, 'prestadores.gerenciar'))
  with check (public.tem_permissao(empresa_id, 'prestadores.gerenciar'));

create policy fornecedor_tipos_select on public.fornecedor_tipos for select to authenticated
  using (public.eh_membro(empresa_id));

drop policy fornecedores_write on public.fornecedores;
create policy fornecedores_write on public.fornecedores for all to authenticated
  using (public.tem_permissao(empresa_id, 'prestadores.gerenciar'))
  with check (public.tem_permissao(empresa_id, 'prestadores.gerenciar'));

grant execute on function public.definir_tipos_prestador(uuid, uuid[]) to authenticated;
