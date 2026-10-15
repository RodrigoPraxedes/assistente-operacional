import type { SupabaseClient } from "@supabase/supabase-js";

// Líder de setor só atribui a colaboradores (o banco confere; aqui só esconde as
// opções). Quem já está na lista (manter) continua aparecendo.
export async function membrosAtribuiveis<T extends { id: string }>(
  supabase: SupabaseClient,
  empresaId: string,
  membros: T[],
  manter: string[] = [],
): Promise<T[]> {
  const { data } = await supabase.rpc("ids_atribuiveis", { p_empresa: empresaId });
  if (!Array.isArray(data)) return membros;
  const ok = new Set<string>([...(data as string[]), ...manter]);
  return membros.filter((m) => ok.has(m.id));
}
