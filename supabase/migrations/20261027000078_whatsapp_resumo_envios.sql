-- Quadro de envios (WhatsApp › Avisos): quantas mensagens saíram hoje, nos últimos 7 e 30 dias,
-- por tipo de aviso. "Hoje" e os dias seguem o fuso da empresa. O Ensaio (simulação) não conta.
create or replace function public.whatsapp_resumo_envios(p_empresa uuid)
returns table (periodo text, origem text, enviadas bigint, falhas bigint, outras bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fuso text;
  v_hoje timestamptz;
begin
  if not (
    public.eh_membro(p_empresa)
    and (public.tem_permissao(p_empresa, 'whatsapp.gerenciar') or public.tem_permissao(p_empresa, 'whatsapp.avisos'))
  ) then
    raise exception 'Sem permissão.';
  end if;
  select e.fuso_horario into v_fuso from public.empresas e where e.id = p_empresa;
  v_hoje := date_trunc('day', now() at time zone coalesce(v_fuso, 'America/Sao_Paulo')) at time zone coalesce(v_fuso, 'America/Sao_Paulo');

  return query
  select p.periodo, m.origem,
         count(*) filter (where m.situacao in ('aceito', 'entregue', 'lido')),
         count(*) filter (where m.situacao = 'falhou'),
         count(*) filter (where m.situacao in ('rascunho', 'na_fila', 'enviando', 'desconhecido'))
  from public.whatsapp_mensagens m
  join public.whatsapp_conexoes c on c.id = m.conexao_id and c.provedor <> 'simulacao'
  join (values ('hoje', v_hoje), ('7d', v_hoje - interval '6 days'), ('30d', v_hoje - interval '29 days')) as p (periodo, desde)
    on m.created_at >= p.desde
  where m.empresa_id = p_empresa
  group by p.periodo, m.origem;
end;
$$;
revoke execute on function public.whatsapp_resumo_envios(uuid) from public, anon;
grant execute on function public.whatsapp_resumo_envios(uuid) to authenticated;
