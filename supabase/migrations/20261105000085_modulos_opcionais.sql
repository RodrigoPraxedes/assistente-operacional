-- Módulos opcionais por empresa: Configurações › Geral › Módulos.
-- Desligar esconde o módulo do menu, das telas e do Painel; os dados ficam guardados.
alter table public.empresas
  add column if not exists modulos_desligados text[] not null default '{}';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_modulos_desligados_check') then
    alter table public.empresas add constraint empresas_modulos_desligados_check
      check (modulos_desligados <@ array['contagens', 'rotinas', 'escalas', 'planos', 'fichas']::text[]);
  end if;
end
$$;

-- Central do QR: contagens somem quando o módulo está desligado
create or replace function public.qr_central(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'unidade', jsonb_build_object('id', u.id, 'nome', u.nome),
    'empresa', jsonb_build_object('id', e.id, 'nome', e.nome, 'fuso_horario', e.fuso_horario),
    'modelos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cm.id, 'nome', cm.nome, 'descricao', cm.descricao,
        'horario_preferencial', to_char(cm.horario_preferencial, 'HH24:MI'),
        'modo_executor', cm.modo_executor,
        'feito_hoje_em', (
          select max(x.enviado_em)
          from public.checklist_execucoes x
          where x.modelo_id = cm.id and x.unidade_id = u.id
            and x.enviado_em >= date_trunc('day', now() at time zone e.fuso_horario) at time zone e.fuso_horario
        )
      ) order by cm.horario_preferencial, cm.nome)
      from public.checklist_modelos cm
      where cm.empresa_id = u.empresa_id and cm.ativo and cm.publico_qr
        and (cm.unidade_id is null or cm.unidade_id = u.id)
    ), '[]'::jsonb),
    'contagens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'nome', c.nome, 'descricao', c.descricao,
        'feito_hoje_em', (
          select max(r.enviado_em)
          from public.contagem_registros r
          where r.contagem_id = c.id and r.unidade_id = u.id
            and r.data_ref = (now() at time zone e.fuso_horario)::date
        )
      ) order by c.nome)
      from public.contagens c
      where c.empresa_id = u.empresa_id and c.ativo and c.publico_qr
        and not ('contagens' = any(e.modulos_desligados))
        and (c.unidade_id is null or c.unidade_id = u.id)
    ), '[]'::jsonb),
    'colaboradores', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nome', m.nome) order by m.nome)
      from public.membros m
      join public.membro_pins mp on mp.membro_id = m.id
      where m.empresa_id = u.empresa_id and m.ativo
        and (m.todas_unidades or m.dono or exists (
          select 1 from public.membro_unidades mu where mu.membro_id = m.id and mu.unidade_id = u.id
        ))
    ), '[]'::jsonb)
  )
  from public.unidades u
  join public.empresas e on e.id = u.empresa_id
  where u.qr_token = p_token and u.ativo and e.situacao = 'ativa'
$$;

grant execute on function public.qr_central(text) to anon, authenticated;
