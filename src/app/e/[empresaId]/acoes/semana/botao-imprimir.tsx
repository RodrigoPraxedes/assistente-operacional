"use client";

// Abre a impressão do navegador: a página já sai só com o quadro, em paisagem; "Salvar como PDF" gera o arquivo.
export function BotaoImprimir() {
  return (
    <>
      <style>{"@media print { @page { size: landscape; margin: 10mm; } }"}</style>
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-superficie px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
      >
        Exportar PDF
      </button>
    </>
  );
}
