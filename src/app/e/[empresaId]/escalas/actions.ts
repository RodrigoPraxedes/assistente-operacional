"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { dataValida, diasDaSemana, somarDias } from "@/lib/escala";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

interface Celula {
  membro: string;
  data: string;
  valor: string;
}

// Grade semanal: só as células que mudaram
export async function salvarGrade(
  empresaId: string,
  unidadeId: string,
  _: { erro?: string; ok?: boolean } | undefined,
  form: FormData,
) {
  const { supabase } = await getContexto(empresaId);
  let celulas: Celula[];
  try {
    celulas = (JSON.parse(String(form.get("celulas") ?? "[]")) as Celula[]).filter((c) => dataValida(c.data));
  } catch {
    return { erro: "Alterações inválidas" };
  }
  if (celulas.length === 0) return { erro: "Nenhuma alteração para salvar" };

  const { error } = await supabase.rpc("salvar_escala", {
    p_empresa: empresaId,
    p_unidade: unidadeId,
    p_celulas: celulas,
  });
  if (error) return { erro: error.message };
  revalidatePath(`/e/${empresaId}/escalas`);
  return { ok: true };
}

// Copia a semana anterior para a semana aberta, sem mexer no que já foi preenchido
export async function copiarSemanaAnterior(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const unidadeId = txt(form, "unidade")!;
  const segunda = txt(form, "semana")!;
  const membros = String(form.get("membros") ?? "").split(",").filter(Boolean);
  const voltar = (extra: string) =>
    `/e/${empresaId}/escalas?unidade=${unidadeId}&semana=${segunda}${form.get("setor") ? `&setor=${form.get("setor")}` : ""}${extra}`;
  if (!dataValida(segunda) || membros.length === 0) redirect(voltar(""));

  const anterior = somarDias(segunda, -7);
  const [{ data: origem }, { data: destino }] = await Promise.all([
    supabase
      .from("escalas")
      .select("membro_id, data, tipo, turno_id")
      .eq("unidade_id", unidadeId)
      .in("membro_id", membros)
      .gte("data", anterior)
      .lte("data", somarDias(anterior, 6)),
    supabase
      .from("escalas")
      .select("membro_id, data")
      .in("membro_id", membros)
      .gte("data", segunda)
      .lte("data", somarDias(segunda, 6)),
  ]);
  const ocupado = new Set((destino ?? []).map((e) => `${e.membro_id}|${e.data}`));
  const dias = diasDaSemana(segunda);
  const celulas = (origem ?? [])
    .map((e) => {
      const i = Math.round((Date.parse(e.data) - Date.parse(anterior)) / 86_400_000);
      return { membro: e.membro_id, data: dias[i], valor: e.tipo === "turno" ? e.turno_id! : e.tipo };
    })
    .filter((c) => !ocupado.has(`${c.membro}|${c.data}`));

  if (celulas.length === 0) redirect(voltar("&aviso=nada"));
  const { error } = await supabase.rpc("salvar_escala", {
    p_empresa: empresaId,
    p_unidade: unidadeId,
    p_celulas: celulas,
  });
  if (error) redirect(voltar(`&erro=${encodeURIComponent(error.message)}`));
  revalidatePath(`/e/${empresaId}/escalas`);
  redirect(voltar("&aviso=copiada"));
}

// Liga (com a semana aberta como modelo) ou desliga a repetição de um colaborador
export async function repetirEscala(
  empresaId: string,
  unidadeId: string,
  membroId: string,
  semana: string,
  ativo: boolean,
): Promise<{ erro?: string; ok?: boolean }> {
  const { supabase } = await getContexto(empresaId);
  if (!dataValida(semana)) return { erro: "Semana inválida" };
  const { error } = await supabase.rpc("repetir_escala", {
    p_empresa: empresaId,
    p_unidade: unidadeId,
    p_membro: membroId,
    p_semana: semana,
    p_ativo: ativo,
  });
  if (error) return { erro: error.message };
  revalidatePath(`/e/${empresaId}/escalas`);
  return { ok: true };
}

export async function salvarTurno(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = txt(form, "id");
  // turno sem horário: só o período (manhã, tarde, noite), sem início nem fim
  const periodo = txt(form, "periodo");
  const dados = {
    nome: txt(form, "nome") ?? "",
    periodo,
    inicio: periodo ? null : (txt(form, "inicio") ?? "08:00"),
    fim: periodo ? null : (txt(form, "fim") ?? "16:00"),
    cor: txt(form, "cor") ?? "#2563eb",
    unidade_id: txt(form, "unidade_id"),
    ativo: form.get("ativo") !== "false",
  };
  const { error } = id
    ? await supabase.from("turnos").update(dados).eq("id", id)
    : await supabase.from("turnos").insert({ ...dados, empresa_id: empresaId });
  if (error) redirect(`/e/${empresaId}/escalas/turnos?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/e/${empresaId}/escalas`);
  redirect(`/e/${empresaId}/escalas/turnos`);
}

export async function pedirTroca(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("pedir_troca", {
    p_escala: txt(form, "escala_id") ?? "",
    p_substituto: txt(form, "substituto_id") ?? "",
    p_motivo: txt(form, "motivo") ?? "",
  });
  if (error) redirect(`/e/${empresaId}/escalas/trocas?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/e/${empresaId}/escalas`);
  redirect(`/e/${empresaId}/escalas/trocas?aviso=pedido`);
}

export async function responderTroca(empresaId: string, trocaId: string, acao: "aprovar" | "recusar" | "cancelar") {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("responder_troca", { p_troca: trocaId, p_acao: acao });
  if (error) redirect(`/e/${empresaId}/escalas/trocas?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/e/${empresaId}/escalas`);
  redirect(`/e/${empresaId}/escalas/trocas?aviso=${acao}`);
}
