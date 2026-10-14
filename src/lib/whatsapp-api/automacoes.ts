import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import { PERIODOS, type Periodo, type TipoEscala } from "@/lib/types";

// Resumo do dia: uma mensagem por colaborador (com WhatsApp autorizado) no
// horário escolhido: turno de hoje, tarefas que vencem hoje e atrasadas.
// O aviso de tarefa atribuída é feito no banco (gatilho na tabela tarefas).

// Passou disso depois do horário (ex.: o relógio externo ficou parado), não manda
// mais: um "bom dia" à noite atrapalha mais do que ajuda
const JANELA_HORAS = 3;
const MAX_ITENS = 8;

interface Config {
  empresa_id: string;
  resumo_hora: string;
  resumo_gerado_em: string | null;
  empresas: { fuso_horario: string } | null;
}

interface Tarefa {
  titulo: string;
  prazo: string;
  privado: boolean;
  responsavel_id: string;
}

interface EscalaHoje {
  membro_id: string;
  unidade_id: string;
  tipo: TipoEscala;
  unidades: { nome: string } | null;
  turnos: { nome: string; inicio: string | null; fim: string | null; periodo: Periodo | null } | null;
}

export async function gerarResumosDoDia(agora = new Date()) {
  const admin = createAdminClient();
  const { data: configs } = await admin
    .from("whatsapp_automacoes")
    .select("empresa_id, resumo_hora, resumo_gerado_em, empresas(fuso_horario)")
    .eq("resumo_dia", true)
    .returns<Config[]>();

  let total = 0;
  for (const c of configs ?? []) {
    const fuso = c.empresas?.fuso_horario ?? "America/Sao_Paulo";
    const { y, m, d } = hojeNoFuso(fuso, agora);
    const hoje = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (c.resumo_gerado_em === hoje) continue;
    const [h, mi] = c.resumo_hora.split(":").map(Number);
    const horario = horaLocalParaUtc(y, m, d, h, mi, fuso);
    const atraso = agora.getTime() - horario.getTime();
    if (atraso < 0 || atraso > JANELA_HORAS * 3_600_000) continue;

    // reserva o dia (dois relógios ao mesmo tempo não geram em dobro)
    let reserva = admin.from("whatsapp_automacoes").update({ resumo_gerado_em: hoje }).eq("empresa_id", c.empresa_id);
    reserva = c.resumo_gerado_em ? reserva.eq("resumo_gerado_em", c.resumo_gerado_em) : reserva.is("resumo_gerado_em", null);
    const { data: reservado } = await reserva.select("empresa_id");
    if (!reservado?.length) continue;

    total += await resumosDaEmpresa(c.empresa_id, fuso, hoje, { y, m, d });
  }
  return total;
}

