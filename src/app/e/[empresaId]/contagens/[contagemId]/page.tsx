import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import type { Contagem, ContagemItem } from "@/lib/types";
import { Aviso, Titulo, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { excluirContagem } from "../actions";
import { FormEditarContagem } from "./form-editar";

export default async function EditarContagem({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; contagemId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, contagemId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "contagens.editar");
  const nova = contagemId === "novo";

  const [{ data: contagem }, { data: itens }, { data: unidades }, { data: setores }, { data: membros }] = await Promise.all([
    nova
      ? Promise.resolve({ data: null })
      : supabase.from("contagens").select("*").eq("id", contagemId).eq("empresa_id", empresaId).maybeSingle(),
    nova
      ? Promise.resolve({ data: [] })
      : supabase.from("contagem_itens").select("*").eq("contagem_id", contagemId).eq("ativo", true).order("ordem"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("membros").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  if (!nova && !contagem) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo
        voltar={{ href: `/e/${empresaId}/contagens`, rotulo: "Contagens" }}
        acoes={
          contagem && (
            <form action={excluirContagem.bind(null, empresaId, contagem.id)}>
              <BotaoConfirmar
                mensagem={`Excluir a contagem "${contagem.nome}" e TODO o histórico dela? Para só parar de usar, mude a situação para Inativa.`}
                className={estilos.botaoPerigo}
              >
                Excluir
              </BotaoConfirmar>
            </form>
          )
        }
      >
        {nova ? "Nova contagem" : `Editar: ${contagem!.nome}`}
      </Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {contagem && (
        <p className="text-xs text-slate-500">Mudar itens e metas vale para as próximas contagens; o histórico não muda.</p>
      )}
      <FormEditarContagem
        empresaId={empresaId}
        contagem={contagem as Contagem | null}
        itens={(itens ?? []) as ContagemItem[]}
        unidades={unidades ?? []}
        setores={setores ?? []}
        membros={membros ?? []}
      />
    </div>
  );
}
