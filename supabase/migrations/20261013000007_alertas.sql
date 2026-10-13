-- =============================================================================
-- Módulo Alertas de datas importantes
-- =============================================================================
-- Um alerta é uma data que não pode passar batida (vencimento do alvará, do
-- AVCB, do contrato de aluguel, da dedetização...). Ele pode acontecer uma vez
-- ou repetir (ex.: todo ano). Cada alerta tem avisos: "X dias antes, criar a
-- tarefa Y para o responsável Z". A tarefa vai para o Kanban com
-- origem = 'alerta' e origem_id = id do aviso, aparece X dias antes e tem como
-- prazo a própria data do alerta. Gerada pelo mesmo motor dos outros módulos.
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('alertas.editar', 'Alertas de datas', 'Criar e editar alertas de datas importantes', false, 45);

-- os perfis "Gerente" já existentes ganham a nova permissão
-- (empresas novas recebem automaticamente pelo criar_empresa)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select p.id, 'alertas.editar', 'empresa' from public.perfis p where p.nome = 'Gerente'
on conflict do nothing;

create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  -- null = vale para a empresa toda (uma tarefa só, sem unidade)
  unidade_id uuid references public.unidades (id) on delete cascade,
  setor_id uuid references public.setores (id) on delete set null,
  categoria_id uuid references public.categorias (id) on delete set null,
  -- responsável padrão das tarefas (cada aviso pode trocar)
  responsavel_id uuid references public.membros (id) on delete set null,
  nome text not null,
  descricao text,
  -- data do evento; se repetir, é a primeira (âncora da regra)
  data_evento date not null,
  -- RRULE sem DTSTART; null = acontece uma vez só
  recorrencia text,
  -- horário em que a tarefa aparece e prazo no dia do evento
  horario time not null default '09:00',
  ativo boolean not null default true,
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.alertas (empresa_id);

create table public.alerta_avisos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  alerta_id uuid not null references public.alertas (id) on delete cascade,
  dias_antes int not null check (dias_antes between 0 and 365),
  -- título da tarefa criada (ex.: "Pedir renovação do alvará")
  titulo text not null,
  -- null = usa o responsável do alerta
  responsavel_id uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.alerta_avisos (alerta_id);

alter table public.alertas enable row level security;
alter table public.alerta_avisos enable row level security;

create policy alertas_select on public.alertas for select to authenticated
  using (public.eh_membro(empresa_id));
create policy alertas_write on public.alertas for all to authenticated
  using (public.tem_permissao(empresa_id, 'alertas.editar'))
  with check (public.tem_permissao(empresa_id, 'alertas.editar'));

create policy alerta_avisos_select on public.alerta_avisos for select to authenticated
  using (public.eh_membro(empresa_id));
-- o aviso precisa ser da mesma empresa do alerta
create policy alerta_avisos_write on public.alerta_avisos for all to authenticated
  using (public.tem_permissao(empresa_id, 'alertas.editar'))
  with check (
    public.tem_permissao(empresa_id, 'alertas.editar')
    and exists (select 1 from public.alertas a where a.id = alerta_id and a.empresa_id = alerta_avisos.empresa_id)
  );
