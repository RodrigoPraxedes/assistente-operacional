-- A migration 45 só deu as permissões novas aos perfis chamados "Gestor".
-- Perfis renomeados (ex.: "Gerente Geral") ficaram sem: aqui elas vão para
-- quem já tinha a permissão equivalente.
--   rotinas.editar  <- quem cria e edita ações recorrentes
--   config.funcoes  <- quem cadastra setores
insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select pp.perfil_id, 'rotinas.editar', 'empresa' from public.perfil_permissoes pp
where pp.permissao = 'acoes.editar'
on conflict do nothing;

insert into public.perfil_permissoes (perfil_id, permissao, escopo)
select pp.perfil_id, 'config.funcoes', 'empresa' from public.perfil_permissoes pp
where pp.permissao = 'config.setores'
on conflict do nothing;
