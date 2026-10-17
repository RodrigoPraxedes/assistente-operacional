import Link from "next/link";
import { cookies } from "next/headers";
import { getContexto } from "@/lib/contexto";
import { hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import { ORIGENS, type Origem, type Status, type Tarefa } from "@/lib/types";
import { linkWhatsApp, mensagemTarefa } from "@/lib/whatsapp";
import { LinkBotao, Select, Titulo } from "@/components/ui";
import { Kanban } from "./kanban";
import { TrocarVisao, type Visao } from "./trocar-visao";

// "pendentes" = tudo que não foi concluído nem cancelado
const PENDENTES = ["aberto", "em_andamento", "adiado"];

// recortes vindos dos números do Painel
const RECORTES = {
  atrasadas: "Atrasadas",
  hoje: "Vencem hoje",
  andamento: "Em andamento",
  concluidas_hoje: "Concluídas hoje",
} as const;
type Recorte = keyof typeof RECORTES;

export default async function PaginaTarefas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ origem?: string; unidade?: string; minhas?: string; status?: string; recorte?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, empresa, membro, pode } = await getContexto(empresaId);
  const visao: Visao = (await cookies()).get("visao_tarefas")?.value === "lista" ? "lista" : "kanban";

  const { data: status } = await supabase
    .from("status")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("ordem");
  const todosStatus = (status ?? []) as Status[];
  // filtro de status: um status, ou "pendentes"
  const statusEscolhidos = !filtros.status
    ? null
    : filtros.status === "pendentes"
      ? todosStatus.filter((s) => PENDENTES.includes(s.tipo)).map((s) => s.id)
      : [filtros.status];

  // fim de hoje no fuso da empresa: ocorrências futuras (amanhã...) ficam escondidas
  const hoje = hojeNoFuso(empresa.fuso_horario);
  const fimDeHoje = horaLocalParaUtc(hoje.y, hoje.m, hoje.d, 23, 59, empresa.fuso_horario).toISOString();
  const seteDiasAtras = new Date(Date.now() - 7 * 86_400_000).toISOString();
  // canceladas somem depois de 48 h (continuam guardadas)
  const doisDiasAtras = new Date(Date.now() - 2 * 86_400_000).toISOString();
  // check-list só aparece 1 hora antes do horário
  const daquiUmaHora = new Date(Date.now() + 3_600_000).toISOString();

  const recorte = filtros.recorte && filtros.recorte in RECORTES ? (filtros.recorte as Recorte) : null;
  const idsPendentes = todosStatus.filter((s) => PENDENTES.includes(s.tipo)).map((s) => s.id);
  const agora = new Date().toISOString();

  let consulta = supabase
    .from("tarefas")
    .select("*")
    .eq("empresa_id", empresaId)
    .or(`ocorrencia_em.is.null,ocorrencia_em.lte.${fimDeHoje}`)
    .or(`concluida_em.is.null,concluida_em.gte.${seteDiasAtras}`)
    .or(`cancelada_em.is.null,cancelada_em.gte.${doisDiasAtras}`)
    .or(`origem.neq.checklist,ocorrencia_em.lte.${daquiUmaHora}`)
    .order("prazo", { ascending: true, nullsFirst: false })
    .limit(500);
  if (filtros.origem) consulta = consulta.eq("origem", filtros.origem);
  if (filtros.unidade) consulta = consulta.eq("unidade_id", filtros.unidade);
  if (filtros.minhas) consulta = consulta.contains("responsaveis", [membro.id]);
  if (statusEscolhidos) consulta = consulta.in("status_id", statusEscolhidos);
  if (recorte === "atrasadas") consulta = consulta.in("status_id", idsPendentes).lt("prazo", agora);
  if (recorte === "hoje") consulta = consulta.in("status_id", idsPendentes).gte("prazo", agora).lte("prazo", fimDeHoje);
  if (recorte === "andamento")
    consulta = consulta.in("status_id", todosStatus.filter((s) => s.tipo === "em_andamento").map((s) => s.id));
  if (recorte === "concluidas_hoje")
    consulta = consulta.gte("concluida_em", horaLocalParaUtc(hoje.y, hoje.m, hoje.d, 0, 0, empresa.fuso_horario).toISOString());

  const [{ data: tarefas }, { data: membros }, { data: unidades }] = await Promise.all([
    consulta,
    supabase.from("membros").select("id, nome, telefone").eq("empresa_id", empresaId),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);

  const nomes = {
    membros: Object.fromEntries((membros ?? []).map((m) => [m.id, m.nome])),
    unidades: Object.fromEntries((unidades ?? []).map((u) => [u.id, u.nome])),
  };

  // chamados na lista: nome do equipamento atrelado (duas consultas, sem N+1)
  const idsChamados = ((tarefas ?? []) as Tarefa[]).filter((t) => t.origem === "chamado").map((t) => t.id);
  const { data: chamadosEq } = idsChamados.length
    ? await supabase.from("chamados").select("tarefa_id, equipamento_id").in("tarefa_id", idsChamados).not("equipamento_id", "is", null)
    : { data: [] as { tarefa_id: string; equipamento_id: string }[] };
  const idsEq = [...new Set((chamadosEq ?? []).map((c) => c.equipamento_id))];
  const { data: equips } = idsEq.length
    ? await supabase.from("equipamentos").select("id, nome").in("id", idsEq)
    : { data: [] as { id: string; nome: string }[] };
  const nomeEquip = new Map((equips ?? []).map((e) => [e.id, e.nome]));
  const equipDaTarefa = new Map((chamadosEq ?? []).map((c) => [c.tarefa_id, nomeEquip.get(c.equipamento_id) ?? null]));
  const etiquetas = Object.fromEntries(
    [...equipDaTarefa.entries()]
      .filter(([, nome]) => nome)
      .map(([id, nome]) => [id, [{ texto: ORIGENS.chamado, cor: "#7c3aed" }, { texto: nome!, cor: "#0f766e" }]]),
  );

  // botão do WhatsApp em cada tarefa: mensagem pronta para o responsável
  // (com vários, sem número: a pessoa escolhe o contato ou o grupo)
  const membroPorId = new Map((membros ?? []).map((m) => [m.id, m]));
  const nomeStatus = new Map(todosStatus.map((s) => [s.id, s.nome]));
  const whatsapp = Object.fromEntries(
    ((tarefas ?? []) as Tarefa[]).map((t) => {
      const resp = t.responsaveis.length === 1 ? membroPorId.get(t.responsaveis[0]) : null;
      const texto = mensagemTarefa(t, {
        empresaId,
        fuso: empresa.fuso_horario,
        responsavel: resp?.telefone ? resp.nome : null,
        status: nomeStatus.get(t.status_id),
        equipamento: equipDaTarefa.get(t.id),
      });
      return [t.id, linkWhatsApp(texto, resp?.telefone)];
    }),
  );

  return (
    <div>
      <Titulo
        acoes={
          <>
            <TrocarVisao inicial={visao} />
            {pode("tarefas.criar") && <LinkBotao href={`/e/${empresaId}/tarefas/nova`}>Nova tarefa</LinkBotao>}
          </>
        }
      >
        Tarefas
      </Titulo>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Select name="origem" defaultValue={filtros.origem ?? ""} className="w-auto">
          <option value="">Todos os módulos</option>
          {(Object.keys(ORIGENS) as Origem[]).map((o) => (
            <option key={o} value={o}>
              {ORIGENS[o]}
            </option>
          ))}
        </Select>
        {(unidades?.length ?? 0) > 1 && (
          <Select name="unidade" defaultValue={filtros.unidade ?? ""} className="w-auto">
            <option value="">Todas as unidades</option>
            {unidades!.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        )}
        <Select name="status" defaultValue={filtros.status ?? ""} className="w-auto">
          <option value="">Todos os status</option>
          <option value="pendentes">Pendentes (não concluídas)</option>
          {todosStatus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nome}
            </option>
          ))}
        </Select>
        {/* liga/desliga na hora, mantendo os outros filtros */}
        <Link
          href={`/e/${empresaId}/tarefas?${new URLSearchParams(
            Object.entries({ ...filtros, minhas: filtros.minhas ? undefined : "1" }).filter((e): e is [string, string] => !!e[1]),
          )}`}
          className={`rounded-lg border px-3 py-2 text-sm ${
            filtros.minhas ? "border-blue-600 bg-blue-50 font-medium text-blue-700" : "border-slate-300 bg-superficie"
          }`}
        >
          Minhas tarefas
          {filtros.minhas && <span className="sr-only"> (filtro ativo)</span>}
        </Link>
        {filtros.minhas && <input type="hidden" name="minhas" value="1" />}
        {recorte && (
          <>
            <input type="hidden" name="recorte" value={recorte} />
            <Link
              href={`/e/${empresaId}/tarefas?${new URLSearchParams(
                Object.entries({ ...filtros, recorte: undefined }).filter((e): e is [string, string] => !!e[1]),
              )}`}
              className="rounded-lg border border-blue-600 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700"
              title="Tirar este filtro"
            >
              {RECORTES[recorte]} ✕
            </Link>
          </>
        )}
        <button className="rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm">Filtrar</button>
        {(filtros.origem || filtros.unidade || filtros.minhas || filtros.status || recorte) && (
          <Link href={`/e/${empresaId}/tarefas`} className="px-2 py-2 text-sm text-slate-500">
            Limpar
          </Link>
        )}
      </form>

      <Kanban
        empresaId={empresaId}
        fuso={empresa.fuso_horario}
        visao={visao}
        status={todosStatus}
        colunas={todosStatus.filter(
          // status de um módulo só (ex.: "Aguardando peça") aparecem aqui quando têm tarefas;
          // com filtro de status, só as colunas escolhidas
          (s) =>
            statusEscolhidos
              ? statusEscolhidos.includes(s.id)
              : !s.modulo || (tarefas ?? []).some((t) => t.status_id === s.id),
        )}
        tarefas={(tarefas ?? []) as Tarefa[]}
        nomes={nomes}
        podeMover={pode("tarefas.mudar_status")}
        whatsapp={whatsapp}
        etiquetas={etiquetas}
        podePreencher={pode("checklist.executar")}
      />
    </div>
  );
}
