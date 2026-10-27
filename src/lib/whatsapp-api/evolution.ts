import "server-only";
import { mascararNumero, sanitizarErro } from "./sanitizar";
import { ErroProvedor, type EstadoConexao, type ProvedorWhatsApp, type StatusConexao } from "./tipos";

// Evolution API v2.3.7 (imagem evoapicloud/evolution-api:v2.3.7), conexão via Baileys
// = WhatsApp Web. NÃO é a API oficial da Meta.
// Endpoints e payloads conferidos no código da versão 2.3.7 (github.com/evolution-foundation/evolution-api):
//   GET    /instance/connectionState/{i}   → { instance: { state: open|connecting|close } }
//   POST   /instance/create                → { instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }
//   GET    /instance/connect/{i}           → { base64, code, pairingCode, count }
//   GET    /instance/fetchInstances?instanceName={i} → [{ ownerJid, ... }]
//   DELETE /instance/logout/{i}
//   POST   /webhook/set/{i}                → { webhook: { enabled, url, headers, byEvents, base64, events } }
//   POST   /message/sendText/{i}           → { number, text } ⇒ { key: { id }, status }
//   GET    /group/fetchAllGroups/{i}?getParticipants=false → [{ id: "...@g.us", subject, size }]
//   POST   /chat/findMessages/{i}          → { where, page, offset } ⇒ { messages: { records } }
// Autenticação: header "apikey" (chave global, só no servidor).

const TIMEOUT_MS = 15_000;
// Eventos que o app aceita. O QR Code (QRCODE_UPDATED) fica de fora de propósito.
export const EVENTOS_ASSINADOS = ["CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"];

