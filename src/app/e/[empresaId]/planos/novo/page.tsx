import { exigirPermissao } from "@/lib/contexto";
import { Aviso, Titulo } from "@/components/ui";
import { FormPlano } from "../form-plano";
import { carregarOpcoes } from "../opcoes";

export default async function NovoPlano({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "planos.editar");
  const opcoes = await carregarOpcoes(supabase, empresaId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/planos`, rotulo: "Projetos" }}>Novo projeto</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <p className="text-sm text-slate-500">Depois de criar o projeto você inclui as etapas.</p>
      <FormPlano empresaId={empresaId} plano={null} podeMudarPrivado {...opcoes} />
    </div>
  );
}
