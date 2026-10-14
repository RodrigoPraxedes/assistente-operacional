import { NextResponse, type NextRequest } from "next/server";
import { gerarTarefasRecorrentes } from "@/lib/gerar-tarefas";
import { processarFila } from "@/lib/whatsapp-api/fila";

export const dynamic = "force-dynamic";

// Chamado pelo Vercel Cron (vercel.json). A Vercel envia
// "Authorization: Bearer <CRON_SECRET>" quando a variável CRON_SECRET existe.
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const resultado = await gerarTarefasRecorrentes();
  // rede de segurança do WhatsApp: o que ficou na fila ou sem processar
  const whatsapp = await processarFila().catch(() => null);
  return NextResponse.json({ ...resultado, whatsapp });
}