function config() {
  const url = (process.env.EVOLUTION_API_URL ?? "").replace(/\/$/, "");
  const chave = process.env.EVOLUTION_API_KEY ?? "";
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
  return { url, chave, segredo, ok: /^https?:\/\//.test(url) && chave.length > 0 && segredo.length >= 32 };
}

const CODIGOS_SEM_CONEXAO = ["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"];

async function chamar(metodo: string, caminho: string, corpo?: unknown): Promise<unknown> {
  const { url, chave, ok } = config();
  if (!ok) throw new ErroProvedor("config", "Configuração pendente: faltam as variáveis da Evolution no servidor.");
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), TIMEOUT_MS);
  let resposta: Response;
  try {
    resposta = await fetch(`${url}${caminho}`, {
      method: metodo,
      headers: { apikey: chave, ...(corpo ? { "Content-Type": "application/json" } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
      signal: controle.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (controle.signal.aborted) throw new ErroProvedor("timeout", "O servidor da Evolution não respondeu a tempo.");
    const codigo = (e as { cause?: { code?: string } })?.cause?.code ?? "";
    // não chegou a conectar: é seguro tentar de novo
    if (CODIGOS_SEM_CONEXAO.includes(codigo))
      throw new ErroProvedor("rede", `Não consegui alcançar o servidor da Evolution (${codigo}).`);
    throw new ErroProvedor("desconhecido", `Falha de rede: ${sanitizarErro(e)}`);
  } finally {
    clearTimeout(relogio);
  }

  const texto = await resposta.text().catch(() => "");
  let json: unknown = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (resposta.ok) return json;

  const detalhe = sanitizarErro(
    (json as { response?: { message?: unknown }; error?: { message?: unknown } } | null)?.response?.message ??
      (json as { error?: { message?: unknown } } | null)?.error?.message ??
      texto,
  );
  if (resposta.status === 401 || resposta.status === 403)
    throw new ErroProvedor("auth", "A Evolution recusou a chave de acesso. Confira EVOLUTION_API_KEY no servidor.");
  if (resposta.status === 404) throw new ErroProvedor("nao_encontrado", `Instância não encontrada na Evolution. ${detalhe}`);
  if (resposta.status >= 500) throw new ErroProvedor("desconhecido", `Erro no servidor da Evolution (${resposta.status}). ${detalhe}`);
  throw new ErroProvedor("rejeitado", `A Evolution recusou o pedido (${resposta.status}). ${detalhe}`);
}

function statusDe(state: unknown): StatusConexao {
  if (state === "open") return "conectado";
  if (state === "connecting") return "conectando";
  if (state === "close") return "desconectado";
  return "atencao";
}

async function numeroConectado(instancia: string): Promise<string | null> {
  try {
    const lista = await chamar("GET", `/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`);
    const item = (Array.isArray(lista) ? lista : [lista]).find(Boolean) as { ownerJid?: string; instance?: { owner?: string } } | undefined;
    return mascararNumero(item?.ownerJid ?? item?.instance?.owner ?? null);
  } catch {
    return null;
  }
}

function caminho(acao: string, instancia: string) {
  return `/${acao}/${encodeURIComponent(instancia)}`;
}

export const evolution: ProvedorWhatsApp = {
  nome: "Evolution API (WhatsApp Web)",
  configurado: () => config().ok,

  async consultarConexao(instancia): Promise<EstadoConexao> {
    try {
      const r = (await chamar("GET", caminho("instance/connectionState", instancia))) as { instance?: { state?: string } };
      const status = statusDe(r?.instance?.state);
      return { status, existe: true, numeroMascarado: status === "conectado" ? await numeroConectado(instancia) : null };
    } catch (e) {
      if (e instanceof ErroProvedor && e.tipo === "nao_encontrado") return { status: "desconectado", existe: false, numeroMascarado: null };
      throw e;
    }
  },

  async conectar(instancia) {
    const estado = await this.consultarConexao(instancia);
    if (estado.status === "conectado") return { jaConectado: true, qr: null, codigoPareamento: null };
    let qr: { base64?: string; pairingCode?: string | null } | undefined;
    if (!estado.existe) {
      const r = (await chamar("POST", "/instance/create", {
        instanceName: instancia,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      })) as { qrcode?: { base64?: string; pairingCode?: string | null } };
      qr = r?.qrcode;
    }
    if (!qr?.base64) {
      qr = (await chamar("GET", caminho("instance/connect", instancia))) as { base64?: string; pairingCode?: string | null };
    }
    const imagem = typeof qr?.base64 === "string" && qr.base64.startsWith("data:image/") ? qr.base64 : null;
    return { jaConectado: false, qr: imagem, codigoPareamento: qr?.pairingCode ?? null };
  },

  async desconectar(instancia) {
    await chamar("DELETE", caminho("instance/logout", instancia));
  },

  async configurarEventos(instancia, urlWebhook) {
    // A Evolution 2.3.7 não assina o corpo do webhook (não há HMAC). O que ela oferece:
    // com "jwt_key" nos headers, envia "Authorization: Bearer <JWT HS256>" válido por
    // 10 minutos, assinado com essa chave. O app confere esse JWT na entrada.
    await chamar("POST", caminho("webhook/set", instancia), {
      webhook: {
        enabled: true,
        url: urlWebhook,
        headers: { jwt_key: config().segredo },
        byEvents: false,
        base64: false,
        events: EVENTOS_ASSINADOS,
      },
    });
  },

  async enviarMensagem({ instancia, numero, texto }) {
    // em grupo, "@5521999998888" no texto vira marcação de verdade
    const marcados = numero.endsWith("@g.us") ? [...new Set([...texto.matchAll(/@(\d{12,13})\b/g)].map((m) => m[1]))] : [];
    const r = (await chamar("POST", caminho("message/sendText", instancia), {
      number: numero,
      text: texto,
      ...(marcados.length ? { mentioned: marcados } : {}),
    })) as {
      key?: { id?: string };
    } | null;
    const id = r?.key?.id;
    // respondeu 2xx sem id: não dá para afirmar que saiu
    if (!id) throw new ErroProvedor("desconhecido", "A Evolution respondeu sem o identificador da mensagem.");
    return { id };
  },

  async listarGrupos(instancia) {
    const r = await chamar("GET", `${caminho("group/fetchAllGroups", instancia)}?getParticipants=false`);
    const lista = Array.isArray(r) ? r : [];
    return lista
      .map((g) => g as { id?: unknown; subject?: unknown; size?: unknown })
      .filter((g) => typeof g.id === "string" && g.id.endsWith("@g.us"))
      .map((g) => ({
        jid: g.id as string,
        nome: typeof g.subject === "string" && g.subject ? g.subject : "(grupo sem nome)",
        participantes: typeof g.size === "number" ? g.size : null,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  },

  async participantesDoGrupo(instancia, jid) {
    const r = await chamar("GET", `${caminho("group/fetchAllGroups", instancia)}?getParticipants=true`);
    const grupo = (Array.isArray(r) ? r : []).find((g) => (g as { id?: unknown }).id === jid) as
      | { participants?: { id?: unknown; jid?: unknown; phoneNumber?: unknown }[] }
      | undefined;
    if (!grupo?.participants) return null;
    // WhatsApp novo pode identificar o participante por "@lid": o número real vem em phoneNumber
    const numeros = new Set<string>();
    for (const p of grupo.participants)
      for (const v of [p.id, p.jid, p.phoneNumber])
        if (typeof v === "string" && !v.endsWith("@lid")) {
          const n = v.split("@")[0].split(":")[0].replace(/\D/g, "");
          if (n.length >= 10) numeros.add(n);
        }
    return [...numeros];
  },

  async procurarEnviada({ instancia, numero, texto, desde, ate }) {
    const r = (await chamar("POST", caminho("chat/findMessages", instancia), {
      where: { key: { fromMe: true }, messageTimestamp: { gte: desde.toISOString(), lte: ate.toISOString() } },
      page: 1,
      offset: 50,
    })) as { messages?: { records?: unknown[] } } | null;
    const fim = numero.endsWith("@g.us") ? numero.split("@")[0] : numero.slice(-8);
    for (const reg of r?.messages?.records ?? []) {
      const m = reg as {
        key?: { id?: string; remoteJid?: string };
        message?: { conversation?: string; extendedTextMessage?: { text?: string } };
      };
      const corpo = m.message?.conversation ?? m.message?.extendedTextMessage?.text;
      const destino = (m.key?.remoteJid ?? "").split("@")[0];
      if (m.key?.id && corpo === texto && destino.endsWith(fim)) return m.key.id;
    }
    return null;
  },
};
