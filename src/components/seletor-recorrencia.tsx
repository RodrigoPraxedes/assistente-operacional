"use client";

import { useState } from "react";
import {
  DIAS_SEMANA,
  ORDENS_MES,
  RECORRENCIAS_PRONTAS,
  descreverRecorrencia,
  lerRegra,
  montarRegra,
  type RegraSimples,
  type Unidade,
} from "@/lib/recorrencias-prontas";
import { Input, Select } from "@/components/ui";

const UNIDADES: { valor: Unidade; rotulo: string; plural: string }[] = [
  { valor: "DAILY", rotulo: "dia", plural: "dias" },
  { valor: "WEEKLY", rotulo: "semana", plural: "semanas" },
  { valor: "MONTHLY", rotulo: "mês", plural: "meses" },
  { valor: "YEARLY", rotulo: "ano", plural: "anos" },
];

// Campo "Repetir": lista de opções prontas + "Personalizar..." (a cada N dias/semanas/meses/anos,
// dias da semana, ou "na 2ª terça do mês"). Envia a regra (RRULE) no campo `name`.
export function SeletorRecorrencia({
  name = "recorrencia",
  inicial,
  permitirNenhuma,
  onChange,
}: {
  name?: string;
  inicial: string;
  permitirNenhuma?: boolean;
  onChange?: (regra: string) => void;
}) {
  const [regra, setRegraEstado] = useState(inicial);
  const naoProntaSimples = !!inicial && !RECORRENCIAS_PRONTAS.some((r) => r.regra === inicial);
  const [personalizar, setPersonalizar] = useState(naoProntaSimples);
  const lida = regra ? lerRegra(regra) : null;
  const bruta = naoProntaSimples && !lerRegra(inicial);

  const setRegra = (r: string) => {
    setRegraEstado(r);
    onChange?.(r);
  };
  const editar = (m: Partial<RegraSimples>) => {
    const base: RegraSimples = lida ?? { unidade: "MONTHLY", intervalo: 1, dias: [], ordem: null, diaMes: "MO" };
    setRegra(montarRegra({ ...base, ...m }));
  };

  if (bruta) {
    return (
      <div className="space-y-1">
        <Input
          name={name}
          value={regra}
          onChange={(e) => setRegra(e.target.value)}
          placeholder="RRULE, ex.: FREQ=MONTHLY;BYMONTHDAY=10"
        />
        <p className="text-xs text-slate-500">Regra avançada (formato do Google Agenda).</p>
      </div>
    );
  }

  if (!personalizar) {
    return (
      <Select
        name={name}
        value={regra}
        onChange={(e) => {
          if (e.target.value === "__outra") {
            setPersonalizar(true);
            if (!regra) setRegra("FREQ=MONTHLY;BYDAY=1MO");
          } else setRegra(e.target.value);
        }}
      >
        {permitirNenhuma && <option value="">Não repete (uma vez só)</option>}
        {RECORRENCIAS_PRONTAS.map((r) => (
          <option key={r.regra} value={r.regra}>
            {r.rotulo}
          </option>
        ))}
        <option value="__outra">Personalizar...</option>
      </Select>
    );
  }

  const r = lida ?? { unidade: "MONTHLY" as Unidade, intervalo: 1, dias: [], ordem: null, diaMes: "MO" };
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3">
      <input type="hidden" name={name} value={regra} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>A cada</span>
        <Input
          type="number"
          min={1}
          max={99}
          className="w-20!"
          value={r.intervalo}
          onChange={(e) => editar({ intervalo: Math.max(1, Math.min(99, Number(e.target.value) || 1)) })}
        />
        <Select
          className="w-auto!"
          value={r.unidade}
          onChange={(e) => editar({ unidade: e.target.value as Unidade, dias: [], ordem: null })}
        >
          {UNIDADES.map((u) => (
            <option key={u.valor} value={u.valor}>
              {r.intervalo > 1 ? u.plural : u.rotulo}
            </option>
          ))}
        </Select>
      </div>

      {r.unidade === "WEEKLY" && (
        <div className="flex flex-wrap gap-1.5">
          {DIAS_SEMANA.map((d) => {
            const ligado = r.dias.includes(d.codigo);
            return (
              <button
                key={d.codigo}
                type="button"
                onClick={() => editar({ dias: ligado ? r.dias.filter((x) => x !== d.codigo) : [...r.dias, d.codigo] })}
                className={`rounded-full border px-3 py-1 text-sm ${
                  ligado ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
                }`}
              >
                {d.curto}
              </button>
            );
          })}
        </div>
      )}

      {r.unidade === "MONTHLY" && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select
            className="w-auto!"
            value={r.ordem === null ? "dia" : "ordem"}
            onChange={(e) => editar({ ordem: e.target.value === "dia" ? null : 1 })}
          >
            <option value="dia">No mesmo dia do mês</option>
            <option value="ordem">Num dia da semana do mês</option>
          </Select>
          {r.ordem !== null && (
            <>
              <Select className="w-auto!" value={r.ordem} onChange={(e) => editar({ ordem: Number(e.target.value) })}>
                {ORDENS_MES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </Select>
              <Select className="w-auto!" value={r.diaMes} onChange={(e) => editar({ diaMes: e.target.value })}>
                {DIAS_SEMANA.map((d) => (
                  <option key={d.codigo} value={d.codigo}>
                    {d.nome}
                  </option>
                ))}
              </Select>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {regra ? descreverRecorrencia(regra) : ""}
          {r.unidade === "WEEKLY" && !r.dias.length ? " (no dia da semana da data inicial)" : ""}
        </span>
        <button
          type="button"
          className="text-blue-600"
          onClick={() => {
            setPersonalizar(false);
            if (!RECORRENCIAS_PRONTAS.some((p) => p.regra === regra)) setRegra(permitirNenhuma ? "" : "FREQ=DAILY");
          }}
        >
          Voltar à lista
        </button>
      </div>
    </div>
  );
}
