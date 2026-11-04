import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { Aviso, Botao, Cartao, Titulo } from "@/components/ui";
import { excluirFicha, salvarFicha } from "../actions";
import { FormFicha } from "../form-ficha";

export default async function EditarFicha({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; fichaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, fichaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "fichas.gerenciar");
  const [{ data: ficha }, { data: categorias }] = await Promise.all([
    supabase
      .from("fichas")
      .select("id, titulo, descricao, categoria_id, nome_arquivo")
      .eq("id", fichaId)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase.from("ficha_categorias").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  if (!ficha) notFound();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/fichas`, rotulo: "Fichas" }}>Editar ficha</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao className="p-4">
        <FormFicha empresaId={empresaId} acao={salvarFicha.bind(null, empresaId)} categorias={categorias ?? []} ficha={ficha} />
      </Cartao>
      <form action={excluirFicha.bind(null, empresaId, fichaId)}>
        <Botao type="submit" variante="perigo">
          Apagar ficha
        </Botao>
      </form>
    </div>
  );
}
