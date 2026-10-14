import Link from "next/link";
import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarData, hojeNoFuso } from "@/lib/formato";
import {
  EVENTOS_PATRIMONIO,
  PRIORIDADES,
  SITUACOES_PATRIMONIO,
  TIPOS_PATRIMONIO,
  type Chamado,
  type Equipamento,
  type EventoPatrimonio,
  type Tarefa,
} from "@/lib/types";
import { Aviso, Cartao, Etiqueta, LinkBotao, Titulo } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { excluirEvento } from "../actions";
import { FormItem } from "../form-item";
import { FormEvento } from "./form-evento";

const brl = (v: number | string | null) =>
  v == null ? null : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// datas "AAAA-MM-DD" (sem hora) exibidas como estão
const dataCurta = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);

type Linha = { chave: string; data: string; ordem: string; titulo: string; detalhe?: string | null; valor?: string | null; por?: string | null; link?: string; cor?: string; eventoId?: string };

export default async function DetalheItem({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; itemId: string }>;
  searchParams: Promise<{ novo?: string; salvo?: string; registrado?: string; erro?: string; editar?: string }>;
}) {
  const { empresaId, itemId } = await params;
  const avisos = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const fuso = empresa.fuso_horario;
  const gerencia = pode("patrimonio.gerenciar");
  const caminho = `/e/${empresaId}/patrimonio/${itemId}`;

  const { data: item } = await supabase
    .from("equipamentos")
    .select("*")
    .eq("id", itemId)
    .eq("empresa_id", empresaId)
    .maybeSingle<Equipamento>();
  if (!item) notFound();

  const [{ data: eventos }, { data: chamados }, { data: unidades }, { data: setores }, { data: status }, foto] = await Promise.all([
    supabase.from("patrimonio_eventos").select("*").eq("equipamento_id", itemId).returns<EventoPatrimonio[]>(),
    supabase
      .from("chamados")
      .select("*, tarefas!inner(*)")
      .eq("equipamento_id", itemId)
      .returns<(Chamado & { tarefas: Tarefa })[]>(),
    supabase.from("unidades").select("id, nome, ativo").eq("empresa_id", empresaId).order("nome"),
    supabase.from("setores").select("id, nome, ativo").eq("empresa_id", empresaId).order("nome"),
    supabase.from("status").select("id, nome, cor").eq("empresa_id", empresaId),
    item.foto_path ? supabase.storage.from("anexos").createSignedUrl(item.foto_path, 3600) : Promise.resolve(null),
  ]);

  const un = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const st = new Map((status ?? []).map((s) => [s.id, s]));
  const sit = SITUACOES_PATRIMONIO[item.situacao];
  const baixado = item.situacao === "vendido" || item.situacao === "aposentado";
  const listaChamados = chamados ?? [];
  const custoChamados = listaChamados.reduce((s, c) => s + Number(c.custo ?? 0), 0);
  const custoManutencoes = (eventos ?? []).filter((e) => e.tipo === "manutencao").reduce((s, e) => s + Number(e.valor ?? 0), 0);
  const custoTotal = custoChamados + custoManutencoes;
  const abertos = listaChamados.filter((c) => !c.tarefas.concluida_em).length;
  const h = hojeNoFuso(fuso);
  const hoje = `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;
  const garantiaVencida = item.garantia_ate ? item.garantia_ate < hoje : false;

  // trajetória: compra + registros + chamados, do mais recente para o mais antigo
  const linhas: Linha[] = [
    ...(item.data_compra
      ? [
          {
            chave: "compra",
            data: item.data_compra,
            ordem: "",
            titulo: "Compra",
            detalhe: [item.comprado_de, item.nota_fiscal && `NF ${item.nota_fiscal}`].filter(Boolean).join(" · ") || null,
            valor: brl(item.valor_compra),
            cor: "#16a34a",
          },
        ]
      : []),
    ...(eventos ?? []).map((e) => ({
      chave: e.id,
      data: e.data,
      ordem: e.created_at,
      titulo:
        e.tipo === "transferencia"
          ? `Mudou de unidade: ${un.get(e.unidade_origem_id ?? "") ?? "sem unidade"} → ${un.get(e.unidade_destino_id ?? "") ?? "—"}`
          : e.tipo === "situacao" && e.situacao_nova
            ? `Situação: ${SITUACOES_PATRIMONIO[e.situacao_nova].rotulo}`
            : EVENTOS_PATRIMONIO[e.tipo],
      detalhe: e.descricao,
      valor: brl(e.valor),
      por: e.membro_nome,
      cor: e.tipo === "venda" ? "#2563eb" : e.tipo === "aposentadoria" ? "#475569" : e.tipo === "manutencao" ? "#d97706" : undefined,
      eventoId: e.id,
    })),
    ...listaChamados.map((c) => {
      const s = st.get(c.tarefas.status_id);
      return {
        chave: c.tarefa_id,
        data: formatarData(c.created_at, fuso).split("/").reverse().join("-"),
        ordem: c.created_at,
        titulo: `Chamado #${c.numero}: ${c.tarefas.titulo}`,
        detalhe: [s?.nome, PRIORIDADES[c.prioridade].rotulo, c.tarefas.concluida_em && `concluído em ${formatarData(c.tarefas.concluida_em, fuso)}`]
          .filter(Boolean)
          .join(" · "),
        valor: brl(c.custo),
        por: c.aberto_por_nome,
        link: `/e/${empresaId}/chamados/${c.tarefa_id}`,
        cor: s?.cor ?? "#d97706",
      };
    }),
  ].sort((a, b) => (a.data === b.data ? b.ordem.localeCompare(a.ordem) : b.data.localeCompare(a.data)));

  const editando = gerencia && avisos.editar;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/e/${empresaId}/patrimonio`} className="text-sm text-slate-500">
        ← Patrimônio
      </Link>
      {avisos.novo && <Aviso tipo="sucesso">Item cadastrado.</Aviso>}
      {avisos.salvo && <Aviso tipo="sucesso">Salvo.</Aviso>}
      {avisos.registrado && <Aviso tipo="sucesso">Registrado no histórico.</Aviso>}
      {avisos.erro && <Aviso>{avisos.erro}</Aviso>}

      <Titulo
        acoes={
          <>
            {gerencia && !editando && (
              <LinkBotao variante="secundario" href={`${caminho}?editar=1`}>
                Editar
              </LinkBotao>
            )}
            {!baixado && pode("chamados.abrir") && (
              <LinkBotao href={`/e/${empresaId}/chamados/novo?equipamento=${item.id}`}>Abrir chamado</LinkBotao>
            )}
          </>
        }
      >
        {item.nome}
      </Titulo>

      {editando ? (
        <>
          <FormItem
            empresaId={empresaId}
            item={item}
            unidades={[]}
            setores={(setores ?? []).filter((s) => s.ativo || s.id === item.setor_id)}
          />
          <Link href={caminho} className="inline-block text-sm text-slate-500">
            Cancelar
          </Link>
        </>
      ) : (
        <Cartao className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Etiqueta cor={sit.cor}>{sit.rotulo}</Etiqueta>
            <Etiqueta>{TIPOS_PATRIMONIO[item.tipo]}</Etiqueta>
            {item.unidade_id && <Etiqueta>{un.get(item.unidade_id)}</Etiqueta>}
            {abertos > 0 && <Etiqueta cor="#d97706">{abertos} chamado(s) aberto(s)</Etiqueta>}
            {item.garantia_ate && !baixado && (
              <Etiqueta cor={garantiaVencida ? "#64748b" : "#16a34a"}>
                {garantiaVencida ? "Garantia vencida" : `Na garantia até ${dataCurta(item.garantia_ate)}`}
              </Etiqueta>
            )}
          </div>
          <div className="flex flex-col gap-4 sm:flex-row">
            {foto?.data?.signedUrl && (
              <a href={foto.data.signedUrl} target="_blank" rel="noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.data.signedUrl} alt={item.nome} className="h-36 w-36 rounded-lg border border-slate-200 object-cover" />
              </a>
            )}
            <dl className="grid flex-1 grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {[
                ["Nº patrimônio/série", item.codigo],
                ["Marca", item.marca],
                ["Modelo", item.modelo],
                ["Setor", (setores ?? []).find((s) => s.id === item.setor_id)?.nome],
                ["Compra", dataCurta(item.data_compra)],
                ["Valor de compra", brl(item.valor_compra)],
                ["Comprado de", item.comprado_de],
                ["Nota fiscal", item.nota_fiscal],
                ["Gasto com manutenção", custoTotal > 0 ? brl(custoTotal) : null],
              ].map(([rotulo, v]) => (
                <div key={rotulo}>
                  <dt className="text-slate-500">{rotulo}</dt>
                  <dd>{v || "—"}</dd>
                </div>
              ))}
            </dl>
          </div>
          {item.observacao && <p className="text-sm whitespace-pre-wrap text-slate-700">{item.observacao}</p>}
        </Cartao>
      )}

      {gerencia && !editando && (
        <Cartao className="space-y-3">
          <h2 className="font-medium">Registrar na trajetória</h2>
          <FormEvento
            empresaId={empresaId}
            itemId={item.id}
            hoje={hoje}
            unidades={(unidades ?? []).filter((u) => u.ativo)}
            unidadeAtual={item.unidade_id}
            baixado={baixado}
          />
        </Cartao>
      )}

      <Cartao className="space-y-3">
        <h2 className="font-medium">Trajetória</h2>
        {linhas.length === 0 ? (
          <p className="text-sm text-slate-500">Nada registrado ainda.</p>
        ) : (
          <ol className="space-y-3 border-l border-slate-200 pl-4">
            {linhas.map((l) => (
              <li key={l.chave} className="relative">
                <span
                  className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-superficie"
                  style={{ backgroundColor: l.cor ?? "var(--color-slate-400)" }}
                  aria-hidden
                />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-medium text-slate-900">
                    {l.link ? (
                      <Link href={l.link} className="text-blue-600 hover:underline">
                        {l.titulo}
                      </Link>
                    ) : (
                      l.titulo
                    )}
                  </p>
                  <span className="text-xs text-slate-500">{dataCurta(l.data)}</span>
                </div>
                {l.detalhe && <p className="text-sm whitespace-pre-wrap text-slate-600">{l.detalhe}</p>}
                <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  {l.valor && <span>{l.valor}</span>}
                  {l.por && <span>por {l.por}</span>}
                  {gerencia && l.eventoId && (
                    <form action={excluirEvento.bind(null, empresaId, item.id, l.eventoId)} className="inline">
                      <BotaoConfirmar
                        mensagem="Apagar este registro? A situação e a unidade do item não voltam sozinhas; ajuste depois se precisar."
                        className="text-red-600 hover:underline"
                      >
                        Apagar
                      </BotaoConfirmar>
                    </form>
                  )}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Cartao>
    </div>
  );
}
