import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import type { Plano } from "@/lib/types";
import { Aviso, Cartao, Titulo, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { excluirPlano } from "../../actions";
import { FormPlano } from "../../form-plano";
import { carregarOpcoes } from "../../opcoes";

export default async function EditarPlano({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; planoId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, planoId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "planos.editar");

  const [{ data: plano }, opcoes] = await Promise.all([
    supabase.from("planos").select("*").eq("id", planoId).eq("empresa_id", empresaId).maybeSingle<Plano>(),
    carregarOpcoes(supabase, empresaId),
  ]);
  if (!plano) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/planos/${planoId}`, rotulo: plano.nome }}>Editar plano</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <FormPlano empresaId={empresaId} plano={plano} {...opcoes} />

      <Cartao className="space-y-2">
        <h2 className="font-medium text-slate-900">Excluir plano</h2>
        <p className="text-sm text-slate-500">Apaga o plano e todas as etapas dele, inclusive as tarefas no Kanban.</p>
        <form action={excluirPlano.bind(null, empresaId, planoId)}>
          <BotaoConfirmar
            mensagem={`Excluir o plano "${plano.nome}" e todas as etapas?`}
            className={estilos.botaoPerigo}
          >
            Excluir plano
          </BotaoConfirmar>
        </form>
      </Cartao>
    </div>
  );
}
