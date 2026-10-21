-- =============================================================================
-- Contagens
-- =============================================================================
-- Registro de quantidades por turno: contagem de produtos no início do turno,
-- produção do dia, retiradas, embalados... (o que antes ia num Google Forms).
-- Cada contagem é uma lista de itens com unidade de medida e, se quiser, uma
-- meta por dia da semana: quem conta digita o que TEM e o app mostra quanto
-- FALTA para a meta daquele dia (ex.: quantos embalar).
-- Preenchimento pelo app (qualquer membro) ou pelo QR Code da unidade (nome
-- digitado, sem PIN). Quem tem contagens.resultados vê o histórico.
-- Migration idempotente: pode rodar de novo sem erro.
-- =============================================================================

insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('contagens.editar',     'Contagens', 'Criar e editar contagens, importar planilhas', false, 34),
  ('contagens.resultados', 'Contagens', 'Ver e exportar o histórico das contagens',    false, 35)
on conflict (chave) do nothing;

-- quem monta check-list monta contagem; quem vê check-list preenchido vê o histórico
-- (qualquer que seja o nome do perfil)
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select pp.perfil_id, 'contagens.editar', 'empresa' from public.perfil_permissoes pp
where pp.permissao = 'checklist.editar_modelo'
on conflict do nothing;

insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select pp.perfil_id, 'contagens.resultados', 'empresa' from public.perfil_permissoes pp
where pp.permissao = 'checklist.ver_execucoes'
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table if not exists public.contagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  -- null = vale para todas as unidades
  unidade_id uuid references public.unidades (id) on delete set null,
  setor_id uuid references public.setores (id) on delete set null,
  -- turnos a escolher no preenchimento (ex.: {Dia,Noite}); vazio = sem turno
  turnos text[] not null default '{}',
  -- mostra a coluna "falta para a meta" (nome da coluna em rotulo_falta)
  usa_meta boolean not null default false,
  rotulo_falta text not null default 'Falta',
  publico_qr boolean not null default true,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists contagens_empresa on public.contagens (empresa_id, nome);

