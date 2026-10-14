"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { PREFIXO_GOOGLE, enderecoGoogleValido, eventosDoGoogle } from "@/lib/google-agenda";

function falhar(empresaId: string, mensagem: string): never {
  redirect(`/e/${empresaId}/agenda?erro=${encodeURIComponent(mensagem)}`);
}

// Cria o link ou troca por um novo (o antigo para de funcionar)
export async function gerarLinkAgenda(empresaId: string, membroId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("gerar_link_agenda", { p_membro: membroId });
  if (error) falhar(empresaId, error.message);
  revalidatePath(`/e/${empresaId}/agenda`);
}

export async function revogarLinkAgenda(empresaId: string, membroId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("revogar_link_agenda", { p_membro: membroId });
  if (error) falhar(empresaId, error.message);
  revalidatePath(`/e/${empresaId}/agenda`);
}

// Endereço secreto da agenda pessoal do Google (só a própria pessoa)
export async function salvarAgendaGoogle(empresaId: string, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const url = String(form.get("url") ?? "").trim();
  if (!enderecoGoogleValido(url)) {
    falhar(empresaId, `Cole o "Endereço secreto no formato iCal" (começa com ${PREFIXO_GOOGLE}).`);
  }
  try {
    await eventosDoGoogle(url, new Date(), new Date());
  } catch {
    falhar(empresaId, "Não consegui ler esse endereço. Confira se copiou o endereço secreto inteiro.");
  }
  const { error } = await supabase
    .from("agenda_google")
    .upsert({ membro_id: membro.id, empresa_id: empresaId, url, updated_at: new Date().toISOString() });
  if (error) falhar(empresaId, error.message);
  revalidatePath(`/e/${empresaId}/agenda`);
}

export async function removerAgendaGoogle(empresaId: string) {
  const { supabase, membro } = await getContexto(empresaId);
  const { error } = await supabase.from("agenda_google").delete().eq("membro_id", membro.id);
  if (error) falhar(empresaId, error.message);
  revalidatePath(`/e/${empresaId}/agenda`);
}
