"use server";

import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";

// Troca a própria senha. Confere a senha atual antes; a senha nunca vai para
// log nem para a URL.
export async function trocarMinhaSenha(empresaId: string, form: FormData) {
  const { supabase, user } = await getContexto(empresaId);
  const caminho = `/e/${empresaId}/conta`;
  const falhar = (m: string): never => redirect(`${caminho}?erro=${encodeURIComponent(m)}`);
  const atual = String(form.get("atual") ?? "");
  const nova = String(form.get("nova") ?? "");
  if (nova.length < 8) falhar("A senha nova precisa ter pelo menos 8 caracteres.");
  if (nova !== String(form.get("confirmar") ?? "")) falhar("A confirmação não é igual à senha nova.");
  if (!user.email) falhar("Sua conta não tem e-mail.");

  const { error: e1 } = await supabase.auth.signInWithPassword({ email: user.email!, password: atual });
  if (e1) falhar("Senha atual incorreta.");
  const { error: e2 } = await supabase.auth.updateUser({ password: nova });
  if (e2) falhar(e2.code === "same_password" ? "A senha nova é igual à atual." : "Não foi possível trocar a senha.");
  await supabase.rpc("minha_senha_trocada");
  redirect(`${caminho}?salvo=1`);
}

// Notificações push: cada aparelho guarda a própria inscrição (RLS limita ao próprio colaborador)
export async function guardarPush(
  empresaId: string,
  s: { endpoint: string; p256dh: string; auth: string; aparelho: string },
): Promise<{ erro?: string }> {
  const { supabase, membro } = await getContexto(empresaId);
  if (!s.endpoint.startsWith("https://") || !s.p256dh || !s.auth) return { erro: "Inscrição inválida." };
  const { error } = await supabase.from("push_inscricoes").upsert(
    { empresa_id: empresaId, membro_id: membro.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, aparelho: s.aparelho },
    { onConflict: "endpoint" },
  );
  return error ? { erro: "Não foi possível guardar este aparelho." } : {};
}

export async function cancelarPush(empresaId: string, endpoint: string) {
  const { supabase, membro } = await getContexto(empresaId);
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint).eq("membro_id", membro.id);
}
