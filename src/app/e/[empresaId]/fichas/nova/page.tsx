import { exigirPermissao } from "@/lib/contexto";
import { Aviso, Cartao, Titulo } from "@/components/ui";
import { salvarFicha } from "../actions";
import { FormFicha } from "../form-ficha";

export default async function NovaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "fichas.gerenciar");
  const { data: categorias } = await supabase
    .from("ficha_categorias")
    .select("id, nome")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("nome");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/fichas`, rotulo: "Fichas" }}>Nova ficha</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao className="p-4">
        <FormFicha empresaId={empresaId} acao={salvarFicha.bind(null, empresaId)} categorias={categorias ?? []} />
      </Cartao>
    </div>
  );
}
