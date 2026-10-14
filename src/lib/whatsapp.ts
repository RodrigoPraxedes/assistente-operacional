import { soDigitos } from "@/lib/formato";

// Link wa.me: abre o WhatsApp com a mensagem pronta (a pessoa aperta enviar).
// Sem telefone, o WhatsApp pergunta para quem enviar.
export function linkWhatsApp(texto: string, telefone?: string | null) {
  let numero = soDigitos(telefone);
  // número brasileiro sem DDI (DDD + 8/9 dígitos)
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}

export function urlDoSite(caminho: string) {
  let base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  // na Vercel, variável vazia ou esquecida com "localhost" usa o endereço de produção
  const producao = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (producao && (!base || /localhost|127\.0\.0\.1/.test(base))) base = `https://${producao}`;
  return `${base}${caminho}`;
}
