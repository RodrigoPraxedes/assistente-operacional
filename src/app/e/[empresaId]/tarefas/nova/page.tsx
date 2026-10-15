import { exigirPermissao } from "@/lib/contexto";
import { membrosAtribuiveis } from "@/lib/atribuicao";
import { Cartao, Titulo } from "@/components/ui";
import { FormTarefa } from "./form";

export default async function NovaTarefa({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { supabase } = await exigirPermissao(empresaId, "tarefas.criar");
  const [{ data: unidades }, { data: setores }, { data: categorias }, { data: membros }] = await Promise.all([
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase.from("membros").select("id, nome, setor_id").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <Titulo>Nova tarefa</Titulo>
      <Cartao>
        <FormTarefa
          empresaId={empresaId}
          unidades={unidades ?? []}
          setores={setores ?? []}
          categorias={categorias ?? []}
          membros={await membrosAtribuiveis(supabase, empresaId, membros ?? [])}
        />
      </Cartao>
    </div>
  );
}
