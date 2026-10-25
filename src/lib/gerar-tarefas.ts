import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisosDeAlerta, ocorrencias, type RegraRecorrencia } from "@/lib/recorrencia";
import { formatarData } from "@/lib/formato";
import type { Origem } from "@/lib/types";

const DIAS_A_FRENTE = 2;

// chave do servidor (job) ou o cliente do usuário logado (tela da agenda, com RLS)
type Admin = SupabaseClient;

// O que cada módulo informa ao motor: de onde vem, quando acontece e como
// fica a tarefa no Kanban.
interface Fonte {
  origem: Origem;
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  // unidade_id null: true = uma tarefa por unidade ativa; false = uma só, sem unidade
  porUnidade?: boolean;
  setor_id: string | null;
  categoria_id: string | null;
  // uma ou mais pessoas (força-tarefa): a tarefa é uma só para todas
  responsaveis: string[];
  // só ficam cientes (WhatsApp e visibilidade), sem ser responsáveis
  cientes?: string[];
  // 2+ responsáveis: todos marcam a parte (check-list mantém assim)
  todos_concluem?: boolean;
  // ação/alerta privado: as tarefas nascem privadas, de quem criou
  privado?: boolean;
  criado_por?: string | null;
  equipamento_id?: string | null;
  titulo: string;
  descricao?: string | null | ((m: { quando: Date; prazo: Date }) => string);
  // check-list: ao regerar, tarefas ainda abertas do mesmo dia mudam de horário em vez de duplicar
  fuso?: string;
  // quando cada tarefa aparece e qual o prazo dela, de hoje até "dias" à frente
  momentos: (dias: number) => { quando: Date; prazo: Date }[];
}

const MINUTO = 60_000;

const chaveAlerta = (empresaId: string, unidadeId: string | null, titulo: string, prazoIso: string) =>
  [empresaId, unidadeId ?? "", titulo.trim().toLowerCase(), prazoIso].join("|");

// ocorrências da regra com prazo fixo depois de cada uma
const porRegra = (regra: RegraRecorrencia, prazoMinutos: number) => (dias: number) =>
  ocorrencias(regra, dias).map((quando) => ({
    quando,
    prazo: new Date(quando.getTime() + prazoMinutos * MINUTO),
  }));

interface ComFuso {
  empresas: { fuso_horario: string } | null;
}

// Filtro das fontes: um registro só (ao salvar) ou uma empresa (agenda)
interface Filtro {
  id?: string;
  empresaId?: string;
}

async function fontesChecklist(admin: Admin, { id: modeloId, empresaId }: Filtro = {}): Promise<Fonte[]> {
  let q = admin
    .from("checklist_modelos")
    .select(
      "id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, responsaveis, nome, horario_preferencial, tolerancia_minutos, recorrencia, created_at, empresas(fuso_horario)",
    )
    .eq("ativo", true);
  if (modeloId) q = q.eq("id", modeloId);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q.returns<
    ({
      id: string;
      empresa_id: string;
      unidade_id: string | null;
      setor_id: string | null;
      categoria_id: string | null;
      responsavel_id: string | null;
      responsaveis: string[];
      nome: string;
      horario_preferencial: string;
      tolerancia_minutos: number;
      recorrencia: string;
      created_at: string;
    } & ComFuso)[]
  >();
  if (error) throw error;
  return (data ?? []).map((m) => ({
    origem: "checklist",
    id: m.id,
    empresa_id: m.empresa_id,
    unidade_id: m.unidade_id,
    setor_id: m.setor_id,
    categoria_id: m.categoria_id,
    responsaveis: m.responsaveis.length ? m.responsaveis : m.responsavel_id ? [m.responsavel_id] : [],
    titulo: `Check-list: ${m.nome}`,
    fuso: m.empresas?.fuso_horario ?? "America/Sao_Paulo",
    momentos: porRegra(
      {
        regra: m.recorrencia,
        horario: m.horario_preferencial,
        inicio: new Date(m.created_at),
        fuso: m.empresas?.fuso_horario ?? "America/Sao_Paulo",
      },
      m.tolerancia_minutos,
    ),
  }));
}

