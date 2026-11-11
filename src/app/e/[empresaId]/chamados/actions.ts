"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { localParaUtc } from "@/lib/formato";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

type Supabase = Awaited<ReturnType<typeof getContexto>>["supabase"];

async function subirFotos(supabase: Supabase, empresaId: string, form: FormData) {
  const caminhos: string[] = [];
  for (const foto of form.getAll("fotos")) {
    if (!(foto instanceof File) || foto.size === 0) continue;
    const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    const caminho = `${empresaId}/chamados/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("anexos").upload(caminho, foto, { contentType: foto.type });
    if (error) throw new Error(`Não foi possível enviar a foto: ${error.message}`);
    caminhos.push(caminho);
  }
  return caminhos;
}

export async function abrirChamado(empresaId: string, _: { erro?: string } | undefined, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  let fotos: string[];
  try {
    fotos = await subirFotos(supabase, empresaId, form);
  } catch (e) {
    return { erro: (e as Error).message };
  }

  const { data, error } = await supabase.rpc("abrir_chamado", {
    p_empresa: empresaId,
    p_titulo: txt(form, "titulo") ?? "",
    p_descricao: txt(form, "descricao"),
    p_unidade: txt(form, "unidade_id"),
    p_setor: txt(form, "setor_id"),
    p_categoria: null,
    p_prioridade: txt(form, "prioridade") ?? "media",
    p_equipamento: txt(form, "equipamento_id"),
    p_local: null,
    p_responsavel: txt(form, "responsavel_id"),
    p_fornecedor: txt(form, "fornecedor_id"),
    p_fotos: fotos,
  });
  if (error) return { erro: error.message };
  revalidatePath(`/e/${empresaId}/chamados`);
  redirect(`/e/${empresaId}/chamados/${data}?novo=1`);
}

// Dados de gestão: título, descrição, prioridade, equipamento, fornecedor e custo
async function atualizarChamado(empresaId: string, tarefaId: string, form: FormData): Promise<string | null> {
  const { supabase, empresa } = await getContexto(empresaId);
  const custo = txt(form, "custo");

  const { error } = await supabase
    .from("chamados")
    .update({
      prioridade: txt(form, "prioridade") ?? "media",
      equipamento_id: txt(form, "equipamento_id"),
      fornecedor_id: txt(form, "fornecedor_id"),
      local: txt(form, "local"),
      custo: custo ? Number(custo.replace(",", ".")) : null,
    })
    .eq("tarefa_id", tarefaId);
  if (error) return error.message;

  // título, descrição e prazo ficam na tarefa
  const titulo = txt(form, "titulo");
  if (!titulo) return "Informe o título do chamado.";
  const prazo = txt(form, "prazo");
  const { error: e2 } = await supabase
    .from("tarefas")
    .update({
      titulo,
      descricao: txt(form, "descricao"),
      ...(prazo ? { prazo: localParaUtc(prazo, empresa.fuso_horario) } : {}),
    })
    .eq("id", tarefaId);
  return e2 ? e2.message : null;
}

// Recebedor central (ou gestor) passa o chamado adiante; quem entra na lista é avisado
async function delegarChamado(empresaId: string, tarefaId: string, form: FormData): Promise<string | null> {
  const { supabase } = await getContexto(empresaId);
  const ids = form.getAll("responsaveis").map(String).filter(Boolean);
  const { error } = await supabase.rpc("delegar_chamado", { p_tarefa: tarefaId, p_responsaveis: ids });
  return error ? error.message : null;
}

// Um único Salvar: grava a gestão e/ou a delegação, conforme os blocos presentes no formulário
export async function salvarChamado(empresaId: string, tarefaId: string, form: FormData) {
  const caminho = `/e/${empresaId}/chamados/${tarefaId}`;
  let erro: string | null = null;
  if (form.get("_gestao")) erro = await atualizarChamado(empresaId, tarefaId, form);
  if (!erro && form.get("_delegar")) erro = await delegarChamado(empresaId, tarefaId, form);
  const de = form.get("_de") === "tarefas" ? "tarefas" : "chamados";
  if (erro) redirect(`${caminho}?de=${de}&erro=${encodeURIComponent(erro)}`);
  revalidatePath(caminho);
  revalidatePath(`/e/${empresaId}/chamados`);
  revalidatePath(`/e/${empresaId}/tarefas`);
  // salvou: fecha o chamado e volta para o quadro de onde a pessoa veio
  redirect(`/e/${empresaId}/${de}?salvo=chamado`);
}

export async function adicionarFotos(empresaId: string, tarefaId: string, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const caminho = `/e/${empresaId}/chamados/${tarefaId}`;
  try {
    const fotos = await subirFotos(supabase, empresaId, form);
    if (fotos.length) {
      const { error } = await supabase
        .from("chamado_fotos")
        .insert(fotos.map((path) => ({ tarefa_id: tarefaId, empresa_id: empresaId, path, membro_id: membro.id })));
      if (error) throw error;
    }
  } catch (e) {
    redirect(`${caminho}?erro=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath(caminho);
}
