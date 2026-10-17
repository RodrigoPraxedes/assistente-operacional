import type { Provedor, SituacaoMensagem, StatusConexao } from "./tipos";

// Textos e cores da tela (pode ser usado no navegador: nada de segredo aqui)

export const STATUS_CONEXAO: Record<StatusConexao, { rotulo: string; cor: string }> = {
  desconectado: { rotulo: "Desconectado", cor: "#64748b" },
  conectando: { rotulo: "Conectando", cor: "#2563eb" },
  conectado: { rotulo: "Conectado", cor: "#16a34a" },
  atencao: { rotulo: "Atenção", cor: "#dc2626" },
};

export const PROVEDORES: Record<Provedor, { rotulo: string; detalhe: string }> = {
  simulacao: { rotulo: "Ensaio (simulação)", detalhe: "Dados fictícios, nada sai do app" },
  evolution: { rotulo: "API alternativa (Evolution)", detalhe: "WhatsApp Web via Baileys, não oficial" },
  meta_cloud: { rotulo: "API oficial da Meta", detalhe: "WhatsApp Cloud API" },
};

export const SITUACAO_MENSAGEM: Record<SituacaoMensagem, { rotulo: string; cor: string }> = {
  rascunho: { rotulo: "Rascunho", cor: "#64748b" },
  na_fila: { rotulo: "Confirmado, na fila", cor: "#2563eb" },
  enviando: { rotulo: "Enviando", cor: "#2563eb" },
  aceito: { rotulo: "Aceito pelo provedor", cor: "#2563eb" },
  entregue: { rotulo: "Entregue", cor: "#16a34a" },
  lido: { rotulo: "Lido", cor: "#16a34a" },
  falhou: { rotulo: "Falhou", cor: "#dc2626" },
  desconhecido: { rotulo: "Resultado desconhecido", cor: "#d97706" },
  cancelado: { rotulo: "Cancelado", cor: "#64748b" },
};

export const SITUACAO_EVENTO: Record<string, { rotulo: string; cor: string }> = {
  recebido: { rotulo: "Recebido", cor: "#2563eb" },
  processado: { rotulo: "Processado", cor: "#16a34a" },
  ignorado: { rotulo: "Ignorado", cor: "#64748b" },
  falhou: { rotulo: "Falhou", cor: "#dc2626" },
};

export const TIPO_EVENTO: Record<string, string> = {
  "connection.update": "Conexão",
  "messages.update": "Recibo de mensagem",
  "messages.upsert": "Mensagem recebida",
  "send.message": "Mensagem enviada",
};

// Exemplo do primeiro caso: relatório do fechamento pronto para revisão (dados fictícios)
export const TEXTO_TESTE = [
  "*TESTE · Relatório do fechamento pronto para revisão*",
  "Unidade: Unidade Exemplo",
  "Enviado por: Colaborador Fictício às 22:40",
  'Itens com problema: 2',
  "Mensagem de ensaio com dados fictícios.",
].join("\n");
