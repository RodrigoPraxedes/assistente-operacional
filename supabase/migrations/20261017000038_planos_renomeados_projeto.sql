-- Planos virou Projeto na interface: só os textos das permissões mudam (chaves iguais).
update public.permissoes
   set modulo = 'Projeto (PMLP)',
       descricao = 'Ver todos os projetos de médio e longo prazo'
 where chave = 'planos.ver';

update public.permissoes
   set modulo = 'Projeto (PMLP)',
       descricao = 'Criar e editar projetos e suas etapas'
 where chave = 'planos.editar';
