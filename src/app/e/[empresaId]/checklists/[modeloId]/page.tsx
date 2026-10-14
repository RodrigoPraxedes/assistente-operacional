import Link from "next/link";
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
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, modeloId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "checklist.editar_modelo");
  const novo = modeloId === "novo";

  const [{ data: modelo }, { data: itens }, { data: unidades }, { data: setores }, { data: categorias }, { data: membros }] =
    await Promise.all([
      novo
        ? Promise.resolve({ data: null })
        : supabase.from("checklist_modelos").select("*").eq("id", modeloId).eq("empresa_id", empresaId).maybeSingle(),
      novo
        ? Promise.resolve({ data: [] })
        : supabase.from("checklist_itens").select("*").eq("modelo_id", modeloId).eq("ativo", true).order("ordem"),
      supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
      supabase.from("membros").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    ]);
  if (!novo && !modelo) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/e/${empresaId}/checklists`} className="text-sm text-slate-500">
        ← Check-lists
      </Link>
      <Titulo
        acoes={
          modelo && (
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
      {modelo && (
        <p className="text-xs text-slate-500">
          Versão {modelo.versao}. Editar os itens não altera os check-lists já preenchidos.
        </p>
      )}
      <FormModelo
        empresaId={empresaId}
        modelo={modelo as ChecklistModelo | null}
        itens={(itens ?? []) as ChecklistItem[]}
        unidades={unidades ?? []}
        setores={setores ?? []}
        categorias={categorias ?? []}
        membros={membros ?? []}
      />
    </div>
  );
}
