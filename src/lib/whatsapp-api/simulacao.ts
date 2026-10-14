import { ErroProvedor, type ProvedorWhatsApp } from "./tipos";

// Ensaio com dados fictícios: nada sai do app. Serve para testar o fluxo inteiro
// (rascunho → confirmação → fila → aceito → entregue → lido) sem servidor.
// Números de teste que forçam erros:
//   final 0000 → o "provedor" não responde a tempo (vira pendência)
//   final 9999 → o "provedor" recusa o envio
export const NUMERO_FICTICIO = "+55 00 9****-0000";

export const simulacao: ProvedorWhatsApp = {
  nome: "Simulação (ensaio)",
  configurado: () => true,
  async consultarConexao() {
    return { status: "conectado", existe: true, numeroMascarado: NUMERO_FICTICIO };
  },
  async conectar() {
    return { jaConectado: true, qr: null, codigoPareamento: null };
  },
  async desconectar() {},
  async configurarEventos() {},
  async enviarMensagem({ numero }) {
    if (numero.endsWith("0000")) throw new ErroProvedor("timeout", "Simulação: o provedor não respondeu a tempo.");
    if (numero.endsWith("9999")) throw new ErroProvedor("rejeitado", "Simulação: o provedor recusou o envio.");
    return { id: `SIM${crypto.randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}` };
  },
  async procurarEnviada() {
    return null;
  },
};
