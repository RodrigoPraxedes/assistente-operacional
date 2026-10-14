import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { mascararNumero } from "./sanitizar";

// Entrada do webhook da Evolution: autenticação, validação estrita e resumo sem dados pessoais.

export const TAMANHO_MAXIMO = 256 * 1024;
export const TIPOS_ACEITOS = ["connection.update", "messages.update", "messages.upsert", "send.message"] as const;
export type TipoEvento = (typeof TIPOS_ACEITOS)[number];

const b64url = (b: Buffer) => b.toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

// Confere o "Authorization: Bearer <JWT>" que a Evolution gera com o jwt_key
// (HS256, validade de 10 minutos, payload { app: "evolution", action: "webhook" }).
export function jwtValido(authorization: string | null, segredo: string, agora = Date.now()): boolean {
  if (!authorization?.startsWith("Bearer ") || segredo.length < 32) return false;
  const partes = authorization.slice(7).trim().split(".");
  if (partes.length !== 3) return false;
  const [h, p, assinatura] = partes;
  try {
    const cabecalho = JSON.parse(Buffer.from(h, "base64url").toString());
    if (cabecalho?.alg !== "HS256") return false;
    const esperada = Buffer.from(b64url(createHmac("sha256", segredo).update(`${h}.${p}`).digest()));
    const recebida = Buffer.from(assinatura);
    if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return false;
    const corpo = JSON.parse(Buffer.from(p, "base64url").toString());
    const seg = Math.floor(agora / 1000);
    if (typeof corpo?.exp !== "number" || corpo.exp < seg) return false;
    if (typeof corpo?.iat === "number" && corpo.iat > seg + 60) return false;
    return corpo?.app === "evolution" && corpo?.action === "webhook";
  } catch {
    return false;
  }
}

// Gera um JWT igual ao da Evolution (para testes e para o ensaio)
export function gerarJwtTeste(segredo: string, agora = Date.now()) {
  const seg = Math.floor(agora / 1000);
  const h = b64url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const p = b64url(Buffer.from(JSON.stringify({ iat: seg, exp: seg + 600, app: "evolution", action: "webhook" })));
  return `${h}.${p}.${b64url(createHmac("sha256", segredo).update(`${h}.${p}`).digest())}`;
}

export interface EventoLido {
  tipo: TipoEvento;
  instancia: string;
  externoId: string;
  resumo: Record<string, string | number | boolean | null>;
}

const texto = (v: unknown, max = 128) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

// Valida o corpo e monta o resumo. null = malformado ou tipo não aceito.
export function lerEvento(bruto: string): EventoLido | null {
  let corpo: unknown;
  try {
    corpo = JSON.parse(bruto);
  } catch {
    return null;
  }
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return null;
  const { event, instance, data } = corpo as { event?: unknown; instance?: unknown; data?: unknown };
  const tipo = typeof event === "string" ? event.toLowerCase().replace(/_/g, ".") : "";
  const instancia = texto(instance);
  if (!(TIPOS_ACEITOS as readonly string[]).includes(tipo) || !instancia) return null;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  const hash = createHash("sha256").update(bruto).digest("hex").slice(0, 40);

  switch (tipo as TipoEvento) {
    case "connection.update": {
      const estado = texto(d.state, 32);
      if (!estado) return null;
      return {
        tipo: "connection.update",
        instancia,
        externoId: `conn:${hash}`,
        resumo: {
          estado,
          motivo: typeof d.statusReason === "number" ? d.statusReason : null,
          numero: mascararNumero(texto(d.wuid)),
        },
      };
    }
    case "messages.update": {
      const id = texto(d.keyId);
      const status = texto(d.status, 32);
      if (!id || !status) return null;
      return {
        tipo: "messages.update",
        instancia,
        externoId: `upd:${id}:${status}`,
        resumo: { mensagem: id, status, propria: d.fromMe === true },
      };
    }
    case "messages.upsert":
    case "send.message": {
      const chave = d.key as { id?: unknown; fromMe?: unknown } | undefined;
      const id = texto(chave?.id);
      if (!id) return null;
      return {
        tipo: tipo as TipoEvento,
        instancia,
        externoId: `${tipo === "send.message" ? "snd" : "msg"}:${id}`,
        // sem texto da mensagem nem número de quem mandou
        resumo: { mensagem: id, propria: chave?.fromMe === true, formato: texto(d.messageType, 40) },
      };
    }
  }
  return null;
}
