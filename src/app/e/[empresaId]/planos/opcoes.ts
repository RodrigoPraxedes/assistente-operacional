import "server-only";
import type { getContexto } from "@/lib/contexto";

type Supabase = Awaited<ReturnType<typeof getContexto>>["supabase"];

// listas usadas nos formulários de plano e de etapa
export async function carregarOpcoes(supabase: Supabase, empresaId: string) {
  const [{ data: unidades }, { data: setores }, { data: categorias }, { data: membros }] = await Promise.all([
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase.from("membros").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  return {
    unidades: unidades ?? [],
    setores: setores ?? [],
    categorias: categorias ?? [],
    membros: membros ?? [],
  };
}
