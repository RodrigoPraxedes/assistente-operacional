import { hojeNoFuso } from "@/lib/formato";

// "2026-10-21" de hoje no fuso da empresa
export function dataDeHoje(fuso: string) {
  const h = hojeNoFuso(fuso);
  return `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;
}

// soma dias a uma data "AAAA-MM-DD"
export function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// dia da semana de uma data "AAAA-MM-DD": 1 = segunda ... 7 = domingo
export function diaDaSemana(data: string) {
  const d = new Date(`${data}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

// dia seguinte da semana: 1 (seg) ... 7 (dom) → 2 ... 7, 1
export const diaSeguinte = (dia: number) => (dia % 7) + 1;

// meta do item no dia da semana (1..7); null = sem meta
export function metaDoDia(metas: (number | null)[] | null | undefined, dia: number) {
  const v = metas?.[dia - 1];
  return v === null || v === undefined ? null : Number(v);
}

// 12 → "12", 2.5 → "2,5"; vazio → "—"
export function formatarQtd(v: number | string | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(v));
}

// rótulo do item com a unidade de medida: "Frango assado (unidades)"
export const rotuloItem = (i: { nome: string; unidade_medida: string | null }) =>
  i.unidade_medida ? `${i.nome} (${i.unidade_medida})` : i.nome;
