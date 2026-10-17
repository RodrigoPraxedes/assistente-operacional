import { hojeNoFuso } from "@/lib/formato";

export const DIAS_SEMANA = [
  { n: 1, curto: "Seg", longo: "Segunda" },
  { n: 2, curto: "Ter", longo: "Terça" },
  { n: 3, curto: "Qua", longo: "Quarta" },
  { n: 4, curto: "Qui", longo: "Quinta" },
  { n: 5, curto: "Sex", longo: "Sexta" },
  { n: 6, curto: "Sáb", longo: "Sábado" },
  { n: 7, curto: "Dom", longo: "Domingo" },
];

// dia da semana de hoje no fuso da empresa: 1 = segunda ... 7 = domingo
export function diaDeHoje(fuso: string) {
  const h = hojeNoFuso(fuso);
  const d = new Date(Date.UTC(h.y, h.m - 1, h.d)).getUTCDay();
  return d === 0 ? 7 : d;
}

// "Todos os dias", "Seg a Sex", "Seg, Qua, Sex"
export function rotuloDias(dias: number[]) {
  const ord = [...new Set(dias)].sort((a, b) => a - b);
  if (ord.length === 7) return "Todos os dias";
  const seguidos = ord.length > 2 && ord.every((n, i) => i === 0 || n === ord[i - 1] + 1);
  const nome = (n: number) => DIAS_SEMANA[n - 1].curto;
  return seguidos ? `${nome(ord[0])} a ${nome(ord[ord.length - 1])}` : ord.map(nome).join(", ");
}

// um passo por linha; tira numeração e marcadores digitados à mão
export function passosDe(descricao: string | null) {
  return (descricao ?? "")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, "").trim())
    .filter(Boolean);
}
