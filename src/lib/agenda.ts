import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { previsoesDoMembro } from "@/lib/gerar-tarefas";
import type { EventoIcal } from "@/lib/ical";
import { formatarDataHora, horaLocalParaUtc } from "@/lib/formato";
import { somarDias } from "@/lib/escala";

// Agenda de uma pessoa: tarefas do Kanban em que ela é responsável, próximas
// ocorrências que o Kanban ainda não criou e a escala. Usada pelo feed do
// Google Agenda e pela tela Agenda do app.

export type TipoEvento = "tarefa" | "previsto" | "turno" | "folga" | "ferias" | "google";

export interface EventoAgenda extends EventoIcal {
  tipo: TipoEvento;
  concluida?: boolean;
  atrasada?: boolean;
  // caminho dentro do app (/e/...)
  caminho?: string;
}

const MINUTO = 60_000;
const DIA = 86_400_000;

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

// dia local (AAAA-MM-DD) de um instante no fuso
function diaLocal(d: Date, fuso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(d);
}

export async function eventosDoMembro(
  db: SupabaseClient,
  { empresaId, membroId, fuso, de, ate }: { empresaId: string; membroId: string; fuso: string; de: Date; ate: Date },
) {
  const deIso = de.toISOString();
  const ateIso = ate.toISOString();
  const agora = Date.now();
  const diasFuturos = ate.getTime() > agora ? Math.ceil((ate.getTime() - agora) / DIA) : -1;

  const [{ data: tarefas }, { data: status }, { data: unidades }, { data: escalas }, previsoes] = await Promise.all([
    db
      .from("tarefas")
      .select("id, titulo, descricao, origem, origem_id, unidade_id, status_id, ocorrencia_em, prazo")
      .eq("empresa_id", empresaId)
      .eq("responsavel_id", membroId)
      .or(
        `and(ocorrencia_em.gte.${deIso},ocorrencia_em.lte.${ateIso}),and(ocorrencia_em.is.null,prazo.gte.${deIso},prazo.lte.${ateIso})`,
      )
      .limit(2000),
    db.from("status").select("id, nome, tipo").eq("empresa_id", empresaId),
    db.from("unidades").select("id, nome").eq("empresa_id", empresaId),
    db
      .from("escalas")
      .select("id, data, tipo, unidade_id, observacao, turnos(nome, inicio, fim)")
      .eq("membro_id", membroId)
      // um turno da véspera pode entrar pela madrugada
      .gte("data", somarDias(diaLocal(de, fuso), -1))
      .lte("data", diaLocal(ate, fuso))
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
    diasFuturos >= 0 ? previsoesDoMembro(db, empresaId, membroId, diasFuturos) : Promise.resolve([]),
  ]);

  const statusPorId = new Map((status ?? []).map((s) => [s.id as string, s as { nome: string; tipo: string }]));
  const unidadePorId = new Map((unidades ?? []).map((u) => [u.id as string, u.nome as string]));
  const nomeUnidade = (id: string | null) => (id ? (unidadePorId.get(id) ?? null) : null);
  const eventos: EventoAgenda[] = [];
  const jaNoKanban = new Set<string>();

  // tarefas que já estão no Kanban
  for (const t of tarefas ?? []) {
    const s = statusPorId.get(t.status_id);
    const inicio = new Date(t.ocorrencia_em ?? t.prazo!);
    // cancelada também conta: a ocorrência não deve voltar como "programada"
    if (t.origem_id && t.ocorrencia_em) jaNoKanban.add(`${t.origem}|${t.origem_id}|${inicio.getTime()}`);
    if (s?.tipo === "cancelado") continue;
    const prazo = t.prazo ? new Date(t.prazo) : null;
    const concluida = s?.tipo === "concluido";
    eventos.push({
      tipo: "tarefa",
      concluida,
      atrasada: !concluida && !!prazo && prazo.getTime() < agora,
      uid: `tarefa-${t.id}@assistente-operacional`,
      titulo: `${concluida ? "✓ " : ""}${t.titulo}`,
      descricao: [
        `${NOMES_ORIGEM[t.origem] ?? "Tarefa"} · ${s?.nome ?? ""}`,
        t.ocorrencia_em && prazo && prazo.getTime() !== inicio.getTime()
          ? `Prazo: ${formatarDataHora(t.prazo, fuso)}`
          : null,
        t.descricao,
      ]
        .filter(Boolean)
        .join("\n\n"),
      local: nomeUnidade(t.unidade_id),
      caminho: `/e/${empresaId}/tarefas/${t.id}`,
      inicio,
      fim: fimDoEvento(inicio, prazo),
    });
  }

  // próximas ocorrências que o Kanban ainda não criou
  const previstas = new Set<string>();
  for (const p of previsoes) {
    const chave = `${p.origem}|${p.origem_id}|${p.quando.getTime()}`;
    if (p.quando < de || p.quando > ate || jaNoKanban.has(chave) || previstas.has(chave)) continue;
    previstas.add(chave);
    eventos.push({
      tipo: "previsto",
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
    const caminho = `/e/${empresaId}/escalas`;
    if (e.tipo === "turno" && e.turnos) {
      const [y, m, d] = e.data.split("-").map(Number);
      const [hi, mi] = e.turnos.inicio.split(":").map(Number);
      const [hf, mf] = e.turnos.fim.split(":").map(Number);
      // fim antes do início = termina no dia seguinte (ex.: 22:00 às 06:00)
      const viraDia = e.turnos.fim.slice(0, 5) <= e.turnos.inicio.slice(0, 5);
      const [yf, mmf, df] = (viraDia ? somarDias(e.data, 1) : e.data).split("-").map(Number);
      const inicio = horaLocalParaUtc(y, m, d, hi, mi, fuso);
      const fim = horaLocalParaUtc(yf, mmf, df, hf, mf, fuso);
      if (fim < de || inicio > ate) continue;
      eventos.push({
        tipo: "turno",
        uid: `escala-${e.id}@assistente-operacional`,
        titulo: `Turno: ${e.turnos.nome}`,
        descricao: e.observacao,
        local,
        caminho,
        inicio,
        fim,
      });
    } else if (e.tipo === "folga" || e.tipo === "ferias") {
      if (e.data < diaLocal(de, fuso)) continue;
      eventos.push({
        tipo: e.tipo,
        uid: `escala-${e.id}@assistente-operacional`,
        titulo: e.tipo === "folga" ? "Folga" : "Férias",
        descricao: e.observacao,
        local,
        caminho,
        inicio: e.data,
        fim: somarDias(e.data, 1),
      });
    }
  }

  return eventos;
}
