import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { descreverRecorrencia, proximaOcorrencia, proximaPorConclusao } from "@/lib/recorrencia";
import { formatarData, formatarDataHora, hojeNoFuso } from "@/lib/formato";
import type { Acao, Alerta, AlertaAviso } from "@/lib/types";
import { Aviso, Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";
import { FiltrosAcoes } from "./filtros";

export default async function PaginaAcoes({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{
    salvo?: string;
    q?: string;
    setor?: string;
    categoria?: string;
    manutencao?: string;
  }>;
}) {
  const { empresaId } = await params;
  const { salvo, q, setor, categoria, manutencao } = await searchParams;
  // Manutenções › Ações recorrentes: só as de categoria "de manutenção" ou ligadas a um equipamento
  const soManutencao = manutencao === "1";
  const { supabase, empresa, pode } = await getContexto(empresaId);

  const [
    { data: acoes },
    { data: unidades },
    { data: membros },
    { data: setores },
    { data: categorias },
    { data: equipamentos },
    { data: alertas },
    { data: avisos },
  ] = await Promise.all([
    supabase
      .from("acoes")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("nome"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("membros").select("id, nome").eq("empresa_id", empresaId),
    supabase
      .from("setores")
      .select("id, nome")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .order("nome"),
    supabase
      .from("categorias")
      .select("id, nome, manutencao")
      .eq("empresa_id", empresaId)
      .order("nome"),
    supabase.from("equipamentos").select("id, nome").eq("empresa_id", empresaId),
    // ações com avisos antes do vencimento (os antigos Alertas)
    supabase.from("alertas").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase
      .from("alerta_avisos")
      .select("alerta_id, dias_antes")
      .eq("empresa_id", empresaId)
      .order("dias_antes", { ascending: false }),
  ]);

  // ações que contam a partir da conclusão: a próxima depende da última tarefa encerrada
  const porConclusao = ((acoes ?? []) as Acao[]).filter((a) => a.contar_da_conclusao && a.recorrencia).map((a) => a.id);
  const historico = new Map<string, { aberta: boolean; ultima: Date | null }>();
  if (porConclusao.length > 0) {
    const { data: ts } = await supabase
      .from("tarefas")
      .select("origem_id, ocorrencia_em, concluida_em, cancelada_em")
      .eq("origem", "acao")
      .in("origem_id", porConclusao)
      .returns<{ origem_id: string; ocorrencia_em: string; concluida_em: string | null; cancelada_em: string | null }[]>();
    for (const t of ts ?? []) {
      const h = historico.get(t.origem_id) ?? { aberta: false, ultima: null };
      const fim = t.concluida_em ?? t.cancelada_em;
      if (!fim) h.aberta = h.aberta || new Date(t.ocorrencia_em).getTime() <= Date.now();
      else if (!h.ultima || new Date(fim) > h.ultima) h.ultima = new Date(fim);
      historico.set(t.origem_id, h);
    }
  }
  const proximaDa = (a: Acao) => {
    const regra = { regra: a.recorrencia, horario: a.horario, inicio: a.data_inicial, fim: a.data_final, fuso };
    return a.contar_da_conclusao && a.recorrencia
      ? proximaPorConclusao(regra, historico.get(a.id)?.ultima ?? null)
      : proximaOcorrencia(regra);
  };
  const equipamento = new Map((equipamentos ?? []).map((e) => [e.id, e.nome]));
  const unidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const membro = new Map((membros ?? []).map((m) => [m.id, m.nome]));
  const fuso = empresa.fuso_horario;

  // busca (sem acento nem maiúsculas) e filtros de setor e categoria
  const normalizar = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const termo = normalizar((q ?? "").trim());
  const filtrando = !!(termo || setor || categoria);

  const categoriasManutencao = new Set((categorias ?? []).filter((c) => c.manutencao).map((c) => c.id));
  const ehManutencao = (a: Acao) =>
    !!a.equipamento_id || (!!a.categoria_id && categoriasManutencao.has(a.categoria_id));
  const vencManutencao = (al: Alerta) => !!al.categoria_id && categoriasManutencao.has(al.categoria_id);
  // as de manutenção moram em Manutenções › Ações recorrentes; a lista geral mostra as outras
  const categoriasDoFiltro = (categorias ?? []).filter((c) => c.manutencao === soManutencao);
  const naManutencao =
    ((acoes ?? []) as Acao[]).filter(ehManutencao).length + ((alertas ?? []) as Alerta[]).filter(vencManutencao).length;

  const linhas = ((acoes ?? []) as Acao[])
    .filter(
      (a) =>
        ehManutencao(a) === soManutencao &&
        (!termo ||
          normalizar(`${a.nome} ${a.descricao ?? ""} ${equipamento.get(a.equipamento_id ?? "") ?? ""}`).includes(termo)) &&
        (!setor || a.setor_id === setor) &&
        (!categoria || a.categoria_id === categoria),
    )
    .map((a) => ({
      a,
      aguardando: a.ativo && a.contar_da_conclusao && !!historico.get(a.id)?.aberta,
      proxima: a.ativo && !(a.contar_da_conclusao && historico.get(a.id)?.aberta)
        ? proximaDa(a)
        : null,
    }))
    .sort(
      (x, y) =>
        (x.proxima?.getTime() ?? Infinity) - (y.proxima?.getTime() ?? Infinity),
    );

  // ações com vencimento: a próxima data e quantos dias faltam
  const h = hojeNoFuso(fuso);
  const hoje = Date.UTC(h.y, h.m - 1, h.d);
  const diasAntes = new Map<string, number[]>();
  for (const v of (avisos ?? []) as Pick<AlertaAviso, "alerta_id" | "dias_antes">[])
    diasAntes.set(v.alerta_id, [...(diasAntes.get(v.alerta_id) ?? []), v.dias_antes]);
  const vencimentos = ((alertas ?? []) as Alerta[])
    .filter(
      (al) =>
        vencManutencao(al) === soManutencao &&
        (!termo || normalizar(`${al.nome} ${al.descricao ?? ""}`).includes(termo)) &&
        (!setor || al.setor_id === setor) &&
        (!categoria || al.categoria_id === categoria),
    )
    .map((al) => {
      const proxima = al.ativo
        ? proximaOcorrencia({ regra: al.recorrencia, horario: al.horario, inicio: al.data_evento, fuso })
        : null;
      const d = proxima ? hojeNoFuso(fuso, proxima) : null;
      const faltam = d ? Math.round((Date.UTC(d.y, d.m - 1, d.d) - hoje) / 86_400_000) : null;
      return { al, proxima, faltam, dias: diasAntes.get(al.id) ?? [] };
    })
    .sort((x, y) => (x.proxima?.getTime() ?? Infinity) - (y.proxima?.getTime() ?? Infinity));
  const total = linhas.length + vencimentos.length;

  // um grupo por categoria (na ordem alfabética); as sem categoria vão por último
  const grupos = [
    ...categoriasDoFiltro.map((c) => ({
      chave: c.id,
      titulo: c.nome,
      itens: linhas.filter((l) => l.a.categoria_id === c.id),
      venc: vencimentos.filter((v) => v.al.categoria_id === c.id),
    })),
    {
      chave: "sem",
      titulo: "Sem categoria",
      itens: linhas.filter(
        (l) =>
          !l.a.categoria_id ||
          !categoriasDoFiltro.some((c) => c.id === l.a.categoria_id),
      ),
      venc: vencimentos.filter(
        (v) => !v.al.categoria_id || !categoriasDoFiltro.some((c) => c.id === v.al.categoria_id),
      ),
    },
  ].filter((g) => g.itens.length + g.venc.length > 0);
  const podeNova = pode("acoes.editar") || pode("alertas.editar");

  return (
    <div className="space-y-4">
      <Titulo
        voltar={soManutencao ? { href: `/e/${empresaId}/chamados`, rotulo: "Manutenções" } : undefined}
        acoes={
          <>
            <LinkBotao variante="secundario" href={`/e/${empresaId}/acoes/semana`}>
              Ver semana
            </LinkBotao>
            {podeNova && (
              <LinkBotao href={`/e/${empresaId}/${pode("acoes.editar") ? "acoes" : "alertas"}/novo`}>Nova ação</LinkBotao>
            )}
          </>
        }
      >
        {soManutencao ? "Ações recorrentes de manutenção" : "Ações"}
      </Titulo>
      {salvo && <Aviso tipo="sucesso">Ação salva.</Aviso>}
      {soManutencao ? (
        <p className="text-sm text-slate-500">
          As ações das categorias marcadas como De manutenção (em Configurações › Geral) e as
          ligadas a um equipamento do patrimônio. O cadastro é o mesmo de{" "}
          <Link href={`/e/${empresaId}/acoes`} className="text-blue-700">
            Ações
          </Link>
          : é lá que você cria uma ação nova (de manutenção, escolha uma categoria de manutenção ou um equipamento).
        </p>
      ) : (
        <p className="text-sm text-slate-500">
          Tudo o que precisa ser lembrado: ações que repetem e viram tarefa no dia marcado, e
          ações com vencimento, que criam tarefas alguns dias antes da data (marcadas com Vencimento).
          {naManutencao > 0 && (
            <>
              {" "}
              As {naManutencao} de manutenção ficam em{" "}
              <Link href={`/e/${empresaId}/acoes?manutencao=1`} className="text-blue-700">
                Manutenções › Ações recorrentes
              </Link>
              .
            </>
          )}
        </p>
      )}

      <FiltrosAcoes
        q={q ?? ""}
        setor={setor ?? ""}
        categoria={categoria ?? ""}
        setores={setores ?? []}
        categorias={categoriasDoFiltro}
        fixos={soManutencao ? { manutencao: "1" } : undefined}
      />

      {total === 0 && filtrando ? (
        <Vazio>Nenhuma ação encontrada com esses filtros.</Vazio>
      ) : total === 0 && soManutencao ? (
        <Vazio>
          Nenhuma ação de manutenção. Marque uma categoria como De manutenção em
          Configurações › Geral, ou ligue a ação a um equipamento do patrimônio.
        </Vazio>
      ) : total === 0 ? (
        <Vazio>
          Nenhuma ação cadastrada. Ex.: limpeza da caixa d&apos;água a cada 6
          meses, pagar aluguel todo dia 10.
        </Vazio>
      ) : (
        grupos.map((g) => (
          <section key={g.chave} className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-700">
              {g.titulo}{" "}
              <span className="font-normal text-slate-500">
                ({g.itens.length + g.venc.length})
              </span>
            </h2>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-superficie">
              {g.venc.map(({ al, proxima, faltam, dias }) => (
                <li
                  key={al.id}
                  className={`flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${al.ativo ? "" : "opacity-60"}`}
                >
                  <div>
                    {pode("alertas.editar") ? (
                      <Link href={`/e/${empresaId}/alertas/${al.id}`} className="font-medium text-blue-700">
                        {al.nome}
                      </Link>
                    ) : (
                      <span className="font-medium">{al.nome}</span>
                    )}{" "}
                    <Etiqueta cor="#2563eb">Vencimento</Etiqueta>
                    {al.privado && (
                      <>
                        {" "}
                        <Etiqueta>Privada</Etiqueta>
                      </>
                    )}
                    <p className="text-xs text-slate-500">
                      {descreverRecorrencia(al.recorrencia)} ·{" "}
                      {al.unidade_id ? unidade.get(al.unidade_id) : "Empresa toda"}
                      {dias.length > 0 &&
                        ` · avisos ${dias.map((d) => (d === 0 ? "no dia" : `${d}d`)).join(", ")} antes`}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    {!al.ativo ? (
                      <Etiqueta>Inativa</Etiqueta>
                    ) : proxima && faltam !== null ? (
                      <div className="space-y-1">
                        <p className="text-slate-600">Vence {formatarData(proxima.toISOString(), fuso)}</p>
                        <Etiqueta cor={faltam <= 7 ? "#dc2626" : faltam <= 30 ? "#d97706" : "#16a34a"}>
                          {faltam === 0 ? "Hoje" : faltam === 1 ? "Amanhã" : `Faltam ${faltam} dias`}
                        </Etiqueta>
                      </div>
                    ) : (
                      <Etiqueta>Já passou</Etiqueta>
                    )}
                  </div>
                </li>
              ))}
              {g.itens.map(({ a, proxima, aguardando }) => (
                <li
                  key={a.id}
                  className={`flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${a.ativo ? "" : "opacity-60"}`}
                >
                  <div>
                    {pode("acoes.editar") ? (
                      <Link
                        href={`/e/${empresaId}/acoes/${a.id}`}
                        className="font-medium text-blue-700"
                      >
                        {a.nome}
                      </Link>
                    ) : (
                      <span className="font-medium">{a.nome}</span>
                    )}
                    {a.privado && (
                      <>
                        {" "}
                        <Etiqueta>Privada</Etiqueta>
                      </>
                    )}
                    {a.equipamento_id && equipamento.has(a.equipamento_id) && (
                      <p className="text-xs">
                        <Link href={`/e/${empresaId}/patrimonio/${a.equipamento_id}`} className="text-blue-700">
                          {equipamento.get(a.equipamento_id)}
                        </Link>
                      </p>
                    )}
                    <p className="text-xs text-slate-500">
                      {descreverRecorrencia(a.recorrencia)} ·{" "}
                      {a.horario.slice(0, 5)} ·{" "}
                      {a.unidade_id
                        ? unidade.get(a.unidade_id)
                        : "Todas as unidades"}
                      {a.responsaveis.length > 0 &&
                        ` · ${a.responsaveis.map((id) => membro.get(id)).join(", ")}`}
                      {a.data_final &&
                        ` · até ${formatarData(`${a.data_final}T12:00:00Z`, fuso)}`}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    {!a.ativo ? (
                      <Etiqueta>Inativa</Etiqueta>
                    ) : aguardando ? (
                      <span className="text-slate-600">Aguardando conclusão</span>
                    ) : proxima ? (
                      <span className="text-slate-600">
                        Próxima: {formatarDataHora(proxima.toISOString(), fuso)}
                      </span>
                    ) : (
                      <Etiqueta>Encerrada</Etiqueta>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
