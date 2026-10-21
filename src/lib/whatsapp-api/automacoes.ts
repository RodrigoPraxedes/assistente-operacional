import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeNoFuso, horaLocalParaUtc, soDigitos } from "@/lib/formato";
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
  responsaveis: string[];
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

    total += (await resumosDaEmpresa(c.empresa_id, fuso, hoje, { y, m, d })).enfileiradas;
  }
  return total;
}

// Destinatário autorizado só com o número (sem escolher o colaborador) nunca
// recebia resumo nem aviso: liga ao colaborador de mesmo celular no cadastro
export async function ligarContatosAosColaboradores(empresaId: string) {
  const admin = createAdminClient();
  const [{ data: soltos }, { data: membros }, { data: ligados }] = await Promise.all([
    admin.from("whatsapp_contatos").select("id, telefone").eq("empresa_id", empresaId).eq("ativo", true).is("membro_id", null),
    admin.from("membros").select("id, telefone").eq("empresa_id", empresaId).eq("ativo", true),
    admin.from("whatsapp_contatos").select("membro_id").eq("empresa_id", empresaId).eq("ativo", true).not("membro_id", "is", null),
  ]);
  if (!soltos?.length) return;
  const jaLigados = new Set((ligados ?? []).map((c) => c.membro_id));
  const porNumero = new Map<string, string>();
  for (const m of membros ?? []) {
    let tel = soDigitos(m.telefone);
    if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
    if (tel && !jaLigados.has(m.id)) porNumero.set(tel, m.id);
  }
  for (const c of soltos) {
    const membroId = porNumero.get(c.telefone);
    if (!membroId) continue;
    porNumero.delete(c.telefone);
    await admin.from("whatsapp_contatos").update({ membro_id: membroId }).eq("id", c.id);
  }
}

// Botão "Reenviar resumo de hoje": manda o resumo de novo a todos, inclusive a quem já recebeu, com a marca
// "Reenvio" no início. Só pula quem ainda tem um resumo de hoje na fila ou sendo enviado.
export async function reenviarResumosDeHoje(empresaId: string, agora = new Date()) {
  const admin = createAdminClient();
  const { data: empresa } = await admin.from("empresas").select("fuso_horario").eq("id", empresaId).maybeSingle();
  const fuso = empresa?.fuso_horario ?? "America/Sao_Paulo";
  const { y, m, d } = hojeNoFuso(fuso, agora);
  const hoje = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // libera a chave dos resumos de hoje já concluídos (enviados ou não), para poder gerar de novo
  const { data: perdidas } = await admin
    .from("whatsapp_mensagens")
    .select("id, chave")
    .eq("empresa_id", empresaId)
    .eq("origem", "resumo")
    .like("chave", `resumo:%:${hoje}`)
    .not("situacao", "in", "(na_fila,enviando)");
  for (const p of perdidas ?? []) {
    await admin.from("whatsapp_mensagens").update({ chave: `${p.chave}:antes-${agora.getTime()}` }).eq("id", p.id);
  }
  return resumosDaEmpresa(empresaId, fuso, hoje, { y, m, d }, true);
}

