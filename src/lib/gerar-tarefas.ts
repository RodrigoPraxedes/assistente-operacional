import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ocorrencias, type RegraRecorrencia } from "@/lib/recorrencia";
import type { Origem } from "@/lib/types";

const DIAS_A_FRENTE = 2;

type Admin = ReturnType<typeof createAdminClient>;

// O que cada módulo informa ao motor: de onde vem, quando acontece e como
// fica a tarefa no Kanban.
interface Fonte {
  origem: Origem;
  id: string;
  empresa_id: string;
  unidade_id: string | null; // null = uma tarefa por unidade ativa
  setor_id: string | null;
  categoria_id: string | null;
  responsavel_id: string | null;
  titulo: string;
  descricao?: string | null;
  regra: Omit<RegraRecorrencia, "fuso">;
  prazoMinutos: number;
}

interface ComFuso {
  empresas: { fuso_horario: string } | null;
}

async function fontesChecklist(admin: Admin, modeloId?: string): Promise<(Fonte & { fuso: string })[]> {
  let q = admin
    .from("checklist_modelos")
    .select(
      "id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, nome, horario_preferencial, tolerancia_minutos, recorrencia, created_at, empresas(fuso_horario)",
    )
    .eq("ativo", true);
  if (modeloId) q = q.eq("id", modeloId);
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
    regra: { regra: m.recorrencia, horario: m.horario_preferencial, inicio: new Date(m.created_at) },
    prazoMinutos: m.tolerancia_minutos,
    fuso: m.empresas?.fuso_horario ?? "America/Sao_Paulo",
  }));
}

async function fontesAcoes(admin: Admin, acaoId?: string): Promise<(Fonte & { fuso: string })[]> {
  let q = admin
    .from("acoes")
    .select(
      "id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, nome, descricao, data_inicial, data_final, horario, prazo_horas, recorrencia, empresas(fuso_horario)",
    )
    .eq("ativo", true);
  if (acaoId) q = q.eq("id", acaoId);
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
    titulo: a.nome,
    descricao: a.descricao,
    regra: { regra: a.recorrencia, horario: a.horario, inicio: a.data_inicial, fim: a.data_final },
    prazoMinutos: a.prazo_horas * 60,
    fuso: a.empresas?.fuso_horario ?? "America/Sao_Paulo",
  }));
}

// Gera no Kanban as tarefas de hoje e dos próximos dias de todos os módulos
// recorrentes. Idempotente: pode rodar várias vezes sem duplicar (índice único).
export async function gerarTarefasRecorrentes(filtro?: { modeloId?: string; acaoId?: string }) {
  const admin = createAdminClient();
  const soUm = filtro?.modeloId || filtro?.acaoId;
  const fontes = [
    ...(!soUm || filtro?.modeloId ? await fontesChecklist(admin, filtro?.modeloId) : []),
    ...(!soUm || filtro?.acaoId ? await fontesAcoes(admin, filtro?.acaoId) : []),
  ];

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
    const alvo = f.unidade_id
      ? [f.unidade_id]
      : (unidades ?? []).filter((u) => u.empresa_id === f.empresa_id).map((u) => u.id);

    let datas: Date[];
    try {
      datas = ocorrencias({ ...f.regra, fuso: f.fuso }, DIAS_A_FRENTE);
    } catch {
      console.error(`Recorrência inválida (${f.origem} ${f.id}): ${f.regra.regra}`);
      continue;
    }

    for (const unidadeId of alvo) {
      for (const quando of datas) {
        novas.push({
          empresa_id: f.empresa_id,
          unidade_id: unidadeId,
          setor_id: f.setor_id,
          categoria_id: f.categoria_id,
          responsavel_id: f.responsavel_id,
          titulo: f.titulo,
          descricao: f.descricao ?? null,
          origem: f.origem,
          origem_id: f.id,
          ocorrencia_em: quando.toISOString(),
          prazo: new Date(quando.getTime() + f.prazoMinutos * 60_000).toISOString(),
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
