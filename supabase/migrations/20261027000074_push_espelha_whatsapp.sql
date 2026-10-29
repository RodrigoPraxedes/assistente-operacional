-- Push no navegador passa a espelhar TODOS os avisos automáticos do WhatsApp.
-- Todo aviso automático nasce em whatsapp_mensagens (chave não nula) para a pessoa
-- com WhatsApp autorizado; um gatilho copia cada um para push_fila, se a pessoa
-- tem aparelho inscrito e o tipo está ligado em empresas.push_origens.
-- Substitui o gatilho e as chaves da migration 73 (só tarefa atribuída e prazo).

drop trigger if exists tarefas_push_atribuida on public.tarefas;
drop function if exists public.tg_push_tarefa_atribuida();

alter table public.empresas
  add column if not exists push_origens text[] not null
  default array['tarefa', 'conclusao', 'lembrete', 'checklist', 'contagem', 'resumo', 'prazo'];

-- quem tinha desligado um dos dois tipos da 73 mantém a escolha
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'empresas' and column_name = 'push_tarefa') then
    update public.empresas set push_origens = array_remove(push_origens, 'tarefa') where not push_tarefa;
    update public.empresas set push_origens = array_remove(push_origens, 'prazo') where not push_prazo;
  end if;
end
$$;

alter table public.empresas drop column if exists push_tarefa;
alter table public.empresas drop column if exists push_prazo;

create or replace function public.tg_push_espelha_whatsapp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_membro uuid;
  v_origens text[];
  v_linhas text[];
  v_titulo text;
  v_corpo text;
  v_url text;
begin
  if new.chave is null or new.origem not in ('tarefa', 'conclusao', 'lembrete', 'checklist', 'contagem', 'resumo', 'prazo') then
    return null;
  end if;

  select c.membro_id into v_membro from public.whatsapp_contatos c where c.id = new.contato_id;
  if v_membro is null or not exists (select 1 from public.push_inscricoes i where i.membro_id = v_membro) then
    return null;
  end if;

  select e.push_origens into v_origens from public.empresas e where e.id = new.empresa_id;
  if not (new.origem = any(coalesce(v_origens, '{}'))) then
    return null;
  end if;

  -- texto do WhatsApp sem formatação, link nem placeholders; 1ª linha vira o título
  select coalesce(array_agg(l), '{}') into v_linhas
  from (
    select btrim(regexp_replace(x, '[*_~]', '', 'g')) as l
    from unnest(string_to_array(new.texto, E'\n')) as x
    where x !~ 'https?://' and x !~ '\{(link|url)\}'
  ) s
  where l <> '';
  v_titulo := coalesce(v_linhas[1], 'Atalaia');
  v_corpo := coalesce(array_to_string(v_linhas[2:], ' · '), '');

  v_url := case
    when new.origem = 'checklist' and new.origem_id is not null then '/e/' || new.empresa_id || '/checklists/execucoes/' || new.origem_id
    when new.origem = 'contagem' then '/e/' || new.empresa_id || '/contagens'
    when new.origem in ('tarefa', 'conclusao', 'lembrete', 'prazo') and new.origem_id is not null then '/e/' || new.empresa_id || '/tarefas/' || new.origem_id
    when new.origem = 'resumo' then '/e/' || new.empresa_id || '/tarefas'
    else '/e/' || new.empresa_id
  end;

  insert into public.push_fila (empresa_id, membro_id, tipo, titulo, corpo, url, chave)
  values (new.empresa_id, v_membro, new.origem, left(v_titulo, 100), left(v_corpo, 220), v_url, 'msg:' || new.id)
  on conflict (chave) do nothing;
  return null;
exception
  when others then
    raise warning 'push_espelha_whatsapp: %', sqlerrm;
    return null;
end;
$$;

drop trigger if exists whatsapp_mensagens_push on public.whatsapp_mensagens;
create trigger whatsapp_mensagens_push
  after insert on public.whatsapp_mensagens
  for each row execute function public.tg_push_espelha_whatsapp();
