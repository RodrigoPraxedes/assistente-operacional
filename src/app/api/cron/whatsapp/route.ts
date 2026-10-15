import { NextResponse, type NextRequest } from "next/server";
import { gerarLembretesChecklist, gerarResumosDoDia } from "@/lib/whatsapp-api/automacoes";
import { processarFila } from "@/lib/whatsapp-api/fila";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Relógio das automações do WhatsApp: chamado a cada minuto pelo servidor da
// Evolution (crontab, ver docs/whatsapp.md), porque o cron da Vercel Hobby só
// roda 1x por dia. Gera os resumos do dia no horário e envia a fila espaçada.
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const resumos = await gerarResumosDoDia().catch(() => null);
  const lembretes = await gerarLembretesChecklist().catch(() => null);
  const fila = await processarFila(12, 40_000).catch(() => null);
  return NextResponse.json({ resumos, lembretes, fila });
}
