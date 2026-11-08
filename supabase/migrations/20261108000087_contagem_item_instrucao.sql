-- Instrução opcional por item da contagem: orientação de como contar (ex.: "contar só o frango sujo")
alter table public.contagem_itens add column if not exists instrucao text;

-- a contagem aberta pelo QR leva a instrução junto com o item
create or replace function public.qr_contagem(p_token text, p_contagem uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao, 'turnos', to_jsonb(c.turnos),
    'usa_meta', c.usa_meta, 'rotulo_falta', c.rotulo_falta, 'pede_vai_fazer', c.pede_vai_fazer,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'nome', i.nome, 'unidade_medida', i.unidade_medida, 'metas', to_jsonb(i.metas),
        'metas_turnos', i.metas_turnos, 'meta_dia_seguinte', i.meta_dia_seguinte,
        'instrucao', i.instrucao
      ) order by i.ordem, i.created_at)
      from public.contagem_itens i where i.contagem_id = c.id and i.ativo
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.empresas e on e.id = u.empresa_id and e.situacao = 'ativa'
  join public.contagens c on c.empresa_id = u.empresa_id
  where u.qr_token = p_token and u.ativo
    and c.id = p_contagem and c.ativo and c.publico_qr
    and (c.unidade_id is null or c.unidade_id = u.id)
$$;

grant execute on function public.qr_contagem(text, uuid) to anon, authenticated;
