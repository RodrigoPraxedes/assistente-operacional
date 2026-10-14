import { hojeNoFuso } from "@/lib/formato";
import { PERIODOS, type Turno } from "@/lib/types";

// Datas da escala são dias de calendário ("2026-10-13"), sem horário nem fuso.
const DIA = 86_400_000;
const NOMES_DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const paraData = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const paraIso = (d: Date) => d.toISOString().slice(0, 10);

export function hojeIso(fuso: string) {
  const h = hojeNoFuso(fuso);
  return `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;
}

export function somarDias(iso: string, n: number) {
  return paraIso(new Date(paraData(iso).getTime() + n * DIA));
}

// A semana da escala começa na segunda-feira
export function segundaDaSemana(iso: string) {
  const dia = paraData(iso).getUTCDay();
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

export function diasDaSemana(segunda: string) {
  return Array.from({ length: 7 }, (_, i) => somarDias(segunda, i));
}

export function dataValida(iso: string | undefined): iso is string {
  return !!iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && !Number.isNaN(paraData(iso).getTime());
}

// "seg 13/10"
export function rotuloDia(iso: string) {
  const d = paraData(iso);
  return `${NOMES_DIAS[d.getUTCDay()]} ${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

// "13/10 a 19/10"
export function rotuloSemana(segunda: string) {
  const fim = somarDias(segunda, 6);
  return `${segunda.slice(8, 10)}/${segunda.slice(5, 7)} a ${fim.slice(8, 10)}/${fim.slice(5, 7)}`;
}

// "06:00–14:00", ou "de manhã" no turno sem horário
export function horarioTurno(t: Pick<Turno, "inicio" | "fim" | "periodo">) {
  if (t.periodo || !t.inicio || !t.fim) return t.periodo ? PERIODOS[t.periodo].frase : "";
  return `${t.inicio.slice(0, 5)}–${t.fim.slice(0, 5)}`;
}

// ordem do dia: turnos sem horário entram no começo do seu período
const INICIO_PERIODO = { manha: "06:00", tarde: "12:00", noite: "18:00" } as const;
export function ordenarTurnos<T extends Pick<Turno, "inicio" | "periodo">>(turnos: T[]) {
  const chave = (t: T) => (t.periodo ? INICIO_PERIODO[t.periodo] : (t.inicio ?? "").slice(0, 5));
  return [...turnos].sort((a, b) => chave(a).localeCompare(chave(b)));
}
