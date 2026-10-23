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

  // foto ilustrativa: nova substitui a antiga; "remover" apaga sem trocar
  let antiga: string | null = null;
  let nova: string | null = null;
  const foto = form.get("foto");
  const remover = form.get("remover_foto") === "on";
  if (id && (remover || (foto instanceof File && foto.size > 0))) {
    const { data } = await supabase.from("rotinas").select("foto_path").eq("id", id).maybeSingle();
    antiga = data?.foto_path ?? null;
  }
  if (foto instanceof File && foto.size > 0) {
    const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    nova = `${empresaId}/rotinas/${crypto.randomUUID()}.${ext}`;
    const { error: erroUp } = await supabase.storage.from("anexos").upload(nova, foto, { contentType: foto.type });
    if (erroUp) erro(`Não foi possível enviar a foto: ${erroUp.message}`);
  }
  const fotoDados = nova ? { foto_path: nova } : remover ? { foto_path: null } : {};
  const { error } = id
    ? await supabase.from("rotinas").update({ ...dados, ...fotoDados }).eq("id", id)
    : await supabase.from("rotinas").insert({ ...dados, ...fotoDados, empresa_id: empresaId });
  if (error) erro(error.message);
  if (antiga) await supabase.storage.from("anexos").remove([antiga]);

  revalidatePath(base);
  redirect(base);
}

export async function excluirRotina(empresaId: string, rotinaId: string) {
  const { supabase } = await getContexto(empresaId);
  const { data: r } = await supabase.from("rotinas").select("foto_path").eq("id", rotinaId).maybeSingle();
  const { error } = await supabase.from("rotinas").delete().eq("id", rotinaId);
  if (error) redirect(`/e/${empresaId}/rotinas/${rotinaId}?erro=${encodeURIComponent(error.message)}`);
  if (r?.foto_path) await supabase.storage.from("anexos").remove([r.foto_path]);
  revalidatePath(`/e/${empresaId}/rotinas`);
  redirect(`/e/${empresaId}/rotinas`);
}
