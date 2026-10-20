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
  quandoLocal?: string,
  solucao?: { descricao: string; custo: number | null },
) {
  const { supabase, empresa } = await getContexto(empresaId);
  const { error } = await supabase.rpc("mover_tarefa", {
    p_tarefa: tarefaId,
    p_status: statusId,
    p_prazo: prazoLocal ? localParaUtc(prazoLocal, empresa.fuso_horario) : null,
    p_comentario: comentario || solucao?.descricao || null,
    p_quando: quandoLocal ? localParaUtc(quandoLocal, empresa.fuso_horario) : null,
  });
  if (error) return { erro: error.message };
  if (solucao && (solucao.descricao || solucao.custo != null)) {
    const { error: e2 } = await supabase.rpc("registrar_solucao_chamado", {
      p_tarefa: tarefaId,
      p_solucao: solucao.descricao,
      p_custo: solucao.custo,
    });
    if (e2) return { erro: e2.message };
  }
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
const lerCientes = (form: FormData) => form.getAll("cientes").map(String).filter(Boolean);

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
      cientes: lerCientes(form),
      todos_concluem: form.get("todos_concluem") === "on",
      prazo: prazo ? localParaUtc(prazo, empresa.fuso_horario) : null,
      status_id: statusInicial,
      criado_por: membro.id,
      privado: lerPrivado(form) ?? false,
      exige_foto: form.get("exige_foto") === "on",
      origem: "avulsa",
    })
    .select("id")
    .single();
  if (error) return { erro: error.message };
  redirect(`/e/${empresaId}/tarefas/${data.id}?nova=1`);
}

// Quem tem a permissão, ou quem criou a tarefa avulsa / manutenção (o banco confere)
export async function excluirTarefa(empresaId: string, tarefaId: string) {
  const { supabase } = await getContexto(empresaId);
  const { data, error } = await supabase.from("tarefas").delete().eq("id", tarefaId).select("origem");
  if (error) return { erro: error.message };
  if (!data?.length) return { erro: "Você não pode excluir esta tarefa" };
  redirect(`/e/${empresaId}/${data[0].origem === "chamado" ? "chamados" : "tarefas"}`);
}

// Tarefa em conjunto: marca (ou desmarca) a parte de quem está logado.
// Quando todos marcam, o banco conclui a tarefa.
export async function marcarMinhaParte(empresaId: string, tarefaId: string, feita: boolean) {
  const { supabase } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/tarefas/${tarefaId}`;
  const { error } = await supabase.rpc("marcar_minha_parte", { p_tarefa: tarefaId, p_feita: feita });
  if (error) redirect(`${voltar}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(voltar);
  revalidatePath(`/e/${empresaId}/tarefas`);
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

// Troca quem só fica ciente e a chave "todos precisam concluir". Quem entrar como ciente recebe o aviso no WhatsApp.
export async function mudarCientes(empresaId: string, tarefaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/tarefas/${tarefaId}`;
  const { data, error } = await supabase
    .from("tarefas")
    .update({ cientes: lerCientes(form), todos_concluem: form.get("todos_concluem") === "on" })
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

// Tarefa que pede foto: envia a foto tirada na hora e conclui (ou, em conjunto, marca a minha parte).
export async function enviarFotoTarefa(empresaId: string, tarefaId: string, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/tarefas/${tarefaId}`;
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) redirect(`${voltar}?erro=${encodeURIComponent("Tire a foto antes de enviar")}`);
  const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
  const caminho = `${empresaId}/tarefas/${crypto.randomUUID()}.${ext}`;
  const { error: erroUp } = await supabase.storage.from("anexos").upload(caminho, foto, { contentType: foto.type });
  if (erroUp) redirect(`${voltar}?erro=${encodeURIComponent(`Não foi possível enviar a foto: ${erroUp.message}`)}`);
  const { error: erroFoto } = await supabase
    .from("tarefa_fotos")
    .insert({ tarefa_id: tarefaId, empresa_id: empresaId, path: caminho, membro_id: membro.id });
  if (erroFoto) redirect(`${voltar}?erro=${encodeURIComponent(erroFoto.message)}`);

  const { data: t } = await supabase.from("tarefas").select("responsaveis, todos_concluem").eq("id", tarefaId).single();
  let erro: string | undefined;
  if ((t?.responsaveis.length ?? 0) > 1 && t?.todos_concluem) {
    erro = (await supabase.rpc("marcar_minha_parte", { p_tarefa: tarefaId, p_feita: true })).error?.message;
  } else {
    const { data: concluido } = await supabase
      .from("status")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("tipo", "concluido")
      .eq("ativo", true)
      .is("modulo", null)
      .order("ordem")
      .limit(1)
      .single();
    if (concluido) erro = (await moverTarefa(empresaId, tarefaId, concluido.id)).erro;
  }
  revalidatePath(voltar);
  revalidatePath(`/e/${empresaId}/tarefas`);
  redirect(erro ? `${voltar}?erro=${encodeURIComponent(erro)}` : `${voltar}?foto=1`);
}
