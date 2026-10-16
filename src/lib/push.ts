import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Push no navegador: espelha os avisos do WhatsApp. Sem as chaves VAPID nas
// variáveis de ambiente, tudo aqui vira no-op.
let pronto: boolean | null = null;
function configurar() {
  if (pronto !== null) return pronto;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  pronto = !!(publica && privada);
  if (pronto) webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:contato@atalaia.app", publica!, privada!);
  return pronto;
}

export async function enviarPushParaMembro(membroId: string, aviso: { titulo: string; corpo: string; url: string }) {
  if (!configurar()) return;
  const admin = createAdminClient();
  const { data: membro } = await admin.from("membros").select("usuario_id").eq("id", membroId).maybeSingle();
  if (!membro?.usuario_id) return;
  const { data: inscricoes } = await admin
    .from("push_inscricoes")
    .select("id, endpoint, p256dh, auth")
    .eq("usuario_id", membro.usuario_id);
  const carga = JSON.stringify(aviso);
  await Promise.all(
    (inscricoes ?? []).map(async (i) => {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, carga, { TTL: 3600 });
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // aparelho desinscrito ou inscrição vencida: some da lista
        if (status === 404 || status === 410) await admin.from("push_inscricoes").delete().eq("id", i.id);
      }
    }),
  );
}
