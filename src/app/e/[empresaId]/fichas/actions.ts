"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { limparBlocos, type Bloco } from "./blocos";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;
const enc = encodeURIComponent;

// O arquivo (PDF ou foto) já foi enviado do navegador para o bucket `fichas`; aqui só registramos a ficha.
export async function salvarFicha(empresaId: string, form: FormData) {
  const { supabase, membro, pode } = await getContexto(empresaId);
  const id = txt(form, "id");
  const montada = form.get("tipo") === "montada";
  const base = `/e/${empresaId}/fichas`;
  const voltar = id ? `${base}/${id}` : `${base}/nova${montada ? "?tipo=montada&" : "?"}`;
  const falhar = (msg: string): never => redirect(`${voltar}${id ? "?" : ""}erro=${enc(msg)}`);
  if (!pode("fichas.gerenciar")) falhar("Você não tem permissão para alterar as fichas.");

  const titulo = txt(form, "titulo");
  if (!titulo) falhar("Informe o título");
  const path = montada ? null : txt(form, "arquivo_path");
  if (path && (!path.startsWith(`${empresaId}/`) || !path.endsWith(".pdf"))) falhar("Arquivo inválido");
  if (!montada && !id && !path) falhar("Escolha o arquivo PDF");
  const foto = montada ? txt(form, "foto_path") : null;
  if (foto && !foto.startsWith(`${empresaId}/fotos/`)) falhar("Foto inválida");
  const removerFoto = montada && form.get("remover_foto") === "on";

  let blocos: Bloco[] = [];
  if (montada) {
    try {
      blocos = limparBlocos(JSON.parse(String(form.get("blocos") ?? "[]")));
    } catch {
      falhar("Não foi possível ler o conteúdo da ficha");
    }
    if (!blocos.length && !foto && !txt(form, "descricao")) falhar("Preencha ao menos um bloco, a descrição ou a foto");
  }

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
      if (error) falhar(error.message);
      categoria = data!.id as string;
    }
  }

  const dados = {
    titulo,
    descricao: txt(form, "descricao"),
    categoria_id: categoria,
    updated_at: new Date().toISOString(),
    ...(montada ? { tipo: "montada", blocos } : { tipo: "pdf" }),
    ...(path
      ? {
          arquivo_path: path,
          nome_arquivo: txt(form, "nome_arquivo") ?? "ficha.pdf",
          tamanho_bytes: Number(form.get("tamanho_bytes")) || null,
        }
      : {}),
    ...(foto ? { foto_path: foto } : removerFoto ? { foto_path: null } : {}),
  };
  const novos = [path, foto].filter((p): p is string => !!p);

  if (id) {
    const { data: antiga } = await supabase.from("fichas").select("arquivo_path, foto_path").eq("id", id).maybeSingle();
    const { error } = await supabase.from("fichas").update(dados).eq("id", id);
    if (error) {
      if (novos.length) await supabase.storage.from("fichas").remove(novos);
      falhar(error.message);
    }
    const sobras = [
      path && antiga?.arquivo_path !== path ? antiga?.arquivo_path : null,
      (foto || removerFoto) && antiga?.foto_path !== foto ? antiga?.foto_path : null,
    ].filter((p): p is string => !!p);
    if (sobras.length) await supabase.storage.from("fichas").remove(sobras);
  } else {
    const { error } = await supabase
      .from("fichas")
      .insert({ ...dados, empresa_id: empresaId, criado_por: membro.id });
    if (error) {
      if (novos.length) await supabase.storage.from("fichas").remove(novos);
      falhar(error.message);
    }
  }
  revalidatePath(base);
  redirect(`${base}?salvo=1`);
}

export async function excluirFicha(empresaId: string, fichaId: string) {
  const { supabase, pode } = await getContexto(empresaId);
  const base = `/e/${empresaId}/fichas`;
  if (!pode("fichas.gerenciar")) redirect(`${base}/${fichaId}?erro=${enc("Você não tem permissão para apagar fichas.")}`);
  const { data: f } = await supabase.from("fichas").select("arquivo_path, foto_path").eq("id", fichaId).maybeSingle();
  const { error } = await supabase.from("fichas").delete().eq("id", fichaId);
  if (error) redirect(`${base}/${fichaId}?erro=${enc(error.message)}`);
  const arquivos = [f?.arquivo_path, f?.foto_path].filter((p): p is string => !!p);
  if (arquivos.length) await supabase.storage.from("fichas").remove(arquivos);
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
