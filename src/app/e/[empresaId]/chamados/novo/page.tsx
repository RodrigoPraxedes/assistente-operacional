import { exigirPermissao } from "@/lib/contexto";
import { Titulo } from "@/components/ui";
import { rotuloPrestador } from "@/lib/formato";
import { FormChamado } from "./form";

export default async function NovoChamado({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ equipamento?: string }>;
}) {
  const { empresaId } = await params;
  const { equipamento } = await searchParams;
  const { supabase, pode } = await exigirPermissao(empresaId, "chamados.abrir");
  const ativos = (tabela: string) =>
    supabase.from(tabela).select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome");

  const [{ data: empresa }, { data: unidades }, { data: setores }, { data: categorias }, { data: equipamentos }, { data: membros }, { data: fornecedores }] =
    await Promise.all([
      supabase.from("empresas").select("sla_chamados").eq("id", empresaId).single(),
      ativos("unidades"),
      ativos("setores"),
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
      supabase.from("equipamentos").select("id, nome, unidade_id").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      ativos("membros"),
      supabase
        .from("fornecedores")
        .select("id, nome, tipos_servico(nome)")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("nome"),
    ]);

  // vindo do patrimônio: item e unidade dele já escolhidos
  const doItem = (equipamentos ?? []).find((e) => e.id === equipamento);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/chamados`, rotulo: "Manutenções" }}>Abrir chamado</Titulo>
      <FormChamado
        empresaId={empresaId}
        gerencia={pode("chamados.gerenciar")}
        sla={(empresa?.sla_chamados as Record<string, number>) ?? {}}
        unidades={(unidades ?? []) as { id: string; nome: string }[]}
        setores={(setores ?? []) as { id: string; nome: string }[]}
        categorias={categorias ?? []}
        equipamentos={(equipamentos ?? []) as { id: string; nome: string }[]}
        equipamentoInicial={doItem?.id}
        unidadeInicial={doItem?.unidade_id ?? undefined}
        membros={(membros ?? []) as { id: string; nome: string }[]}
        fornecedores={(fornecedores ?? []).map((f) => ({ id: f.id, nome: rotuloPrestador(f) }))}
        podeCadastrarPrestador={pode("prestadores.gerenciar")}
      />
    </div>
  );
}
