"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdminMaster } from "@/lib/contexto";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// As funções do banco conferem de novo se é Admin Master; aqui só evita chamada à toa
async function cliente() {
  if (!(await ehAdminMaster())) notFound();
  return createClient();
}

function voltar(erro?: string, ok?: string): never {
  revalidatePath("/admin");
  if (erro) redirect(`/admin?erro=${encodeURIComponent(erro)}`);
  redirect(ok ? `/admin?ok=${encodeURIComponent(ok)}` : "/admin");
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

export async function excluirEmpresaPendente(empresaId: string) {
  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_excluir_empresa_pendente", { p_empresa: empresaId });
  voltar(error?.message, "Empresa excluída.");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function senhaInvalida(senha: string) {
  return senha.length < 8 ? "A senha precisa ter pelo menos 8 caracteres." : null;
}

// Login (e-mail + senha) só pela API admin do Supabase, no servidor. A senha
// nunca vai para log nem para a URL. Se o e-mail já tem login, ele é
// confirmado e recebe a senha nova.
async function garantirLogin(email: string, senha: string, nome: string) {
  const supabase = await cliente();
  const { data: existente, error } = await supabase.rpc("admin_usuario_por_email", { p_email: email });
  if (error) return { erro: error.message };
  const admin = createAdminClient();
  if (existente) {
    const { error: e } = await admin.auth.admin.updateUserById(existente as string, { password: senha, email_confirm: true });
    return e ? { erro: "Não foi possível atualizar o login." } : { id: existente as string, novo: false };
  }
  const { data, error: e } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome },
  });
  if (e || !data.user) return { erro: e?.code === "weak_password" ? "Senha fraca demais." : "Não foi possível criar o login." };
  return { id: data.user.id, novo: true };
}

export async function cadastrarUsuario(form: FormData) {
  const nome = txt(form, "nome");
  const email = txt(form, "email").toLowerCase();
  const senha = String(form.get("senha") ?? "");
  const empresa = txt(form, "empresa");
  const novaEmpresa = txt(form, "nova_empresa");
  if (!nome) voltar("Informe o nome.");
  if (!EMAIL.test(email)) voltar("Informe um e-mail válido.");
  const ruim = senhaInvalida(senha);
  if (ruim) voltar(ruim);
  if (!empresa) voltar("Escolha a empresa.");
  if (empresa === "nova" && !novaEmpresa) voltar("Informe o nome da empresa nova.");

  const login = await garantirLogin(email, senha, nome);
  if (login.erro || !login.id) voltar(login.erro ?? "Não foi possível criar o login.");

  const supabase = await cliente();
  const { error } = await supabase.rpc("admin_vincular_usuario", {
    p_usuario: login.id,
    p_empresa: empresa === "nova" ? null : empresa,
    p_nova_empresa: empresa === "nova" ? novaEmpresa : null,
    p_unidade: txt(form, "unidade") || null,
    p_acesso: txt(form, "acesso") === "completo" ? "completo" : "colaborador",
  });
  voltar(
    error?.message,
    login.novo ? `Conta de ${email} criada e vinculada.` : `${email} já tinha login: e-mail confirmado, senha trocada e conta vinculada.`,
  );
}

export async function trocarSenha(form: FormData) {
  const email = txt(form, "email").toLowerCase();
  const senha = String(form.get("senha") ?? "");
  if (!EMAIL.test(email)) voltar("Informe um e-mail válido.");
  const ruim = senhaInvalida(senha);
  if (ruim) voltar(ruim);

  const supabase = await cliente();
  const { data: id, error } = await supabase.rpc("admin_usuario_por_email", { p_email: email });
  if (error) voltar(error.message);
  if (!id) voltar(`Não existe login com o e-mail ${email}.`);
  const { error: e } = await createAdminClient().auth.admin.updateUserById(id as string, { password: senha, email_confirm: true });
  if (e) voltar("Não foi possível trocar a senha.");
  const { error: e2 } = await supabase.rpc("admin_senha_definida", { p_usuario: id });
  voltar(e2?.message, `Senha de ${email} trocada.`);
}
