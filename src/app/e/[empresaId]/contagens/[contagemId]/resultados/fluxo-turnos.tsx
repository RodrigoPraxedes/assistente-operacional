import type { DiaFluxo, PontoFluxo } from "@/lib/contagem-resultados";
import { formatarQtd } from "@/lib/contagens";
import type { ContagemItem } from "@/lib/types";

const media = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

// diferença para a meta do turno: acima (sobrou além do que precisava) ou abaixo (faltou)
function DifMeta({ dif }: { dif: number | null }) {
  if (!dif) return null;
  return dif > 0 ? (
    <span className="block text-xs font-medium text-blue-700">+{formatarQtd(Math.round(dif * 10) / 10)} acima</span>
  ) : (
    <span className="block text-xs font-medium text-red-700">−{formatarQtd(Math.round(-dif * 10) / 10)}</span>
  );
}

// Fluxo entre turnos de um item: por dia, em cada turno, o que tinha (contado), o que entrou e o que saiu
// até a contagem seguinte. O "Tem" do turno seguinte é o que sobrou do anterior.
function TabelaItem({
  item,
  dias,
  turnos,
  rotulo,
}: {
  item: ContagemItem;
  dias: (DiaFluxo & { rotulo: string })[];
  turnos: string[];
  rotulo: string;
}) {
  const linhas = dias.filter((d) => turnos.some((t) => d.turnos.get(t)?.get(item.id)));
  const pontos = (t: string) =>
    linhas.map((d) => d.turnos.get(t)?.get(item.id)).filter((p): p is PontoFluxo => !!p);
  const celula = "whitespace-nowrap px-3 py-2 text-right tabular-nums";

  return (
    <section className="space-y-2">
      <h2 className="font-medium">
        {item.nome}
        {item.unidade_medida && <span className="ml-1 text-sm font-normal text-slate-500">({item.unidade_medida})</span>}
      </h2>
      {linhas.length === 0 ? (
        <p className="text-sm text-slate-500">Sem contagens desse item no período.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th rowSpan={2} className="sticky left-0 z-10 bg-slate-50 px-3 py-2 align-bottom">
                  Data
                </th>
                {turnos.map((t) => (
                  <th key={t} colSpan={3} className="border-l border-slate-200 px-3 pt-2 text-center font-medium text-slate-700">
                    {t}
                  </th>
                ))}
              </tr>
              <tr>
                {turnos.map((t) => (
                  <FragmentoCabecalho key={t} rotulo={rotulo} />
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((d) => (
                <tr key={d.data}>
                  <td className="sticky left-0 bg-superficie px-3 py-2 font-medium whitespace-nowrap">{d.rotulo}</td>
                  {turnos.map((t) => {
                    const p = d.turnos.get(t)?.get(item.id);
                    return [
                      <td key={`${t}-tem`} className={`${celula} border-l border-slate-200`}>
                        {formatarQtd(p?.tem)}
                        {p?.meta != null && <span className="block text-xs text-slate-400">meta {formatarQtd(p.meta)}</span>}
                        <DifMeta dif={p?.tem != null && p.meta != null ? p.tem - p.meta : null} />
                      </td>,
                      <td key={`${t}-entrada`} className={celula}>
                        {p?.entrada != null ? formatarQtd(p.entrada) : "—"}
                      </td>,
                      <td key={`${t}-saida`} className={`${celula} text-slate-600`}>
                        {formatarQtd(p?.saida)}
                      </td>,
                    ];
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
              <tr>
                <td className="sticky left-0 whitespace-nowrap bg-slate-50 px-3 py-2">Média</td>
                {turnos.map((t) => {
                  const ps = pontos(t);
                  const dif = media(ps.map((p) => (p.tem !== null && p.meta !== null ? p.tem - p.meta : null)));
                  return [
                    <td key={`${t}-tem`} className={`${celula} border-l border-slate-200`}>
                      {formatarQtd(arredondar(media(ps.map((p) => p.tem))))}
                      <DifMeta dif={dif} />
                    </td>,
                    <td key={`${t}-entrada`} className={celula}>
                      {formatarQtd(arredondar(media(ps.map((p) => p.entrada))))}
                    </td>,
                    <td key={`${t}-saida`} className={celula}>
                      {formatarQtd(arredondar(media(ps.map((p) => p.saida))))}
                    </td>,
                  ];
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

const arredondar = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

function FragmentoCabecalho({ rotulo }: { rotulo: string }) {
  return (
    <>
      <th className="border-l border-slate-200 px-3 pb-2 text-right font-normal">Tem</th>
      <th className="px-3 pb-2 text-right font-normal">{rotulo}</th>
      <th className="px-3 pb-2 text-right font-normal">Saiu</th>
    </>
  );
}

export function FluxoTurnos({
  itens,
  dias,
  turnos,
  rotulo,
}: {
  itens: ContagemItem[];
  dias: (DiaFluxo & { rotulo: string })[];
  turnos: string[];
  rotulo: string;
}) {
  return (
    <div className="space-y-6">
      {itens.map((i) => (
        <TabelaItem key={i.id} item={i} dias={dias} turnos={turnos} rotulo={rotulo} />
      ))}
    </div>
  );
}
