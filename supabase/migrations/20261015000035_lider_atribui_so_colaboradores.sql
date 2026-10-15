-- Demanda desce na hierarquia: o Gestor atribui a qualquer pessoa; o Líder de
-- setor só a Colaboradores (ou a si mesmo). Vale para tarefas, ações e avisos de
-- alerta. Colaborador já não cria demanda (não tem tarefas.criar).

-- null = sem restrição; senão, os membros para quem eu posso atribuir
create or replace function public.ids_atribuiveis(p_empresa uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.membros m
      join public.perfis p on p.id = m.perfil_id
      where m.empresa_id = p_empresa and m.usuario_id = auth.uid() and p.nome = 'Líder de setor'
    ) then (
      select coalesce(array_agg(m.id), '{}')
      from public.membros m
      left join public.perfis p on p.id = m.perfil_id
      where m.empresa_id = p_empresa and m.ativo
        and (p.nome = 'Colaborador' or m.usuario_id = auth.uid())
    )
    else null
  end
$$;
grant execute on function public.ids_atribuiveis(uuid) to authenticated;

create or replace function public.tg_valida_atribuicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_permitidos uuid[];
begin
  -- sistema (cron, QR, gatilhos encadeados) não passa por aqui
  if auth.uid() is null or current_setting('app.sistema', true) = 'on' or pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.responsaveis is not distinct from old.responsaveis then
    return new;
  end if;

  v_permitidos := public.ids_atribuiveis(new.empresa_id);
  if v_permitidos is null then
    return new;
  end if;

  -- quem já estava na lista pode continuar nela
  if exists (
    select 1 from unnest(new.responsaveis) r
    where r <> all (v_permitidos)
      and (tg_op = 'INSERT' or r <> all (old.responsaveis))
  ) then
    raise exception 'Líder de setor só pode atribuir a colaboradores';
  end if;
  return new;
end;
$$;

create trigger tarefas_validar_atribuicao before insert or update on public.tarefas
  for each row execute function public.tg_valida_atribuicao();
create trigger acoes_validar_atribuicao before insert or update on public.acoes
  for each row execute function public.tg_valida_atribuicao();
create trigger alerta_avisos_validar_atribuicao before insert or update on public.alerta_avisos
  for each row execute function public.tg_valida_atribuicao();
