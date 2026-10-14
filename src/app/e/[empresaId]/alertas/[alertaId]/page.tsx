import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { hojeNoFuso } from "@/lib/formato";
import type { Alerta, AlertaAviso } from "@/lib/types";
import { Aviso, Titulo } from "@/components/ui";
import { FormAlerta } from "./form-alerta";

export default async function EditarAlerta({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; alertaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, alertaId } = await params;
  const { erro } = await searchParams;
  const { supabase, empresa, membro } = await exigirPermissao(empresaId, "alertas.editar");
  const novo = alertaId === "novo";

  const [
    { data: alerta },
    { data: avisos },
    { data: unidades },
    { data: setores },
    { data: categorias },
    { data: membros },
  ] = await Promise.all([
    novo
      ? Promise.resolve({ data: null })
      : supabase.from("alertas").select("*").eq("id", alertaId).eq("empresa_id", empresaId).maybeSingle(),
    novo
      ? Promise.resolve({ data: [] })
      : supabase.from("alerta_avisos").select("*").eq("alerta_id", alertaId).order("dias_antes", { ascending: false }),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase.from("membros").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  if (!novo && !alerta) notFound();

  const h = hojeNoFuso(empresa.fuso_horario);
  const hoje = `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/alertas`, rotulo: "Alertas de datas" }}>{novo ? "Novo alerta" : `Editar: ${alerta!.nome}`}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {!novo && (
        <p className="text-xs text-slate-500">Mudanças valem para as próximas tarefas. As já criadas não mudam.</p>
      )}
      <FormAlerta
        empresaId={empresaId}
        alerta={alerta as Alerta | null}
        avisos={(avisos ?? []) as AlertaAviso[]}
        hoje={hoje}
        unidades={unidades ?? []}
        setores={setores ?? []}
        categorias={categorias ?? []}
        membros={membros ?? []}
        podeMudarPrivado={novo || !alerta!.criado_por || alerta!.criado_por === membro.id}
      />
    </div>
  );
}
