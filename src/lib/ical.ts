// Arquivo de calendário no formato iCal (RFC 5545), o que o Google Agenda,
// o iPhone e o Outlook leem quando a pessoa assina um calendário por link.

export interface EventoIcal {
  uid: string;
  titulo: string;
  descricao?: string | null;
  local?: string | null;
  url?: string | null;
  // com horário (instantes) ou o dia todo ("AAAA-MM-DD", fim exclusivo)
  inicio: Date | string;
  fim: Date | string;
}

// texto: \ ; , e quebras de linha precisam de escape
const escapar = (t: string) =>
  t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// 20261014T083000Z
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

const dia = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

// linhas com no máximo 75 bytes; a continuação começa com um espaço
function dobrar(linha: string) {
  const bytes = new TextEncoder();
  if (bytes.encode(linha).length <= 75) return linha;
  const partes: string[] = [];
  let atual = "";
  let limite = 75;
  for (const c of linha) {
    if (bytes.encode(atual + c).length > limite) {
      partes.push(atual);
      atual = "";
      limite = 74; // o espaço inicial conta
    }
    atual += c;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

function data(campo: "DTSTART" | "DTEND", valor: Date | string) {
  return typeof valor === "string" ? `${campo};VALUE=DATE:${dia(valor)}` : `${campo}:${utc(valor)}`;
}

export function montarIcal({ nome, fuso, eventos }: { nome: string; fuso: string; eventos: EventoIcal[] }) {
  const agora = utc(new Date());
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Atalaia//Agenda//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapar(nome)}`,
    `X-WR-TIMEZONE:${fuso}`,
    // pedido para atualizar a cada hora (cada aplicativo decide quando busca)
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of eventos) {
    linhas.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${agora}`,
      data("DTSTART", e.inicio),
      data("DTEND", e.fim),
      `SUMMARY:${escapar(e.titulo)}`,
    );
    if (e.descricao) linhas.push(`DESCRIPTION:${escapar(e.descricao)}`);
    if (e.local) linhas.push(`LOCATION:${escapar(e.local)}`);
    if (e.url) linhas.push(`URL:${e.url}`);
    linhas.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  linhas.push("END:VCALENDAR");
  return linhas.map(dobrar).join("\r\n") + "\r\n";
}
