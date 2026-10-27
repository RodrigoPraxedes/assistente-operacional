-- WhatsApp: destinatário pode ser um GRUPO (JID "1203...@g.us"), além de uma pessoa.
-- Grupo não tem colaborador, não recebe boas-vindas nem resumo do dia; recebe o aviso
-- de "Check-list concluído" pelas regras da aba Destinatários e avisos manuais.

alter table public.whatsapp_contatos
  add column if not exists tipo text not null default 'pessoa' check (tipo in ('pessoa', 'grupo'));

alter table public.whatsapp_contatos drop constraint if exists whatsapp_contatos_telefone_check;
alter table public.whatsapp_contatos drop constraint if exists whatsapp_contatos_telefone_tipo;
alter table public.whatsapp_contatos add constraint whatsapp_contatos_telefone_tipo check (
  (tipo = 'pessoa' and telefone ~ '^[0-9]{12,13}$')
  or (tipo = 'grupo' and telefone ~ '^[0-9]{8,20}(-[0-9]{5,20})?@g\.us$' and membro_id is null)
);

-- boas-vindas só para pessoas
create or replace function public.tg_whatsapp_boas_vindas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conexao uuid;
  v_empresa text;
begin
  if new.tipo <> 'pessoa' or not new.ativo or not exists (
    select 1 from public.whatsapp_automacoes a where a.empresa_id = new.empresa_id and a.boas_vindas
  ) then
    return null;
  end if;
  v_conexao := public.whatsapp_conexao_para(new.empresa_id, null);
  if v_conexao is null then
    return null;
  end if;
  select nome into v_empresa from public.empresas where id = new.empresa_id;

  perform public.whatsapp_enfileirar_contato(
    new.empresa_id, v_conexao, new.id,
    format(
      E'Olá, %s! 👋\nEste é o WhatsApp do *Atalaia*, o sistema de avisos da %s.\nPor aqui você vai receber avisos de tarefas, check-lists e o resumo do seu dia.\n\n*Salve este número nos seus contatos* para não perder nenhum aviso.',
      split_part(trim(new.nome), ' ', 1), v_empresa
    ),
    'boasvindas', null,
    'boasvindas:' || new.id
  );
  return null;
exception
  when others then
    raise warning 'whatsapp_boas_vindas: %', sqlerrm;
    return null;
end;
$$;
