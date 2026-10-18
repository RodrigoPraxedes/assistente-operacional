import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { rotuloDia } from "@/lib/escala";
import type { CartaoSemana } from "@/lib/semana-acoes";

// Colunas seg a dom com as ações previstas; no celular os dias ficam recolhidos (hoje aberto) e na impressão voltam a 7 colunas.
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
  const lembrete = (c: CartaoSemana) => `${c.acao.id}-${c.hora}`;
  const cartoes = (lista: CartaoSemana[]) =>
    lista.length === 0 ? (
      <p className="py-2 text-xs text-slate-400">Nada programado</p>
    ) : (
      <ul className="space-y-2">
        {lista.map((c) => {
          const conteudo = (
            <>
              <span className="block text-xs text-slate-500">{c.hora}</span>
              <span className="block break-words text-sm font-medium text-slate-900">{c.acao.nome}</span>
              {c.responsaveis.length > 0 && (
                <span className="block break-words text-xs text-slate-500">{c.responsaveis.join(", ")}</span>
              )}
            </>
          );
          const estilo = c.cor
            ? { backgroundColor: `${c.cor}33`, borderColor: c.cor, printColorAdjust: "exact" as const }
            : { backgroundColor: "var(--color-superficie)" };
          const classe = "block rounded-lg border border-slate-200 p-2 shadow-sm";
          return (
            <li key={lembrete(c)} className="print:break-inside-avoid">
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
    );

  return (
    <>
      {/* celular: hoje aberto, os outros dias recolhidos (tocar para abrir) */}
      <div className="space-y-2 lg:hidden print:hidden">
        {dias.map((dia) => {
          const lista = porDia.get(dia) ?? [];
          const ehHoje = dia === hoje;
          return (
            <details
              key={dia}
              open={ehHoje}
              className={`group rounded-xl border bg-slate-50 ${ehHoje ? "border-blue-500" : "border-slate-200"}`}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
                <span className={`text-sm font-semibold uppercase ${ehHoje ? "text-blue-600" : "text-slate-700"}`}>
                  {rotuloDia(dia)}
                  {ehHoje && " · hoje"}
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {lista.length === 0 ? "Nada" : lista.length === 1 ? "1 ação" : `${lista.length} ações`}
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden />
                </span>
              </summary>
              <div className="px-3 pb-3">{cartoes(lista)}</div>
            </details>
          );
        })}
      </div>

      {/* computador e impressão: grade de 7 colunas */}
      <div className="hidden gap-2 lg:grid lg:grid-cols-7 print:grid print:grid-cols-7 print:gap-1">
        {dias.map((dia) => {
          const ehHoje = dia === hoje;
          return (
            <section
              key={dia}
              className={`min-w-0 rounded-xl border p-2 ${ehHoje ? "border-blue-500" : "border-slate-200"} bg-slate-50 print:break-inside-avoid`}
            >
              <h3 className={`mb-2 text-xs font-semibold uppercase ${ehHoje ? "text-blue-600" : "text-slate-600"}`}>
                {rotuloDia(dia)}
              </h3>
              {cartoes(porDia.get(dia) ?? [])}
            </section>
          );
        })}
      </div>
    </>
  );
}
