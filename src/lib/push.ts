import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehMadrugada, ORIGENS_SEM_MADRUGADA } from "@/lib/whatsapp-api/fila";

// Notificações push no navegador (Web Push). Cada aviso automático do WhatsApp é
// copiado para push_fila por um gatilho do banco (migration 74). Chaves VAPID nas variáveis da
// Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.
// Sem elas o push fica desligado em silêncio (o WhatsApp segue normal).

export function pushConfigurado() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configurar() {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contato@atalaia.app",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
}

// Envia os avisos da fila a todos os aparelhos da pessoa; aparelho que o
// navegador diz não existir mais (404/410) é removido
export async function processarPush(limite = 50) {
  if (!pushConfigurado()) return { enviados: 0, removidos: 0 };
  configurar();
  const admin = createAdminClient();
  const { data: fila } = await admin
    .from("push_fila")
    .select("id, empresa_id, membro_id, titulo, corpo, url, tipo")
    .is("enviado_em", null)
    .order("criado_em")
    .limit(limite);
  // como no WhatsApp, avisos de tarefa, conclusão e prazo esperam até as 8h da empresa
  const { data: empresas } = await admin
    .from("empresas")
    .select("id, fuso_horario")
    .in("id", [...new Set((fila ?? []).map((a) => a.empresa_id))]);
  const fusoDe = new Map((empresas ?? []).map((e) => [e.id, e.fuso_horario as string]));
  let enviados = 0;
  let removidos = 0;
  for (const a of fila ?? []) {
    if (ORIGENS_SEM_MADRUGADA.has(a.tipo) && ehMadrugada(fusoDe.get(a.empresa_id))) continue;
    // reserva antes de enviar: dois relógios ao mesmo tempo não mandam em dobro
    const { data: reservado } = await admin
      .from("push_fila")
      .update({ enviado_em: new Date().toISOString() })
      .eq("id", a.id)
      .is("enviado_em", null)
      .select("id");
    if (!reservado?.length) continue;
    const { data: aparelhos } = await admin.from("push_inscricoes").select("id, endpoint, p256dh, auth").eq("membro_id", a.membro_id);
    const carga = JSON.stringify({ titulo: a.titulo, corpo: a.corpo, url: a.url, tag: a.tipo });
    for (const ap of aparelhos ?? []) {
      try {
        await webpush.sendNotification({ endpoint: ap.endpoint, keys: { p256dh: ap.p256dh, auth: ap.auth } }, carga, { TTL: 3600 });
        enviados++;
      } catch (erro) {
        const status = (erro as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_inscricoes").delete().eq("id", ap.id);
          removidos++;
        }
      }
    }
  }
  // limpa a fila antiga
  await admin.from("push_fila").delete().lt("criado_em", new Date(Date.now() - 7 * 86_400_000).toISOString());
  return { enviados, removidos };
}
