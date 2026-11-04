"use client";

import { Printer } from "lucide-react";

// Abre a impressão do navegador só com a ficha; "Salvar como PDF" gera o arquivo.
export function BotaoExportar() {
  return (
    <>
      <style>{"@media print { @page { size: portrait; margin: 12mm; } }"}</style>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-superficie px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100 sm:min-h-10"
      >
        <Printer className="h-4 w-4" aria-hidden /> Exportar PDF
      </button>
    </>
  );
}
