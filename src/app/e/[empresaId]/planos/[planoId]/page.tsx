import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { formatarData, formatarDia, hojeNoFuso, utcParaLocalInput } from "@/lib/formato";
import { HORIZONTES, SITUACOES_PLANO, type Plano, type PlanoEtapa, type Tarefa } from "@/lib/types";
import { Aviso, Cartao, Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";
import { moverEtapa } from "../actions";
import { BarraProgresso, contarEtapas } from "../progresso";
import { Cronograma } from "./cronograma";

const ENCERRADO = new Set(["concluido", "cancelado"]);

export default async function DetalhePlano({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; planoId: string }>;
  searchParams: Promise<{ salvo?: string; erro?: string }>;
}) {
  const { empresaId, planoId } = await params;
  const avisos = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const fuso = empresa.fuso_horario;
  const edita = pode("planos.editar");

  const { data: plano } = await supabase
    .from("planos")
    .select("*")
    .eq("id", planoId)
    .eq("empresa_id", empresaId)
    .maybeSingle<Plano>();
  if (!plano) notFound();

  const [{ data: etapas }, { data: tarefas }, { data: deps }, { data: equipe }, { data: status }, { data: membros }, { data: unidade }] =
    await Promise.all([
      supabase.from("plano_etapas").select("*").eq("plano_id", planoId).order("ordem").order("tarefa_id"),
      supabase.from("tarefas").select("*").eq("origem", "plano").eq("origem_id", planoId),
      supabase.from("plano_etapa_dependencias").select("etapa_id, depende_de").eq("empresa_id", empresaId),
      supabase.from("plano_etapa_equipe").select("etapa_id, membro_id").eq("empresa_id", empresaId),
      supabase.from("status").select("id, nome, cor, tipo").eq("empresa_id", empresaId),
      supabase.from("membros").select("id, nome").eq("empresa_id", empresaId),
      plano.unidade_id
        ? supabase.from("unidades").select("nome").eq("id", plano.unidade_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const st = new Map((status ?? []).map((s) => [s.id, s]));
  const nome = new Map((membros ?? []).map((m) => [m.id, m.nome as string]));
  const tarefa = new Map(((tarefas ?? []) as Tarefa[]).map((t) => [t.id, t]));
  const tipoDe = (id: string) => {
    const t = tarefa.get(id);
    return t ? st.get(t.status_id)?.tipo : undefined;
  };

  const linhas = ((etapas ?? []) as PlanoEtapa[])
    .filter((e) => tarefa.has(e.tarefa_id))
    .map((e, i) => {
      const t = tarefa.get(e.tarefa_id)!;
      const dependeDe = (deps ?? []).filter((d) => d.etapa_id === e.tarefa_id).map((d) => d.depende_de);
      const pendentes = dependeDe.filter((d) => !ENCERRADO.has(tipoDe(d) ?? ""));
      return {
        e,
        t,
        numero: i + 1,
        status: st.get(t.status_id),
        dependeDe,
        pendentes,
        equipe: (equipe ?? []).filter((q) => q.etapa_id === e.tarefa_id).map((q) => nome.get(q.membro_id) ?? ""),
      };
    });
  const numeroDe = new Map(linhas.map((l) => [l.e.tarefa_id, l.numero]));
  const conta = contarEtapas(linhas.map((l) => l.status?.tipo));

  const h = hojeNoFuso(fuso);
  const hoje = `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;
  const situacao = SITUACOES_PLANO[plano.situacao];
  const atrasado = plano.fim_previsto && plano.fim_previsto < hoje && !ENCERRADO.has(plano.situacao);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href={`/e/${empresaId}/planos`} className="text-sm text-slate-500">
        ← Planos
      </Link>
      {avisos.salvo && <Aviso tipo="sucesso">Salvo.</Aviso>}
      {avisos.erro && <Aviso>{avisos.erro}</Aviso>}
      <Titulo
        acoes={
          edita && (
            <>
              <LinkBotao variante="secundario" href={`/e/${empresaId}/planos/${planoId}/editar`}>
                Editar plano
              </LinkBotao>
              <LinkBotao href={`/e/${empresaId}/planos/${planoId}/etapas/nova`}>Nova etapa</LinkBotao>
            </>
          )
        }
      >
        {plano.nome}
      </Titulo>

      <Cartao className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Etiqueta cor={situacao.cor}>{situacao.rotulo}</Etiqueta>
          <Etiqueta>
            {HORIZONTES[plano.horizonte].rotulo} ({HORIZONTES[plano.horizonte].dica})
          </Etiqueta>
          {atrasado && <Etiqueta cor="#dc2626">Atrasado</Etiqueta>}
        </div>
        {plano.objetivo && <p className="whitespace-pre-wrap text-sm text-slate-700">{plano.objetivo}</p>}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Coordenador</dt>
            <dd>{plano.responsavel_id ? nome.get(plano.responsavel_id) : "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Início</dt>
            <dd>{formatarDia(plano.inicio) || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Término previsto</dt>
            <dd>{formatarDia(plano.fim_previsto) || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Unidade</dt>
            <dd>{unidade?.nome ?? "Empresa toda"}</dd>
          </div>
        </dl>
        <BarraProgresso conta={conta} />
      </Cartao>

      <Cronograma
        inicioPlano={plano.inicio}
        fimPlano={plano.fim_previsto}
        hoje={hoje}
        etapas={linhas.map((l) => ({
          id: l.e.tarefa_id,
          numero: l.numero,
          titulo: l.t.titulo,
          inicio: l.e.inicio_previsto,
          fim: l.t.prazo ? utcParaLocalInput(l.t.prazo, fuso).slice(0, 10) : null,
          cor: l.status?.cor ?? "#64748b",
        }))}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-900">Etapas</h2>
        {linhas.length === 0 ? (
          <Vazio>
            Nenhuma etapa ainda. Ex.: ideia base → pesquisa de profissionais → orçamentos → compra de material →
            locação de equipamento → início da obra.
          </Vazio>
        ) : (
          <ol className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-superficie">
            {linhas.map((l, i) => {
              const tipo = l.status?.tipo;
              const atrasada = l.t.prazo && !ENCERRADO.has(tipo ?? "") && new Date(l.t.prazo).getTime() < Date.now();
              return (
                <li key={l.e.tarefa_id} className="flex gap-3 p-3 text-sm">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                    {l.numero}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/e/${empresaId}/tarefas/${l.t.id}`} className="font-medium text-blue-700">
                        {l.t.titulo}
                      </Link>
                      {l.status && <Etiqueta cor={l.status.cor}>{l.status.nome}</Etiqueta>}
                      {l.pendentes.length > 0 && !ENCERRADO.has(tipo ?? "") ? (
                        <Etiqueta cor="#d97706">
                          Aguardando etapa {l.pendentes.map((d) => numeroDe.get(d)).join(", ")}
                        </Etiqueta>
                      ) : (
                        l.dependeDe.length > 0 &&
                        tipo === "aberto" && <Etiqueta cor="#16a34a">Pode começar</Etiqueta>
                      )}
                      {atrasada && <Etiqueta cor="#dc2626">Atrasada</Etiqueta>}
                    </div>
                    <p className="text-xs text-slate-500">
                      {[
                        l.t.responsavel_id ? `Responsável: ${nome.get(l.t.responsavel_id)}` : "Sem responsável",
                        l.equipe.length > 0 && `Equipe: ${l.equipe.join(", ")}`,
                        l.e.inicio_previsto && `Início ${formatarDia(l.e.inicio_previsto)}`,
                        l.t.prazo && `Prazo ${formatarData(l.t.prazo, fuso)}`,
                        l.dependeDe.length > 0 &&
                          `Depende da etapa ${l.dependeDe.map((d) => numeroDe.get(d)).join(", ")}`,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  {edita && (
                    <div className="flex shrink-0 items-start gap-1">
                      <form action={moverEtapa.bind(null, empresaId, planoId, l.e.tarefa_id, -1)}>
                        <button
                          disabled={i === 0}
                          aria-label="Subir etapa"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ChevronUp className="h-4 w-4" aria-hidden />
                        </button>
                      </form>
                      <form action={moverEtapa.bind(null, empresaId, planoId, l.e.tarefa_id, 1)}>
                        <button
                          disabled={i === linhas.length - 1}
                          aria-label="Descer etapa"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ChevronDown className="h-4 w-4" aria-hidden />
                        </button>
                      </form>
                      <Link
                        href={`/e/${empresaId}/planos/${planoId}/etapas/${l.e.tarefa_id}`}
                        className="flex h-9 items-center rounded-lg px-2 text-slate-600 hover:bg-slate-100"
                      >
                        Editar
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <p className="text-xs text-slate-500">
          Uma etapa só pode ir para “em andamento” ou ser concluída depois que as etapas de que ela depende forem
          concluídas. O andamento de cada etapa é atualizado no Kanban de tarefas.
        </p>
      </section>
    </div>
  );
}
