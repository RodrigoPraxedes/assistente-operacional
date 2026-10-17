"use client";

export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-superficie px-3 text-xs font-medium text-slate-700 hover:bg-slate-100"
    >
      Imprimir
    </button>
  );
}
