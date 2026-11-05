// Módulos que cada empresa pode ligar ou desligar em Configurações › Geral.
// Nenhum outro módulo depende deles; desligar só esconde (os dados ficam guardados).
export const MODULOS_OPCIONAIS = [
  { chave: "contagens", rotulo: "Contagens", tela: "/contagens", descricao: "Quantidades por turno, com meta (produção, estoque, embalagens)." },
  { chave: "rotinas", rotulo: "Rotinas", tela: "/rotinas", descricao: "Cronograma de referência: o que acontece em cada horário." },
  { chave: "escalas", rotulo: "Escalas", tela: "/escalas", descricao: "Turnos, folgas e trocas da equipe; quem trabalha hoje no Painel." },
  { chave: "planos", rotulo: "Projeto", tela: "/planos", descricao: "Projetos de médio e longo prazo em etapas." },
  { chave: "fichas", rotulo: "Fichas", tela: "/fichas", descricao: "Biblioteca de fichas e PDFs para consulta rápida." },
] as const;

export type ModuloOpcional = (typeof MODULOS_OPCIONAIS)[number]["chave"];

// tela (ex.: "/contagens") desligada para a empresa?
export function telaDesligada(tela: string | undefined, desligados: string[]) {
  return !!tela && MODULOS_OPCIONAIS.some((m) => desligados.includes(m.chave) && tela.startsWith(m.tela));
}
