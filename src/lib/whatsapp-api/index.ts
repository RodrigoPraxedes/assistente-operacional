import "server-only";
import { evolution } from "./evolution";
import { simulacao } from "./simulacao";
import { ErroProvedor, type Provedor, type ProvedorWhatsApp } from "./tipos";

// API oficial da Meta (WhatsApp Cloud API): reservada. Quando for ligada, entra aqui
// com as mesmas operações, credenciais por empresa e webhook com assinatura X-Hub-Signature-256.
const naoDisponivel = (): never => {
  throw new ErroProvedor("config", "A API oficial da Meta ainda não está disponível neste app.");
};
const metaCloud: ProvedorWhatsApp = {
  nome: "API oficial da Meta",
  configurado: () => false,
  consultarConexao: async () => naoDisponivel(),
  conectar: async () => naoDisponivel(),
  desconectar: async () => naoDisponivel(),
  configurarEventos: async () => naoDisponivel(),
  enviarMensagem: async () => naoDisponivel(),
  procurarEnviada: async () => naoDisponivel(),
};

export function provedorDe(p: Provedor | string): ProvedorWhatsApp {
  if (p === "evolution") return evolution;
  if (p === "simulacao") return simulacao;
  return metaCloud;
}

export function comoErroProvedor(e: unknown): ErroProvedor {
  if (e instanceof ErroProvedor) return e;
  return new ErroProvedor("desconhecido", "Erro inesperado na integração.");
}

export { ErroProvedor };
