-- Editar título, descrição e prazo de uma tarefa já criada.
-- Permissão nova tarefas.editar; a função confere no banco (não só na tela).
insert into public.permissoes (chave, modulo, descricao, usa_escopo, ordem) values
  ('tarefas.editar', 'Tarefas', 'Editar título, descrição e prazo de tarefas', false, 14);

-- quem já pode excluir tarefas (gestão) recebe a nova permissão, qualquer que seja o nome do perfil
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select pp.perfil_id, 'tarefas.editar', 'empresa' from public.perfil_permissoes pp
where pp.permissao = 'tarefas.excluir'
on conflict do nothing;

create or replace function public.editar_tarefa(
  p_tarefa uuid,
  p_titulo text,
  p_descricao text,
  p_prazo timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  t public.tarefas%rowtype;
begin
  select * into t from public.tarefas where id = p_tarefa;
  if not found
     or not public.tem_permissao(t.empresa_id, 'tarefas.editar')
     or not public.pode_acessar(t.empresa_id, 'tarefas.ver', t.unidade_id, t.setor_id,
          public.responsavel_eu(t.empresa_id, t.responsavel_id, t.responsaveis), t.criado_por)
     or not public.ve_privado(t.empresa_id, t.privado,
          public.responsavel_eu(t.empresa_id, t.responsavel_id, t.responsaveis), t.criado_por) then
    raise exception 'Tarefa não encontrada ou sem permissão';
  end if;
  if t.origem in ('chamado', 'checklist', 'plano') then
    raise exception 'Esta tarefa é editada na própria tela do módulo';
  end if;
  if t.concluida_em is not null or t.cancelada_em is not null then
    raise exception 'Tarefa concluída ou cancelada não pode ser editada';
  end if;
  if nullif(trim(p_titulo), '') is null then
    raise exception 'Informe o título da tarefa';
  end if;

  update public.tarefas
     set titulo = trim(p_titulo),
         descricao = nullif(trim(p_descricao), ''),
         prazo = p_prazo
   where id = p_tarefa;
end;
$$;
grant execute on function public.editar_tarefa(uuid, text, text, timestamptz) to authenticated;
