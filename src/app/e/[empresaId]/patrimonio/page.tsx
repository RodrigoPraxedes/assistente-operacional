import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { SITUACOES_PATRIMONIO, TIPOS_PATRIMONIO, type Equipamento, type SituacaoPatrimonio } from "@/lib/types";
import { Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";
import { FiltrosPatrimonio } from "./filtros-patrimonio";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function PaginaPatrimonio({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ busca?: string; tipo?: string; situacao?: string; unidade?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, pode } = await getContexto(empresaId);

  let consulta = supabase.from("equipamentos").select("*").eq("empresa_id", empresaId).order("nome").limit(500);
  if (filtros.tipo) consulta = consulta.eq("tipo", filtros.tipo);
  if (filtros.unidade) consulta = consulta.eq("unidade_id", filtros.unidade);
  // sem filtro de situação, esconde o que já saiu (vendido/aposentado)
  if (filtros.situacao === "todos") {
    // sem filtro
  } else if (filtros.situacao) consulta = consulta.eq("situacao", filtros.situacao);
  else consulta = consulta.eq("ativo", true);
  if (filtros.busca) {
    const b = filtros.busca.replace(/[%,()]/g, " ").trim();
    if (b) consulta = consulta.or(`nome.ilike.%${b}%,codigo.ilike.%${b}%,marca.ilike.%${b}%,modelo.ilike.%${b}%`);
  }

  const [{ data: itens }, { data: unidades }, { data: chamados }] = await Promise.all([
    consulta.returns<Equipamento[]>(),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase
      .from("chamados")
      .select("equipamento_id, tarefas!inner(concluida_em)")
      .eq("empresa_id", empresaId)
      .not("equipamento_id", "is", null)
      .is("tarefas.concluida_em", null),
  ]);
  const unidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const abertos = new Map<string, number>();
  for (const c of chamados ?? []) abertos.set(c.equipamento_id!, (abertos.get(c.equipamento_id!) ?? 0) + 1);
  const lista = itens ?? [];
  const total = lista.reduce((s, i) => s + Number(i.valor_compra ?? 0), 0);
  const filtrando = Boolean(filtros.busca || filtros.tipo || filtros.situacao || filtros.unidade);

  return (
    <div className="space-y-4">
      <Titulo
        voltar={{ href: `/e/${empresaId}/chamados`, rotulo: "Manutenções" }}
        acoes={
          pode("patrimonio.gerenciar") && (
            <>
              <LinkBotao variante="secundario" href={`/e/${empresaId}/patrimonio/importar`}>
                Importar planilha
              </LinkBotao>
              <LinkBotao href={`/e/${empresaId}/patrimonio/novo`}>Novo item</LinkBotao>
            </>
          )
        }
      >
        Patrimônio
      </Titulo>

      <FiltrosPatrimonio
        busca={filtros.busca ?? ""}
        tipo={filtros.tipo ?? ""}
        situacao={filtros.situacao ?? ""}
        unidade={filtros.unidade ?? ""}
        unidades={unidades ?? []}
      />

      {lista.length === 0 ? (
        <Vazio>
          {filtrando
            ? "Nenhum item encontrado com esses filtros."
            : "Nenhum item cadastrado. Cadastre móveis e equipamentos para acompanhar compra, manutenções e baixa de cada um."}
        </Vazio>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-superficie">
            {lista.map((i) => {
              const sit = SITUACOES_PATRIMONIO[i.situacao as SituacaoPatrimonio];
              const qtd = abertos.get(i.id) ?? 0;
              return (
                <li key={i.id}>
                  <Link
                    href={`/e/${empresaId}/patrimonio/${i.id}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{i.nome}</p>
                      <p className="truncate text-xs text-slate-500">
                        {[TIPOS_PATRIMONIO[i.tipo], i.codigo, [i.marca, i.modelo].filter(Boolean).join(" "), i.unidade_id && unidade.get(i.unidade_id)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    {qtd > 0 && <Etiqueta cor="#d97706">{qtd} chamado(s) aberto(s)</Etiqueta>}
                    <Etiqueta cor={sit.cor}>{sit.rotulo}</Etiqueta>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-slate-500">
            {lista.length} item(ns){total > 0 && ` · valor de compra somado: ${brl(total)}`}
          </p>
        </>
      )}
    </div>
  );
}
