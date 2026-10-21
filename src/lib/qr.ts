import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { ModoExecutor } from "@/lib/types";

// Cliente anônimo (sem sessão) para a central pública
function anon() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

export interface CentralQr {
  unidade: { id: string; nome: string };
  empresa: { id: string; nome: string; fuso_horario: string };
  modelos: { id: string; nome: string; descricao: string | null; horario_preferencial: string; modo_executor: ModoExecutor; feito_hoje_em: string | null }[];
  // ausente enquanto a migration 59 não foi aplicada
  contagens?: { id: string; nome: string; descricao: string | null; feito_hoje_em: string | null }[];
  colaboradores: { id: string; nome: string }[];
}

export async function carregarCentral(token: string) {
  const { data } = await anon().rpc("qr_central", { p_token: token });
  return (data as CentralQr | null) ?? null;
}

export async function carregarModeloQr(token: string, modeloId: string) {
  const { data } = await anon().rpc("qr_modelo", { p_token: token, p_modelo: modeloId });
  return data as
    | {
        id: string;
        nome: string;
        descricao: string | null;
        modo_executor: ModoExecutor;
        itens: import("@/components/checklist/form-preencher").ItemPreencher[];
      }
    | null;
}

export async function carregarDadosChamado(token: string) {
  const { data } = await anon().rpc("qr_dados_chamado", { p_token: token });
  return (data as { setores: { id: string; nome: string }[]; equipamentos: { id: string; nome: string }[] } | null) ?? null;
}

export async function carregarContagemQr(token: string, contagemId: string) {
  const { data } = await anon().rpc("qr_contagem", { p_token: token, p_contagem: contagemId });
  return (data as import("@/components/contagem/form-contagem").ContagemPreencher & { descricao: string | null }) ?? null;
}
