import { formatarData } from "@/lib/formato";
import {
  EVENTOS_PATRIMONIO,
  PRIORIDADES,
  SITUACOES_PATRIMONIO,
  type Chamado,
  type Equipamento,
  type EventoPatrimonio,
  type Tarefa,
} from "@/lib/types";

export const brl = (v: number | string | null) =>
  v == null ? null : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// datas "AAAA-MM-DD" (sem hora) exibidas como estão
export const dataCurta = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);

export type Linha = { chave: string; data: string; ordem: string; titulo: string; detalhe?: string | null; valor?: string | null; por?: string | null; link?: string; cor?: string; eventoId?: string };

// trajetória: compra + registros + chamados, do mais recente para o mais antigo
export function montarTrajetoria({
  item,
  eventos,
  chamados,
  un,
  st,
  fuso,
  empresaId,
}: {
  item: Equipamento;
  eventos: EventoPatrimonio[];
  chamados: (Chamado & { tarefas: Tarefa })[];
  un: Map<string, string>;
  st: Map<string, { nome: string; cor: string | null }>;
  fuso: string;
  empresaId: string;
}): Linha[] {
  return [
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
    ...eventos.map((e) => ({
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
    ...chamados.map((c) => {
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
}
