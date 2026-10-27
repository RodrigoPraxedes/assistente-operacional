// "5521999998888" ou "5521999998888@s.whatsapp.net" → "+55 21 9****-8888"
export function mascararNumero(valor: string | null | undefined): string | null {
  if ((valor ?? "").endsWith("@g.us")) return "grupo";
  const n = (valor ?? "").split("@")[0].split(":")[0].replace(/\D/g, "");
  if (n.length < 8) return null;
  // Brasil: 55 + DDD + 8 ou 9 dígitos
  if (n.length === 12 || n.length === 13) return `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n[4]}****-${n.slice(-4)}`;
  return `****-${n.slice(-4)}`;
}

// Tira do texto qualquer coisa que pareça segredo ou dado pessoal antes de gravar/mostrar:
// a chave da Evolution, tokens, QR Code e números de telefone.
export function sanitizarErro(texto: unknown): string {
  let s = typeof texto === "string" ? texto : texto instanceof Error ? texto.message : JSON.stringify(texto ?? "");
  for (const segredo of [process.env.EVOLUTION_API_KEY, process.env.WHATSAPP_WEBHOOK_SECRET]) {
    if (segredo && segredo.length >= 6) s = s.split(segredo).join("***");
  }
  s = s
    .replace(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g, "[imagem]")
    .replace(/(apikey|api_key|token|authorization|bearer|jwt_key)("?\s*[:=]\s*"?)[^\s",}]+/gi, "$1$2***")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "***")
    .replace(/\d{10,13}(@[a-z.]+)?/g, (m) => mascararNumero(m) ?? "***");
  return s.slice(0, 300);
}
