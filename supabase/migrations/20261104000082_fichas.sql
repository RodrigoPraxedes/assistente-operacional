-- =============================================================================
-- Fichas: biblioteca de PDFs para consulta rápida na operação
-- =============================================================================
-- Fichas técnicas, de procedimento, de equipamento, de alimento ou de serviço,
-- geradas fora do app e guardadas aqui em PDF. Qualquer membro consulta;
-- quem tem fichas.gerenciar envia, edita, apaga e cria as categorias.
-- Bucket próprio e privado (fichas): fora da limpeza de 30 dias das fotos.
-- Migration idempotente: pode rodar de novo sem erro.
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('fichas.gerenciar', 'Fichas', 'Enviar, editar e apagar fichas em PDF e gerenciar as categorias', false, 60)
on conflict (chave) do nothing;

-- quem monta check-list gerencia fichas (qualquer que seja o nome do perfil)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select pp.perfil_id, 'fichas.gerenciar', 'empresa' from public.perfil_permissoes pp
where pp.permissao = 'checklist.editar_modelo'
on conflict do nothing;

create table if not exists public.ficha_categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists ficha_categorias_nome on public.ficha_categorias (empresa_id, lower(nome));

create table if not exists public.fichas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  categoria_id uuid references public.ficha_categorias (id) on delete set null,
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  -- {empresa_id}/{uuid}.pdf no bucket fichas
  arquivo_path text not null check (split_part(arquivo_path, '/', 1) = empresa_id::text),
  nome_arquivo text not null,
  tamanho_bytes bigint,
  criado_por uuid references public.membros (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists fichas_empresa on public.fichas (empresa_id, titulo);

alter table public.ficha_categorias enable row level security;
alter table public.fichas enable row level security;

drop policy if exists ficha_categorias_select on public.ficha_categorias;
create policy ficha_categorias_select on public.ficha_categorias for select to authenticated
  using (public.eh_membro(empresa_id));
drop policy if exists ficha_categorias_escrita on public.ficha_categorias;
create policy ficha_categorias_escrita on public.ficha_categorias for all to authenticated
  using (public.tem_permissao(empresa_id, 'fichas.gerenciar'))
  with check (public.tem_permissao(empresa_id, 'fichas.gerenciar'));

drop policy if exists fichas_select on public.fichas;
create policy fichas_select on public.fichas for select to authenticated
  using (public.eh_membro(empresa_id));
drop policy if exists fichas_escrita on public.fichas;
create policy fichas_escrita on public.fichas for all to authenticated
  using (public.tem_permissao(empresa_id, 'fichas.gerenciar'))
  with check (public.tem_permissao(empresa_id, 'fichas.gerenciar'));

-- -----------------------------------------------------------------------------
-- Storage: bucket privado só de PDF, até 10 MB. Caminho: {empresa_id}/{arquivo}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fichas', 'fichas', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists fichas_storage_select on storage.objects;
create policy fichas_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'fichas' and public.eh_membro(nullif((storage.foldername(name))[1], '')::uuid));

drop policy if exists fichas_storage_insert on storage.objects;
create policy fichas_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fichas' and public.tem_permissao(nullif((storage.foldername(name))[1], '')::uuid, 'fichas.gerenciar'));

drop policy if exists fichas_storage_delete on storage.objects;
create policy fichas_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fichas' and public.tem_permissao(nullif((storage.foldername(name))[1], '')::uuid, 'fichas.gerenciar'));
