// Opções prontas para a tela (o usuário não precisa saber RRULE)
export const RECORRENCIAS_PRONTAS = [
  { regra: "FREQ=DAILY", rotulo: "Todos os dias" },
  { regra: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", rotulo: "Dias úteis (seg a sex)" },
  { regra: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA", rotulo: "Segunda a sábado" },
  { regra: "FREQ=WEEKLY;BYDAY=SA,SU", rotulo: "Fins de semana" },
  { regra: "FREQ=WEEKLY", rotulo: "Uma vez por semana (mesmo dia da criação)" },
  { regra: "FREQ=MONTHLY", rotulo: "Uma vez por mês (mesmo dia da criação)" },
] as const;

export function descreverRecorrencia(regra: string) {
  const pronta = RECORRENCIAS_PRONTAS.find((r) => r.regra === regra);
  return pronta?.rotulo ?? regra;
}
