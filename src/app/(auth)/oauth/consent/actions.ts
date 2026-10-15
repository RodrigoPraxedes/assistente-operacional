"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function decidir(form: FormData) {
  const id = String(form.get("authorization_id") ?? "");
  const supabase = await createClient();
  const opcoes = { skipBrowserRedirect: true };
  const { data, error } =
    form.get("decisao") === "permitir"
      ? await supabase.auth.oauth.approveAuthorization(id, opcoes)
      : await supabase.auth.oauth.denyAuthorization(id, opcoes);
  if (error || !data) redirect(`/oauth/consent?authorization_id=${encodeURIComponent(id)}`);
  redirect(data.redirect_url);
}