// Contagem com agenda: uma fonte por horário (um por turno). A chave única da
// tarefa leva o instante, então os turnos do mesmo dia não se confundem.
async function fontesContagens(admin: Admin, { id: contagemId, empresaId }: Filtro = {}): Promise<Fonte[]> {
  let q = admin
    .from("contagens")
    .select(
      "id, empresa_id, unidade_id, setor_id, responsaveis, nome, turnos, horarios, tolerancia_minutos, recorrencia, created_at, empresas(fuso_horario)",
    )
    .eq("ativo", true)
    .eq("agendada", true);
  if (contagemId) q = q.eq("id", contagemId);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q.returns<
    ({
      id: string;
      empresa_id: string;
      unidade_id: string | null;
      setor_id: string | null;
      responsaveis: string[];
      nome: string;
      turnos: string[];
      horarios: string[];
      tolerancia_minutos: number;
      recorrencia: string;
      created_at: string;
    } & ComFuso)[]
  >();
  // banco ainda sem a migration da agenda: as contagens não podem travar os outros módulos
  if (error) {
    console.error("Contagens fora da geração de tarefas", error.message);
    return [];
  }
  return (data ?? []).flatMap((c) => {
    const fuso = c.empresas?.fuso_horario ?? "America/Sao_Paulo";
    return c.horarios.map((horario, i) => ({
      origem: "contagem" as const,
      id: c.id,
      empresa_id: c.empresa_id,
      unidade_id: c.unidade_id,
      setor_id: c.setor_id,
      categoria_id: null,
      responsaveis: c.responsaveis,
      titulo: `Contagem: ${c.nome}${c.turnos[i] ? ` · ${c.turnos[i]}` : ""}`,
      fuso,
      momentos: porRegra({ regra: c.recorrencia, horario, inicio: new Date(c.created_at), fuso }, c.tolerancia_minutos),
    }));
  });
}

async function fontesAcoes(admin: Admin, { id: acaoId, empresaId }: Filtro = {}): Promise<Fonte[]> {
  let q = admin
    .from("acoes")
    .select(
      "id, empresa_id, unidade_id, setor_id, categoria_id, responsaveis, cientes, todos_concluem, equipamento_id, nome, descricao, data_inicial, data_final, horario, prazo_minutos, recorrencia, privado, criado_por, empresas(fuso_horario)",
    )
    .eq("ativo", true);
  if (acaoId) q = q.eq("id", acaoId);
  if (empresaId) q = q.eq("empresa_id", empresaId);
  const { data, error } = await q.returns<
    ({
      id: string;
      empresa_id: string;
      unidade_id: string | null;
      setor_id: string | null;
      categoria_id: string | null;
      responsaveis: string[];
      cientes: string[];
      todos_concluem: boolean;
      equipamento_id: string | null;
      nome: string;
      descricao: string | null;
      data_inicial: string;
      data_final: string | null;
      horario: string;
      prazo_minutos: number;
      recorrencia: string | null;
      privado: boolean;
      criado_por: string | null;
    } & ComFuso)[]
  >();
  if (error) throw error;
  return (data ?? []).map((a) => ({
    origem: "acao",
    id: a.id,
    empresa_id: a.empresa_id,
    unidade_id: a.unidade_id,
    setor_id: a.setor_id,
    categoria_id: a.categoria_id,
    responsaveis: a.responsaveis,
    cientes: a.cientes,
    todos_concluem: a.todos_concluem,
    privado: a.privado,
    criado_por: a.criado_por,
    equipamento_id: a.equipamento_id,
    titulo: a.nome,
    descricao: a.descricao,
    momentos: porRegra(
      {
        regra: a.recorrencia,
        horario: a.horario,
        inicio: a.data_inicial,
        fim: a.data_final,
        fuso: a.empresas?.fuso_horario ?? "America/Sao_Paulo",
      },
      a.prazo_minutos,
    ),
  }));
}

