"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoAuth = { erro?: string; mensagem?: string } | undefined;

function destinoSeguro(voltar: FormDataEntryValue | null) {
  const v = typeof voltar === "string" ? voltar : "";
  return v.startsWith("/") && !v.startsWith("//") ? v : "/app";
}

export async function entrar(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("senha") ?? ""),
  });
  if (error) {
    return {
      erro:
        error.message === "Email not confirmed"
          ? "Confirme seu e-mail pelo link que enviamos antes de entrar."
          : "E-mail ou senha incorretos.",
    };
  }
  redirect(destinoSeguro(form.get("voltar")));
}

export async function cadastrar(_: EstadoAuth, form: FormData): Promise<EstadoAuth> {
  const nome = String(form.get("nome") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!nome) return { erro: "Informe seu nome." };
  if (senha.length < 8) return { erro: "A senha precisa ter pelo menos 8 caracteres." };

  const origem = (await headers()).get("origin") ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome }, emailRedirectTo: `${origem}/auth/callback` },
  });
  if (error) return { erro: error.message };
  if (data.session) redirect("/app");
  return { mensagem: "Enviamos um link de confirmação para o seu e-mail. Abra o link para ativar a conta." };
}
