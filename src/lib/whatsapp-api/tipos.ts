// Camada de integração com o WhatsApp: o resto do app só conhece estas operações.
// Provedores: simulação (ensaio), Evolution API (Baileys) e, depois, a API oficial da Meta.

export type Provedor = "simulacao" | "evolution" | "meta_cloud";
export type StatusConexao = "desconectado" | "conectando" | "conectado" | "atencao";
export type SituacaoMensagem =
  | "rascunho"
  | "na_fila"
  | "enviando"
  | "aceito"
  | "entregue"
  | "lido"
  | "falhou"
  | "desconhecido"
  | "cancelado";

export interface EstadoConexao {
  status: StatusConexao;
  // false = a instância ainda não existe no provedor (nunca conectou)
  existe: boolean;
  numeroMascarado: string | null;
}

export interface ResultadoConectar {
  jaConectado: boolean;
  // imagem do QR (data:image/png;base64,...). Só vai para a tela, nunca para o banco ou log.
  qr: string | null;
  codigoPareamento: string | null;
}

export interface Envio {
  instancia: string;
  numero: string; // só dígitos, com DDI
  texto: string;
}

export interface ProvedorWhatsApp {
  nome: string;
  // false = faltam variáveis de ambiente no servidor
  configurado(): boolean;
  consultarConexao(instancia: string): Promise<EstadoConexao>;
  conectar(instancia: string): Promise<ResultadoConectar>;
  desconectar(instancia: string): Promise<void>;
  configurarEventos(instancia: string, urlWebhook: string): Promise<void>;
  // devolve o id da mensagem no provedor (aceita ≠ entregue)
  enviarMensagem(envio: Envio): Promise<{ id: string }>;
  // grupos em que o número conectado participa (opcional: só a Evolution lista)
  listarGrupos?(instancia: string): Promise<{ jid: string; nome: string; participantes: number | null }[]>;
  // números (só dígitos) que participam do grupo; null = não deu para saber
  participantesDoGrupo?(instancia: string, jid: string): Promise<string[] | null>;
  // depois de um timeout: procura no provedor se a mensagem saiu (null = não achou)
  procurarEnviada(envio: Envio & { desde: Date; ate: Date }): Promise<string | null>;
}

// Erro já sem segredos, pronto para mostrar na tela e gravar
//  config  = falta variável de ambiente
//  auth    = chave recusada
//  rejeitado / nao_encontrado = o provedor respondeu que não
//  rede    = não chegou ao provedor (pode tentar de novo)
//  timeout / desconhecido = pode ter saído ou não (não reenviar sozinho)
export type TipoErro = "config" | "auth" | "rejeitado" | "nao_encontrado" | "rede" | "timeout" | "desconhecido";

export class ErroProvedor extends Error {
  constructor(
    public tipo: TipoErro,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "ErroProvedor";
  }
}
