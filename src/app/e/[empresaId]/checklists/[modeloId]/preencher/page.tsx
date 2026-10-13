import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { FormPreencher, type ItemPreencher } from "@/components/checklist/form-preencher";
import { Titulo } from "@/components/ui";

export default async function Preencher({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; modeloId: string }>;
  searchParams: Promise<{ unidade?: string }>;
}) {
  const { empresaId, modeloId } = await params;
  const { unidade: unidadeParam } = await searchParams;
  const { supabase, membro } = await exigirPermissao(empresaId, "checklist.executar");

  const [{ data: modelo }, { data: itens }] = await Promise.all([
    supabase.from("checklist_modelos").select("id, nome, descricao, unidade_id").eq("id", modeloId).eq("ativo", true).maybeSingle(),
    supabase.from("checklist_itens").select("*").eq("modelo_id", modeloId).eq("ativo", true).order("ordem"),
  ]);
  if (!modelo) notFound();

  const unidadeId = modelo.unidade_id ?? unidadeParam;
  const { data: unidade } = unidadeId
    ? await supabase.from("unidades").select("id, nome").eq("id", unidadeId).maybeSingle()
    : { data: null };
  if (!unidade) notFound();

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href={`/e/${empresaId}/checklists`} className="text-sm text-slate-500">
        ← Check-lists
      </Link>
      <Titulo>{modelo.nome}</Titulo>
      <p className="-mt-3 text-sm text-slate-500">
        {unidade.nome}
        {modelo.descricao ? ` · ${modelo.descricao}` : ""}
      </p>
      <FormPreencher
        canal="app"
        empresaId={empresaId}
        modeloId={modelo.id}
        unidadeId={unidade.id}
        executor={membro.nome}
        itens={(itens ?? []) as ItemPreencher[]}
        voltar={{ href: `/e/${empresaId}/checklists`, rotulo: "Voltar aos check-lists" }}
      />
    </div>
  );
}
