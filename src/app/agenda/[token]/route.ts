import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { previsoesDoMembro } from "@/lib/gerar-tarefas";
import { montarIcal, type EventoIcal } from "@/lib/ical";
import { horaLocalParaUtc } from "@/lib/formato";
import { hojeIso, somarDias } from "@/lib/escala";
import { urlDoSite } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

const MINUTO = 60_000;
const DIA = 86_400_000;
const DIAS_PASSADOS = 30;
const DIAS_FUTUROS = 90;

const NOMES_ORIGEM: Record<string, string> = {
  avulsa: "Tarefa",
  checklist: "Check-list",
  acao: "Ação",
  chamado: "Chamado",
  alerta: "Alerta",
};

// Duração no calendário: até o prazo, se for curto; senão um bloco de 30 min
// no horário (uma ação com prazo de 2 dias não vira um evento de 2 dias).
function fimDoEvento(inicio: Date, prazo: Date | null) {
  const minutos = prazo ? (prazo.getTime() - inicio.getTime()) / MINUTO : 0;
  return minutos >= 15 && minutos <= 240 ? prazo! : new Date(inicio.getTime() + 30 * MINUTO);
}

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
      .select("nome, fuso_horario")
      .eq("id", link.empresa_id)
      .maybeSingle<{ nome: string; fuso_horario: string }>(),
  ]);
  if (!membro?.ativo || !empresa) return new NextResponse("Link desligado ou inexistente", { status: 404 });

  const { membro_id: membroId, empresa_id: empresaId } = link;
  const fuso = empresa.fuso_horario;
  const agora = Date.now();
  const desde = new Date(agora - DIAS_PASSADOS * DIA).toISOString();
  const ate = new Date(agora + DIAS_FUTUROS * DIA);
  const hoje = hojeIso(fuso);

  const [{ data: tarefas }, { data: status }, { data: unidades }, { data: escalas }, previsoes] = await Promise.all([
    admin
      .from("tarefas")
      .select("id, titulo, descricao, origem, origem_id, unidade_id, status_id, ocorrencia_em, prazo")
      .eq("empresa_id", empresaId)
      .eq("responsavel_id", membroId)
      .or(`prazo.gte.${desde},ocorrencia_em.gte.${desde}`)
      .limit(2000),
    admin.from("status").select("id, nome, tipo").eq("empresa_id", empresaId),
    admin.from("unidades").select("id, nome").eq("empresa_id", empresaId),
    admin
      .from("escalas")
      .select("id, data, tipo, unidade_id, observacao, turnos(nome, inicio, fim)")
      .eq("membro_id", membroId)
      .gte("data", somarDias(hoje, -DIAS_PASSADOS))
      .lte("data", somarDias(hoje, DIAS_FUTUROS))
      .returns<
        {
          id: string;
          data: string;
          tipo: string;
          unidade_id: string;
          observacao: string | null;
          turnos: { nome: string; inicio: string; fim: string } | null;
        }[]
      >(),
    previsoesDoMembro(admin, empresaId, membroId, DIAS_FUTUROS),
  ]);

  const statusPorId = new Map((status ?? []).map((s) => [s.id, s]));
  const unidadePorId = new Map((unidades ?? []).map((u) => [u.id, u.nome as string]));
  const nomeUnidade = (id: string | null) => (id ? (unidadePorId.get(id) ?? null) : null);
  const eventos: EventoIcal[] = [];
  const jaNoKanban = new Set<string>();

  // tarefas que já estão no Kanban
  for (const t of tarefas ?? []) {
    const s = statusPorId.get(t.status_id);
    const inicio = new Date(t.ocorrencia_em ?? t.prazo!);
    // cancelada também conta: a ocorrência não deve voltar como "programada"
    if (t.origem_id && t.ocorrencia_em) jaNoKanban.add(`${t.origem}|${t.origem_id}|${inicio.getTime()}`);
    if (s?.tipo === "cancelado" || inicio > ate) continue;
    const prazo = t.prazo ? new Date(t.prazo) : null;
    eventos.push({
      uid: `tarefa-${t.id}@assistente-operacional`,
      titulo: `${s?.tipo === "concluido" ? "✓ " : ""}${t.titulo}`,
      descricao: [
        `${NOMES_ORIGEM[t.origem] ?? "Tarefa"} · ${s?.nome ?? ""}`,
        t.ocorrencia_em && prazo && prazo.getTime() !== inicio.getTime()
          ? `Prazo: ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: fuso }).format(prazo)}`
          : null,
        t.descricao,
      ]
        .filter(Boolean)
        .join("\n\n"),
      local: nomeUnidade(t.unidade_id),
      url: urlDoSite(`/e/${empresaId}/tarefas/${t.id}`),
      inicio,
      fim: fimDoEvento(inicio, prazo),
    });
  }

  // próximas ocorrências que o Kanban ainda não criou
  const previstas = new Set<string>();
  for (const p of previsoes) {
    const chave = `${p.origem}|${p.origem_id}|${p.quando.getTime()}`;
    if (jaNoKanban.has(chave) || previstas.has(chave)) continue;
    previstas.add(chave);
    eventos.push({
      uid: `${p.origem}-${p.origem_id}-${p.quando.getTime()}@assistente-operacional`,
      titulo: p.titulo,
      descricao: [`${NOMES_ORIGEM[p.origem]} · programado`, p.descricao].filter(Boolean).join("\n\n"),
      local: nomeUnidade(p.unidade_id),
      inicio: p.quando,
      fim: fimDoEvento(p.quando, p.prazo),
    });
  }

  // escala: turnos com horário; folga e férias como dia inteiro
  for (const e of escalas ?? []) {
    const local = nomeUnidade(e.unidade_id);
    const url = urlDoSite(`/e/${empresaId}/escalas`);
    if (e.tipo === "turno" && e.turnos) {
      const [y, m, d] = e.data.split("-").map(Number);
      const [hi, mi] = e.turnos.inicio.split(":").map(Number);
      const [hf, mf] = e.turnos.fim.split(":").map(Number);
      // fim antes do início = termina no dia seguinte (ex.: 22:00 às 06:00)
      const viraDia = e.turnos.fim.slice(0, 5) <= e.turnos.inicio.slice(0, 5);
      const [yf, mmf, df] = (viraDia ? somarDias(e.data, 1) : e.data).split("-").map(Number);
      eventos.push({
        uid: `escala-${e.id}@assistente-operacional`,
        titulo: `Turno: ${e.turnos.nome}`,
        descricao: e.observacao,
        local,
        url,
        inicio: horaLocalParaUtc(y, m, d, hi, mi, fuso),
        fim: horaLocalParaUtc(yf, mmf, df, hf, mf, fuso),
      });
    } else if (e.tipo === "folga" || e.tipo === "ferias") {
      eventos.push({
        uid: `escala-${e.id}@assistente-operacional`,
        titulo: e.tipo === "folga" ? "Folga" : "Férias",
        descricao: e.observacao,
        local,
        url,
        inicio: e.data,
        fim: somarDias(e.data, 1),
      });
    }
  }

  // marca o último acesso (mostra na tela que o calendário está lendo o link)
  await admin.from("agenda_links").update({ acessado_em: new Date().toISOString() }).eq("membro_id", membroId);

  const ical = montarIcal({
    nome: `${empresa.nome} · ${membro.nome}`,
    fuso,
    eventos,
  });
  return new NextResponse(ical, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="agenda.ics"',
      "Cache-Control": "no-store",
    },
  });
}
