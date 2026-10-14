"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";

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
