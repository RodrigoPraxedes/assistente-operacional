import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import { Titulo } from "@/components/ui";
import { FormChamado } from "./form";

export default async function NovoChamado({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { supabase, pode } = await exigirPermissao(empresaId, "chamados.abrir");
  const ativos = (tabela: string) =>
    supabase.from(tabela).select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome");

  const [{ data: empresa }, { data: unidades }, { data: setores }, { data: categorias }, { data: equipamentos }, { data: membros }, { data: fornecedores }] =
    await Promise.all([
      supabase.from("empresas").select("sla_chamados").eq("id", empresaId).single(),
      ativos("unidades"),
      ativos("setores"),
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
      ativos("equipamentos"),
      ativos("membros"),
      ativos("fornecedores"),
    ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/e/${empresaId}/chamados`} className="text-sm text-slate-500">
        ← Chamados
      </Link>
      <Titulo>Abrir chamado</Titulo>
      <FormChamado
        empresaId={empresaId}
        gerencia={pode("chamados.gerenciar")}
        sla={(empresa?.sla_chamados as Record<string, number>) ?? {}}
        unidades={(unidades ?? []) as { id: string; nome: string }[]}
        setores={(setores ?? []) as { id: string; nome: string }[]}
        categorias={categorias ?? []}
        equipamentos={(equipamentos ?? []) as { id: string; nome: string }[]}
        membros={(membros ?? []) as { id: string; nome: string }[]}
        fornecedores={(fornecedores ?? []) as { id: string; nome: string }[]}
      />
    </div>
  );
}
