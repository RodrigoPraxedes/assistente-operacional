-- Automações (resumo do dia, avisos, lembretes) escolhiam a conexão "Empresa toda" antes da
-- conexão da unidade quando a tarefa não tem unidade. Se a "Empresa toda" é o ensaio
-- (simulação), nada sai de verdade. Agora a conexão de um provedor real vem sempre antes
-- da simulação; dentro disso vale a regra de antes (unidade, empresa toda, outra).

create or replace function public.whatsapp_conexao_para(p_empresa uuid, p_unidade uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id from public.whatsapp_conexoes c
  where c.empresa_id = p_empresa
  order by (c.provedor <> 'simulacao') desc,
           (c.unidade_id = p_unidade) desc nulls last,
           (c.unidade_id is null) desc,
           c.created_at
  limit 1
$$;

create or replace function public.whatsapp_enfileirar_automatica(
  p_empresa uuid, p_unidade uuid, p_membro uuid, p_texto text, p_origem text, p_origem_id uuid, p_chave text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contato uuid;
  v_conexao uuid;
begin
  select t.id into v_contato
  from public.whatsapp_contatos t
  where t.empresa_id = p_empresa and t.membro_id = p_membro and t.ativo
  order by t.autorizado_em desc
  limit 1;
  if v_contato is null then
    return null;
  end if;

  v_conexao := public.whatsapp_conexao_para(p_empresa, p_unidade);
  if v_conexao is null then
    return null;
  end if;

  return public.whatsapp_enfileirar_contato(p_empresa, v_conexao, v_contato, p_texto, p_origem, p_origem_id, p_chave);
end;
$$;
revoke execute on function public.whatsapp_enfileirar_automatica(uuid, uuid, uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.whatsapp_enfileirar_automatica(uuid, uuid, uuid, text, text, uuid, text) to service_role;