// Cada aviso de alerta é uma fonte: a tarefa aparece X dias antes da data e
// o prazo é a própria data do evento.
async function fontesAlertas(admin: Admin, { id: alertaId, empresaId }: Filtro = {}): Promise<Fonte[]> {
  let q = admin
    .from("alerta_avisos")
    .select(
      "id, dias_antes, titulo, responsaveis, cientes, todos_concluem, alertas!inner(id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, nome, descricao, data_evento, recorrencia, horario, ativo, privado, criado_por, empresas(fuso_horario))",
    )
    .eq("alertas.ativo", true);
  if (alertaId) q = q.eq("alerta_id", alertaId);
  if (empresaId) q = q.eq("alertas.empresa_id", empresaId);
  const { data, error } = await q.returns<
    {
      id: string;
      dias_antes: number;
      titulo: string;
      responsaveis: string[];
      cientes: string[];
      todos_concluem: boolean;
      alertas: {
        id: string;
        empresa_id: string;
        unidade_id: string | null;
        setor_id: string | null;
        categoria_id: string | null;
        responsavel_id: string | null;
        nome: string;
        descricao: string | null;
        data_evento: string;
        recorrencia: string | null;
        horario: string;
        privado: boolean;
        criado_por: string | null;
      } & ComFuso;
    }[]
  >();
  if (error) throw error;
  return (data ?? []).map((v) => {
    const a = v.alertas;
    const fuso = a.empresas?.fuso_horario ?? "America/Sao_Paulo";
    const evento = {
      regra: a.recorrencia,
      horario: a.horario,
      inicio: a.data_evento,
      fuso,
    };
    return {
      origem: "alerta",
      id: v.id,
      empresa_id: a.empresa_id,
      // alerta da empresa toda = uma tarefa só, sem unidade
      unidade_id: a.unidade_id,
      porUnidade: false,
      setor_id: a.setor_id,
      categoria_id: a.categoria_id,
      // aviso sem ninguém: responsável padrão do alerta
      responsaveis: v.responsaveis.length ? v.responsaveis : a.responsavel_id ? [a.responsavel_id] : [],
      cientes: v.cientes,
      todos_concluem: v.todos_concluem,
      privado: a.privado,
      criado_por: a.criado_por,
      titulo: v.titulo,
      descricao: (quando) =>
        [`${a.nome}: ${formatarData(quando.prazo.toISOString(), fuso)}`, a.descricao].filter(Boolean).join("\n\n"),
      momentos: (dias) =>
        avisosDeAlerta(evento, v.dias_antes, dias).map((m) => ({
          quando: m.quando,
          prazo: m.evento,
        })),
    };
  });
}