async function resumosDaEmpresa(empresaId: string, fuso: string, hoje: string, dia: { y: number; m: number; d: number }, reenvio = false) {
  const admin = createAdminClient();
  await ligarContatosAosColaboradores(empresaId);
  const { data: contatos, error: erroContatos } = await admin
    .from("whatsapp_contatos")
    // whatsapp_contatos tem duas ligações com membros (membro_id e autorizado_por): sem nomear, a consulta falha por ambiguidade
    .select("membro_id, membros!whatsapp_contatos_membro_id_fkey(nome, ativo)")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .not("membro_id", "is", null)
    .returns<{ membro_id: string; membros: { nome: string; ativo: boolean } | null }[]>();
  const pessoas = new Map<string, string>();
  for (const c of contatos ?? []) if (c.membros?.ativo) pessoas.set(c.membro_id, c.membros.nome);
  if (!pessoas.size)
    return {
      enfileiradas: 0,
      diag: [erroContatos ? `erro ao ler os destinatários (${erroContatos.message})` : "nenhum destinatário ativo está ligado a um colaborador"],
    };
  const ids = [...pessoas.keys()];

  const fimDoDia = horaLocalParaUtc(dia.y, dia.m, dia.d, 23, 59, fuso).toISOString();
  const inicioDoDia = horaLocalParaUtc(dia.y, dia.m, dia.d, 0, 0, fuso).getTime();
  const [{ data: abertos }, { data: tarefas }, { data: escalas }] = await Promise.all([
    admin.from("status").select("id").eq("empresa_id", empresaId).in("tipo", ["aberto", "em_andamento", "adiado"]),
    admin
      .from("tarefas")
      .select("titulo, prazo, privado, responsaveis, status_id")
      .eq("empresa_id", empresaId)
      .overlaps("responsaveis", ids)
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
    // tarefa com vários responsáveis entra no resumo de cada um
    for (const id of t.responsaveis) porPessoa.set(id, [...(porPessoa.get(id) ?? []), t]);
  }
  const escalaDe = new Map((escalas ?? []).map((e) => [e.membro_id, e]));

  let enfileiradas = 0;
  const diag: string[] = [];
  for (const [membroId, nome] of pessoas) {
    const lista = porPessoa.get(membroId) ?? [];
    const escala = escalaDe.get(membroId);
    // nada para hoje ou atrasado: não manda mensagem (turno sozinho não conta)
    if (!lista.length) {
      diag.push(`${nome}: nenhuma tarefa aberta com prazo até hoje`);
      continue;
    }

    const hojeItens = lista.filter((t) => new Date(t.prazo).getTime() >= inicioDoDia);
    const atrasadas = lista.filter((t) => new Date(t.prazo).getTime() < inicioDoDia);
    const linhas = reenvio ? ["🔁 *Reenvio do resumo do dia*"] : [] as string[];
    linhas.push(`*Bom dia, ${nome.trim().split(/\s+/)[0]}!* Seu dia ${hoje.slice(8, 10)}/${hoje.slice(5, 7)}:`);
    if (escala) linhas.push(linhaEscala(escala));
    if (hojeItens.length) {
      linhas.push("", `*Para hoje (${hojeItens.length})*`, ...itens(hojeItens, (t) => `até ${hora(t.prazo, fuso)}`));
    }
    if (atrasadas.length) {
      linhas.push("", `*Atrasadas (${atrasadas.length})*`, ...itens(atrasadas, (t) => `venceu ${diaMes(t.prazo, fuso)}`));
    }

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
    if (id) {
      enfileiradas++;
    } else {
      // não entrou: já existe resumo de hoje na fila ou sendo enviado, ou falta destinatário/conexão
      const { data: existente } = await admin
        .from("whatsapp_mensagens")
        .select("situacao")
        .eq("chave", `resumo:${membroId}:${hoje}`)
        .maybeSingle();
      diag.push(
        existente
          ? `${nome}: já há um resumo de hoje (${existente.situacao})`
          : `${nome}: sem destinatário ativo ou sem conexão de WhatsApp`,
      );
    }
  }
  return { enfileiradas, diag };
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

// Lembrete de check-list: "lembrete_minutos" antes do horário, o responsável
// recebe um aviso para puxar a equipe. Só envia antes do horário (relógio
// atrasado não manda lembrete de algo que já começou).
const LEMBRETE_MAX_MIN = 720;

export async function gerarLembretesChecklist(agora = new Date()) {
  const admin = createAdminClient();
  const { data: configs } = await admin
    .from("whatsapp_automacoes")
    .select("empresa_id, empresas(fuso_horario)")
    .eq("lembrete_checklist", true)
    .returns<{ empresa_id: string; empresas: { fuso_horario: string } | null }[]>();

  let total = 0;
  for (const c of configs ?? []) {
    const fuso = c.empresas?.fuso_horario ?? "America/Sao_Paulo";
    const [{ data: tarefas }, { data: abertos }] = await Promise.all([
      admin
        .from("tarefas")
        .select("id, origem_id, unidade_id, responsaveis, status_id, ocorrencia_em, unidades(nome)")
        .eq("empresa_id", c.empresa_id)
        .eq("origem", "checklist")
        .not("responsavel_id", "is", null)
        .is("concluida_em", null)
        .gt("ocorrencia_em", agora.toISOString())
        .lte("ocorrencia_em", new Date(agora.getTime() + LEMBRETE_MAX_MIN * 60_000).toISOString())
        .returns<
          {
            id: string;
            origem_id: string;
            unidade_id: string | null;
            responsaveis: string[];
            status_id: string;
            ocorrencia_em: string;
            unidades: { nome: string } | null;
          }[]
        >(),
      admin.from("status").select("id").eq("empresa_id", c.empresa_id).in("tipo", ["aberto", "em_andamento", "adiado"]),
    ]);
    const statusAberto = new Set((abertos ?? []).map((s) => s.id));
    const pendentes = (tarefas ?? []).filter((t) => statusAberto.has(t.status_id));
    if (!pendentes.length) continue;

    const { data: modelos } = await admin
      .from("checklist_modelos")
      .select("id, nome, lembrete_minutos")
      .in("id", [...new Set(pendentes.map((t) => t.origem_id))]);
    const modeloDe = new Map((modelos ?? []).map((m) => [m.id, m]));

    for (const t of pendentes) {
      const m = modeloDe.get(t.origem_id);
      if (!m || m.lembrete_minutos <= 0) continue;
      const quando = new Date(t.ocorrencia_em);
      if (quando.getTime() - m.lembrete_minutos * 60_000 > agora.getTime()) continue;

      // cada responsável recebe o seu lembrete (o primeiro mantém a chave antiga, para não repetir o que já saiu)
      for (const [i, responsavel] of t.responsaveis.entries()) {
        const { data: id } = await admin.rpc("whatsapp_enfileirar_automatica", {
          p_empresa: c.empresa_id,
          p_unidade: t.unidade_id,
          p_membro: responsavel,
          p_texto: [
            `*Lembrete: check-list às ${hora(t.ocorrencia_em, fuso)}*`,
            `${m.nome}${t.unidades?.nome ? ` · ${t.unidades.nome}` : ""}`,
            "Você é o responsável: lembre a equipe de fazer.",
          ].join("\n"),
          p_origem: "lembrete",
          p_origem_id: t.id,
          p_chave: i === 0 ? `lembrete:${t.id}` : `lembrete:${t.id}:${responsavel}`,
        });
        if (id) total++;
      }
    }
  }
  return total;
}

// Lembrete de ação recorrente: "lembrete_acao_minutos" antes do horário da
// ocorrência, cada responsável recebe um aviso. A mensagem de "Nova tarefa" sai
// na criação da ocorrência (gatilho no banco); este é o segundo aviso.
export async function gerarLembretesAcoes(agora = new Date()) {
  const admin = createAdminClient();
  const { data: configs } = await admin
    .from("whatsapp_automacoes")
    .select("empresa_id, lembrete_acao_minutos, empresas(fuso_horario)")
    .eq("lembrete_acao", true)
    .returns<{ empresa_id: string; lembrete_acao_minutos: number; empresas: { fuso_horario: string } | null }[]>();

  let total = 0;
  for (const c of configs ?? []) {
    const fuso = c.empresas?.fuso_horario ?? "America/Sao_Paulo";
    const [{ data: tarefas }, { data: abertos }] = await Promise.all([
      admin
        .from("tarefas")
        .select("id, unidade_id, responsaveis, cientes, status_id, titulo, ocorrencia_em, unidades(nome)")
        .eq("empresa_id", c.empresa_id)
        .eq("origem", "acao")
        .eq("privado", false)
        .is("concluida_em", null)
        .gt("ocorrencia_em", agora.toISOString())
        .lte("ocorrencia_em", new Date(agora.getTime() + c.lembrete_acao_minutos * 60_000).toISOString())
        .returns<
          {
            id: string;
            unidade_id: string | null;
            responsaveis: string[];
            cientes: string[];
            status_id: string;
            titulo: string;
            ocorrencia_em: string;
            unidades: { nome: string } | null;
          }[]
        >(),
      admin.from("status").select("id").eq("empresa_id", c.empresa_id).in("tipo", ["aberto", "em_andamento", "adiado"]),
    ]);
    const statusAberto = new Set((abertos ?? []).map((s) => s.id));

    for (const t of (tarefas ?? []).filter((x) => statusAberto.has(x.status_id))) {
      // quem só está ciente recebe o mesmo lembrete, com o título trocado
      for (const membroId of [...t.responsaveis, ...t.cientes]) {
        const ciente = !t.responsaveis.includes(membroId);
        const { data: id } = await admin.rpc("whatsapp_enfileirar_automatica", {
          p_empresa: c.empresa_id,
          p_unidade: t.unidade_id,
          p_membro: membroId,
          p_texto: [
            `*${ciente ? "Para seu conhecimento" : "Lembrete"}: ação às ${hora(t.ocorrencia_em, fuso)}*`,
            `${t.titulo}${t.unidades?.nome ? ` · ${t.unidades.nome}` : ""}`,
          ].join("\n"),
          p_origem: "lembrete",
          p_origem_id: t.id,
          p_chave: `lembrete:${t.id}:${membroId}`,
        });
        if (id) total++;
      }
    }
  }
  return total;
}
