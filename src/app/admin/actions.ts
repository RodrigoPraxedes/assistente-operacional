"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ehAdminMaster } from "@/lib/contexto";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// As funções do banco conferem de novo se é Admin Master; aqui só evita chamada à toa
async function cliente() {
  if (!(await ehAdminMaster())) notFound();
  return createClient();
}

function voltar(erro?: string): never {
  revalidatePath("/admin");
  redirect(erro ? `/admin?erro=${encodeURIComponent(erro)}` : "/admin");
}

export async function definirSituacao(empresaId: string, situacao: "ativa" | "suspensa", form: FormData) {
  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_definir_situacao", {
    p_empresa: empresaId,
    p_situacao: situacao,
    p_motivo: txt(form, "motivo") || null,
  });
  voltar(error?.message);
}

export async function definirLimite(empresaId: string, form: FormData) {
  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_definir_limite", {
    p_empresa: empresaId,
    p_limite: Number(form.get("limite")) || 0,
  });
  voltar(error?.message);
}

export async function entrarEmpresa(empresaId: string) {
  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_entrar_empresa", { p_empresa: empresaId });
  if (error) voltar(error.message);
  redirect(`/e/${empresaId}/painel`);
}

export async function sairEmpresa(empresaId: string) {
  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_sair_empresa", { p_empresa: empresaId });
  voltar(error?.message);
}

export async function promoverAdmin(form: FormData) {
  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_promover", { p_email: txt(form, "email") });
  voltar(error?.message);
}

export async function removerAdmin(usuarioId: string) {
  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_remover", { p_usuario: usuarioId });
  voltar(error?.message);
}
