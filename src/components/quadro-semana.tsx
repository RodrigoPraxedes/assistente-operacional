import Link from "next/link";
import { rotuloDia } from "@/lib/escala";
import type { CartaoSemana } from "@/lib/semana-acoes";

// Colunas seg a dom com as ações previstas; no celular os dias ficam empilhados e na impressão voltam a 7 colunas.
export function QuadroSemana({
  dias,
  porDia,
  hoje,
  empresaId,
  podeAbrir,
}: {
  dias: string[];
  porDia: Map<string, CartaoSemana[]>;
  hoje: string;
  empresaId: string;
  podeAbrir: boolean;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-7 lg:gap-2 print:grid-cols-7 print:gap-1">
      {dias.map((dia) => {
        const lista = porDia.get(dia) ?? [];
        const ehHoje = dia === hoje;
        return (
          <section
            key={dia}
            className={`min-w-0 rounded-xl border p-2 ${ehHoje ? "border-blue-500" : "border-slate-200"} bg-slate-50 print:break-inside-avoid`}
          >
            <h3 className={`mb-2 text-xs font-semibold uppercase ${ehHoje ? "text-blue-600" : "text-slate-600"}`}>
              {rotuloDia(dia)}
            </h3>
            {lista.length === 0 ? (
              <p className="py-2 text-xs text-slate-400">Nada programado</p>
            ) : (
              <ul className="space-y-2">
                {lista.map((c) => {
                  const conteudo = (
                    <>
                      <span className="block text-xs text-slate-500">{c.hora}</span>
                      <span className="block break-words text-sm font-medium text-slate-900">{c.acao.nome}</span>
                      {c.responsaveis.length > 0 && (
                        <span className="block text-xs text-slate-500">{c.responsaveis.join(", ")}</span>
                      )}
                    </>
                  );
                  const estilo = c.cor
                    ? { backgroundColor: `${c.cor}33`, borderColor: c.cor, printColorAdjust: "exact" as const }
                    : { backgroundColor: "var(--color-superficie)" };
                  const classe = "block rounded-lg border border-slate-200 p-2 shadow-sm";
                  return (
                    <li key={`${c.acao.id}-${c.hora}`} className="print:break-inside-avoid">
                      {podeAbrir ? (
                        <Link href={`/e/${empresaId}/acoes/${c.acao.id}`} className={classe} style={estilo}>
                          {conteudo}
                        </Link>
                      ) : (
                        <div className={classe} style={estilo}>
                          {conteudo}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
