import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { eventosDoMembro } from "@/lib/agenda";
import { montarIcal } from "@/lib/ical";
import { urlDoSite } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const DIA = 86_400_000;
const DIAS_PASSADOS = 30;
const DIAS_FUTUROS = 90;

// Feed público do Google Agenda: /agenda/<token>.ics (sem login; o token é o segredo).
// Usa a chave do servidor porque não há usuário logado.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{48}$/.test(token)) return new NextResponse("Link inválido", { status: 404 });

  const admin = createAdminClient();
  const { data: link } = await admin
    .from("agenda_links")
    .select("membro_id, empresa_id")
    .eq("token", token)
    .maybeSingle<{ membro_id: string; empresa_id: string }>();
  if (!link) return new NextResponse("Link desligado ou inexistente", { status: 404 });

  const [{ data: membro }, { data: empresa }] = await Promise.all([
    admin.from("membros").select("nome, ativo").eq("id", link.membro_id).maybeSingle<{ nome: string; ativo: boolean }>(),
    admin
      .from("empresas")
      .select("nome, fuso_horario, situacao")
      .eq("id", link.empresa_id)
      .maybeSingle<{ nome: string; fuso_horario: string; situacao: string }>(),
  ]);
  if (!membro?.ativo || empresa?.situacao !== "ativa") return new NextResponse("Link desligado ou inexistente", { status: 404 });

  const { membro_id: membroId, empresa_id: empresaId } = link;
  const agora = Date.now();
  const eventos = await eventosDoMembro(admin, {
    empresaId,
    membroId,
    fuso: empresa.fuso_horario,
    de: new Date(agora - DIAS_PASSADOS * DIA),
    ate: new Date(agora + DIAS_FUTUROS * DIA),
  });

  // marca o último acesso (mostra na tela que o calendário está lendo o link)
  await admin.from("agenda_links").update({ acessado_em: new Date().toISOString() }).eq("membro_id", membroId);

  const ical = montarIcal({
    nome: `${empresa.nome} · ${membro.nome}`,
    fuso: empresa.fuso_horario,
    eventos: eventos.map((e) => ({ ...e, url: e.caminho ? urlDoSite(e.caminho) : null })),
  });
  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda.ics"',
      "Cache-Control": "no-store",
    },
  });
}
