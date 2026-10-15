"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { localParaUtc } from "@/lib/formato";
import { lerPrivado } from "@/lib/privado";

const txt = (form: FormData, k: string) => String(form.get(k) ?? "").trim() || null;
const comErro = (caminho: string, erro: string) => `${caminho}?erro=${encodeURIComponent(erro)}`;

export async function salvarPlano(empresaId: string, planoId: string | null, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/planos/${planoId ?? "novo"}${planoId ? "/editar" : ""}`;

  const inicio = txt(form, "inicio");
  const fim = txt(form, "fim_previsto");
  if (inicio && fim && fim < inicio) redirect(comErro(voltar, "A data de término vem antes do início"));

  const dados = {
    nome: txt(form, "nome") ?? "",
    objetivo: txt(form, "objetivo"),
    horizonte: txt(form, "horizonte") ?? "medio",
    inicio,
    fim_previsto: fim,
    responsavel_id: txt(form, "responsavel_id"),
    unidade_id: txt(form, "unidade_id"),
    setor_id: txt(form, "setor_id"),
    categoria_id: txt(form, "categoria_id"),
    ...(planoId ? { situacao: txt(form, "situacao") ?? "planejamento" } : {}),
    ...(lerPrivado(form) !== undefined && { privado: lerPrivado(form) }),
  };
  if (!dados.nome) redirect(comErro(voltar, "Dê um nome para o plano"));

  let id = planoId;
  if (planoId) {
    const { data, error } = await supabase.from("planos").update(dados).eq("id", planoId).select("id");
    if (error) redirect(comErro(voltar, error.message));
    if (!data?.length) redirect(comErro(voltar, "Este plano é privado: só quem criou e o coordenador podem editar"));
  } else {
    const { data, error } = await supabase
      .from("planos")
      .insert({ ...dados, empresa_id: empresaId, criado_por: membro.id })
      .select("id")
      .single();
    if (error) redirect(comErro(voltar, error.message));
    id = data.id;
  }

  revalidatePath(`/e/${empresaId}/planos`);
  redirect(`/e/${empresaId}/planos/${id}?salvo=1`);
}

export async function excluirPlano(empresaId: string, planoId: string) {
  const { supabase } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/planos/${planoId}/editar`;
  const { data, error } = await supabase.from("planos").delete().eq("id", planoId).select("id");
  if (error) redirect(comErro(voltar, error.message));
  if (!data?.length) redirect(comErro(voltar, "Este plano é privado: só quem criou pode excluir"));
  revalidatePath(`/e/${empresaId}/planos`);
  revalidatePath(`/e/${empresaId}/tarefas`);
  redirect(`/e/${empresaId}/planos`);
}

export async function salvarEtapa(empresaId: string, planoId: string, etapaId: string | null, form: FormData) {
  const { supabase, empresa } = await getContexto(empresaId);
  const voltar = `/e/${empresaId}/planos/${planoId}/etapas/${etapaId ?? "nova"}`;
  // prazo é um dia: vale até o fim dele no fuso da empresa
  const prazo = txt(form, "prazo");

  const { error } = await supabase.rpc("salvar_etapa", {
    p_plano: planoId,
    p_etapa: etapaId,
    p_titulo: txt(form, "titulo") ?? "",
    p_descricao: txt(form, "descricao"),
    p_responsavel: txt(form, "responsavel_id"),
    p_inicio: txt(form, "inicio_previsto"),
    p_prazo: prazo ? localParaUtc(`${prazo}T23:59`, empresa.fuso_horario) : null,
    p_depende: form.getAll("depende").map(String),
    p_equipe: form.getAll("equipe").map(String),
  });
  if (error) redirect(comErro(voltar, error.message));

  revalidatePath(`/e/${empresaId}/planos/${planoId}`);
  revalidatePath(`/e/${empresaId}/tarefas`);
  redirect(`/e/${empresaId}/planos/${planoId}?salvo=1`);
}

export async function excluirEtapa(empresaId: string, planoId: string, etapaId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("excluir_etapa", { p_etapa: etapaId });
  if (error) redirect(comErro(`/e/${empresaId}/planos/${planoId}/etapas/${etapaId}`, error.message));
  revalidatePath(`/e/${empresaId}/tarefas`);
  redirect(`/e/${empresaId}/planos/${planoId}`);
}

export async function moverEtapa(empresaId: string, planoId: string, etapaId: string, direcao: number) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("mover_etapa", { p_etapa: etapaId, p_direcao: direcao });
  if (error) redirect(comErro(`/e/${empresaId}/planos/${planoId}`, error.message));
  revalidatePath(`/e/${empresaId}/planos/${planoId}`);
}
