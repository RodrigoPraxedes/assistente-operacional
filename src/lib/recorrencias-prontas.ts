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
  { regra: "FREQ=MONTHLY;INTERVAL=4", rotulo: "A cada 4 meses" },
  { regra: "FREQ=MONTHLY;INTERVAL=5", rotulo: "A cada 5 meses" },
  { regra: "FREQ=MONTHLY;INTERVAL=6", rotulo: "A cada 6 meses" },
  { regra: "FREQ=YEARLY", rotulo: "Todo ano" },
] as const;

export const DIAS_SEMANA = [
  { codigo: "MO", nome: "segunda-feira", curto: "seg", feminino: false },
  { codigo: "TU", nome: "terça-feira", curto: "ter", feminino: false },
  { codigo: "WE", nome: "quarta-feira", curto: "qua", feminino: false },
  { codigo: "TH", nome: "quinta-feira", curto: "qui", feminino: false },
  { codigo: "FR", nome: "sexta-feira", curto: "sex", feminino: false },
  { codigo: "SA", nome: "sábado", curto: "sáb", feminino: false },
  { codigo: "SU", nome: "domingo", curto: "dom", feminino: false },
] as const;

export const ORDENS_MES = [
  { valor: 1, rotulo: "1ª" },
  { valor: 2, rotulo: "2ª" },
  { valor: 3, rotulo: "3ª" },
  { valor: 4, rotulo: "4ª" },
  { valor: -1, rotulo: "última" },
] as const;

export type Unidade = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export interface RegraSimples {
  unidade: Unidade;
  intervalo: number;
  dias: string[]; // semanal: ["MO","TH"]
  ordem: number | null; // mensal: 1..4 ou -1 (última); null = mesmo dia do mês
  diaMes: string; // mensal com ordem: "MO".."SU"
}

// Lê regras no formato que a tela monta; devolve null para o que ela não sabe editar
export function lerRegra(regra: string): RegraSimples | null {
  const partes: Record<string, string> = {};
  for (const p of regra.replace(/^RRULE:/i, "").split(";")) {
    const [k, v] = p.split("=");
    if (!k || v === undefined) return null;
    partes[k.toUpperCase()] = v.toUpperCase();
  }
  const unidade = partes.FREQ as Unidade;
  if (!["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(unidade)) return null;
  const permitidas = unidade === "WEEKLY" || unidade === "MONTHLY" ? ["FREQ", "INTERVAL", "BYDAY"] : ["FREQ", "INTERVAL"];
  if (Object.keys(partes).some((k) => !permitidas.includes(k))) return null;
  const intervalo = partes.INTERVAL ? Number(partes.INTERVAL) : 1;
  if (!Number.isInteger(intervalo) || intervalo < 1) return null;
  const codigos: string[] = DIAS_SEMANA.map((d) => d.codigo);
  const r: RegraSimples = { unidade, intervalo, dias: [], ordem: null, diaMes: "MO" };
  if (partes.BYDAY && unidade === "WEEKLY") {
    r.dias = partes.BYDAY.split(",");
    if (r.dias.some((d) => !codigos.includes(d))) return null;
  } else if (partes.BYDAY) {
    const m = /^(-1|[1-4])([A-Z]{2})$/.exec(partes.BYDAY);
    if (!m || !codigos.includes(m[2])) return null;
    r.ordem = Number(m[1]);
    r.diaMes = m[2];
  }
  return r;
}

export function montarRegra(r: RegraSimples) {
  let s = `FREQ=${r.unidade}`;
  if (r.intervalo > 1) s += `;INTERVAL=${r.intervalo}`;
  if (r.unidade === "WEEKLY" && r.dias.length) {
    s += `;BYDAY=${DIAS_SEMANA.map((d) => d.codigo).filter((c) => r.dias.includes(c)).join(",")}`;
  }
  if (r.unidade === "MONTHLY" && r.ordem !== null) s += `;BYDAY=${r.ordem}${r.diaMes}`;
  return s;
}

const NOME_UNIDADE = {
  DAILY: ["dia", "dias"],
  WEEKLY: ["semana", "semanas"],
  MONTHLY: ["mês", "meses"],
  YEARLY: ["ano", "anos"],
} as const;

export function descreverRecorrencia(regra: string | null) {
  if (!regra) return "Uma vez";
  const pronta = RECORRENCIAS_PRONTAS.find((r) => r.regra === regra);
  if (pronta) return pronta.rotulo;
  const r = lerRegra(regra);
  if (!r) return regra;
  const [um, varios] = NOME_UNIDADE[r.unidade];
  const cada = r.intervalo > 1 ? `A cada ${r.intervalo} ${varios}` : null;
  if (r.unidade === "MONTHLY" && r.ordem !== null) {
    const ordem = ORDENS_MES.find((o) => o.valor === r.ordem)?.rotulo ?? "";
    const dia = DIAS_SEMANA.find((d) => d.codigo === r.diaMes)?.nome ?? "";
    const ult = r.ordem === -1;
    const artigo = ult ? "na última" : `na ${ordem}`;
    const genero = ["SA", "SU"].includes(r.diaMes) ? (ult ? "no último" : `no ${ordem.replace("ª", "º")}`) : artigo;
    return `${genero} ${dia} do mês${cada ? ` (${cada.toLowerCase()})` : ""}`;
  }
  if (r.unidade === "WEEKLY" && r.dias.length) {
    const dias = DIAS_SEMANA.filter((d) => r.dias.includes(d.codigo)).map((d) => d.curto).join(", ");
    return `${cada ?? "Toda semana"} (${dias})`;
  }
  return cada ?? `${r.unidade === "WEEKLY" ? "Toda" : "Todo"} ${um}`;
}
