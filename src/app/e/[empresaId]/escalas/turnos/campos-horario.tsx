"use client";

import { useState } from "react";
import { PERIODOS, type Periodo } from "@/lib/types";
import { Input, Select } from "@/components/ui";

// Horário fixo (início e fim) ou só o período do dia, quando o horário varia
// de um colaborador para outro.
export function CamposHorario({
  periodo: inicial,
  inicio,
  fim,
}: {
  periodo?: Periodo | null;
  inicio?: string | null;
  fim?: string | null;
}) {
  const [periodo, setPeriodo] = useState<string>(inicial ?? "");
  return (
    <>
      <Select
        name="periodo"
        value={periodo}
        onChange={(e) => setPeriodo(e.target.value)}
        aria-label="Horário"
        className="w-44"
      >
        <option value="">Com horário</option>
        {(Object.keys(PERIODOS) as Periodo[]).map((p) => (
          <option key={p} value={p}>
            {PERIODOS[p].rotulo} (sem horário)
          </option>
        ))}
      </Select>
      {!periodo && (
        <>
          <Input type="time" name="inicio" defaultValue={inicio?.slice(0, 5) ?? "06:00"} required aria-label="Início" className="w-28" />
          <span className="text-slate-400">às</span>
          <Input type="time" name="fim" defaultValue={fim?.slice(0, 5) ?? "14:00"} required aria-label="Fim" className="w-28" />
        </>
      )}
    </>
  );
}
