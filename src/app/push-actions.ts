"use server";

import { createClient } from "@/lib/supabase/server";

interface Inscricao {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export async function salvarInscricaoPush(i: Inscricao) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false };
  const { error } = await supabase
    .from("push_inscricoes")
    .upsert({ usuario_id: data.user.id, ...i }, { onConflict: "endpoint" });
  return { ok: !error };
}

export async function removerInscricaoPush(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_inscricoes").delete().eq("endpoint", endpoint);
}
