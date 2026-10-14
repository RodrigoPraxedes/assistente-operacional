"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { gerarTarefasRecorrentes } from "@/lib/gerar-tarefas";
import { regraValida } from "@/lib/recorrencia";
import { lerPrivado } from "@/lib/privado";

interface AvisoForm {
  dias_antes: number;
  titulo: string;
  responsavel_id: string | null;
}

export async function salvarAlerta(empresaId: string, _: { erro?: string } | undefined, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const id = String(form.get("id") ?? "") || null;
  const txt = (k: string) => String(form.get(k) ?? "").trim() || null;

  const recorrencia = txt("recorrencia");
  if (recorrencia && !regraValida(recorrencia)) return { erro: "Regra de recorrência inválida" };
  const dataEvento = txt("data_evento");
  if (!dataEvento) return { erro: "Informe a data" };

  let avisos: AvisoForm[];
  try {
    avisos = (JSON.parse(String(form.get("avisos") ?? "[]")) as AvisoForm[])
      .map((a) => ({
        dias_antes: Math.round(Number(a.dias_antes)),
        titulo: String(a.titulo ?? "").trim(),
        responsavel_id: a.responsavel_id || null,
      }))
      .filter((a) => a.titulo);
  } catch {
    return { erro: "Avisos inválidos" };
  }
  if (avisos.length === 0)
    return {
      erro: "Inclua pelo menos um aviso (quantos dias antes e o que fazer)",
    };
  if (avisos.some((a) => !Number.isFinite(a.dias_antes) || a.dias_antes < 0 || a.dias_antes > 365))
    return { erro: "Os dias de antecedência vão de 0 a 365" };

  const dados = {
    nome: txt("nome")!,
    descricao: txt("descricao"),
    unidade_id: txt("unidade_id"),
    setor_id: txt("setor_id"),
    categoria_id: txt("categoria_id"),
    responsavel_id: txt("responsavel_id"),
    data_evento: dataEvento,
    recorrencia,
    horario: txt("horario") ?? "09:00",
    ativo: form.get("ativo") !== "false",
    ...(lerPrivado(form) !== undefined && { privado: lerPrivado(form) }),
  };

  let alertaId = id;
  if (id) {
    const { data, error } = await supabase.from("alertas").update(dados).eq("id", id).select("id");
    if (error) return { erro: error.message };
    if (!data?.length) return { erro: "Este alerta é privado: só quem criou pode editar" };
    // avisos são substituídos; as tarefas já criadas continuam no Kanban
    const { error: e } = await supabase.from("alerta_avisos").delete().eq("alerta_id", id);
    if (e) return { erro: e.message };
  } else {
    const { data, error } = await supabase
      .from("alertas")
      .insert({ ...dados, empresa_id: empresaId, criado_por: membro.id })
      .select("id")
      .single();
    if (error) return { erro: error.message };
    alertaId = data.id;
  }

  const { error: e } = await supabase
    .from("alerta_avisos")
    .insert(avisos.map((a) => ({ ...a, empresa_id: empresaId, alerta_id: alertaId })));
  if (e) return { erro: e.message };

  // se algum aviso já venceu ou é para hoje, a tarefa aparece na hora
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await gerarTarefasRecorrentes({ alertaId: alertaId! });
    } catch (err) {
      console.error("Falha ao gerar tarefas do alerta", err);
    }
  }

  revalidatePath(`/e/${empresaId}/alertas`);
  redirect(`/e/${empresaId}/alertas?salvo=1`);
}

export async function excluirAlerta(empresaId: string, alertaId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("alertas").delete().eq("id", alertaId);
  if (error) redirect(`/e/${empresaId}/alertas/${alertaId}?erro=${encodeURIComponent(error.message)}`);
  redirect(`/e/${empresaId}/alertas`);
}
