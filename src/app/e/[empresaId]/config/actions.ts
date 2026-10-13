"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { soDigitos } from "@/lib/formato";
import type { Escopo } from "@/lib/types";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const opcional = (f: FormData, k: string) => txt(f, k) || null;

// Em caso de erro volta para a mesma página mostrando a mensagem
function falhar(caminho: string, mensagem: string): never {
  redirect(`${caminho}?erro=${encodeURIComponent(mensagem)}`);
}

// ---------------------------------------------------------------- empresa
export async function salvarEmpresa(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase
    .from("empresas")
    .update({ nome: txt(form, "nome"), fuso_horario: txt(form, "fuso_horario") || "America/Sao_Paulo" })
    .eq("id", empresaId);
  if (error) falhar(`/e/${empresaId}/config`, error.message);
  revalidatePath(`/e/${empresaId}`, "layout");
}

export async function salvarUnidade(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = opcional(form, "id");
  const dados = { nome: txt(form, "nome"), endereco: opcional(form, "endereco"), ativo: form.get("ativo") !== "false" };
  const { error } = id
    ? await supabase.from("unidades").update(dados).eq("id", id)
    : await supabase.from("unidades").insert({ ...dados, empresa_id: empresaId });
  if (error) falhar(`/e/${empresaId}/config`, error.message);
  revalidatePath(`/e/${empresaId}/config`);
}

export async function gerarNovoQr(empresaId: string, unidadeId: string) {
  const { supabase } = await getContexto(empresaId);
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const { error } = await supabase.from("unidades").update({ qr_token: token }).eq("id", unidadeId);
  if (error) falhar(`/e/${empresaId}/config/unidades/${unidadeId}`, error.message);
  revalidatePath(`/e/${empresaId}/config/unidades/${unidadeId}`);
}

// ---------------------------------------------------------------- setores e categorias
export async function salvarSetor(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("setores").insert({ empresa_id: empresaId, nome: txt(form, "nome") });
  if (error) falhar(`/e/${empresaId}/config`, error.code === "23505" ? "Já existe um setor com esse nome" : error.message);
  revalidatePath(`/e/${empresaId}/config`);
}

export async function alternarSetor(empresaId: string, setorId: string, ativo: boolean) {
  const { supabase } = await getContexto(empresaId);
  await supabase.from("setores").update({ ativo }).eq("id", setorId);
  revalidatePath(`/e/${empresaId}/config`);
}

export async function salvarCategoria(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase
    .from("categorias")
    .insert({ empresa_id: empresaId, nome: txt(form, "nome"), cor: txt(form, "cor") || "#64748b" });
  if (error)
    falhar(`/e/${empresaId}/config`, error.code === "23505" ? "Já existe uma categoria com esse nome" : error.message);
  revalidatePath(`/e/${empresaId}/config`);
}

export async function excluirCategoria(empresaId: string, categoriaId: string) {
  const { supabase } = await getContexto(empresaId);
  await supabase.from("categorias").delete().eq("id", categoriaId);
  revalidatePath(`/e/${empresaId}/config`);
}

// ---------------------------------------------------------------- status do Kanban
export async function salvarStatus(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = opcional(form, "id");
  const dados = { nome: txt(form, "nome"), tipo: txt(form, "tipo"), cor: txt(form, "cor") || "#64748b" };
  let error;
  if (id) {
    ({ error } = await supabase.from("status").update(dados).eq("id", id));
  } else {
    const { data: ultimo } = await supabase
      .from("status")
      .select("ordem")
      .eq("empresa_id", empresaId)
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();
    ({ error } = await supabase.from("status").insert({ ...dados, empresa_id: empresaId, ordem: (ultimo?.ordem ?? 0) + 1 }));
  }
  if (error) falhar(`/e/${empresaId}/config`, error.message);
  revalidatePath(`/e/${empresaId}`, "layout");
}

export async function moverStatus(empresaId: string, statusId: string, direcao: -1 | 1) {
  const { supabase } = await getContexto(empresaId);
  const { data: lista } = await supabase.from("status").select("id, ordem").eq("empresa_id", empresaId).order("ordem");
  if (!lista) return;
  const i = lista.findIndex((s) => s.id === statusId);
  const j = i + direcao;
  if (i < 0 || j < 0 || j >= lista.length) return;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await Promise.all(lista.map((s, idx) => supabase.from("status").update({ ordem: idx + 1 }).eq("id", s.id)));
  revalidatePath(`/e/${empresaId}`, "layout");
}

