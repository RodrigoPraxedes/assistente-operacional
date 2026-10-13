import { NextResponse, type NextRequest } from "next/server";
import { gerarTarefasRecorrentes } from "@/lib/gerar-tarefas";

export const dynamic = "force-dynamic";

// Chamado pelo Vercel Cron (vercel.json). A Vercel envia
// "Authorization: Bearer <CRON_SECRET>" quando a variável CRON_SECRET existe.
export async function GET(request: NextRequest) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || request.headers.get("authorization") !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  const resultado = await gerarTarefasRecorrentes();
  return NextResponse.json(resultado);
}
