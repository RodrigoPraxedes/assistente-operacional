"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { gerarTarefasRecorrentes } from "@/lib/gerar-tarefas";
import { regraValida } from "@/lib/recorrencia";
import { lerPrivado } from "@/lib/privado";

export async function salvarAcao(empresaId: string, _: { erro?: string } | undefined, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const id = String(form.get("id") ?? "") || null;
  const txt = (k: string) => String(form.get(k) ?? "").trim() || null;

  const recorrencia = txt("recorrencia");
  if (recorrencia && !regraValida(recorrencia)) return { erro: "Regra de recorrência inválida" };
  const dataInicial = txt("data_inicial");
  const dataFinal = recorrencia ? txt("data_final") : null;
  if (!dataInicial) return { erro: "Informe a data inicial" };
  if (dataFinal && dataFinal < dataInicial) return { erro: "A data final precisa ser depois da inicial" };

  const dados = {
    nome: txt("nome")!,
    descricao: txt("descricao"),
    unidade_id: txt("unidade_id"),
    setor_id: txt("setor_id"),
    categoria_id: txt("categoria_id"),
    responsaveis: form.getAll("responsaveis").map(String).filter(Boolean),
    data_inicial: dataInicial,
    data_final: dataFinal,
    horario: txt("horario") ?? "09:00",
    prazo_horas: Math.max(0, Number(form.get("prazo_horas") ?? 8) || 0),
    recorrencia,
    ativo: form.get("ativo") !== "false",
    ...(lerPrivado(form) !== undefined && { privado: lerPrivado(form) }),
  };

  let acaoId = id;
  if (id) {
    const { data, error } = await supabase.from("acoes").update(dados).eq("id", id).select("id");
    if (error) return { erro: error.message };
    if (!data?.length) return { erro: "Esta ação é privada: só quem criou pode editar" };
  } else {
    const { data, error } = await supabase
      .from("acoes")
      .insert({ ...dados, empresa_id: empresaId, criado_por: membro.id })
      .select("id")
      .single();
    if (error) return { erro: error.message };
    acaoId = data.id;
  }

  // já cria no Kanban as ocorrências de hoje e dos próximos dias
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await gerarTarefasRecorrentes({ acaoId: acaoId! });
    } catch (e) {
      console.error("Falha ao gerar tarefas da ação", e);
    }
  }

  revalidatePath(`/e/${empresaId}/acoes`);
  redirect(`/e/${empresaId}/acoes?salvo=1`);
}

export async function excluirAcao(empresaId: string, acaoId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("acoes").delete().eq("id", acaoId);
  if (error) redirect(`/e/${empresaId}/acoes/${acaoId}?erro=${encodeURIComponent(error.message)}`);
  redirect(`/e/${empresaId}/acoes`);
}
