import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { hojeNoFuso } from "@/lib/formato";
import type { Acao } from "@/lib/types";
import { Aviso, Titulo } from "@/components/ui";
import { FormAcao } from "./form-acao";

export default async function EditarAcao({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; acaoId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, acaoId } = await params;
  const { erro } = await searchParams;
  const { supabase, empresa, membro } = await exigirPermissao(empresaId, "acoes.editar");
  const novo = acaoId === "novo";

  const [{ data: acao }, { data: unidades }, { data: setores }, { data: categorias }, { data: membros }] = await Promise.all([
    novo
      ? Promise.resolve({ data: null })
      : supabase.from("acoes").select("*").eq("id", acaoId).eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase.from("membros").select("id, nome, setor_id").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  if (!novo && !acao) notFound();

  const h = hojeNoFuso(empresa.fuso_horario);
  const hoje = `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/acoes`, rotulo: "Ações recorrentes" }}>{novo ? "Nova ação" : `Editar: ${acao!.nome}`}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {!novo && (
        <p className="text-xs text-slate-500">Mudanças valem para as próximas ocorrências. Nas tarefas já criadas, só os responsáveis acompanham (enquanto estiverem abertas).</p>
      )}
      <FormAcao
        empresaId={empresaId}
        acao={acao as Acao | null}
        hoje={hoje}
        unidades={unidades ?? []}
        setores={setores ?? []}
        categorias={categorias ?? []}
        membros={membros ?? []}
        podeMudarPrivado={novo || !acao!.criado_por || acao!.criado_por === membro.id}
      />
    </div>
  );
}