// Gera no Kanban as tarefas de hoje e dos próximos dias de todos os módulos
// recorrentes. Idempotente: pode rodar várias vezes sem duplicar (índice único).
export async function gerarTarefasRecorrentes(filtro?: { modeloId?: string; acaoId?: string; alertaId?: string; contagemId?: string }) {
  const admin = createAdminClient();
  const soUm = filtro?.modeloId || filtro?.acaoId || filtro?.alertaId || filtro?.contagemId;
  const todas = [
    ...(!soUm || filtro?.modeloId ? await fontesChecklist(admin, { id: filtro?.modeloId }) : []),
    ...(!soUm || filtro?.contagemId ? await fontesContagens(admin, { id: filtro?.contagemId }) : []),
    ...(!soUm || filtro?.acaoId ? await fontesAcoes(admin, { id: filtro?.acaoId }) : []),
    ...(!soUm || filtro?.alertaId ? await fontesAlertas(admin, { id: filtro?.alertaId }) : []),
  ];

  if (todas.length === 0) return { criadas: 0, avaliadas: 0 };

  // empresas suspensas ou aguardando aprovação não geram tarefas
  const { data: ativas } = await admin
    .from("empresas")
    .select("id")
    .in("id", [...new Set(todas.map((f) => f.empresa_id))])
    .eq("situacao", "ativa");
  const liberadas = new Set((ativas ?? []).map((e) => e.id));
  const fontes = todas.filter((f) => liberadas.has(f.empresa_id));

  const empresas = [...new Set(fontes.map((f) => f.empresa_id))];
  if (empresas.length === 0) return { criadas: 0, avaliadas: 0 };

  const [{ data: unidades }, { data: status }] = await Promise.all([
    admin.from("unidades").select("id, empresa_id").in("empresa_id", empresas).eq("ativo", true),
    admin
      .from("status")
      .select("id, empresa_id, ordem")
      .in("empresa_id", empresas)
      .eq("tipo", "aberto")
      .eq("ativo", true)
      .order("ordem"),
  ]);

  const statusAbertos = (status ?? []).map((s) => s.id);
  const statusInicial = new Map<string, string>();
  for (const s of status ?? []) if (!statusInicial.has(s.empresa_id)) statusInicial.set(s.empresa_id, s.id);

  const novas = [];
  const vistosAlerta = new Set<string>();
  for (const f of fontes) {
    const statusId = statusInicial.get(f.empresa_id);
    if (!statusId) continue;
    const alvo: (string | null)[] =
      f.unidade_id || f.porUnidade === false
        ? [f.unidade_id]
        : (unidades ?? []).filter((u) => u.empresa_id === f.empresa_id).map((u) => u.id);

    let momentos: { quando: Date; prazo: Date }[];
    try {
      momentos = f.momentos(DIAS_A_FRENTE);
    } catch {
      console.error(`Recorrência inválida (${f.origem} ${f.id})`);
      continue;
    }

    for (const unidadeId of alvo) {
      for (const m of [...momentos].sort((a, b) => a.quando.getTime() - b.quando.getTime())) {
        // avisos do alerta com o mesmo texto e o mesmo prazo viram uma tarefa só
        if (f.origem === "alerta") {
          const k = chaveAlerta(f.empresa_id, unidadeId, f.titulo, m.prazo.toISOString());
          if (vistosAlerta.has(k)) continue;
          vistosAlerta.add(k);
        }
        novas.push({
          empresa_id: f.empresa_id,
          unidade_id: unidadeId,
          setor_id: f.setor_id,
          categoria_id: f.categoria_id,
          responsaveis: f.responsaveis,
          cientes: f.cientes ?? [],
          // check-list e contagem: quem enviar primeiro conclui para todos
          todos_concluem: f.todos_concluem ?? false,
          privado: f.privado ?? false,
          criado_por: f.criado_por ?? null,
          equipamento_id: f.equipamento_id ?? null,
          titulo: f.titulo,
          descricao: typeof f.descricao === "function" ? f.descricao(m) : (f.descricao ?? null),
          origem: f.origem,
          origem_id: f.id,
          ocorrencia_em: m.quando.toISOString(),
          prazo: m.prazo.toISOString(),
          status_id: statusId,
        });
      }
    }
  }

  // Editar o horário do check-list muda o instante da ocorrência (parte da chave
  // única) e geraria uma segunda tarefa no mesmo dia. Então, para cada dia, as
  // tarefas ainda no status inicial e fora do novo horário são reaproveitadas
  // (ou removidas, se sobrarem); as já em andamento/concluídas ficam como estão.
  // A contagem faz o mesmo, juntando os horários de todos os turnos.
  if (filtro?.modeloId || filtro?.contagemId) {
    const dia = (d: Date, fuso: string) => d.toLocaleDateString("en-CA", { timeZone: fuso });
    const ajustaveis = new Map<string, Fonte>();
    const momentosDe = new Map<string, { quando: Date; prazo: Date; titulo: string }[]>();
    for (const x of fontes.filter((x) => x.origem === "checklist" || x.origem === "contagem")) {
      let ms: { quando: Date; prazo: Date }[];
      try {
        ms = x.momentos(DIAS_A_FRENTE);
      } catch {
        continue;
      }
      ajustaveis.set(x.id, x);
      momentosDe.set(x.id, [...(momentosDe.get(x.id) ?? []), ...ms.map((m) => ({ ...m, titulo: x.titulo }))]);
    }
    for (const f of ajustaveis.values()) {
      const statusId = statusInicial.get(f.empresa_id);
      if (!statusId || !f.fuso) continue;
      const momentos = momentosDe.get(f.id)!;
      const { data: pendentes } = await admin
        .from("tarefas")
        .select("id, unidade_id, ocorrencia_em")
        .eq("origem", f.origem)
        .eq("origem_id", f.id)
        .eq("status_id", statusId)
        .gte("ocorrencia_em", new Date(Date.now() - 36 * 60 * MINUTO).toISOString());
      const unidadesDoModelo = f.unidade_id
        ? [f.unidade_id]
        : (unidades ?? []).filter((u) => u.empresa_id === f.empresa_id).map((u) => u.id);
      for (const unidadeId of unidadesDoModelo) {
        const doDia = new Map<string, { quando: Date; prazo: Date; titulo: string }[]>();
        for (const m of momentos) {
          const k = dia(m.quando, f.fuso);
          doDia.set(k, [...(doDia.get(k) ?? []), m]);
        }
        for (const [k, novos] of doDia) {
          const antigas = (pendentes ?? []).filter(
            (t) => t.unidade_id === unidadeId && dia(new Date(t.ocorrencia_em), f.fuso!) === k,
          );
          const jaCertas = new Set(novos.map((m) => m.quando.getTime()));
          const sobrando = antigas.filter((t) => !jaCertas.has(new Date(t.ocorrencia_em).getTime()));
          const faltando = novos.filter((m) => !antigas.some((t) => new Date(t.ocorrencia_em).getTime() === m.quando.getTime()));
          for (const [i, t] of sobrando.entries()) {
            const m = faltando[i];
            const { error: e } = m
              ? await admin
                  .from("tarefas")
                  .update({ ocorrencia_em: m.quando.toISOString(), prazo: m.prazo.toISOString(), titulo: m.titulo })
                  .eq("id", t.id)
              : await admin.from("tarefas").delete().eq("id", t.id);
            if (e) console.error(`Erro ao ajustar tarefa (${f.origem})`, e.message);
          }
        }
      }
    }
  }

  // tarefas de alerta que já existem com o mesmo texto e prazo (de outro aviso) não se repetem
  const prazosAlerta = [...new Set(novas.filter((t) => t.origem === "alerta").map((t) => t.prazo))];
  if (prazosAlerta.length) {
    const { data: jaExistem } = await admin
      .from("tarefas")
      .select("empresa_id, unidade_id, titulo, prazo")
      .eq("origem", "alerta")
      .in("prazo", prazosAlerta);
    const existentes = new Set(
      (jaExistem ?? []).map((t) => chaveAlerta(t.empresa_id, t.unidade_id, t.titulo, new Date(t.prazo).toISOString())),
    );
    for (let i = novas.length - 1; i >= 0; i--) {
      const t = novas[i];
      if (t.origem === "alerta" && existentes.has(chaveAlerta(t.empresa_id, t.unidade_id, t.titulo, t.prazo))) {
        novas.splice(i, 1);
      }
    }
  }

  // insere uma a uma ignorando as que já existem (índice único parcial)
  let criadas = 0;
  for (const t of novas) {
    const { error: e } = await admin.from("tarefas").insert(t);
    if (!e) criadas++;
    else if (e.code === "23505") {
      // ao salvar uma ação, a ocorrência já existente (ainda aberta) ganha o prazo e o equipamento novos
      if (filtro?.acaoId && t.origem === "acao") {
        let q = admin
          .from("tarefas")
          .update({ prazo: t.prazo, equipamento_id: t.equipamento_id })
          .eq("origem", "acao")
          .eq("origem_id", t.origem_id)
          .eq("ocorrencia_em", t.ocorrencia_em)
          .in("status_id", statusAbertos);
        q = t.unidade_id ? q.eq("unidade_id", t.unidade_id) : q.is("unidade_id", null);
        const { error: e2 } = await q;
        if (e2) console.error("Erro ao ajustar prazo da tarefa", e2.message);
      }
    } else console.error("Erro ao gerar tarefa", e.message);
  }
  return { criadas, avaliadas: novas.length };
}

// Agenda: as próximas ocorrências (que o job ainda não criou no Kanban) de tudo
// que é recorrente e tem esta pessoa entre os responsáveis.
export async function previsoesDoMembro(admin: Admin, empresaId: string, membroId: string, dias: number) {
  const fontes = [
    ...(await fontesChecklist(admin, { empresaId })),
    ...(await fontesContagens(admin, { empresaId })),
    ...(await fontesAcoes(admin, { empresaId })),
    ...(await fontesAlertas(admin, { empresaId })),
  ].filter((f) => f.responsaveis.includes(membroId));

  const previsoes = [];
  for (const f of fontes) {
    let momentos: { quando: Date; prazo: Date }[];
    try {
      momentos = f.momentos(dias);
    } catch {
      continue;
    }
    for (const m of momentos) {
      previsoes.push({
        origem: f.origem,
        origem_id: f.id,
        unidade_id: f.unidade_id,
        titulo: f.titulo,
        descricao: typeof f.descricao === "function" ? f.descricao(m) : (f.descricao ?? null),
        quando: m.quando,
        prazo: m.prazo,
      });
    }
  }
  return previsoes;
}
