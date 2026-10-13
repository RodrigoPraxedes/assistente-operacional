"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { localParaUtc } from "@/lib/formato";

export async function moverTarefa(
  empresaId: string,
  tarefaId: string,
  statusId: string,
  prazoLocal?: string,
  comentario?: string,
) {
  const { supabase, empresa } = await getContexto(empresaId);
  const { error } = await supabase.rpc("mover_tarefa", {
    p_tarefa: tarefaId,
    p_status: statusId,
    p_prazo: prazoLocal ? localParaUtc(prazoLocal, empresa.fuso_horario) : null,
    p_comentario: comentario || null,
  });
  if (error) return { erro: error.message };
  revalidatePath(`/e/${empresaId}/tarefas`);
  revalidatePath(`/e/${empresaId}/chamados`);
  return { ok: true };
}

export async function retornarTarefa(empresaId: string, tarefaId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("retornar_tarefa", { p_tarefa: tarefaId });
  if (error) return { erro: error.message };
  revalidatePath(`/e/${empresaId}/tarefas`);
  revalidatePath(`/e/${empresaId}/chamados`);
  return { ok: true };
}

const vazioParaNull = (v: FormDataEntryValue | null) => (v ? String(v) : null);

export async function criarTarefa(empresaId: string, _: { erro?: string } | undefined, form: FormData) {
  const { supabase, empresa, membro } = await getContexto(empresaId);
  const { data: statusInicial } = await supabase.rpc("status_inicial", { p_empresa: empresaId });
  const prazo = vazioParaNull(form.get("prazo"));

  const { data, error } = await supabase
    .from("tarefas")
    .insert({
      empresa_id: empresaId,
      titulo: String(form.get("titulo") ?? "").trim(),
      descricao: vazioParaNull(form.get("descricao")),
      unidade_id: vazioParaNull(form.get("unidade_id")),
      setor_id: vazioParaNull(form.get("setor_id")),
      categoria_id: vazioParaNull(form.get("categoria_id")),
      responsavel_id: vazioParaNull(form.get("responsavel_id")),
      prazo: prazo ? localParaUtc(prazo, empresa.fuso_horario) : null,
      status_id: statusInicial,
      criado_por: membro.id,
      origem: "avulsa",
    })
    .select("id")
    .single();
  if (error) return { erro: error.message };
  redirect(`/e/${empresaId}/tarefas/${data.id}?nova=1`);
}

export async function excluirTarefa(empresaId: string, tarefaId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("tarefas").delete().eq("id", tarefaId);
  if (error) return { erro: error.message };
  redirect(`/e/${empresaId}/tarefas`);
}

export async function comentarTarefa(empresaId: string, tarefaId: string, voltar: string, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) return;
  const { error } = await supabase
    .from("tarefa_comentarios")
    .insert({ tarefa_id: tarefaId, empresa_id: empresaId, membro_id: membro.id, texto });
  if (error) redirect(`${voltar}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(voltar);
}

// Mudar status por formulário (páginas de detalhe)
export async function moverPorFormulario(empresaId: string, tarefaId: string, voltar: string, form: FormData) {
  const r = await moverTarefa(
    empresaId,
    tarefaId,
    String(form.get("status_id")),
    String(form.get("prazo") ?? "") || undefined,
    String(form.get("comentario") ?? "") || undefined,
  );
  if (r.erro) redirect(`${voltar}?erro=${encodeURIComponent(r.erro)}`);
  revalidatePath(voltar);
}
