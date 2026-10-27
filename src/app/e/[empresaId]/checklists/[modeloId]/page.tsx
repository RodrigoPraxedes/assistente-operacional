import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import type { ChecklistItem, ChecklistModelo } from "@/lib/types";
import { Aviso, Titulo, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { excluirChecklist } from "../actions";
import { FormModelo } from "./form-modelo";

export default async function EditarModelo({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; modeloId: string }>;
  searchParams: Promise<{ erro?: string; copiar?: string }>;
}) {
  const { empresaId, modeloId } = await params;
  const { erro, copiar } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "checklist.editar_modelo");
  const novo = modeloId === "novo";
  // "Salvar e copiar": formulário novo pré-preenchido com o check-list de origem
  const origemId = novo ? copiar : undefined;
  const baseId = origemId ?? modeloId;
  const semBase = novo && !origemId;

  const [{ data: modelo }, { data: itens }, { data: unidades }, { data: setores }, { data: categorias }, { data: membros }, { data: grupos }] =
    await Promise.all([
      semBase
        ? Promise.resolve({ data: null })
        : supabase.from("checklist_modelos").select("*").eq("id", baseId).eq("empresa_id", empresaId).maybeSingle(),
      semBase
        ? Promise.resolve({ data: [] })
        : supabase.from("checklist_itens").select("*").eq("modelo_id", baseId).eq("ativo", true).order("ordem"),
      supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
      supabase.from("membros").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("whatsapp_contatos").select("id, nome").eq("empresa_id", empresaId).eq("tipo", "grupo").eq("ativo", true).order("nome"),
    ]);
  if (!semBase && !modelo) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo
        voltar={{ href: `/e/${empresaId}/checklists`, rotulo: "Check-lists" }}
        acoes={
          modelo && !novo && (
            <form action={excluirChecklist.bind(null, empresaId, modelo.id)}>
              <BotaoConfirmar
                mensagem={`Excluir o check-list "${modelo.nome}"? Os preenchimentos já enviados continuam no histórico; as tarefas em aberto dele somem.`}
                className={estilos.botaoPerigo}
              >
                Excluir
              </BotaoConfirmar>
            </form>
          )
        }
      >
        {novo ? "Novo check-list" : `Editar: ${modelo!.nome}`}
      </Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {origemId && (
        <p className="text-xs text-slate-500">Novo check-list com as configurações e itens de “{modelo!.nome}”. Ajuste o nome e o que mudar e salve.</p>
      )}
      {modelo && !novo && (
        <p className="text-xs text-slate-500">
          Versão {modelo.versao}. Editar os itens não altera os check-lists já preenchidos.
        </p>
      )}
      <FormModelo
        empresaId={empresaId}
        key={`${modeloId}-${origemId ?? ""}`}
        copia={!!origemId}
        modelo={modelo as ChecklistModelo | null}
        itens={(itens ?? []) as ChecklistItem[]}
        unidades={unidades ?? []}
        setores={setores ?? []}
        categorias={categorias ?? []}
        membros={membros ?? []}
        grupos={grupos ?? []}
      />
    </div>
  );
}
