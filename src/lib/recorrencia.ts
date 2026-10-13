import { RRule } from "rrule";
import { hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
export { RECORRENCIAS_PRONTAS, descreverRecorrencia } from "@/lib/recorrencias-prontas";

// Motor único de recorrência. Regras no formato RRULE (o mesmo do Google Agenda),
// interpretadas no horário de parede do fuso da empresa.
//
// Truque: o rrule trabalha em UTC, então tratamos o horário local como se fosse
// UTC ("horário flutuante") e só no fim convertemos para o instante real no fuso.

export interface RegraRecorrencia {
  regra: string | null; // ex.: "FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR". null = acontece uma vez só
  horario: string; // "HH:MM" ou "HH:MM:SS"
  // âncora da regra: instante (ex.: data de criação) ou data local "AAAA-MM-DD".
  // Importa para INTERVAL e é a data da ocorrência única.
  inicio: Date | string;
  fim?: string | null; // última data local "AAAA-MM-DD" (inclusive)
  fuso: string;
}

type DataLocal = { y: number; m: number; d: number };

function dataLocal(valor: Date | string, fuso: string): DataLocal {
  if (typeof valor === "string") {
    const [y, m, d] = valor.slice(0, 10).split("-").map(Number);
    return { y, m, d };
  }
  return hojeNoFuso(fuso, valor);
}

// Ocorrências de hoje até "dias" à frente, como instantes reais (UTC)
export function ocorrencias({ regra, horario, inicio, fim, fuso }: RegraRecorrencia, dias: number, base = new Date()) {
  const [h, mi] = horario.split(":").map(Number);
  const ancora = dataLocal(inicio, fuso);
  const hoje = hojeNoFuso(fuso, base);

  const dtstart = new Date(Date.UTC(ancora.y, ancora.m - 1, ancora.d, h, mi));
  const de = new Date(Date.UTC(hoje.y, hoje.m - 1, hoje.d, 0, 0));
  let ate = new Date(Date.UTC(hoje.y, hoje.m - 1, hoje.d + dias, 23, 59));
  if (fim) {
    const f = dataLocal(fim, fuso);
    const limite = new Date(Date.UTC(f.y, f.m - 1, f.d, 23, 59));
    if (limite < ate) ate = limite;
  }

  let flutuantes: Date[];
  if (!regra) {
    flutuantes = dtstart >= de && dtstart <= ate ? [dtstart] : [];
  } else {
    const rule = new RRule({
      ...RRule.parseString(regra.replace(/^RRULE:/i, "")),
      dtstart,
    });
    flutuantes = ate < de ? [] : rule.between(de, ate, true);
  }

  return flutuantes.map((f) =>
    horaLocalParaUtc(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate(), f.getUTCHours(), f.getUTCMinutes(), fuso),
  );
}

// Próxima ocorrência a partir de hoje (para mostrar na tela), procurando até ~2 anos
export function proximaOcorrencia(r: RegraRecorrencia, base = new Date()) {
  try {
    return ocorrencias(r, 730, base)[0] ?? null;
  } catch {
    return null;
  }
}

export function regraValida(regra: string) {
  try {
    const o = RRule.parseString(regra.replace(/^RRULE:/i, ""));
    return o.freq !== undefined;
  } catch {
    return false;
  }
}

// Alertas: para cada data do evento nos próximos dias, o momento em que a tarefa
// deve aparecer ("diasAntes" antes, no mesmo horário). Se o aviso já devia ter
// aparecido (alerta criado em cima da hora), o momento fica no passado e a
// tarefa nasce atrasada em vez de ser esquecida.
export function avisosDeAlerta(
  evento: Omit<RegraRecorrencia, "fim">,
  diasAntes: number,
  diasAFrente: number,
  base = new Date(),
) {
  const [h, mi] = evento.horario.split(":").map(Number);
  return ocorrencias(evento, diasAntes + diasAFrente, base).map((data) => {
    const l = hojeNoFuso(evento.fuso, data);
    const d = new Date(Date.UTC(l.y, l.m - 1, l.d - diasAntes));
    return {
      evento: data,
      quando: horaLocalParaUtc(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h, mi, evento.fuso),
    };
  });
}
