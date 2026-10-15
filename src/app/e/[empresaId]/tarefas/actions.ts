"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { localParaUtc } from "@/lib/formato";
import { lerPrivado } from "@/lib/privado";

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
const lerResponsaveis = (form: FormData) => form.getAll("responsaveis").map(String).filter(Boolean);

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
      responsaveis: lerResponsaveis(form),
      prazo: prazo ? localParaUtc(prazo, empresa.fuso_horario) : null,
      status_id: statusInicial,
      criado_por: membro.id,
      privado: lerPrivado(form) ?? false,
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

// Privada: só quem criou e o responsável veem. Só quem criou pode trocar (o banco confere).
export async function mudarPrivacidadeTarefa(empresaId: string, tarefaId: string, privado: boolean) {
  const { supabase } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/tarefas/${tarefaId}`;
  const { error } = await supabase.from("tarefas").update({ privado }).eq("id", tarefaId);
  if (error) redirect(`${voltar}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(voltar);
  revalidatePath(`/e/${empresaId}/tarefas`);
}

// Troca quem é responsável (uma ou mais pessoas). Quem entrar recebe o aviso no WhatsApp.
export async function mudarResponsaveis(empresaId: string, tarefaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/tarefas/${tarefaId}`;
  const { data, error } = await supabase
    .from("tarefas")
    .update({ responsaveis: lerResponsaveis(form) })
    .eq("id", tarefaId)
    .select("id");
  if (error) redirect(`${voltar}?erro=${encodeURIComponent(error.message)}`);
  if (!data?.length) redirect(`${voltar}?erro=${encodeURIComponent("Sem permissão para mudar esta tarefa")}`);
  revalidatePath(voltar);
  revalidatePath(`/e/${empresaId}/tarefas`);
  redirect(`${voltar}?responsaveis=1`);
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
