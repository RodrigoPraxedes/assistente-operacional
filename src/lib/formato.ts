// Datas sempre exibidas no fuso da empresa
export function formatarDataHora(iso: string | null | undefined, fuso = "America/Sao_Paulo") {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: fuso,
  }).format(new Date(iso));
}

export function formatarData(iso: string | null | undefined, fuso = "America/Sao_Paulo") {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: fuso }).format(new Date(iso));
}

// Data sem hora ("2026-10-13", coluna date) → "13/10/2026"
export function formatarDia(data: string | null | undefined) {
  if (!data) return "";
  const [y, m, d] = data.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// Converte "2026-10-13T14:30" (horário local da empresa) para ISO em UTC
export function localParaUtc(valor: string, fuso: string): string {
  const [data, hora = "00:00"] = valor.split("T");
  const [y, m, d] = data.split("-").map(Number);
  const [h, mi] = hora.split(":").map(Number);
  return horaLocalParaUtc(y, m, d, h, mi, fuso).toISOString();
}

// Converte um ISO em UTC para o formato do <input type="datetime-local"> no fuso da empresa
export function utcParaLocalInput(iso: string | null, fuso: string): string {
  if (!iso) return "";
  const p = partes(new Date(iso), fuso);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function partes(data: Date, fuso: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const r: Record<string, string> = {};
  for (const p of f.formatToParts(data)) r[p.type] = p.value;
  return r as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

// Diferença (ms) entre o horário de parede no fuso e UTC naquele instante
function offsetMs(instante: number, fuso: string) {
  const p = partes(new Date(instante), fuso);
  const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return comoUtc - Math.floor(instante / 1000) * 1000;
}

// Horário de parede (no fuso da empresa) → instante real
export function horaLocalParaUtc(y: number, m: number, d: number, h: number, mi: number, fuso: string) {
  const chute = Date.UTC(y, m - 1, d, h, mi);
  let instante = chute - offsetMs(chute, fuso);
  // reconfere (muda se cair numa troca de horário de verão)
  instante = chute - offsetMs(instante, fuso);
  return new Date(instante);
}

// Data de hoje (AAAA-MM-DD) no fuso da empresa
export function hojeNoFuso(fuso: string, base = new Date()) {
  const p = partes(base, fuso);
  return { y: +p.year, m: +p.month, d: +p.day };
}

export function soDigitos(valor: string | null | undefined) {
  return (valor ?? "").replace(/\D/g, "");
}
