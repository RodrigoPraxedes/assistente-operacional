-- =============================================================================
-- Storage (fotos) e permissões de execução das funções
-- =============================================================================

-- Bucket privado para fotos de check-lists (e, depois, chamados).
-- Caminho dos arquivos: {empresa_id}/{modulo}/{arquivo}
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('anexos', 'anexos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy anexos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'anexos'
    and public.eh_membro(nullif((storage.foldername(name))[1], '')::uuid)
  );

create policy anexos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'anexos'
    and public.eh_membro(nullif((storage.foldername(name))[1], '')::uuid)
  );

-- -----------------------------------------------------------------------------
-- Funções: por padrão o Postgres libera execução para todos. Fechamos e
-- liberamos só o necessário.
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

-- usadas pelas políticas RLS e pelo app logado
grant execute on function
  public.meu_membro_id(uuid),
  public.eh_membro(uuid),
  public.escopo_permissao(uuid, text),
  public.tem_permissao(uuid, text),
  public.tem_acesso_unidade(uuid),
  public.pode_acessar(uuid, text, uuid, uuid, uuid, uuid),
  public.definir_pin(uuid, text),
  public.membros_com_pin(uuid),
  public.vincular_convites(),
  public.mover_tarefa(uuid, uuid, timestamptz, text),
  public.retornar_tarefa(uuid, text),
  public.criar_empresa(text, text),
  public.status_inicial(uuid),
  public.enviar_checklist(uuid, uuid, jsonb, text)
to authenticated;

-- central pública (QR Code): leitura liberada para visitantes
grant execute on function
  public.qr_central(text),
  public.qr_modelo(text, uuid)
to anon, authenticated;

-- envio pelo QR e conferência de PIN: só o servidor do app (service_role)
grant execute on function
  public.qr_validar_pin(text, uuid, text),
  public.qr_enviar_checklist(text, uuid, uuid, text, jsonb, text),
  public._registrar_execucao(uuid, uuid, uuid, text, jsonb, text),
  public.status_inicial(uuid)
to service_role;

-- funções criadas daqui em diante também nascem fechadas
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- PINs: nenhuma leitura direta pela API, nem com RLS
revoke all on public.membro_pins from anon, authenticated;
