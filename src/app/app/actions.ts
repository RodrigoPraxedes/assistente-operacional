"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function criarEmpresa(_: { erro?: string } | undefined, form: FormData) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("criar_empresa", {
    p_nome: String(form.get("nome") ?? ""),
    p_unidade: String(form.get("unidade") ?? ""),
  });
  if (error) return { erro: error.message };
  redirect(`/e/${data}/config`);
}
