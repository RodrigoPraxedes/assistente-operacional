import { NextResponse, type NextRequest } from "next/server";
import { gerarLembretesAcoes, gerarLembretesChecklist, gerarResumosDoDia } from "@/lib/whatsapp-api/automacoes";
import { processarFila } from "@/lib/whatsapp-api/fila";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Relógio das automações do WhatsApp: chamado a cada minuto pelo servidor da
// Evolution (crontab, ver docs/whatsapp.md), porque o cron da Vercel Hobby só
// roda 1x por dia. Gera os resumos do dia no horário e envia a fila espaçada.
// Aproveita para cancelar check-lists não feitos (30 min depois da tolerância)
// e estender as escalas que se repetem (1x por dia por repetição).
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const admin = createAdminClient();
  const { data: checklistsCancelados } = await admin.rpc("cancelar_checklists_atrasados");
  const { data: escalasRepetidas } = await admin.rpc("estender_escalas_repetidas");
  const resumos = await gerarResumosDoDia().catch(() => null);
  const lembretes = await gerarLembretesChecklist().catch(() => null);
  const lembretesAcoes = await gerarLembretesAcoes().catch(() => null);
  const fila = await processarFila(12, 40_000).catch(() => null);
  return NextResponse.json({ checklistsCancelados, escalasRepetidas, resumos, lembretes, lembretesAcoes, fila });
}
