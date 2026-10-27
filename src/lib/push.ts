import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

// Notificações push no navegador (Web Push). Chaves VAPID nas variáveis da
// Vercel: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY e VAPID_SUBJECT.
// Sem elas o push fica desligado em silêncio (o WhatsApp segue normal).

const PRAZO_JANELA_HORAS = 6;

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

// Tarefa cujo prazo venceu e segue aberta: avisa quem é responsável (1x por prazo)
export async function gerarPushPrazoVencido(agora = new Date()) {
  if (!pushConfigurado()) return 0;
  const admin = createAdminClient();
  const { data: empresas } = await admin.from("empresas").select("id").eq("push_prazo", true);
  let total = 0;
  for (const e of empresas ?? []) {
    const [{ data: tarefas }, { data: abertos }] = await Promise.all([
      admin
        .from("tarefas")
        .select("id, titulo, prazo, responsaveis, origem, status_id")
        .eq("empresa_id", e.id)
        .not("origem", "in", "(checklist,contagem)")
        .eq("privado", false)
        .is("concluida_em", null)
        .not("prazo", "is", null)
        .lte("prazo", agora.toISOString())
        .gt("prazo", new Date(agora.getTime() - PRAZO_JANELA_HORAS * 3_600_000).toISOString())
        .returns<{ id: string; titulo: string; prazo: string; responsaveis: string[]; origem: string; status_id: string }[]>(),
      admin.from("status").select("id").eq("empresa_id", e.id).in("tipo", ["aberto", "em_andamento", "adiado"]),
    ]);
    if (!tarefas?.length) continue;
    const statusAberto = new Set((abertos ?? []).map((s) => s.id));

    const donos = [...new Set(tarefas.flatMap((t) => t.responsaveis))];
    if (!donos.length) continue;
    const { data: inscritos } = await admin.from("push_inscricoes").select("membro_id").in("membro_id", donos);
    const comAparelho = new Set((inscritos ?? []).map((i) => i.membro_id));

    for (const t of tarefas) {
      if (!statusAberto.has(t.status_id)) continue;
      for (const membroId of t.responsaveis) {
        if (!comAparelho.has(membroId)) continue;
        const { data } = await admin
          .from("push_fila")
          .upsert(
            {
              empresa_id: e.id,
              membro_id: membroId,
              tipo: "prazo",
              titulo: "Prazo venceu",
              corpo: t.titulo,
              url: `/e/${e.id}/${t.origem === "chamado" ? "chamados" : "tarefas"}/${t.id}`,
              chave: `prazo:${t.id}:${new Date(t.prazo).getTime()}:${membroId}`,
            },
            { onConflict: "chave", ignoreDuplicates: true },
          )
          .select("id");
        total += data?.length ?? 0;
      }
    }
  }
  return total;
}

// Envia os avisos da fila a todos os aparelhos da pessoa; aparelho que o
// navegador diz não existir mais (404/410) é removido
export async function processarPush(limite = 50) {
  if (!pushConfigurado()) return { enviados: 0, removidos: 0 };
  configurar();
  const admin = createAdminClient();
  const { data: fila } = await admin
    .from("push_fila")
    .select("id, membro_id, titulo, corpo, url, tipo")
    .is("enviado_em", null)
    .order("criado_em")
    .limit(limite);
  let enviados = 0;
  let removidos = 0;
  for (const a of fila ?? []) {
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
