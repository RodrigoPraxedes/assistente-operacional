"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

export async function salvarRotina(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = txt(form, "id");
  const base = `/e/${empresaId}/rotinas`;
  const voltar = `${base}/${id ?? "novo"}`;
  const erro = (m: string): never => redirect(`${voltar}?erro=${encodeURIComponent(m)}`);

  const nome = txt(form, "nome");
  const horario = txt(form, "horario");
  const dias = form.getAll("dias").map(Number).filter((n) => n >= 1 && n <= 7);
  if (!nome) erro("Informe o nome da atividade");
  if (!horario || !/^\d{2}:\d{2}/.test(horario)) erro("Informe o horário");
  if (dias.length === 0) erro("Marque pelo menos um dia da semana");

  const dados = {
    nome,
    descricao: txt(form, "descricao"),
    horario,
    dias,
    setor_ids: [...new Set(form.getAll("setor_ids").map(String).filter(Boolean))],
    funcao_id: txt(form, "funcao_id"),
    unidade_id: txt(form, "unidade_id"),
    ativo: form.get("ativo") !== "false",
  };
  const { error } = id
    ? await supabase.from("rotinas").update(dados).eq("id", id)
    : await supabase.from("rotinas").insert({ ...dados, empresa_id: empresaId });
  if (error) erro(error.message);

  revalidatePath(base);
  redirect(base);
}

export async function excluirRotina(empresaId: string, rotinaId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("rotinas").delete().eq("id", rotinaId);
  if (error) redirect(`/e/${empresaId}/rotinas/${rotinaId}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/e/${empresaId}/rotinas`);
  redirect(`/e/${empresaId}/rotinas`);
}
