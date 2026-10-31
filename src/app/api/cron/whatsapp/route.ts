import { NextResponse, type NextRequest } from "next/server";
import { gerarAvisosPrazoVencido, gerarLembretesAcoes, gerarLembretesChecklist, gerarResumosDoDia } from "@/lib/whatsapp-api/automacoes";
import { processarFila } from "@/lib/whatsapp-api/fila";
import { gerarPushPrazoVencido, processarPush } from "@/lib/push";
import { retomarTarefasAdiadas } from "@/lib/retomar-adiadas";
import { limparFotosAntigas } from "@/lib/limpar-fotos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Relógio das automações do WhatsApp: chamado a cada minuto pelo servidor da
// Evolution (crontab, ver docs/whatsapp.md), porque o cron da Vercel Hobby só
// roda 1x por dia. Gera os resumos do dia no horário e envia a fila espaçada.
// Aproveita para cancelar check-lists não feitos (30 min depois da tolerância)
// e estender as escalas que se repetem (1x por dia por repetição).
// Também envia as notificações push do navegador (ver lib/push.ts).
// Também apaga as fotos com mais de 30 dias (ver lib/limpar-fotos.ts).
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: checklistsCancelados } = await admin.rpc("cancelar_checklists_atrasados");
  const { data: escalasRepetidas } = await admin.rpc("estender_escalas_repetidas");
  const retomadas = await retomarTarefasAdiadas().catch(() => null);
  const resumos = await gerarResumosDoDia().catch(() => null);
  const lembretes = await gerarLembretesChecklist().catch(() => null);
  const lembretesAcoes = await gerarLembretesAcoes().catch(() => null);
  const avisosPrazo = await gerarAvisosPrazoVencido().catch(() => null);
  // 1x por dia (03h de Brasília, janela de 5 min): apaga fotos com mais de 30 dias
  const agora = new Date();
  const fotos =
    agora.getUTCHours() === 6 && agora.getUTCMinutes() < 5 ? await limparFotosAntigas().catch(() => null) : null;
  const pushPrazo = await gerarPushPrazoVencido().catch(() => null);
  const push = await processarPush().catch(() => null);
  const fila = await processarFila(12, 40_000).catch(() => null);
  return NextResponse.json({ checklistsCancelados, escalasRepetidas, retomadas, resumos, lembretes, lembretesAcoes, avisosPrazo, pushPrazo, push, fotos, fila });
}
