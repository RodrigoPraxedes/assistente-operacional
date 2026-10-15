-- Item de check-list com foto sempre obrigatória (tirada na hora pela câmera).
-- A checagem de "foto recente" é feita no navegador; aqui o banco garante que
-- nenhum envio passe sem a foto, por qualquer canal (app, QR com PIN, QR aberto).

alter table public.checklist_itens
  add column foto_obrigatoria boolean not null default false;

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
        'permite_na', i.permite_na
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

-- Recusa resposta sem foto quando o item exige foto sempre
create or replace function public.tg_checklist_foto_obrigatoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.item_id is not null
     and coalesce(new.foto_path, '') = ''
     and exists (
       select 1 from public.checklist_itens i
       where i.id = new.item_id and i.permite_foto and i.foto_obrigatoria
     ) then
    raise exception 'Tire a foto do item "%" antes de enviar.', new.item_texto;
  end if;
  return new;
end;
$$;

create trigger checklist_foto_obrigatoria
  before insert on public.checklist_respostas
  for each row execute function public.tg_checklist_foto_obrigatoria();
