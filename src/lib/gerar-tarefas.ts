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
  responsavel_id: string | null;
  // ação/alerta privado: as tarefas nascem privadas, de quem criou
  privado?: boolean;
  criado_por?: string | null;
  titulo: string;
  descricao?: string | null | ((m: { quando: Date; prazo: Date }) => string);
  // quando cada tarefa aparece e qual o prazo dela, de hoje até "dias" à frente
  momentos: (dias: number) => { quando: Date; prazo: Date }[];
}

const MINUTO = 60_000;

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
      "id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, nome, horario_preferencial, tolerancia_minutos, recorrencia, created_at, empresas(fuso_horario)",
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
    responsavel_id: m.responsavel_id,
    titulo: `Check-list: ${m.nome}`,
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

async function fontesAcoes(admin: Admin, { id: acaoId, empresaId }: Filtro = {}): Promise<Fonte[]> {
  let q = admin
    .from("acoes")
    .select(
      "id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, nome, descricao, data_inicial, data_final, horario, prazo_horas, recorrencia, privado, criado_por, empresas(fuso_horario)",
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
      responsavel_id: string | null;
      nome: string;
      descricao: string | null;
      data_inicial: string;
      data_final: string | null;
      horario: string;
      prazo_horas: number;
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
    responsavel_id: a.responsavel_id,
    privado: a.privado,
    criado_por: a.criado_por,
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
      a.prazo_horas * 60,
    ),
  }));
}

// Cada aviso de alerta é uma fonte: a tarefa aparece X dias antes da data e
// o prazo é a própria data do evento.
async function fontesAlertas(admin: Admin, { id: alertaId, empresaId }: Filtro = {}): Promise<Fonte[]> {
  let q = admin
    .from("alerta_avisos")
    .select(
      "id, dias_antes, titulo, responsavel_id, alertas!inner(id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, nome, descricao, data_evento, recorrencia, horario, ativo, privado, criado_por, empresas(fuso_horario))",
    )
    .eq("alertas.ativo", true);
  if (alertaId) q = q.eq("alerta_id", alertaId);
  if (empresaId) q = q.eq("alertas.empresa_id", empresaId);
  const { data, error } = await q.returns<
    {
      id: string;
      dias_antes: number;
      titulo: string;
      responsavel_id: string | null;
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
      responsavel_id: v.responsavel_id ?? a.responsavel_id,
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
export async function gerarTarefasRecorrentes(filtro?: { modeloId?: string; acaoId?: string; alertaId?: string }) {
  const admin = createAdminClient();
  const soUm = filtro?.modeloId || filtro?.acaoId || filtro?.alertaId;
  const todas = [
    ...(!soUm || filtro?.modeloId ? await fontesChecklist(admin, { id: filtro?.modeloId }) : []),
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

  const statusInicial = new Map<string, string>();
  for (const s of status ?? []) if (!statusInicial.has(s.empresa_id)) statusInicial.set(s.empresa_id, s.id);

  const novas = [];
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
      for (const m of momentos) {
        novas.push({
          empresa_id: f.empresa_id,
          unidade_id: unidadeId,
          setor_id: f.setor_id,
          categoria_id: f.categoria_id,
          responsavel_id: f.responsavel_id,
          privado: f.privado ?? false,
          criado_por: f.criado_por ?? null,
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

  // insere uma a uma ignorando as que já existem (índice único parcial)
  let criadas = 0;
  for (const t of novas) {
    const { error: e } = await admin.from("tarefas").insert(t);
    if (!e) criadas++;
    else if (e.code !== "23505") console.error("Erro ao gerar tarefa", e.message);
  }
  return { criadas, avaliadas: novas.length };
}

// Agenda: as próximas ocorrências (que o job ainda não criou no Kanban) de tudo
// que é recorrente e tem esta pessoa como responsável.
export async function previsoesDoMembro(admin: Admin, empresaId: string, membroId: string, dias: number) {
  const fontes = [
    ...(await fontesChecklist(admin, { empresaId })),
    ...(await fontesAcoes(admin, { empresaId })),
    ...(await fontesAlertas(admin, { empresaId })),
  ].filter((f) => f.responsavel_id === membroId);

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
