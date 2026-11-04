-- =============================================================================
-- Fichas montadas no Atalaia
-- =============================================================================
-- Além do PDF enviado, a ficha pode ser montada no próprio app: uma foto
-- (reduzida no navegador) e blocos com nome editável, em qualquer ordem:
--   lista          itens com quantidade e unidade (Ingredientes, Materiais, Peças)
--   especificacoes pares nome/valor (Voltagem: 220 V, Rendimento: 10 porções)
--   passos         passo a passo numerado (Modo de preparo, Procedimento)
--   texto          texto livre (Observações, Cuidados)
-- Formato de blocos: [{ "tipo": "...", "titulo": "...", "itens": [...] }]
-- Migration idempotente: pode rodar de novo sem erro.
-- =============================================================================

alter table public.fichas add column if not exists tipo text not null default 'pdf';
alter table public.fichas add column if not exists foto_path text;
alter table public.fichas add column if not exists blocos jsonb not null default '[]'::jsonb;

alter table public.fichas alter column arquivo_path drop not null;
alter table public.fichas alter column nome_arquivo drop not null;

alter table public.fichas drop constraint if exists fichas_tipo_check;
alter table public.fichas add constraint fichas_tipo_check check (
  (tipo = 'pdf' and arquivo_path is not null and nome_arquivo is not null)
  or tipo = 'montada'
);

alter table public.fichas drop constraint if exists fichas_foto_path_check;
alter table public.fichas add constraint fichas_foto_path_check
  check (foto_path is null or split_part(foto_path, '/', 1) = empresa_id::text);

alter table public.fichas drop constraint if exists fichas_blocos_check;
alter table public.fichas add constraint fichas_blocos_check check (jsonb_typeof(blocos) = 'array');

-- a foto da ficha montada fica no mesmo bucket privado (fora da limpeza de 30 dias)
update storage.buckets
set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
where id = 'fichas';