async function resumosDaEmpresa(empresaId: string, fuso: string, hoje: string, dia: { y: number; m: number; d: number }) {
  const admin = createAdminClient();
  const { data: contatos } = await admin
    .from("whatsapp_contatos")
    .select("membro_id, membros(nome, ativo)")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .not("membro_id", "is", null)
    .returns<{ membro_id: string; membros: { nome: string; ativo: boolean } | null }[]>();
  const pessoas = new Map<string, string>();
  for (const c of contatos ?? []) if (c.membros?.ativo) pessoas.set(c.membro_id, c.membros.nome);
  if (!pessoas.size) return 0;
  const ids = [...pessoas.keys()];

  const fimDoDia = horaLocalParaUtc(dia.y, dia.m, dia.d, 23, 59, fuso).toISOString();
  const inicioDoDia = horaLocalParaUtc(dia.y, dia.m, dia.d, 0, 0, fuso).getTime();
  const [{ data: abertos }, { data: tarefas }, { data: escalas }] = await Promise.all([
    admin.from("status").select("id").eq("empresa_id", empresaId).in("tipo", ["aberto", "em_andamento", "adiado"]),
    admin
      .from("tarefas")
      .select("titulo, prazo, privado, responsavel_id, status_id")
      .eq("empresa_id", empresaId)
      .in("responsavel_id", ids)
      .not("prazo", "is", null)
      .lte("prazo", fimDoDia)
      .is("concluida_em", null)
      .order("prazo")
      .limit(2000)
      .returns<(Tarefa & { status_id: string })[]>(),
    admin
      .from("escalas")
      .select("membro_id, unidade_id, tipo, unidades(nome), turnos(nome, inicio, fim, periodo)")
      .eq("empresa_id", empresaId)
      .eq("data", hoje)
      .in("membro_id", ids)
      .returns<EscalaHoje[]>(),
  ]);
  const statusAberto = new Set((abertos ?? []).map((s) => s.id));

  const porPessoa = new Map<string, Tarefa[]>();
  for (const t of tarefas ?? []) {
    if (!statusAberto.has(t.status_id)) continue;
    porPessoa.set(t.responsavel_id, [...(porPessoa.get(t.responsavel_id) ?? []), t]);
  }
  const escalaDe = new Map((escalas ?? []).map((e) => [e.membro_id, e]));

  let enfileiradas = 0;
  for (const [membroId, nome] of pessoas) {
    const lista = porPessoa.get(membroId) ?? [];
    const escala = escalaDe.get(membroId);
    // nada para hoje: não manda mensagem (menos volume para o número)
    if (!lista.length && escala?.tipo !== "turno") continue;

    const hojeItens = lista.filter((t) => new Date(t.prazo).getTime() >= inicioDoDia);
    const atrasadas = lista.filter((t) => new Date(t.prazo).getTime() < inicioDoDia);
    const linhas = [`*Bom dia, ${nome.trim().split(/\s+/)[0]}!* Seu dia ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}:`];
    if (escala) linhas.push(linhaEscala(escala));
    if (hojeItens.length) {
      linhas.push("", `*Para hoje (${hojeItens.length})*`, ...itens(hojeItens, (t) => `até ${hora(t.prazo, fuso)}`));
    }
    if (atrasadas.length) {
      linhas.push("", `*Atrasadas (${atrasadas.length})*`, ...itens(atrasadas, (t) => `venceu ${diaMes(t.prazo, fuso)}`));
    }
    if (!lista.length) linhas.push("Nenhuma tarefa com prazo para hoje.");

    const { data: id } = await admin.rpc("whatsapp_enfileirar_automatica", {
      p_empresa: empresaId,
      // número da unidade onde a pessoa trabalha hoje, se houver
      p_unidade: escala?.unidade_id ?? null,
      p_membro: membroId,
      p_texto: linhas.join("\n"),
      p_origem: "resumo",
      p_origem_id: null,
      p_chave: `resumo:${membroId}:${hoje}`,
    });
    if (id) enfileiradas++;
  }
  return enfileiradas;
}

function linhaEscala(e: EscalaHoje) {
  const onde = e.unidades?.nome ? ` · ${e.unidades.nome}` : "";
  if (e.tipo === "folga") return "Hoje é sua folga.";
  if (e.tipo === "ferias") return "Você está de férias hoje.";
  if (e.tipo === "falta") return `Escala: falta registrada${onde}`;
  const t = e.turnos;
  if (!t) return `Turno de hoje${onde}`;
  const horario = t.inicio && t.fim ? ` ${t.inicio.slice(0, 5)}–${t.fim.slice(0, 5)}` : t.periodo ? ` (${PERIODOS[t.periodo].rotulo.toLowerCase()})` : "";
  return `Turno: ${t.nome}${horario}${onde}`;
}

// tarefas privadas entram só na contagem, sem título (o texto fica visível para quem gerencia)
function itens(lista: Tarefa[], quando: (t: Tarefa) => string) {
  const publicas = lista.filter((t) => !t.privado);
  const privadas = lista.length - publicas.length;
  const linhas = publicas.slice(0, MAX_ITENS).map((t) => `• ${t.titulo} (${quando(t)})`);
  const resto = publicas.length - Math.min(publicas.length, MAX_ITENS);
  if (resto > 0) linhas.push(`• e mais ${resto}`);
  if (privadas > 0) linhas.push(`• ${privadas} ${privadas === 1 ? "tarefa privada" : "tarefas privadas"}`);
  return linhas;
}

function hora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}

function diaMes(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: fuso }).format(new Date(iso));
}
