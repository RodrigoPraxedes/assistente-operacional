import { after, NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarEvento } from "@/lib/whatsapp-api/fila";
import { TAMANHO_MAXIMO, jwtValido, lerEvento } from "@/lib/whatsapp-api/webhook";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Webhook da Evolution: autentica, valida, grava uma vez só e responde rápido.
// O processamento roda depois da resposta (after). A empresa e a instância vêm
// do cadastro (pelo id da conexão na URL), nunca do corpo do pedido.
// Respostas 4xx não são repetidas pela Evolution; 5xx são.
export async function POST(request: NextRequest, { params }: { params: Promise<{ conexaoId: string }> }) {
  const { conexaoId } = await params;
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
  if (!segredo) return NextResponse.json({ erro: "configuração pendente" }, { status: 503 });
  if (!UUID.test(conexaoId)) return NextResponse.json({ erro: "não encontrado" }, { status: 404 });
  if (!jwtValido(request.headers.get("authorization"), segredo))
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  if (!(request.headers.get("content-type") ?? "").includes("application/json"))
    return NextResponse.json({ erro: "formato não aceito" }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > TAMANHO_MAXIMO)
    return NextResponse.json({ erro: "grande demais" }, { status: 413 });
  const bruto = await request.text();
  if (bruto.length > TAMANHO_MAXIMO) return NextResponse.json({ erro: "grande demais" }, { status: 413 });

  const evento = lerEvento(bruto);
  if (!evento) return NextResponse.json({ erro: "evento inválido ou não aceito" }, { status: 400 });

  const admin = createAdminClient();
  const { data: conexao } = await admin
    .from("whatsapp_conexoes")
    .select("id, provedor, instancia")
    .eq("id", conexaoId)
    .maybeSingle();
  if (!conexao || conexao.provedor !== "evolution" || conexao.instancia !== evento.instancia)
    return NextResponse.json({ erro: "não encontrado" }, { status: 404 });

  const { data, error } = await admin.rpc("whatsapp_registrar_evento", {
    p_conexao: conexao.id,
    p_externo: evento.externoId,
    p_tipo: evento.tipo,
    p_resumo: evento.resumo,
  });
  if (error) return NextResponse.json({ erro: "falha ao gravar" }, { status: 500 });
  const registro = (data as { id: string; novo: boolean }[] | null)?.[0];
  if (!registro?.novo) return NextResponse.json({ ok: true, duplicado: true });

  after(() => processarEvento(registro.id));
  return NextResponse.json({ ok: true });
}
