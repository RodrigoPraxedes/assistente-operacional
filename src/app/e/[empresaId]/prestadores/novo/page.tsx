import { exigirPermissao } from "@/lib/contexto";
import type { TipoServico } from "@/lib/types";
import { Aviso, Titulo } from "@/components/ui";
import { FormPrestador } from "../form-prestador";

export default async function NovoPrestador({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "prestadores.gerenciar");
  const { data: tipos } = await supabase
    .from("tipos_servico")
    .select("*")
    .eq("empresa_id", empresaId)
    .order("nome")
    .returns<TipoServico[]>();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/prestadores`, rotulo: "Prestadores" }}>Novo prestador</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <FormPrestador empresaId={empresaId} tipos={tipos ?? []} marcados={[]} />
    </div>
  );
}
