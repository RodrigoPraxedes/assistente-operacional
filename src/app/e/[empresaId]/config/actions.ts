"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { createAdminClient } from "@/lib/supabase/admin";
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

export async function salvarSla(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const sla = Object.fromEntries(
    ["urgente", "alta", "media", "baixa"].map((p) => [p, Math.max(1, Number(form.get(p)) || 1)]),
  );
  const { error } = await supabase.from("empresas").update({ sla_chamados: sla }).eq("id", empresaId);
  if (error) falhar(`/e/${empresaId}/config`, error.message);
  revalidatePath(`/e/${empresaId}/config`);
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

// o que estava no setor (tarefas, colaboradores, check-lists...) fica sem setor
export async function excluirSetor(empresaId: string, setorId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("setores").delete().eq("id", setorId);
  if (error) falhar(`/e/${empresaId}/config`, error.message);
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

// mesmo id: tudo que já estava ligado à categoria continua ligado
export async function editarCategoria(empresaId: string, categoriaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase
    .from("categorias")
    .update({ nome: txt(form, "nome"), cor: txt(form, "cor") || "#64748b" })
    .eq("id", categoriaId);
  if (error)
    falhar(`/e/${empresaId}/config`, error.code === "23505" ? "Já existe uma categoria com esse nome" : error.message);
  revalidatePath(`/e/${empresaId}`);
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
  const dados = {
    nome: txt(form, "nome"),
    tipo: txt(form, "tipo"),
    cor: txt(form, "cor") || "#64748b",
    modulo: opcional(form, "modulo"),
  };
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

// ---------------------------------------------------------------- funções
export async function salvarFuncao(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("funcoes").insert({ empresa_id: empresaId, nome: txt(form, "nome") });
  if (error) falhar(`/e/${empresaId}/config`, error.code === "23505" ? "Já existe uma função com esse nome" : error.message);
  revalidatePath(`/e/${empresaId}`, "layout");
}

export async function alternarFuncao(empresaId: string, funcaoId: string, ativo: boolean) {
  const { supabase } = await getContexto(empresaId);
  await supabase.from("funcoes").update({ ativo }).eq("id", funcaoId);
  revalidatePath(`/e/${empresaId}`, "layout");
}

// colaboradores e rotinas da função ficam sem função
export async function excluirFuncao(empresaId: string, funcaoId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("funcoes").delete().eq("id", funcaoId);
  if (error) falhar(`/e/${empresaId}/config`, error.message);
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
    funcao_id: opcional(form, "funcao_id"),
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

// Cria o login do colaborador (e-mail do cadastro + senha definida aqui), já
// confirmado. O banco confere a permissão config.membros e recusa e-mail que já
// tem conta em uso. A senha nunca vai para log nem para a URL.
export async function criarAcessoMembro(empresaId: string, membroId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const caminho = `/e/${empresaId}/config/membros/${membroId}`;
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) falhar(caminho, "A senha precisa ter pelo menos 8 caracteres.");

  const { data, error } = await supabase.rpc("acesso_membro_preparar", { p_membro: membroId });
  if (error) falhar(caminho, error.message);
  const info = data as { email: string; usuario_id: string | null; nome: string };

  const admin = createAdminClient();
  let usuarioId = info.usuario_id;
  if (usuarioId) {
    const { error: e } = await admin.auth.admin.updateUserById(usuarioId, { password: senha, email_confirm: true });
    if (e) falhar(caminho, "Não foi possível criar o acesso.");
  } else {
    const { data: criado, error: e } = await admin.auth.admin.createUser({
      email: info.email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: info.nome },
    });
    if (e || !criado.user) falhar(caminho, e?.code === "weak_password" ? "Senha fraca demais." : "Não foi possível criar o acesso.");
    usuarioId = criado.user.id;
  }

  const { error: e2 } = await supabase.rpc("acesso_membro_vincular", { p_membro: membroId, p_usuario: usuarioId });
  if (e2) falhar(caminho, e2.message);
  revalidatePath(`/e/${empresaId}/config/membros`);
  redirect(`${caminho}?salvo=acesso`);
}

// Troca a senha de um login que esta empresa criou (o banco diz se pode)
export async function trocarSenhaMembro(empresaId: string, membroId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const caminho = `/e/${empresaId}/config/membros/${membroId}`;
  const senha = String(form.get("senha") ?? "");
  if (senha.length < 8) falhar(caminho, "A senha precisa ter pelo menos 8 caracteres.");

  const { data: usuarioId, error } = await supabase.rpc("acesso_membro_senha_liberada", { p_membro: membroId });
  if (error) falhar(caminho, error.message);
  if (!usuarioId) falhar(caminho, "A senha deste colaborador só pode ser trocada por ele mesmo, em Minha conta.");
  const { error: e } = await createAdminClient().auth.admin.updateUserById(usuarioId as string, { password: senha });
  if (e) falhar(caminho, e.code === "weak_password" ? "Senha fraca demais." : "Não foi possível trocar a senha.");
  redirect(`${caminho}?salvo=senha`);
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
