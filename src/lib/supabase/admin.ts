import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a chave service_role: ignora RLS. Usar SÓ no servidor e só para
// o que não tem usuário logado (central pública via QR Code, feed da agenda e o
// job de recorrência). Exceção: o Admin Master cria logins e troca senhas pela
// API admin do Auth (src/app/admin/actions.ts), sempre depois de conferir que
// quem chama é Admin Master.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
