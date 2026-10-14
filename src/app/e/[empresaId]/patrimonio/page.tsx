import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { SITUACOES_PATRIMONIO, TIPOS_PATRIMONIO, type Equipamento, type SituacaoPatrimonio } from "@/lib/types";
import { Etiqueta, Input, LinkBotao, Select, Titulo, Vazio } from "@/components/ui";

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

      <form className="flex flex-wrap items-end gap-2">
        <Input name="busca" defaultValue={filtros.busca ?? ""} placeholder="Buscar nome, código, marca..." className="w-56 flex-1 sm:flex-none" />
        <Select name="tipo" defaultValue={filtros.tipo ?? ""} className="w-auto">
          <option value="">Todos os tipos</option>
          {Object.entries(TIPOS_PATRIMONIO).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Select name="situacao" defaultValue={filtros.situacao ?? ""} className="w-auto">
          <option value="">Em atividade</option>
          {Object.entries(SITUACOES_PATRIMONIO).map(([k, v]) => (
            <option key={k} value={k}>
              {v.rotulo}
            </option>
          ))}
          <option value="todos">Todas as situações</option>
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
        <button className="min-h-11 rounded-lg border border-slate-200 bg-superficie px-3 py-2 text-sm sm:min-h-10">Filtrar</button>
        {filtrando && (
          <Link href={`/e/${empresaId}/patrimonio`} className="px-2 py-2 text-sm text-slate-500">
            Limpar
          </Link>
        )}
      </form>

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
