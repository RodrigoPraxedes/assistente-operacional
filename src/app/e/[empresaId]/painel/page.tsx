import Link from "next/link";
import type { ReactNode } from "react";
import { getContexto } from "@/lib/contexto";
import { formatarData, formatarDataHora, hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import { hojeIso, horarioTurno, ordenarTurnos, rotuloSemana, segundaDaSemana } from "@/lib/escala";
import { carregarSemana } from "@/lib/semana-acoes";
import { QuadroSemana } from "@/components/quadro-semana";
import { proximaOcorrencia } from "@/lib/recorrencia";
import { AUSENCIAS, PRIORIDADES, type Alerta, type Prioridade, type Status, type Turno } from "@/lib/types";
import { Cartao, Etiqueta, Titulo } from "@/components/ui";
import { provedorDe } from "@/lib/whatsapp-api";
import type { StatusConexao } from "@/lib/whatsapp-api/tipos";

const DIA = 86_400_000;
const PENDENTES = ["aberto", "em_andamento", "adiado"];

type TarefaPainel = {
  id: string;
  titulo: string;
  origem: string;
  origem_id: string | null;
  status_id: string;
  prazo: string | null;
  responsaveis: string[];
  concluida_em: string | null;
};

type ConexaoPainel = { id: string; provedor: string; instancia: string; status: StatusConexao; envio_pausado: boolean; unidades: { nome: string } | null };

// Consulta o provedor na hora (máx. 3 s); se falhar ou demorar, vale o último status gravado.
async function statusWhatsApp(c: ConexaoPainel): Promise<StatusConexao> {
  try {
    const prov = provedorDe(c.provedor);
    if (!prov.configurado()) return c.status;
    const limite = new Promise<never>((_, nao) => setTimeout(() => nao(new Error("tempo")), 3000));
    const estado = await Promise.race([prov.consultarConexao(c.instancia), limite]);
    return estado.status;
  } catch {
    return c.status;
  }
}

// Painel: o que pede atenção hoje. Mostra só o que a pessoa já pode ver
// (a regra de acesso do banco filtra tudo, inclusive tarefas privadas).
export default async function PaginaPainel({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ minhas?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, empresa, membro, pode, escopo } = await getContexto(empresaId);
  const fuso = empresa.fuso_horario;

  // quem só vê as próprias tarefas fica sempre em "Meu painel"
  const soProprias = !pode("tarefas.ver") || escopo("tarefas.ver") === "proprias";
  const minhas = soProprias || !!filtros.minhas;
  const base = `/e/${empresaId}`;
  const sufixoMinhas = minhas && !soProprias ? "&minhas=1" : "";

  const agora = new Date();
  const h = hojeNoFuso(fuso);
  const inicioHoje = horaLocalParaUtc(h.y, h.m, h.d, 0, 0, fuso).toISOString();
  const fimHoje = horaLocalParaUtc(h.y, h.m, h.d, 23, 59, fuso).toISOString();
  const daquiUmaHora = new Date(agora.getTime() + 3_600_000).toISOString();
  const daquiSeteDias = new Date(agora.getTime() + 7 * DIA);
  const trintaDiasAtras = new Date(agora.getTime() - 30 * DIA).toISOString();
  const hoje = hojeIso(fuso);

  const segundaSemana = segundaDaSemana(hoje);
  const semana = await carregarSemana(supabase, empresaId, fuso, segundaSemana, {
    membroId: minhas ? membro.id : undefined,
  });

  const { data: statusDados } = await supabase.from("status").select("*").eq("empresa_id", empresaId);
  const status = (statusDados ?? []) as Status[];
  const tipoStatus = new Map(status.map((s) => [s.id, s.tipo]));
  const nomeStatus = new Map(status.map((s) => [s.id, s]));
  const idsPendentes = status.filter((s) => PENDENTES.includes(s.tipo)).map((s) => s.id);

  const deMim = <T extends { contains: (c: string, v: string[]) => T }>(q: T) =>
    minhas ? q.contains("responsaveis", [membro.id]) : q;
  const camposTarefa = "id, titulo, origem, origem_id, status_id, prazo, responsaveis, concluida_em";

  // status do WhatsApp só para quem gerencia
  const verWhatsApp = pode("whatsapp.gerenciar");
  const conexoesWpp = verWhatsApp
    ? (
        (
          await supabase
            .from("whatsapp_conexoes")
            .select("id, provedor, instancia, status, envio_pausado, unidades(nome)")
            .eq("empresa_id", empresaId)
            .order("created_at")
            .returns<ConexaoPainel[]>()
        ).data ?? []
      )
    : [];
  const statusWpp = await Promise.all(conexoesWpp.map(statusWhatsApp));
  for (const [i, c] of conexoesWpp.entries()) {
    if (statusWpp[i] !== c.status) {
      await supabase.rpc("whatsapp_atualizar_estado", { p_conexao: c.id, p_status: statusWpp[i], p_numero: null, p_erro: null });
    }
  }

  const [
    { data: pendentes },
    { count: concluidasHoje },
    { data: checklistsHoje },
    { data: execucoesComNao },
    { data: chamados },
    { data: alertas },
    { data: etapas },
    { data: escalas },
    { data: ultimos30 },
    { data: membros },
    { data: setores },
    { data: unidades },
  ] = await Promise.all([
    // 1. pendentes que já aparecem no Kanban (sem ocorrências futuras; check-list só 1 h antes)
    deMim(
      supabase
        .from("tarefas")
        .select(camposTarefa)
        .eq("empresa_id", empresaId)
        .in("status_id", idsPendentes)
        .or(`ocorrencia_em.is.null,ocorrencia_em.lte.${fimHoje}`)
        .or(`origem.neq.checklist,ocorrencia_em.lte.${daquiUmaHora}`)
        .limit(2000),
    ).returns<TarefaPainel[]>(),
    deMim(
      supabase
        .from("tarefas")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId)
        .gte("concluida_em", inicioHoje),
    ),
    // 2. check-lists com horário hoje
    deMim(
      supabase
        .from("tarefas")
        .select(camposTarefa)
        .eq("empresa_id", empresaId)
        .eq("origem", "checklist")
        .gte("ocorrencia_em", inicioHoje)
        .lte("ocorrencia_em", fimHoje)
        .limit(500),
    ).returns<TarefaPainel[]>(),
    (() => {
      let q = supabase
        .from("checklist_execucoes")
        .select("id, modelo_nome, executor_nome, enviado_em, qtd_nao, checklist_respostas(item_texto, resposta, ordem)")
        .eq("empresa_id", empresaId)
        .gte("enviado_em", inicioHoje)
        .gt("qtd_nao", 0)
        .eq("checklist_respostas.problema", true)
        .order("enviado_em", { ascending: false })
        .limit(20);
      if (minhas) q = q.eq("executor_id", membro.id);
      return q;
    })(),
    // 3. manutenções em aberto
    (() => {
      let q = supabase
        .from("chamados")
        .select("tarefa_id, numero, prioridade, equipamento_id, created_at, tarefas!inner(titulo, status_id, responsaveis)")
        .eq("empresa_id", empresaId)
        .in("tarefas.status_id", idsPendentes)
        .order("created_at", { ascending: true })
        .limit(500);
      if (minhas) q = q.contains("tarefas.responsaveis", [membro.id]);
      return q.returns<
        {
          tarefa_id: string;
          numero: number;
          prioridade: Prioridade;
          equipamento_id: string | null;
          created_at: string;
          tarefas: { titulo: string; status_id: string };
        }[]
      >();
    })(),
    // 4. próximos 7 dias
    supabase.from("alertas").select("*").eq("empresa_id", empresaId).eq("ativo", true),
    deMim(
      supabase
        .from("tarefas")
        .select(camposTarefa)
        .eq("empresa_id", empresaId)
        .eq("origem", "plano")
        .in("status_id", idsPendentes)
        .lte("prazo", daquiSeteDias.toISOString())
        .order("prazo")
        .limit(50),
    ).returns<TarefaPainel[]>(),
    // 5. escala de hoje
    supabase
      .from("escalas")
      .select("membro_id, tipo, unidade_id, turnos(id, nome, inicio, fim, periodo, cor)")
      .eq("empresa_id", empresaId)
      .eq("data", hoje)
      .returns<
        {
          membro_id: string;
          tipo: "turno" | "folga" | "ferias" | "falta";
          unidade_id: string;
          turnos: Pick<Turno, "id" | "nome" | "inicio" | "fim" | "periodo" | "cor"> | null;
        }[]
      >(),
    // 6. prazos dos últimos 30 dias
    deMim(
      supabase
        .from("tarefas")
        .select(camposTarefa)
        .eq("empresa_id", empresaId)
        .gte("prazo", trintaDiasAtras)
        .lte("prazo", agora.toISOString())
        .limit(5000),
    ).returns<TarefaPainel[]>(),
    supabase.from("membros").select("id, nome, setor_id").eq("empresa_id", empresaId),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true),
  ]);

  const nomeMembro = new Map((membros ?? []).map((m) => [m.id, m.nome]));
  const setorDoMembro = new Map((membros ?? []).map((m) => [m.id, m.setor_id as string | null]));
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id, s.nome]));
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const agoraMs = agora.getTime();

  // 1. hoje em números
  const lista = pendentes ?? [];
  const atrasadas = lista.filter((t) => t.prazo && new Date(t.prazo).getTime() < agoraMs).length;
  const fimHojeMs = new Date(fimHoje).getTime();
  const vencemHoje = lista.filter((t) => {
    const p = t.prazo ? new Date(t.prazo).getTime() : NaN;
    return p >= agoraMs && p <= fimHojeMs;
  }).length;
  const emAndamento = lista.filter((t) => tipoStatus.get(t.status_id) === "em_andamento").length;

  // 2. check-lists do dia
  const cls = checklistsHoje ?? [];
  const clFeitos = cls.filter((t) => tipoStatus.get(t.status_id) === "concluido").length;
  const clNaoRealizados = cls.filter((t) => tipoStatus.get(t.status_id) === "cancelado").length;
  const clPendentes = cls.length - clFeitos - clNaoRealizados;

  // 3. manutenções
  const abertas = chamados ?? [];
  const porStatus = new Map<string, number>();
  abertas.forEach((c) => porStatus.set(c.tarefas.status_id, (porStatus.get(c.tarefas.status_id) ?? 0) + 1));
  const porPrioridade = (Object.keys(PRIORIDADES) as Prioridade[])
    .map((p) => ({ p, n: abertas.filter((c) => c.prioridade === p).length }))
    .filter((x) => x.n > 0);
  // nome do equipamento só dos 5 que aparecem na lista (uma consulta, sem N+1)
  const idsEquip = [...new Set(abertas.slice(0, 5).map((c) => c.equipamento_id).filter((x): x is string => !!x))];
  const { data: equipsPainel } = idsEquip.length
    ? await supabase.from("equipamentos").select("id, nome").in("id", idsEquip)
    : { data: [] as { id: string; nome: string }[] };
  const nomeEquip = new Map((equipsPainel ?? []).map((e) => [e.id, e.nome]));
  const diasAberto = (iso: string) => Math.floor((agoraMs - new Date(iso).getTime()) / DIA);

  // 4. próximos 7 dias: alertas (data do evento) e etapas de projetos
  const hojeUtc = Date.UTC(h.y, h.m - 1, h.d);
  const proximosAlertas = ((alertas ?? []) as Alerta[])
    .map((a) => {
      const proxima = proximaOcorrencia({ regra: a.recorrencia, horario: a.horario, inicio: a.data_evento, fuso });
      if (!proxima || proxima > daquiSeteDias) return null;
      const d = hojeNoFuso(fuso, proxima);
      return { a, proxima, faltam: Math.round((Date.UTC(d.y, d.m - 1, d.d) - hojeUtc) / DIA) };
    })
    .filter((x) => x !== null)
    .sort((x, y) => x.proxima.getTime() - y.proxima.getTime());

  // 5. escala de hoje, agrupada por turno
  const doDia = escalas ?? [];
  const turnosHoje = ordenarTurnos(
    [...new Map(doDia.filter((e) => e.tipo === "turno" && e.turnos).map((e) => [e.turnos!.id, e.turnos!])).values()],
  ).map((t) => ({
    turno: t,
    pessoas: doDia
      .filter((e) => e.turnos?.id === t.id)
      .map((e) => ({ nome: nomeMembro.get(e.membro_id) ?? "—", unidade: nomeUnidade.get(e.unidade_id) }))
      .sort((a, b) => a.nome.localeCompare(b.nome)),
  }));
  const ausentes = doDia.filter((e) => e.tipo !== "turno");
  const variasUnidades = (unidades?.length ?? 0) > 1;

  // 6. no prazo nos últimos 30 dias (canceladas não contam)
  const comPrazo = (ultimos30 ?? []).filter((t) => tipoStatus.get(t.status_id) !== "cancelado");
  const noPrazo = (t: TarefaPainel) =>
    !!t.concluida_em && !!t.prazo && new Date(t.concluida_em).getTime() <= new Date(t.prazo).getTime();
  const somar = (mapa: Map<string, { total: number; ok: number }>, chave: string, ok: boolean) => {
    const v = mapa.get(chave) ?? { total: 0, ok: 0 };
    v.total++;
    if (ok) v.ok++;
    mapa.set(chave, v);
  };
  const porPessoa = new Map<string, { total: number; ok: number }>();
  const porSetor = new Map<string, { total: number; ok: number }>();
  comPrazo.forEach((t) => {
    const ok = noPrazo(t);
    const setoresDaTarefa = new Set<string>();
    t.responsaveis.forEach((r) => {
      somar(porPessoa, r, ok);
      setoresDaTarefa.add(setorDoMembro.get(r) ?? "");
    });
    setoresDaTarefa.forEach((s) => somar(porSetor, s, ok));
  });
  const totalOk = comPrazo.filter(noPrazo).length;
  const ranking = (mapa: Map<string, { total: number; ok: number }>, nome: (k: string) => string) =>
    [...mapa.entries()]
      .map(([k, v]) => ({ nome: nome(k), ...v }))
      .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome))
      .slice(0, 8);

  return (
    <div className="space-y-6">
      <Titulo
        acoes={
          !soProprias && (
            <div className="inline-flex rounded-lg border border-slate-200 bg-superficie p-0.5 text-sm">
              <Link
                href={`${base}/painel`}
                className={`rounded-md px-3 py-1.5 ${!minhas ? "bg-blue-600 font-medium text-white" : "text-slate-600"}`}
                aria-current={!minhas ? "page" : undefined}
              >
                Geral
              </Link>
              <Link
                href={`${base}/painel?minhas=1`}
                className={`rounded-md px-3 py-1.5 ${minhas ? "bg-blue-600 font-medium text-white" : "text-slate-600"}`}
                aria-current={minhas ? "page" : undefined}
              >
                Meu painel
              </Link>
            </div>
          )
        }
      >
        {minhas ? "Meu painel" : "Painel"}
      </Titulo>

      {conexoesWpp.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {conexoesWpp.map((c, i) => {
            const ok = statusWpp[i] === "conectado";
            return (
              <Link
                key={c.id}
                href={`${base}/whatsapp/conexao`}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
                  ok ? "border-green-200 text-green-700" : "border-red-200 bg-red-50 font-medium text-red-700"
                }`}
              >
                <span className={`size-2 rounded-full ${ok ? "bg-green-600" : "bg-red-600"}`} aria-hidden />
                WhatsApp{c.unidades ? ` ${c.unidades.nome}` : ""}: {ok ? "conectado" : "desconectado"}
                {c.envio_pausado && " (envios pausados)"}
                {!ok && <span className="underline">Reconectar</span>}
              </Link>
            );
          })}
        </div>
      )}

      {/* semana das ações recorrentes */}
      <Bloco
        titulo={`Semana das ações, ${rotuloSemana(segundaSemana)}`}
        link={{ href: `${base}/acoes/semana`, rotulo: "Imprimir ou exportar" }}
      >
        <QuadroSemana
          dias={semana.dias}
          porDia={semana.porDia}
          hoje={hoje}
          empresaId={empresaId}
          podeAbrir={pode("acoes.editar")}
        />
      </Bloco>

      {/* 1. hoje em números */}
      <section aria-labelledby="hoje" className="space-y-2">
        <h2 id="hoje" className="text-sm font-medium text-slate-500">
          Hoje, {formatarData(agora.toISOString(), fuso)}
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Numero href={`${base}/tarefas?recorte=atrasadas${sufixoMinhas}`} valor={atrasadas} rotulo="Atrasadas" cor={atrasadas ? "red" : undefined} />
          <Numero href={`${base}/tarefas?recorte=hoje${sufixoMinhas}`} valor={vencemHoje} rotulo="Vencem hoje" cor={vencemHoje ? "blue" : undefined} />
          <Numero href={`${base}/tarefas?recorte=andamento${sufixoMinhas}`} valor={emAndamento} rotulo="Em andamento" />
          <Numero href={`${base}/tarefas?recorte=concluidas_hoje${sufixoMinhas}`} valor={concluidasHoje ?? 0} rotulo="Concluídas hoje" cor={concluidasHoje ? "green" : undefined} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 2. check-lists do dia */}
        <Bloco titulo="Check-lists de hoje" link={{ href: `${base}/checklists`, rotulo: "Ver check-lists" }}>
          {cls.length === 0 ? (
            <Nada>Nenhum check-list marcado para hoje.</Nada>
          ) : (
            <>
              <Barra
                partes={[
                  { valor: clFeitos, rotulo: "Feitos", classe: "bg-green-500" },
                  { valor: clPendentes, rotulo: "Pendentes", classe: "bg-blue-500" },
                  { valor: clNaoRealizados, rotulo: "Não realizados no tempo", classe: "bg-red-500" },
                ]}
              />
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <Mini rotulo="Feitos" valor={clFeitos} cor="text-green-700" />
                <Mini rotulo="Pendentes" valor={clPendentes} cor="text-blue-700" />
                <Mini rotulo="Não realizados" valor={clNaoRealizados} cor="text-red-700" />
              </dl>
            </>
          )}
          {(execucoesComNao?.length ?? 0) > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-3">
              <p className="mb-2 text-sm font-medium text-slate-700">Problemas encontrados nos check-lists</p>
              <ul className="space-y-2">
                {execucoesComNao!.map((e) => (
                  <li key={e.id}>
                    <Link href={`${base}/checklists/execucoes/${e.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-slate-100">
                      <span className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-900">{e.modelo_nome}</span>
                        <Etiqueta cor="#dc2626">{e.qtd_nao} {e.qtd_nao === 1 ? "problema" : "problemas"}</Etiqueta>
                      </span>
                      <span className="block text-xs text-slate-500">
                        {e.executor_nome} · {formatarDataHora(e.enviado_em, fuso)}
                      </span>
                      <span className="block text-xs text-red-700">
                        {[...(e.checklist_respostas ?? [])]
                          .sort((a, b) => a.ordem - b.ordem)
                          .map((r) => r.item_texto)
                          .join(" · ")}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Bloco>

        {/* 3. manutenções */}
        <Bloco titulo="Manutenções em aberto" link={{ href: `${base}/chamados`, rotulo: "Ver manutenções" }}>
          {abertas.length === 0 ? (
            <Nada>Nenhuma manutenção em aberto.</Nada>
          ) : (
            <>
              <p className="text-3xl font-semibold text-slate-900">{abertas.length}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[...porStatus.entries()].map(([id, n]) => (
                  <Etiqueta key={id} cor={nomeStatus.get(id)?.cor}>
                    {nomeStatus.get(id)?.nome ?? "—"}: {n}
                  </Etiqueta>
                ))}
                {porPrioridade.map(({ p, n }) => (
                  <Etiqueta key={p} cor={PRIORIDADES[p].cor}>
                    {PRIORIDADES[p].rotulo}: {n}
                  </Etiqueta>
                ))}
              </div>
              <p className="mt-4 mb-1 text-sm font-medium text-slate-700">Abertas há mais tempo</p>
              <ul className="divide-y divide-slate-200">
                {abertas.slice(0, 5).map((c) => {
                  const dias = diasAberto(c.created_at);
                  return (
                    <li key={c.tarefa_id}>
                      <Link href={`${base}/chamados/${c.tarefa_id}`} className="flex items-center justify-between gap-2 px-1 py-2 text-sm hover:bg-slate-100">
                        <span className="min-w-0 truncate">
                          <span className="text-slate-500">#{c.numero}</span> {c.tarefas.titulo}
                          {c.equipamento_id && nomeEquip.get(c.equipamento_id) && (
                            <span className="text-slate-500"> · {nomeEquip.get(c.equipamento_id)}</span>
                          )}
                        </span>
                        <span className={`shrink-0 text-xs ${dias >= 7 ? "font-medium text-red-700" : "text-slate-500"}`}>
                          {dias === 0 ? "hoje" : dias === 1 ? "1 dia" : `${dias} dias`}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Bloco>

        {/* 4. próximos 7 dias */}
        <Bloco titulo="Próximos 7 dias">
          {proximosAlertas.length === 0 && (etapas?.length ?? 0) === 0 ? (
            <Nada>Nenhuma data ou etapa de projeto nos próximos 7 dias.</Nada>
          ) : (
            <ul className="divide-y divide-slate-200">
              {proximosAlertas.map(({ a, proxima, faltam }) => (
                <li key={a.id}>
                  <Link href={`${base}/alertas/${a.id}`} className="flex items-center justify-between gap-2 px-1 py-2 text-sm hover:bg-slate-100">
                    <span className="min-w-0 truncate">
                      <Etiqueta>Alerta</Etiqueta> {a.nome}
                    </span>
                    <span className={`shrink-0 text-xs ${faltam <= 1 ? "font-medium text-blue-700" : "text-slate-500"}`}>
                      {faltam === 0 ? "hoje" : faltam === 1 ? "amanhã" : formatarData(proxima.toISOString(), fuso)}
                    </span>
                  </Link>
                </li>
              ))}
              {(etapas ?? []).map((t) => {
                const atrasada = !!t.prazo && new Date(t.prazo).getTime() < agoraMs;
                return (
                  <li key={t.id}>
                    <Link href={`${base}/planos/${t.origem_id}`} className="flex items-center justify-between gap-2 px-1 py-2 text-sm hover:bg-slate-100">
                      <span className="min-w-0 truncate">
                        <Etiqueta>Projeto</Etiqueta> {t.titulo}
                      </span>
                      <span className={`shrink-0 text-xs ${atrasada ? "font-medium text-red-700" : "text-slate-500"}`}>
                        {atrasada ? "atrasada" : formatarData(t.prazo, fuso)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Bloco>

        {/* 5. escala de hoje */}
        <Bloco titulo="Escalados hoje" link={{ href: `${base}/escalas`, rotulo: "Ver escala" }}>
          {turnosHoje.length === 0 && ausentes.length === 0 ? (
            <Nada>Ninguém escalado para hoje.</Nada>
          ) : (
            <div className="space-y-3">
              {turnosHoje.map(({ turno, pessoas }) => (
                <div key={turno.id}>
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: turno.cor }} aria-hidden />
                    {turno.nome}
                    <span className="font-normal text-slate-500">{horarioTurno(turno)}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {pessoas.map((p) => (variasUnidades && p.unidade ? `${p.nome} (${p.unidade})` : p.nome)).join(", ")}
                  </p>
                </div>
              ))}
              {ausentes.length > 0 && (
                <p className="border-t border-slate-200 pt-2 text-sm text-slate-500">
                  {(Object.keys(AUSENCIAS) as (keyof typeof AUSENCIAS)[])
                    .map((tipo) => {
                      const nomes = ausentes.filter((e) => e.tipo === tipo).map((e) => nomeMembro.get(e.membro_id) ?? "—");
                      return nomes.length ? `${AUSENCIAS[tipo].rotulo}: ${nomes.join(", ")}` : null;
                    })
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          )}
        </Bloco>
      </div>

      {/* 6. últimos 30 dias */}
      <Bloco titulo="Tarefas no prazo · últimos 30 dias">
        {comPrazo.length === 0 ? (
          <Nada>Nenhuma tarefa com prazo nos últimos 30 dias.</Nada>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-3xl font-semibold text-slate-900">{Math.round((totalOk / comPrazo.length) * 100)}%</p>
              <p className="text-sm text-slate-500">
                {totalOk} de {comPrazo.length} tarefas concluídas até o prazo
              </p>
            </div>
            {!minhas && (
              <div className="grid gap-6 md:grid-cols-2">
                <Ranking titulo="Por pessoa" linhas={ranking(porPessoa, (k) => nomeMembro.get(k) ?? "—")} />
                <Ranking titulo="Por setor" linhas={ranking(porSetor, (k) => (k ? (nomeSetor.get(k) ?? "—") : "Sem setor"))} />
              </div>
            )}
          </div>
        )}
      </Bloco>
    </div>
  );
}

function Numero({ href, valor, rotulo, cor }: { href: string; valor: number; rotulo: string; cor?: "red" | "blue" | "green" }) {
  const corNumero = cor === "red" ? "text-red-600" : cor === "blue" ? "text-blue-600" : cor === "green" ? "text-green-600" : "text-slate-900";
  return (
    <Link
      href={href}
      className="block rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm transition-colors duration-150 hover:bg-slate-100"
    >
      <span className={`block text-3xl font-semibold ${corNumero}`}>{valor}</span>
      <span className="block text-sm text-slate-600">{rotulo}</span>
    </Link>
  );
}

function Bloco({ titulo, link, children }: { titulo: string; link?: { href: string; rotulo: string }; children: ReactNode }) {
  return (
    <Cartao>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-slate-900">{titulo}</h2>
        {link && (
          <Link href={link.href} className="text-sm text-blue-600 hover:underline">
            {link.rotulo}
          </Link>
        )}
      </div>
      {children}
    </Cartao>
  );
}

function Nada({ children }: { children: ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function Mini({ rotulo, valor, cor }: { rotulo: string; valor: number; cor: string }) {
  return (
    <div>
      <dd className={`text-2xl font-semibold ${cor}`}>{valor}</dd>
      <dt className="text-xs text-slate-500">{rotulo}</dt>
    </div>
  );
}

function Barra({ partes }: { partes: { valor: number; rotulo: string; classe: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${p.valor}`).join(", ")}>
      {partes
        .filter((p) => p.valor > 0)
        .map((p) => (
          <div key={p.rotulo} className={p.classe} style={{ width: `${(p.valor / total) * 100}%` }} />
        ))}
    </div>
  );
}

function Ranking({ titulo, linhas }: { titulo: string; linhas: { nome: string; total: number; ok: number }[] }) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">{titulo}</p>
      <ul className="space-y-2.5">
        {linhas.map((l, i) => {
          const pct = Math.round((l.ok / l.total) * 100);
          return (
            <li key={i}>
              <div className="flex justify-between gap-2 text-sm">
                <span className="truncate text-slate-700">{l.nome}</span>
                <span className="shrink-0 text-slate-500">
                  <span className={`font-medium ${pct < 70 ? "text-red-700" : "text-slate-900"}`}>{pct}%</span> · {l.ok}/{l.total}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${pct < 70 ? "bg-red-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
