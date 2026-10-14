import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { utcParaLocalInput } from "@/lib/formato";
import type { Plano, PlanoEtapa, Tarefa } from "@/lib/types";
import { Aviso, Campo, Cartao, Input, Select, Textarea, Titulo, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { BotaoEnviar } from "@/components/botao-enviar";
import { excluirEtapa, salvarEtapa } from "../../../actions";

export default async function FormEtapa({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; planoId: string; etapaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, planoId, etapaId } = await params;
  const { erro } = await searchParams;
  const { supabase, empresa } = await exigirPermissao(empresaId, "planos.editar");
  const nova = etapaId === "nova";

  const [{ data: plano }, { data: etapas }, { data: tarefas }, { data: membros }, { data: deps }, { data: equipe }] =
    await Promise.all([
      supabase.from("planos").select("*").eq("id", planoId).eq("empresa_id", empresaId).maybeSingle<Plano>(),
      supabase.from("plano_etapas").select("*").eq("plano_id", planoId).order("ordem").order("tarefa_id"),
      supabase.from("tarefas").select("id, titulo, descricao, responsavel_id, prazo").eq("origem", "plano").eq("origem_id", planoId),
      supabase.from("membros").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      nova
        ? Promise.resolve({ data: [] })
        : supabase.from("plano_etapa_dependencias").select("depende_de").eq("etapa_id", etapaId),
      nova
        ? Promise.resolve({ data: [] })
        : supabase.from("plano_etapa_equipe").select("membro_id").eq("etapa_id", etapaId),
    ]);
  if (!plano) notFound();

  const titulos = new Map(
    ((tarefas ?? []) as Pick<Tarefa, "id" | "titulo" | "descricao" | "responsavel_id" | "prazo">[]).map((t) => [t.id, t]),
  );
  const lista = ((etapas ?? []) as PlanoEtapa[]).filter((e) => titulos.has(e.tarefa_id));
  const etapa = nova ? null : lista.find((e) => e.tarefa_id === etapaId);
  if (!nova && !etapa) notFound();
  const tarefa = etapa ? titulos.get(etapa.tarefa_id)! : null;
  const marcadasDep = new Set((deps ?? []).map((d) => d.depende_de as string));
  const marcadosEquipe = new Set((equipe ?? []).map((q) => q.membro_id as string));
  // nova etapa: por padrão depende da última (cascata)
  const ultima = lista.at(-1);
  if (nova && ultima) marcadasDep.add(ultima.tarefa_id);

  const outras = lista.map((e, i) => ({ id: e.tarefa_id, numero: i + 1 })).filter((e) => e.id !== etapaId);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/e/${empresaId}/planos/${planoId}`} className="text-sm text-slate-500">
        ← {plano.nome}
      </Link>
      <Titulo>{nova ? "Nova etapa" : "Editar etapa"}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}

      <form action={salvarEtapa.bind(null, empresaId, planoId, nova ? null : etapaId)} className="space-y-4">
        <Cartao className="space-y-4">
          <Campo rotulo="Etapa">
            <Input name="titulo" defaultValue={tarefa?.titulo} placeholder="Ex.: Orçamento do letreiro" required />
          </Campo>
          <Campo rotulo="O que precisa ser feito">
            <Textarea
              name="descricao"
              rows={3}
              defaultValue={tarefa?.descricao ?? ""}
              placeholder="Ex.: pedir pelo menos 3 orçamentos, com prazo de entrega e garantia"
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Responsável">
              <Select name="responsavel_id" defaultValue={tarefa?.responsavel_id ?? ""}>
                <option value="">—</option>
                {(membros ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Início previsto">
              <Input type="date" name="inicio_previsto" defaultValue={etapa?.inicio_previsto ?? ""} />
            </Campo>
            <Campo rotulo="Prazo">
              <Input
                type="date"
                name="prazo"
                defaultValue={tarefa?.prazo ? utcParaLocalInput(tarefa.prazo, empresa.fuso_horario).slice(0, 10) : ""}
              />
            </Campo>
          </div>
        </Cartao>

        <Cartao className="space-y-3">
          <div>
            <h2 className="font-medium text-slate-900">Depende de</h2>
            <p className="text-xs text-slate-500">
              Esta etapa só começa depois que as marcadas forem concluídas. Ex.: o orçamento da obra depende do
              orçamento do letreiro.
            </p>
          </div>
          {outras.length === 0 ? (
            <p className="text-sm text-slate-500">É a primeira etapa do plano.</p>
          ) : (
            <ul className="space-y-1">
              {outras.map((o) => (
                <li key={o.id}>
                  <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-slate-50 sm:min-h-9">
                    <input type="checkbox" name="depende" value={o.id} defaultChecked={marcadasDep.has(o.id)} />
                    {o.numero}. {titulos.get(o.id)?.titulo}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao className="space-y-3">
          <div>
            <h2 className="font-medium text-slate-900">Equipe da etapa</h2>
            <p className="text-xs text-slate-500">
              Quem mais trabalha nesta etapa (força-tarefa). A equipe vê o plano e pode atualizar a etapa no Kanban.
            </p>
          </div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {(membros ?? []).map((m) => (
              <li key={m.id}>
                <label className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm hover:bg-slate-50 sm:min-h-9">
                  <input type="checkbox" name="equipe" value={m.id} defaultChecked={marcadosEquipe.has(m.id)} />
                  {m.nome}
                </label>
              </li>
            ))}
          </ul>
        </Cartao>

        <BotaoEnviar>{nova ? "Incluir etapa" : "Salvar"}</BotaoEnviar>
      </form>

      {!nova && (
        <form action={excluirEtapa.bind(null, empresaId, planoId, etapaId)}>
          <BotaoConfirmar mensagem="Excluir esta etapa? A tarefa dela sai do Kanban." className={estilos.botaoPerigo}>
            Excluir etapa
          </BotaoConfirmar>
        </form>
      )}
    </div>
  );
}
