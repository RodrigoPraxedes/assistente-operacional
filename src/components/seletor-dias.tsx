"use client";

import { Select } from "@/components/ui";

/** Prazo em dias depois da data de início: "No mesmo dia", "+1 dia"... "+7 dias". */
export function SeletorDias({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Prazo em dias">
      <option value="0">No mesmo dia</option>
      {[1, 2, 3, 4, 5, 6, 7].map((d) => (
        <option key={d} value={d}>
          {d === 1 ? "+1 dia" : `+${d} dias`}
        </option>
      ))}
    </Select>
  );
}

export function somarDias(data: string, dias: number) {
  const [a, m, d] = data.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + dias));
  return t.toISOString().slice(0, 10);
}
