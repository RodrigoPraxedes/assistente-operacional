import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Fotos de check-list, chamado e tarefa são apagadas depois de 30 dias para o
// Storage do Supabase (1 GB no plano gratuito) não encher. A foto do cadastro
// do patrimônio fica: é a identificação do item, não um comprovante.
// Apagar a linha de storage.objects por SQL não remove o arquivo, por isso
// a limpeza passa pela API do Storage.
export const RETENCAO_FOTOS_DIAS = 30;
const LOTE = 200;

async function removerArquivos(paths: string[]): Promise<boolean> {
  if (!paths.length) return true;
  const { error } = await createAdminClient().storage.from("anexos").remove(paths);
  return !error;
}

export async function limparFotosAntigas() {
  const admin = createAdminClient();
  const corte = new Date(Date.now() - RETENCAO_FOTOS_DIAS * 86_400_000).toISOString();
  let apagadas = 0;

  for (const tabela of ["chamado_fotos", "tarefa_fotos"] as const) {
    const { data } = await admin.from(tabela).select("id, path").lt("created_at", corte).limit(LOTE);
    if (!data?.length) continue;
    if (!(await removerArquivos(data.map((f) => f.path)))) continue;
    const { error } = await admin.from(tabela).delete().in("id", data.map((f) => f.id));
    if (!error) apagadas += data.length;
  }

  const { data: respostas } = await admin
    .from("checklist_respostas")
    .select("id, foto_path, checklist_execucoes!inner(enviado_em)")
    .not("foto_path", "is", null)
    .lt("checklist_execucoes.enviado_em", corte)
    .limit(LOTE);
  if (respostas?.length && (await removerArquivos(respostas.map((r) => r.foto_path as string)))) {
    const { error } = await admin
      .from("checklist_respostas")
      .update({ foto_path: null })
      .in("id", respostas.map((r) => r.id));
    if (!error) apagadas += respostas.length;
  }
  return { apagadas };
}
