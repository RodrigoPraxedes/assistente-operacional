import { exigirPermissao } from "@/lib/contexto";
import { Titulo } from "@/components/ui";
import { FormItem } from "../form-item";

export default async function NovoItem({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { supabase } = await exigirPermissao(empresaId, "patrimonio.gerenciar");
  const [{ data: unidades }, { data: setores }] = await Promise.all([
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/patrimonio`, rotulo: "Patrimônio" }}>Novo item</Titulo>
      <FormItem empresaId={empresaId} unidades={unidades ?? []} setores={setores ?? []} />
    </div>
  );
}
