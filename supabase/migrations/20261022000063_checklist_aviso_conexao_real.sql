-- =============================================================================
-- Aviso de check-list concluído saía pelo Ensaio em vez do WhatsApp real.
-- As regras da aba Destinatários guardam a conexão escolhida em "Pelo número
-- de". Regra criada com a conexão de Ensaio (simulação) gerava o aviso só no
-- app (marcado "lido" pela simulação), e a chave única do aviso
-- (checklist:<execução>:<contato>) descartava o envio real de "Recebe o
-- resultado" para a mesma pessoa.
-- Agora: regra presa ao Ensaio usa a conexão real da unidade quando existir,
-- e cada destinatário recebe um aviso só, sempre pela conexão real primeiro.
-- =============================================================================

create or replace function public.tg_whatsapp_checklist_enviado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auto boolean;
  v_texto text;
  v_fuso text;
  v_unidade text;
  v_membro uuid;
  v_contato uuid;
  v_conexao uuid;
  r record;
begin
  select coalesce(a.checklist_auto, false) into v_auto
  from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id;
  select fuso_horario into v_fuso from public.empresas where id = new.empresa_id;
  select nome into v_unidade from public.unidades where id = new.unidade_id;
  select resultado_membro_id into v_membro from public.checklist_modelos where id = new.modelo_id;

  v_texto := format(
    E'*Check-list concluído ✅*\n%s\nUnidade: %s\nEnviado por: %s às %s%s',
    new.modelo_nome,
    coalesce(v_unidade, '-'),
    new.executor_nome,
    to_char(new.enviado_em at time zone v_fuso, 'DD/MM HH24:MI'),
    case when new.qtd_nao > 0 then format(E'\nItens com "Não": %s', new.qtd_nao) else '' end
  );

  -- conexão preferida da unidade (a real vem antes do Ensaio)
  v_conexao := public.whatsapp_conexao_para(new.empresa_id, new.unidade_id);

  -- quem recebe o resultado, se tiver WhatsApp autorizado
  if v_membro is not null then
    select t.id into v_contato
    from public.whatsapp_contatos t
    where t.empresa_id = new.empresa_id and t.membro_id = v_membro and t.ativo
    order by t.autorizado_em desc
    limit 1;
  end if;

  for r in
    select distinct on (x.contato_id) x.empresa_id, x.conexao_id, x.contato_id
    from (
      select g.empresa_id,
             case when c.provedor = 'simulacao' then coalesce(v_conexao, g.conexao_id) else g.conexao_id end as conexao_id,
             g.contato_id
      from public.whatsapp_gatilhos g
      join public.whatsapp_conexoes c on c.id = g.conexao_id
      join public.whatsapp_contatos t on t.id = g.contato_id and t.ativo
      where g.modelo_id = new.modelo_id and g.ativo
        and (c.unidade_id is null or c.unidade_id = new.unidade_id)
      union all
      select new.empresa_id, v_conexao, v_contato
      where v_contato is not null and v_conexao is not null
    ) x
    join public.whatsapp_conexoes c2 on c2.id = x.conexao_id
    order by x.contato_id, (c2.provedor <> 'simulacao') desc
  loop
    if coalesce(v_auto, false) then
      perform public.whatsapp_enfileirar_contato(
        r.empresa_id, r.conexao_id, r.contato_id, v_texto, 'checklist', new.id,
        'checklist:' || new.id || ':' || r.contato_id
      );
    elsif not exists (
      select 1 from public.whatsapp_mensagens m
      where m.origem = 'checklist' and m.origem_id = new.id and m.contato_id = r.contato_id
    ) then
      insert into public.whatsapp_mensagens (empresa_id, conexao_id, pedido_id, contato_id, texto, origem, origem_id)
      values (r.empresa_id, r.conexao_id, gen_random_uuid(), r.contato_id, v_texto, 'checklist', new.id);
    end if;
  end loop;
  return null;
exception
  -- o aviso nunca pode impedir de enviar o check-list
  when others then
    raise warning 'whatsapp_checklist_enviado: %', sqlerrm;
    return null;
end;
$$;
