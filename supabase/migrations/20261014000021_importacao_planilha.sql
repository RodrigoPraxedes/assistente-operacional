-- =============================================================================
-- Importação por planilha (Excel) em Patrimônio e Prestadores
-- =============================================================================
-- O app lê a planilha, resolve unidade/setor pelo nome e manda as linhas já
-- limpas para estas funções, que gravam tudo de uma vez.
-- Reimportar a mesma planilha não duplica: item e prestador com o mesmo nome
-- são reaproveitados, e um registro de histórico igual (mesmo item, data e
-- descrição) é ignorado.
-- =============================================================================

-- p_itens: [{ nome, tipo, unidade_id, setor_id, codigo, marca, modelo,
--             data_compra, valor_compra, comprado_de, nota_fiscal, garantia_ate,
--             situacao, observacao, eventos: [{ data, descricao, valor }] }]
create or replace function public.importar_patrimonio(p_empresa uuid, p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro public.membros;
  v_linha jsonb;
  v_evento jsonb;
  v_item uuid;
  v_nome text;
  v_descricao text;
  v_data date;
  v_novos int := 0;
  v_existentes int := 0;
  v_eventos int := 0;
begin
  if not public.tem_permissao(p_empresa, 'patrimonio.gerenciar') then
    raise exception 'Você não tem permissão para alterar o patrimônio';
  end if;
  if jsonb_typeof(coalesce(p_itens, '[]'::jsonb)) <> 'array' then
    raise exception 'Planilha em formato inválido';
  end if;
  if jsonb_array_length(p_itens) > 2000 then
    raise exception 'Importe no máximo 2000 itens por vez';
  end if;
  select * into v_membro from public.membros where id = public.meu_membro_id(p_empresa);

  for v_linha in select value from jsonb_array_elements(p_itens) loop
    v_nome := left(trim(coalesce(v_linha ->> 'nome', '')), 200);
    if v_nome = '' then
      continue;
    end if;
    if nullif(v_linha ->> 'unidade_id', '') is not null and not exists (
      select 1 from public.unidades where id = (v_linha ->> 'unidade_id')::uuid and empresa_id = p_empresa
    ) then
      raise exception 'Unidade inválida no item: %', v_nome;
    end if;
    if nullif(v_linha ->> 'setor_id', '') is not null and not exists (
      select 1 from public.setores where id = (v_linha ->> 'setor_id')::uuid and empresa_id = p_empresa
    ) then
      raise exception 'Setor inválido no item: %', v_nome;
    end if;

    select id into v_item from public.equipamentos
    where empresa_id = p_empresa and lower(nome) = lower(v_nome)
    order by ativo desc, created_at
    limit 1;

    if v_item is null then
      insert into public.equipamentos (
        empresa_id, nome, tipo, unidade_id, setor_id, codigo, marca, modelo,
        data_compra, valor_compra, comprado_de, nota_fiscal, garantia_ate, situacao, observacao
      ) values (
        p_empresa, v_nome,
        coalesce(nullif(v_linha ->> 'tipo', ''), 'equipamento'),
        nullif(v_linha ->> 'unidade_id', '')::uuid,
        nullif(v_linha ->> 'setor_id', '')::uuid,
        nullif(trim(v_linha ->> 'codigo'), ''),
        nullif(trim(v_linha ->> 'marca'), ''),
        nullif(trim(v_linha ->> 'modelo'), ''),
        nullif(v_linha ->> 'data_compra', '')::date,
        nullif(v_linha ->> 'valor_compra', '')::numeric,
        nullif(trim(v_linha ->> 'comprado_de'), ''),
        nullif(trim(v_linha ->> 'nota_fiscal'), ''),
        nullif(v_linha ->> 'garantia_ate', '')::date,
        coalesce(nullif(v_linha ->> 'situacao', ''), 'em_uso'),
        nullif(trim(v_linha ->> 'observacao'), '')
      ) returning id into v_item;
      v_novos := v_novos + 1;
    else
      v_existentes := v_existentes + 1;
    end if;

    for v_evento in select value from jsonb_array_elements(coalesce(v_linha -> 'eventos', '[]'::jsonb)) loop
      v_descricao := nullif(trim(v_evento ->> 'descricao'), '');
      v_data := nullif(v_evento ->> 'data', '')::date;
      if v_descricao is null or v_data is null then
        continue;
      end if;
      if exists (
        select 1 from public.patrimonio_eventos
        where equipamento_id = v_item and data = v_data and descricao = v_descricao
      ) then
        continue;
      end if;
      insert into public.patrimonio_eventos (
        empresa_id, equipamento_id, tipo, data, valor, descricao, membro_id, membro_nome
      ) values (
        p_empresa, v_item, 'manutencao', v_data, nullif(v_evento ->> 'valor', '')::numeric, v_descricao,
        v_membro.id, v_membro.nome
      );
      v_eventos := v_eventos + 1;
    end loop;
  end loop;

  return jsonb_build_object('itens_novos', v_novos, 'itens_existentes', v_existentes, 'eventos', v_eventos);
end;
$$;

-- p_linhas: [{ nome, telefone, telefone2, email, tipos: [text] }]
-- Prestador que já existe (mesmo nome) só ganha o que estava faltando.
create or replace function public.importar_prestadores(p_empresa uuid, p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linha jsonb;
  v_nome text;
  v_tipo_nome text;
  v_prestador uuid;
  v_tipo uuid;
  v_novos int := 0;
  v_existentes int := 0;
begin
  if not public.tem_permissao(p_empresa, 'prestadores.gerenciar') then
    raise exception 'Você não tem permissão para cadastrar prestadores';
  end if;
  if jsonb_typeof(coalesce(p_linhas, '[]'::jsonb)) <> 'array' then
    raise exception 'Planilha em formato inválido';
  end if;
  if jsonb_array_length(p_linhas) > 2000 then
    raise exception 'Importe no máximo 2000 prestadores por vez';
  end if;

  for v_linha in select value from jsonb_array_elements(p_linhas) loop
    v_nome := left(trim(coalesce(v_linha ->> 'nome', '')), 200);
    if v_nome = '' then
      continue;
    end if;

    select id into v_prestador from public.fornecedores
    where empresa_id = p_empresa and lower(nome) = lower(v_nome)
    order by ativo desc, created_at
    limit 1;

    if v_prestador is null then
      insert into public.fornecedores (empresa_id, nome, telefone, telefone2, email)
      values (
        p_empresa, v_nome,
        nullif(v_linha ->> 'telefone', ''),
        nullif(v_linha ->> 'telefone2', ''),
        nullif(trim(v_linha ->> 'email'), '')
      ) returning id into v_prestador;
      v_novos := v_novos + 1;
    else
      update public.fornecedores set
        telefone = coalesce(telefone, nullif(v_linha ->> 'telefone', '')),
        telefone2 = coalesce(telefone2, nullif(v_linha ->> 'telefone2', '')),
        email = coalesce(email, nullif(trim(v_linha ->> 'email'), ''))
      where id = v_prestador;
      v_existentes := v_existentes + 1;
    end if;

    for v_tipo_nome in
      select distinct left(trim(t), 80) from jsonb_array_elements_text(coalesce(v_linha -> 'tipos', '[]'::jsonb)) t
      where trim(t) <> ''
    loop
      select id into v_tipo from public.tipos_servico
      where empresa_id = p_empresa and lower(nome) = lower(v_tipo_nome);
      if v_tipo is null then
        insert into public.tipos_servico (empresa_id, nome) values (p_empresa, v_tipo_nome)
        returning id into v_tipo;
      else
        update public.tipos_servico set ativo = true where id = v_tipo and not ativo;
      end if;
      insert into public.fornecedor_tipos (fornecedor_id, tipo_id, empresa_id)
      values (v_prestador, v_tipo, p_empresa)
      on conflict do nothing;
    end loop;
  end loop;

  return jsonb_build_object('novos', v_novos, 'existentes', v_existentes);
end;
$$;

revoke execute on function
  public.importar_patrimonio(uuid, jsonb),
  public.importar_prestadores(uuid, jsonb)
from public, anon;

grant execute on function
  public.importar_patrimonio(uuid, jsonb),
  public.importar_prestadores(uuid, jsonb)
to authenticated;
