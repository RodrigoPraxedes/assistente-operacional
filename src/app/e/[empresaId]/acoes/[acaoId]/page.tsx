import { membrosAtribuiveis } from "@/lib/atribuicao";
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
  searchParams: Promise<{ erro?: string; copiar?: string }>;
}) {
  const { empresaId, acaoId } = await params;
  const { erro, copiar } = await searchParams;
  const { supabase, empresa, membro } = await exigirPermissao(empresaId, "acoes.editar");
  const novo = acaoId === "novo";
  // modelo para "criar nova a partir desta": busca a ação de origem
  const origemId = novo ? copiar : undefined;

  const [{ data: acao }, { data: unidades }, { data: setores }, { data: categorias }, { data: membros }, { data: equipamentos }] = await Promise.all([
    novo && !origemId
      ? Promise.resolve({ data: null })
      : supabase.from("acoes").select("*").eq("id", origemId ?? acaoId).eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase.from("membros").select("id, nome, setor_id").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("equipamentos").select("id, nome, ativo").eq("empresa_id", empresaId).order("nome"),
  ]);
  if ((!novo || origemId) && !acao) notFound();

  const h = hojeNoFuso(empresa.fuso_horario);
  const hoje = `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/acoes`, rotulo: "Ações recorrentes" }}>{novo ? "Nova ação" : `Editar: ${acao!.nome}`}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {origemId && (
        <p className="text-xs text-slate-500">Nova ação com as configurações de “{acao!.nome}”. Ajuste o nome e o que mudar e salve.</p>
      )}
      {!novo && (
        <p className="text-xs text-slate-500">Mudanças valem para as próximas ocorrências. Nas tarefas já criadas, só os responsáveis acompanham (enquanto estiverem abertas).</p>
      )}
      <FormAcao
        key={`${acaoId}-${origemId ?? ""}`}
        empresaId={empresaId}
        acao={novo ? null : (acao as Acao | null)}
        modelo={origemId ? (acao as Acao) : null}
        hoje={hoje}
        // itens baixados só aparecem se já estiverem ligados a esta ação
        equipamentos={(equipamentos ?? []).filter((e) => e.ativo || e.id === acao?.equipamento_id).map(({ id, nome, ativo }) => ({ id, nome: ativo ? nome : `${nome} (baixado)` }))}
        unidades={unidades ?? []}
        setores={setores ?? []}
        categorias={categorias ?? []}
        membros={await membrosAtribuiveis(supabase, empresaId, membros ?? [], acao?.responsaveis ?? [])}
        podeMudarPrivado={novo || !acao!.criado_por || acao!.criado_por === membro.id}
      />
    </div>
  );
}