export async function alternarStatus(empresaId: string, statusId: string, ativo: boolean) {
  const { supabase } = await getContexto(empresaId);
  if (!ativo) {
    const { data: s } = await supabase.from("status").select("tipo").eq("id", statusId).single();
    const { count } = await supabase
      .from("status")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .eq("tipo", s?.tipo ?? "")
      .eq("ativo", true);
    if ((count ?? 0) <= 1 && ["aberto", "concluido"].includes(s?.tipo ?? "")) {
      falhar(`/e/${empresaId}/config`, "É preciso ter pelo menos um status ativo do tipo Aberto e um do tipo Concluído");
    }
  }
  await supabase.from("status").update({ ativo }).eq("id", statusId);
  revalidatePath(`/e/${empresaId}`, "layout");
}

// ---------------------------------------------------------------- membros
export async function salvarMembro(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = opcional(form, "id");
  const voltar = id ? `/e/${empresaId}/config/membros/${id}` : `/e/${empresaId}/config/membros`;
  const todas = form.get("todas_unidades") === "on";
  const dados = {
    nome: txt(form, "nome"),
    cargo: opcional(form, "cargo"),
    telefone: soDigitos(txt(form, "telefone")) || null,
    email: opcional(form, "email")?.toLowerCase() ?? null,
    perfil_id: opcional(form, "perfil_id"),
    setor_id: opcional(form, "setor_id"),
    todas_unidades: todas,
    ativo: form.get("ativo") !== "false",
  };

  let membroId = id;
  if (id) {
    const { error } = await supabase.from("membros").update(dados).eq("id", id);
    if (error) falhar(voltar, error.message);
  } else {
    const { data, error } = await supabase
      .from("membros")
      .insert({ ...dados, empresa_id: empresaId })
      .select("id")
      .single();
    if (error) falhar(voltar, error.message);
    membroId = data.id;
  }

  // unidades
  const unidades = form.getAll("unidades").map(String);
  await supabase.from("membro_unidades").delete().eq("membro_id", membroId!);
  if (!todas && unidades.length) {
    const { error } = await supabase
      .from("membro_unidades")
      .insert(unidades.map((u) => ({ membro_id: membroId!, unidade_id: u })));
    if (error) falhar(`/e/${empresaId}/config/membros/${membroId}`, error.message);
  }

  const pin = txt(form, "pin");
  if (pin) {
    const { error } = await supabase.rpc("definir_pin", { p_membro: membroId, p_pin: pin });
    if (error) falhar(`/e/${empresaId}/config/membros/${membroId}`, error.message);
  }

  revalidatePath(`/e/${empresaId}/config/membros`);
  redirect(`/e/${empresaId}/config/membros/${membroId}?salvo=1`);
}

// ---------------------------------------------------------------- perfis
export async function salvarPerfil(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = opcional(form, "id");
  const dados = { nome: txt(form, "nome"), descricao: opcional(form, "descricao") };

  let perfilId = id;
  if (id) {
    const { error } = await supabase.from("perfis").update(dados).eq("id", id);
    if (error) falhar(`/e/${empresaId}/config/perfis/${id}`, error.message);
  } else {
    const { data, error } = await supabase
      .from("perfis")
      .insert({ ...dados, empresa_id: empresaId })
      .select("id")
      .single();
    if (error) falhar(`/e/${empresaId}/config/perfis`, error.message);
    perfilId = data.id;
  }

  const marcadas = form.getAll("permissoes").map(String);
  const linhas = marcadas.map((chave) => ({
    perfil_id: perfilId!,
    permissao: chave,
    escopo: ((form.get(`escopo_${chave}`) as Escopo | null) ?? "empresa") as Escopo,
  }));
  await supabase.from("perfil_permissoes").delete().eq("perfil_id", perfilId!);
  if (linhas.length) {
    const { error } = await supabase.from("perfil_permissoes").insert(linhas);
    if (error) falhar(`/e/${empresaId}/config/perfis/${perfilId}`, error.message);
  }

  revalidatePath(`/e/${empresaId}`, "layout");
  redirect(`/e/${empresaId}/config/perfis/${perfilId}?salvo=1`);
}

export async function excluirPerfil(empresaId: string, perfilId: string) {
  const { supabase } = await getContexto(empresaId);
  const { count } = await supabase
    .from("membros")
    .select("id", { count: "exact", head: true })
    .eq("perfil_id", perfilId);
  if (count) falhar(`/e/${empresaId}/config/perfis/${perfilId}`, "Há colaboradores usando este perfil");
  await supabase.from("perfis").delete().eq("id", perfilId);
  redirect(`/e/${empresaId}/config/perfis`);
}
