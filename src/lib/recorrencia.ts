import { RRule } from "rrule";
import { hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
export { RECORRENCIAS_PRONTAS, descreverRecorrencia } from "@/lib/recorrencias-prontas";

// Motor único de recorrência. Regras no formato RRULE (o mesmo do Google Agenda),
// interpretadas no horário de parede do fuso da empresa.
//
// Truque: o rrule trabalha em UTC, então tratamos o horário local como se fosse
// UTC ("horário flutuante") e só no fim convertemos para o instante real no fuso.

export interface RegraRecorrencia {
  regra: string; // ex.: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR"
  horario: string; // "HH:MM" ou "HH:MM:SS"
  inicio: Date; // âncora da regra (ex.: data de criação), importa para INTERVAL
  fuso: string;
}

export function ocorrencias({ regra, horario, inicio, fuso }: RegraRecorrencia, dias: number, base = new Date()) {
  const [h, mi] = horario.split(":").map(Number);
  const ancora = hojeNoFuso(fuso, inicio);
  const hoje = hojeNoFuso(fuso, base);

  const opcoes = RRule.parseString(regra.replace(/^RRULE:/i, ""));
  const rule = new RRule({
    ...opcoes,
    dtstart: new Date(Date.UTC(ancora.y, ancora.m - 1, ancora.d, h, mi)),
  });

  const de = new Date(Date.UTC(hoje.y, hoje.m - 1, hoje.d, 0, 0));
  const ate = new Date(Date.UTC(hoje.y, hoje.m - 1, hoje.d + dias, 23, 59));

  return rule.between(de, ate, true).map((flutuante) =>
    horaLocalParaUtc(
      flutuante.getUTCFullYear(),
      flutuante.getUTCMonth() + 1,
      flutuante.getUTCDate(),
      flutuante.getUTCHours(),
      flutuante.getUTCMinutes(),
      fuso,
    ),
  );
}

export function regraValida(regra: string) {
  try {
    const o = RRule.parseString(regra.replace(/^RRULE:/i, ""));
    return o.freq !== undefined;
  } catch {
    return false;
  }
}