create table if not exists public.contagem_itens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  contagem_id uuid not null references public.contagens (id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  -- unidades, varas, pacotes, kg...
  unidade_medida text,
  ordem int not null default 0,
  -- meta por dia da semana: posição 1 = segunda ... 7 = domingo; null = sem meta
  metas numeric[] check (metas is null or cardinality(metas) = 7),
  -- item removido fica inativo, para o histórico continuar com o nome
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists contagem_itens_contagem on public.contagem_itens (contagem_id, ordem);

create table if not exists public.contagem_registros (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  contagem_id uuid not null references public.contagens (id) on delete cascade,
  unidade_id uuid references public.unidades (id) on delete set null,
  -- dia a que a contagem se refere (no fuso da empresa)
  data_ref date not null,
  turno text,
  executor_id uuid references public.membros (id) on delete set null,
  executor_nome text not null,
  canal text not null check (canal in ('app', 'qr', 'importacao')),
  observacao text,
  enviado_em timestamptz not null default now(),
  -- respostas importadas de planilha: impede duplicar ao importar de novo
  chave_importacao text,
  unique (contagem_id, chave_importacao)
);
create index if not exists contagem_registros_data on public.contagem_registros (contagem_id, data_ref desc, enviado_em desc);
create index if not exists contagem_registros_empresa on public.contagem_registros (empresa_id, enviado_em desc);

create table if not exists public.contagem_valores (
  registro_id uuid not null references public.contagem_registros (id) on delete cascade,
  item_id uuid not null references public.contagem_itens (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id) on delete cascade,
  quantidade numeric,
  -- meta do dia no momento do envio e quanto faltava (meta - quantidade)
  meta numeric,
  a_fazer numeric,
  primary key (registro_id, item_id)
);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.contagens enable row level security;
alter table public.contagem_itens enable row level security;
alter table public.contagem_registros enable row level security;
alter table public.contagem_valores enable row level security;

drop policy if exists contagens_select on public.contagens;
drop policy if exists contagens_write on public.contagens;
create policy contagens_select on public.contagens for select to authenticated
  using (public.eh_membro(empresa_id));
create policy contagens_write on public.contagens for all to authenticated
  using (public.tem_permissao(empresa_id, 'contagens.editar'))
  with check (public.tem_permissao(empresa_id, 'contagens.editar'));

drop policy if exists contagem_itens_select on public.contagem_itens;
drop policy if exists contagem_itens_write on public.contagem_itens;
create policy contagem_itens_select on public.contagem_itens for select to authenticated
  using (public.eh_membro(empresa_id));
create policy contagem_itens_write on public.contagem_itens for all to authenticated
  using (public.tem_permissao(empresa_id, 'contagens.editar'))
  with check (public.tem_permissao(empresa_id, 'contagens.editar'));

-- preenchimento só pelas funções abaixo; gravação direta só na importação
drop policy if exists contagem_registros_select on public.contagem_registros;
drop policy if exists contagem_registros_write on public.contagem_registros;
create policy contagem_registros_select on public.contagem_registros for select to authenticated
  using (
    public.tem_permissao(empresa_id, 'contagens.resultados')
    or public.tem_permissao(empresa_id, 'contagens.editar')
    or executor_id = public.meu_membro_id(empresa_id)
  );
create policy contagem_registros_write on public.contagem_registros for all to authenticated
  using (public.tem_permissao(empresa_id, 'contagens.editar'))
  with check (public.tem_permissao(empresa_id, 'contagens.editar'));

drop policy if exists contagem_valores_select on public.contagem_valores;
drop policy if exists contagem_valores_write on public.contagem_valores;
create policy contagem_valores_select on public.contagem_valores for select to authenticated
  using (exists (select 1 from public.contagem_registros r where r.id = registro_id));
create policy contagem_valores_write on public.contagem_valores for all to authenticated
  using (public.tem_permissao(empresa_id, 'contagens.editar'))
  with check (public.tem_permissao(empresa_id, 'contagens.editar'));

-- -----------------------------------------------------------------------------
-- Registro (interno): valida e grava uma contagem com os valores.
-- p_valores = [{ "item_id": "...", "quantidade": "12" }, ...]
-- -----------------------------------------------------------------------------
create or replace function public._registrar_contagem(
  p_contagem uuid,
  p_unidade uuid,
  p_executor uuid,
  p_executor_nome text,
  p_canal text,
  p_data date,
  p_turno text,
  p_valores jsonb,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contagem public.contagens;
  v_unidade public.unidades;
  v_nome text;
  v_fuso text;
  v_hoje date;
  v_dia int;
  v_turno text;
  v_registro uuid;
  v_item record;
  v_texto text;
  v_qtd numeric;
  v_meta numeric;
  v_preenchidos int := 0;
begin
  select * into v_contagem from public.contagens where id = p_contagem and ativo;
  if v_contagem.id is null then
    raise exception 'Contagem indisponível';
  end if;
  if p_unidade is not null then
    select * into v_unidade from public.unidades where id = p_unidade and ativo;
    if v_unidade.id is null or v_unidade.empresa_id <> v_contagem.empresa_id then
      raise exception 'Unidade inválida';
    end if;
  end if;
  if v_contagem.unidade_id is not null and v_contagem.unidade_id is distinct from p_unidade then
    raise exception 'Esta contagem não pertence a esta unidade';
  end if;

  if p_executor is not null then
    select nome into v_nome from public.membros
    where id = p_executor and empresa_id = v_contagem.empresa_id and ativo;
    if v_nome is null then
      raise exception 'Executor inválido';
    end if;
  else
    v_nome := left(regexp_replace(trim(coalesce(p_executor_nome, '')), '\s+', ' ', 'g'), 80);
    if v_nome = '' then
      raise exception 'Informe o seu nome';
    end if;
  end if;

  select fuso_horario into v_fuso from public.empresas where id = v_contagem.empresa_id;
  v_hoje := (now() at time zone v_fuso)::date;
  if p_data is null or p_data > v_hoje + 1 or p_data < v_hoje - 31 then
    raise exception 'Data da contagem inválida';
  end if;
  v_dia := extract(isodow from p_data)::int;

  v_turno := nullif(trim(coalesce(p_turno, '')), '');
  if cardinality(v_contagem.turnos) > 0 and (v_turno is null or not v_turno = any (v_contagem.turnos)) then
    raise exception 'Escolha o turno';
  end if;
  if cardinality(v_contagem.turnos) = 0 then
    v_turno := null;
  end if;
  if jsonb_typeof(coalesce(p_valores, '[]'::jsonb)) <> 'array' then
    raise exception 'Valores em formato inválido';
  end if;

  insert into public.contagem_registros (
    empresa_id, contagem_id, unidade_id, data_ref, turno, executor_id, executor_nome, canal, observacao
  ) values (
    v_contagem.empresa_id, v_contagem.id, p_unidade, p_data, v_turno, p_executor, v_nome, p_canal,
    nullif(left(trim(coalesce(p_observacao, '')), 1000), '')
  ) returning id into v_registro;

  for v_item in
    select * from public.contagem_itens where contagem_id = v_contagem.id and ativo order by ordem, created_at
  loop
    select nullif(trim(r.value ->> 'quantidade'), '') into v_texto
    from jsonb_array_elements(coalesce(p_valores, '[]'::jsonb)) as r (value)
    where r.value ->> 'item_id' = v_item.id::text
    limit 1;

    v_qtd := null;
    if v_texto is not null then
      begin
        v_qtd := replace(v_texto, ',', '.')::numeric;
      exception when others then
        raise exception 'Quantidade inválida em: %', v_item.nome;
      end;
      if v_qtd < 0 then
        raise exception 'Quantidade negativa em: %', v_item.nome;
      end if;
      v_preenchidos := v_preenchidos + 1;
    end if;

    v_meta := case when v_contagem.usa_meta and v_item.metas is not null then v_item.metas[v_dia] end;

    insert into public.contagem_valores (registro_id, item_id, empresa_id, quantidade, meta, a_fazer)
    values (
      v_registro, v_item.id, v_contagem.empresa_id, v_qtd, v_meta,
      case when v_meta is not null and v_qtd is not null then greatest(v_meta - v_qtd, 0) end
    );
  end loop;

  if v_preenchidos = 0 then
    raise exception 'Preencha pelo menos uma quantidade';
  end if;

  return v_registro;
end;
$$;

-- Envio pelo app (usuário logado, qualquer membro da empresa)
create or replace function public.enviar_contagem(
  p_contagem uuid,
  p_unidade uuid,
  p_data date,
  p_turno text,
  p_valores jsonb,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empresa uuid;
  v_membro uuid;
begin
  select empresa_id into v_empresa from public.contagens where id = p_contagem;
  v_membro := public.meu_membro_id(v_empresa);
  if v_membro is null then
    raise exception 'Sem acesso a esta contagem';
  end if;
  return public._registrar_contagem(p_contagem, p_unidade, v_membro, null, 'app', p_data, p_turno, p_valores, p_observacao);
end;
$$;

-- -----------------------------------------------------------------------------
-- Central pública (QR Code)
-- -----------------------------------------------------------------------------
create or replace function public.qr_contagem(p_token text, p_contagem uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'descricao', c.descricao, 'turnos', to_jsonb(c.turnos),
    'usa_meta', c.usa_meta, 'rotulo_falta', c.rotulo_falta,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'nome', i.nome, 'unidade_medida', i.unidade_medida, 'metas', to_jsonb(i.metas)
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

-- Só o servidor (service_role) chama, como o check-list aberto
create or replace function public.qr_enviar_contagem(
  p_token text,
  p_contagem uuid,
  p_nome text,
  p_data date,
  p_turno text,
  p_valores jsonb,
  p_observacao text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unidade public.unidades;
begin
  select * into v_unidade from public.unidades where qr_token = p_token and ativo;
  if v_unidade.id is null then
    raise exception 'QR Code inválido';
  end if;
  if public.qr_contagem(p_token, p_contagem) is null then
    raise exception 'Contagem indisponível nesta unidade';
  end if;
  return public._registrar_contagem(p_contagem, v_unidade.id, null, p_nome, 'qr', p_data, p_turno, p_valores, p_observacao);
end;
$$;

-- Central pública: a mesma da migration 40, com a lista de contagens
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

-- -----------------------------------------------------------------------------
-- Permissões de execução (funções novas nascem fechadas)
-- -----------------------------------------------------------------------------
revoke execute on function
  public._registrar_contagem(uuid, uuid, uuid, text, text, date, text, jsonb, text),
  public.qr_enviar_contagem(text, uuid, text, date, text, jsonb, text)
from public, anon, authenticated;

grant execute on function
  public._registrar_contagem(uuid, uuid, uuid, text, text, date, text, jsonb, text),
  public.qr_enviar_contagem(text, uuid, text, date, text, jsonb, text)
to service_role;

grant execute on function public.enviar_contagem(uuid, uuid, date, text, jsonb, text) to authenticated;
grant execute on function public.qr_contagem(text, uuid) to anon, authenticated;
grant execute on function public.qr_central(text) to anon, authenticated;
