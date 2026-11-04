"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;
const enc = encodeURIComponent;

// O PDF já foi enviado do navegador para o bucket `fichas`; aqui só registramos a ficha.
export async function salvarFicha(empresaId: string, form: FormData) {
  const { supabase, membro, pode } = await getContexto(empresaId);
  const id = txt(form, "id");
  const base = `/e/${empresaId}/fichas`;
  const voltar = id ? `${base}/${id}` : `${base}/nova`;
  if (!pode("fichas.gerenciar")) redirect(`${voltar}?erro=${enc("Você não tem permissão para alterar as fichas.")}`);

  const titulo = txt(form, "titulo");
  if (!titulo) redirect(`${voltar}?erro=${enc("Informe o título")}`);
  const path = txt(form, "arquivo_path");
  if (path && (!path.startsWith(`${empresaId}/`) || !path.endsWith(".pdf"))) {
    redirect(`${voltar}?erro=${enc("Arquivo inválido")}`);
  }
  if (!id && !path) redirect(`${voltar}?erro=${enc("Escolha o arquivo PDF")}`);

  let categoria = txt(form, "categoria_id");
  const nova = txt(form, "nova_categoria");
  if (nova) {
    const { data: existente } = await supabase
      .from("ficha_categorias")
      .select("id")
      .eq("empresa_id", empresaId)
      .ilike("nome", nova.replace(/[\\%_]/g, "\\$&"))
      .maybeSingle();
    if (existente) {
      categoria = existente.id as string;
      await supabase.from("ficha_categorias").update({ ativo: true }).eq("id", categoria);
    } else {
      const { data, error } = await supabase
        .from("ficha_categorias")
        .insert({ empresa_id: empresaId, nome: nova })
        .select("id")
        .single();
      if (error) redirect(`${voltar}?erro=${enc(error.message)}`);
      categoria = data!.id as string;
    }
  }

  const dados = {
    titulo,
    descricao: txt(form, "descricao"),
    categoria_id: categoria,
    updated_at: new Date().toISOString(),
    ...(path
      ? {
          arquivo_path: path,
          nome_arquivo: txt(form, "nome_arquivo") ?? "ficha.pdf",
          tamanho_bytes: Number(form.get("tamanho_bytes")) || null,
        }
      : {}),
  };

  if (id) {
    const { data: antiga } = await supabase.from("fichas").select("arquivo_path").eq("id", id).maybeSingle();
    const { error } = await supabase.from("fichas").update(dados).eq("id", id);
    if (error) redirect(`${voltar}?erro=${enc(error.message)}`);
    if (path && antiga?.arquivo_path && antiga.arquivo_path !== path) {
      await supabase.storage.from("fichas").remove([antiga.arquivo_path]);
    }
  } else {
    const { error } = await supabase
      .from("fichas")
      .insert({ ...dados, empresa_id: empresaId, criado_por: membro.id });
    if (error) {
      if (path) await supabase.storage.from("fichas").remove([path]);
      redirect(`${voltar}?erro=${enc(error.message)}`);
    }
  }
  revalidatePath(base);
  redirect(`${base}?salvo=1`);
}

export async function excluirFicha(empresaId: string, fichaId: string) {
  const { supabase, pode } = await getContexto(empresaId);
  const base = `/e/${empresaId}/fichas`;
  if (!pode("fichas.gerenciar")) redirect(`${base}/${fichaId}?erro=${enc("Você não tem permissão para apagar fichas.")}`);
  const { data: f } = await supabase.from("fichas").select("arquivo_path").eq("id", fichaId).maybeSingle();
  const { error } = await supabase.from("fichas").delete().eq("id", fichaId);
  if (error) redirect(`${base}/${fichaId}?erro=${enc(error.message)}`);
  if (f?.arquivo_path) await supabase.storage.from("fichas").remove([f.arquivo_path]);
  revalidatePath(base);
  redirect(`${base}?excluida=1`);
}

export async function salvarCategoria(empresaId: string, form: FormData) {
  const { supabase, pode } = await getContexto(empresaId);
  const base = `/e/${empresaId}/fichas/categorias`;
  if (!pode("fichas.gerenciar")) redirect(`${base}?erro=${enc("Você não tem permissão para alterar as categorias.")}`);
  const id = txt(form, "id");
  const nome = txt(form, "nome");
  if (!nome) redirect(`${base}?erro=${enc("Informe o nome da categoria")}`);
  const { error } = id
    ? await supabase.from("ficha_categorias").update({ nome, ativo: form.get("ativo") !== "false" }).eq("id", id)
    : await supabase.from("ficha_categorias").insert({ empresa_id: empresaId, nome });
  if (error) {
    const msg = error.code === "23505" ? "Já existe uma categoria com esse nome" : error.message;
    redirect(`${base}?erro=${enc(msg)}`);
  }
  revalidatePath(base);
  redirect(base);
}
