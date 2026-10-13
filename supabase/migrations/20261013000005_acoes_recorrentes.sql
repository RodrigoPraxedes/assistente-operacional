-- =============================================================================
-- Módulo Ações recorrentes
-- =============================================================================
-- Uma ação é algo a fazer numa data (uma vez) ou repetidamente (RRULE), entre
-- uma data inicial e uma data final opcional. Cada ocorrência vira uma tarefa
-- no Kanban com origem = 'acao' (gerada pelo mesmo motor dos check-lists).
-- Ex.: "Limpar caixa d'água" a cada 6 meses; "Pagar aluguel" todo dia 10.
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('acoes.editar', 'Ações recorrentes', 'Criar e editar ações recorrentes', false, 40);

-- os perfis "Gerente" já existentes ganham a nova permissão
-- (empresas novas recebem automaticamente pelo criar_empresa)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, 'acoes.editar', 'empresa' from public.perfis p where p.nome = 'Gerente'
on conflict do nothing;

create table public.acoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- null = uma tarefa para cada unidade ativa
  unidade_id uuid references public.unidades (id) on delete cascade,
  setor_id uuid references public.setores (id) on delete set null,
  categoria_id uuid references public.categorias (id) on delete set null,
  responsavel_id uuid references public.membros (id) on delete set null,
  nome text not null,
  descricao text,
  data_inicial date not null default current_date,
  data_final date,
  horario time not null default '09:00',
  -- horas depois do horário até o prazo da tarefa
  prazo_horas int not null default 8 check (prazo_horas >= 0),
  -- RRULE sem DTSTART; null = acontece só na data inicial
  recorrencia text,
  ativo boolean not null default true,
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  check (data_final is null or data_final >= data_inicial)
);
create index on public.acoes (empresa_id);

alter table public.acoes enable row level security;

create policy acoes_select on public.acoes for select to authenticated
  using (public.eh_membro(empresa_id));
create policy acoes_write on public.acoes for all to authenticated
  using (public.tem_permissao(empresa_id, 'acoes.editar'))
  with check (public.tem_permissao(empresa_id, 'acoes.editar'));
