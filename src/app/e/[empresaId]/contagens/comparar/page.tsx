import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { lerFiltros } from "@/lib/contagem-resultados";
import { diaDaSemana, formatarQtd } from "@/lib/contagens";
import { DIAS_SEMANA } from "@/lib/rotinas";
import { formatarDia } from "@/lib/formato";
import { Botao, Cartao, Input, Titulo, Vazio } from "@/components/ui";

// Itens de contagens diferentes lado a lado, somados por dia.
// Ex.: frango contado (Contagem) x frango para assar (Produção) x frango de perda (Retirada).
export default async function CompararContagens({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ de?: string; ate?: string; item?: string | string[] }>;
}) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  if (!pode("contagens.resultados") && !pode("contagens.editar")) notFound();
  const filtros = lerFiltros({ de: sp.de, ate: sp.ate }, empresa.fuso_horario);
  const escolhidos = [sp.item ?? []].flat().slice(0, 12);

  const [{ data: contagens }, { data: itens }] = await Promise.all([
    supabase.from("contagens").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase.from("contagem_itens").select("id, contagem_id, nome, unidade_medida, ordem").eq("empresa_id", empresaId).eq("ativo", true).order("ordem"),
  ]);
  const nomeContagem = new Map((contagens ?? []).map((c) => [c.id as string, c.nome as string]));
  const colunas = escolhidos.map((id) => (itens ?? []).find((i) => i.id === id)).filter((i): i is NonNullable<typeof i> => !!i);

  // soma por dia de cada item escolhido
  const soma = new Map<string, Map<string, number>>();
  if (colunas.length) {
    for (let desde = 0; desde < 50000; desde += 1000) {
      const { data } = await supabase
        .from("contagem_valores")
        .select("item_id, quantidade, contagem_registros!inner(data_ref)")
        .in(
          "item_id",
          colunas.map((c) => c.id),
        )
        .not("quantidade", "is", null)
        .gte("contagem_registros.data_ref", filtros.de)
        .lte("contagem_registros.data_ref", filtros.ate)
        .order("registro_id")
        .order("item_id")
        .range(desde, desde + 999);
      for (const v of (data ?? []) as unknown as { item_id: string; quantidade: number; contagem_registros: { data_ref: string } }[]) {
        const dia = soma.get(v.contagem_registros.data_ref) ?? new Map<string, number>();
        dia.set(v.item_id, (dia.get(v.item_id) ?? 0) + Number(v.quantidade));
        soma.set(v.contagem_registros.data_ref, dia);
      }
      if ((data ?? []).length < 1000) break;
    }
  }
  const dias = [...soma.keys()].sort((a, b) => b.localeCompare(a));

  return (
    <div className="space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/contagens`, rotulo: "Contagens" }}>Comparar contagens</Titulo>
      <p className="-mt-3 text-sm text-slate-500">
        Escolha itens de contagens diferentes para ver lado a lado, somados por dia. Ex.: o que foi contado, o que foi produzido e o
        que saiu.
      </p>

      <form method="get">
        <Cartao className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 text-sm">
            <label className="space-y-1">
              <span className="block text-xs text-slate-500">De</span>
              <Input type="date" name="de" defaultValue={filtros.de} className="w-auto" />
            </label>
            <label className="space-y-1">
              <span className="block text-xs text-slate-500">Até</span>
              <Input type="date" name="ate" defaultValue={filtros.ate} className="w-auto" />
            </label>
            <Botao type="submit">Comparar</Botao>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(contagens ?? []).map((c) => {
              const deles = (itens ?? []).filter((i) => i.contagem_id === c.id);
              if (!deles.length) return null;
              return (
                <fieldset key={c.id} className="space-y-1">
                  <legend className="text-sm font-medium text-slate-700">{c.nome}</legend>
                  {deles.map((i) => (
                    <label key={i.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="item" value={i.id} defaultChecked={escolhidos.includes(i.id)} />
                      {i.nome}
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>
        </Cartao>
      </form>

      {colunas.length === 0 ? (
        <Vazio>Marque os itens acima e toque em Comparar (até 12).</Vazio>
      ) : dias.length === 0 ? (
        <Vazio>Nenhum valor desses itens no período.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="sticky left-0 bg-slate-50 px-3 py-2">Data</th>
                {colunas.map((c) => (
                  <th key={c.id} className="min-w-28 px-3 py-2 text-right align-bottom font-medium">
                    {c.nome}
                    <span className="block font-normal text-slate-400">
                      {nomeContagem.get(c.contagem_id)}
                      {c.unidade_medida ? ` · ${c.unidade_medida}` : ""}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dias.map((d) => (
                <tr key={d}>
                  <td className="sticky left-0 bg-superficie px-3 py-2 font-medium whitespace-nowrap">
                    {formatarDia(d).slice(0, 5)} {DIAS_SEMANA[diaDaSemana(d) - 1].curto}
                  </td>
                  {colunas.map((c) => (
                    <td key={c.id} className="px-3 py-2 text-right tabular-nums">
                      {formatarQtd(soma.get(d)?.get(c.id))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
              <tr>
                <td className="sticky left-0 bg-slate-50 px-3 py-2">Total</td>
                {colunas.map((c) => (
                  <td key={c.id} className="px-3 py-2 text-right tabular-nums">
                    {formatarQtd(dias.reduce((t, d) => t + (soma.get(d)?.get(c.id) ?? 0), 0))}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
