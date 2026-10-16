// Opções prontas para a tela (o usuário não precisa saber RRULE).
// "Toda semana", mensais e anuais usam o dia da data de início; "A cada N dias" conta a partir dela;
// "Às segundas" etc. são dia fixo da semana, independente da data de início.
export const RECORRENCIAS_PRONTAS = [
  { regra: "FREQ=DAILY", rotulo: "Todos os dias" },
  { regra: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", rotulo: "Dias úteis (seg a sex)" },
  { regra: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA", rotulo: "Segunda a sábado" },
  { regra: "FREQ=WEEKLY;BYDAY=SA,SU", rotulo: "Fins de semana" },
  { regra: "FREQ=WEEKLY", rotulo: "Toda semana (mesmo dia da semana do início)" },
  { regra: "FREQ=DAILY;INTERVAL=2", rotulo: "A cada 2 dias" },
  { regra: "FREQ=DAILY;INTERVAL=3", rotulo: "A cada 3 dias" },
  { regra: "FREQ=DAILY;INTERVAL=4", rotulo: "A cada 4 dias" },
  { regra: "FREQ=DAILY;INTERVAL=10", rotulo: "A cada 10 dias" },
  { regra: "FREQ=DAILY;INTERVAL=15", rotulo: "A cada 15 dias" },
  { regra: "FREQ=WEEKLY;BYDAY=MO", rotulo: "Às segundas" },
  { regra: "FREQ=WEEKLY;BYDAY=TU", rotulo: "Às terças" },
  { regra: "FREQ=WEEKLY;BYDAY=WE", rotulo: "Às quartas" },
  { regra: "FREQ=WEEKLY;BYDAY=TH", rotulo: "Às quintas" },
  { regra: "FREQ=WEEKLY;BYDAY=FR", rotulo: "Às sextas" },
  { regra: "FREQ=WEEKLY;BYDAY=SA", rotulo: "Aos sábados" },
  { regra: "FREQ=WEEKLY;BYDAY=SU", rotulo: "Aos domingos" },
  { regra: "FREQ=WEEKLY;INTERVAL=2", rotulo: "A cada 2 semanas" },
  { regra: "FREQ=MONTHLY", rotulo: "Todo mês (mesmo dia do início)" },
  { regra: "FREQ=MONTHLY;INTERVAL=3", rotulo: "A cada 3 meses" },
  { regra: "FREQ=MONTHLY;INTERVAL=6", rotulo: "A cada 6 meses" },
  { regra: "FREQ=YEARLY", rotulo: "Todo ano" },
] as const;

export function descreverRecorrencia(regra: string | null) {
  if (!regra) return "Uma vez";
  const pronta = RECORRENCIAS_PRONTAS.find((r) => r.regra === regra);
  return pronta?.rotulo ?? regra;
}
