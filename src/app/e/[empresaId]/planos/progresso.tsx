// Andamento de um plano: etapas canceladas saem da conta
export function contarEtapas(tipos: (string | undefined)[]) {
  const validas = tipos.filter((t) => t !== "cancelado");
  return {
    total: validas.length,
    concluidas: validas.filter((t) => t === "concluido").length,
  };
}

export function BarraProgresso({ conta }: { conta: { total: number; concluidas: number } }) {
  const pct = conta.total ? Math.round((conta.concluidas / conta.total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div
        className="h-2 overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Andamento"
      >
        <div className="h-full rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-slate-500">
        {conta.total === 0 ? "Nenhuma etapa ainda" : `${conta.concluidas} de ${conta.total} etapas concluídas (${pct}%)`}
      </p>
    </div>
  );
}
