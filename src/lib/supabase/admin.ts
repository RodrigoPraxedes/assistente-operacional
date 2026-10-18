import "server-only";
import { createClient } from "@supabase/supabase-js";

// Cliente com a chave service_role: ignora RLS. Usar SÓ no servidor e só para
// o que não tem usuário logado (central pública via QR Code, feed da agenda e o
// job de recorrência). Exceção: a API admin do Auth para criar logins e trocar
// senhas (Admin Master em src/app/admin/actions.ts; quem cadastra colaboradores
// em config/actions.ts), sempre depois de o banco conferir a permissão.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
