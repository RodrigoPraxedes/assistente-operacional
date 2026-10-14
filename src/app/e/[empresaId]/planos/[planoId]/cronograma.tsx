import { formatarDia } from "@/lib/formato";
import { Cartao } from "@/components/ui";

interface EtapaCronograma {
  id: string;
  numero: number;
  titulo: string;
  inicio: string | null; // AAAA-MM-DD
  fim: string | null; // AAAA-MM-DD
  cor: string;
}

const DIA = 86_400_000;
const dia = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// Linha do tempo simples (estilo Gantt): uma barra por etapa, do início previsto ao prazo.
// Etapa com só uma das datas aparece como um ponto.
export function Cronograma({
  inicioPlano,
  fimPlano,
  hoje,
  etapas,
}: {
  inicioPlano: string | null;
  fimPlano: string | null;
  hoje: string;
  etapas: EtapaCronograma[];
}) {
  const datas = [inicioPlano, fimPlano, ...etapas.flatMap((e) => [e.inicio, e.fim])].filter(Boolean) as string[];
  if (!etapas.some((e) => e.inicio || e.fim) || datas.length < 2) return null;

  const ini = Math.min(...datas.map(dia));
  const fim = Math.max(...datas.map(dia)) + DIA;
  if (fim - ini < 2 * DIA) return null;
  const pos = (t: number) => `${((t - ini) / (fim - ini)) * 100}%`;

  // marcas de mês
  const meses: { t: number; rotulo: string }[] = [];
  const d0 = new Date(ini);
  for (let m = new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1)); m.getTime() < fim; m.setUTCMonth(m.getUTCMonth() + 1)) {
    meses.push({ t: m.getTime(), rotulo: `${MESES[m.getUTCMonth()]}${m.getUTCMonth() === 0 ? `/${m.getUTCFullYear() % 100}` : ""}` });
  }
  const tHoje = dia(hoje);

  return (
    <Cartao className="space-y-3">
      <h2 className="font-medium text-slate-900">Cronograma</h2>
      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="relative ml-40 h-5 border-b border-slate-200 text-[11px] text-slate-500">
            {meses.map((m) => (
              <span key={m.t} className="absolute -translate-x-1/2" style={{ left: pos(m.t) }}>
                {m.rotulo}
              </span>
            ))}
          </div>
          <ul className="relative">
            {etapas.map((e) => {
              const a = e.inicio ? dia(e.inicio) : null;
              const b = e.fim ? dia(e.fim) + DIA : null;
              const periodo = [formatarDia(e.inicio), formatarDia(e.fim)].filter(Boolean).join(" a ");
              return (
                <li key={e.id} className="flex h-8 items-center text-xs">
                  <span className="w-40 shrink-0 truncate pr-2 text-slate-700" title={e.titulo}>
                    {e.numero}. {e.titulo}
                  </span>
                  <div className="relative h-full flex-1">
                    {meses.map((m) => (
                      <span key={m.t} className="absolute inset-y-0 w-px bg-slate-100" style={{ left: pos(m.t) }} />
                    ))}
                    {a !== null && b !== null && b > a ? (
                      <span
                        className="absolute top-2 h-4 rounded"
                        style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})`, backgroundColor: e.cor }}
                        title={periodo}
                      />
                    ) : (
                      (a ?? b) !== null && (
                        <span
                          className="absolute top-2.5 h-3 w-3 -translate-x-1/2 rotate-45 rounded-sm"
                          style={{ left: pos(a ?? b! - DIA), backgroundColor: e.cor }}
                          title={periodo}
                        />
                      )
                    )}
                  </div>
                </li>
              );
            })}
            {tHoje >= ini && tHoje < fim && (
              <span
                className="pointer-events-none absolute inset-y-0 ml-40 w-[calc(100%-10rem)]"
                aria-hidden
              >
                <span className="absolute inset-y-0 w-0.5 bg-red-500/70" style={{ left: pos(tHoje) }} />
              </span>
            )}
          </ul>
          <p className="mt-2 text-[11px] text-slate-500">A linha vermelha marca hoje. A cor de cada barra é o status da etapa.</p>
        </div>
      </div>
    </Cartao>
  );
}
