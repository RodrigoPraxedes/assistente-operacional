-- Nem toda resposta "Não" é problema. Cada item Sim/Não passa a dizer qual
-- resposta conta como problema: 'nao' (padrão, como era até aqui), 'sim' ou 'nunca'.
-- A resposta grava um retrato (problema) no momento do envio, então mudar a regra
-- do item depois não reescreve o histórico. execucoes.qtd_nao passa a contar problemas.

alter table public.checklist_itens
  add column problema_quando text not null default 'nao'
    check (problema_quando in ('nao', 'sim', 'nunca'));

alter table public.checklist_respostas
  add column problema boolean not null default false;

-- execuções já gravadas: "Não" era o problema
update public.checklist_respostas set problema = true where resposta = 'nao';

create index checklist_respostas_problema_idx
  on public.checklist_respostas (execucao_id) where problema;

-- marca a resposta pela regra do item no momento do envio
create or replace function public.tg_checklist_resposta_problema()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.problema := new.tipo_resposta = 'sim_nao'
    and new.resposta in ('sim', 'nao')
    and exists (
      select 1 from public.checklist_itens i
      where i.id = new.item_id and i.problema_quando = new.resposta
    );
  return new;
end;
$$;

create trigger checklist_resposta_problema
  before insert on public.checklist_respostas
  for each row execute function public.tg_checklist_resposta_problema();

-- as funções de envio gravam qtd_nao contando "Não"; aqui vira a contagem de problemas
create or replace function public.tg_checklist_execucao_qtd_problemas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.qtd_nao := (
    select count(*) from public.checklist_respostas r
    where r.execucao_id = new.id and r.problema
  );
  return new;
end;
$$;

create trigger checklist_execucao_qtd_problemas
  before update of qtd_nao on public.checklist_execucoes
  for each row execute function public.tg_checklist_execucao_qtd_problemas();

-- itens do check-list aberto pelo QR levam a regra para colorir a resposta
create or replace function public.qr_modelo(p_token text, p_modelo uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', cm.id, 'nome', cm.nome, 'descricao', cm.descricao,
    'whatsapp_destino', cm.whatsapp_destino,
    'modo_executor', cm.modo_executor,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'texto', i.texto, 'tipo_resposta', i.tipo_resposta,
        'obrigatorio', i.obrigatorio, 'permite_foto', i.permite_foto,
        'foto_obrigatoria', i.foto_obrigatoria,
        'foto_obrigatoria_se_nao', i.foto_obrigatoria_se_nao,
        'permite_na', i.permite_na,
        'problema_quando', i.problema_quando
      ) order by i.ordem, i.created_at)
      from public.checklist_itens i where i.modelo_id = cm.id and i.ativo
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.empresas e on e.id = u.empresa_id and e.situacao = 'ativa'
  join public.checklist_modelos cm on cm.empresa_id = u.empresa_id
  where u.qr_token = p_token and u.ativo
    and cm.id = p_modelo and cm.ativo and cm.publico_qr
    and (cm.unidade_id is null or cm.unidade_id = u.id)
$$;
