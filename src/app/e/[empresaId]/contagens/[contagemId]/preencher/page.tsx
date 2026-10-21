import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { dataDeHoje } from "@/lib/contagens";
import { FormContagem, type ContagemPreencher } from "@/components/contagem/form-contagem";
import { Titulo } from "@/components/ui";

export default async function PreencherContagem({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; contagemId: string }>;
  searchParams: Promise<{ unidade?: string; turno?: string; de?: string }>;
}) {
  const { empresaId, contagemId } = await params;
  const { unidade: unidadeParam, turno, de } = await searchParams;
  const { supabase, membro, empresa } = await getContexto(empresaId);
  const voltar =
    de === "tarefas" ? { href: `/e/${empresaId}/tarefas`, rotulo: "Tarefas" } : { href: `/e/${empresaId}/contagens`, rotulo: "Contagens" };

  const [{ data: contagem }, { data: itens }] = await Promise.all([
    supabase.from("contagens").select("*").eq("id", contagemId).eq("empresa_id", empresaId).eq("ativo", true).maybeSingle(),
    supabase.from("contagem_itens").select("id, nome, unidade_medida, metas").eq("contagem_id", contagemId).eq("ativo", true).order("ordem"),
  ]);
  if (!contagem) notFound();

  const unidadeId = contagem.unidade_id ?? unidadeParam;
  const { data: unidade } = unidadeId
    ? await supabase.from("unidades").select("id, nome").eq("id", unidadeId).eq("empresa_id", empresaId).maybeSingle()
    : { data: null };
  if (!unidade) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Titulo voltar={voltar}>{contagem.nome}</Titulo>
      <p className="-mt-3 text-sm text-slate-500">
        {unidade.nome}
        {contagem.descricao ? ` · ${contagem.descricao}` : ""}
      </p>
      <FormContagem
        canal="app"
        contagem={{ ...(contagem as ContagemPreencher), itens: (itens ?? []) as ContagemPreencher["itens"] }}
        unidadeId={unidade.id}
        executor={membro.nome}
        hoje={dataDeHoje(empresa.fuso_horario)}
        turnoInicial={turno}
        voltar={{ href: voltar.href, rotulo: `Voltar para ${voltar.rotulo}` }}
      />
    </div>
  );
}
