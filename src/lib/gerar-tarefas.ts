import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ocorrencias } from "@/lib/recorrencia";

const DIAS_A_FRENTE = 2;

interface ModeloComEmpresa {
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
  empresas: { fuso_horario: string } | null;
}

// Gera no Kanban as tarefas dos próximos dias para cada check-list ativo.
// Idempotente: pode rodar várias vezes sem duplicar (índice único no banco).
// Futuramente as Ações recorrentes e os Alertas entram aqui também.
export async function gerarTarefasRecorrentes(filtro?: { modeloId?: string }) {
  const admin = createAdminClient();

  let consulta = admin
    .from("checklist_modelos")
    .select(
      "id, empresa_id, unidade_id, setor_id, categoria_id, responsavel_id, nome, horario_preferencial, tolerancia_minutos, recorrencia, created_at, empresas(fuso_horario)",
    )
    .eq("ativo", true);
  if (filtro?.modeloId) consulta = consulta.eq("id", filtro.modeloId);

  const { data: modelos, error } = await consulta.returns<ModeloComEmpresa[]>();
  if (error) throw error;

  const empresas = [...new Set((modelos ?? []).map((m) => m.empresa_id))];
  if (empresas.length === 0) return { criadas: 0 };

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
  for (const m of modelos ?? []) {
    const fuso = m.empresas?.fuso_horario ?? "America/Sao_Paulo";
    const alvo = m.unidade_id
      ? [m.unidade_id]
      : (unidades ?? []).filter((u) => u.empresa_id === m.empresa_id).map((u) => u.id);
    const statusId = statusInicial.get(m.empresa_id);
    if (!statusId) continue;

    let datas: Date[];
    try {
      datas = ocorrencias(
        { regra: m.recorrencia, horario: m.horario_preferencial, inicio: new Date(m.created_at), fuso },
        DIAS_A_FRENTE,
      );
    } catch {
      console.error(`Recorrência inválida no check-list ${m.id}: ${m.recorrencia}`);
      continue;
    }

    for (const unidadeId of alvo) {
      for (const quando of datas) {
        novas.push({
          empresa_id: m.empresa_id,
          unidade_id: unidadeId,
          setor_id: m.setor_id,
          categoria_id: m.categoria_id,
          responsavel_id: m.responsavel_id,
          titulo: `Check-list: ${m.nome}`,
          origem: "checklist",
          origem_id: m.id,
          ocorrencia_em: quando.toISOString(),
          prazo: new Date(quando.getTime() + m.tolerancia_minutos * 60_000).toISOString(),
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
