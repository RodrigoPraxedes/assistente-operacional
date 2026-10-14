import "server-only";
import ICAL from "ical.js";
import type { EventoAgenda } from "@/lib/agenda";

// Eventos da agenda pessoal do Google, lidos pelo "endereço secreto no formato
// iCal" que a própria pessoa cola no app. Só endereços do Google são aceitos
// (o servidor não busca endereços quaisquer).

export const PREFIXO_GOOGLE = "https://calendar.google.com/calendar/ical/";

export function enderecoGoogleValido(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "calendar.google.com" && url.startsWith(PREFIXO_GOOGLE);
  } catch {
    return false;
  }
}

// limite de repetições percorridas por evento (um evento diário de 10 anos atrás)
const MAX_REPETICOES = 5000;

export async function eventosDoGoogle(url: string, de: Date, ate: Date): Promise<EventoAgenda[]> {
  if (!enderecoGoogleValido(url)) throw new Error("Endereço do Google inválido");
  // guarda por 5 minutos para não buscar a agenda inteira a cada clique
  const resposta = await fetch(url, { next: { revalidate: 300 }, signal: AbortSignal.timeout(10_000) });
  if (!resposta.ok) throw new Error(`O Google respondeu ${resposta.status}`);
  const raiz = new ICAL.Component(ICAL.parse(await resposta.text()));

  for (const fuso of raiz.getAllSubcomponents("vtimezone")) {
    ICAL.TimezoneService.register(new ICAL.Timezone(fuso));
  }

  const inicioJanela = ICAL.Time.fromJSDate(de, true);
  const fimJanela = ICAL.Time.fromJSDate(ate, true);
  const eventos = raiz.getAllSubcomponents("vevent").map((v) => new ICAL.Event(v));

  // alterações de uma ocorrência (RECURRENCE-ID) se ligam ao evento principal
  const principais = new Map<string, InstanceType<typeof ICAL.Event>>();
  for (const e of eventos) if (!e.isRecurrenceException()) principais.set(e.uid, e);
  for (const e of eventos) if (e.isRecurrenceException()) principais.get(e.uid)?.relateException(e);

  const lista: EventoAgenda[] = [];
  const adicionar = (
    uid: string,
    item: InstanceType<typeof ICAL.Event>,
    inicio: InstanceType<typeof ICAL.Time>,
    fim: InstanceType<typeof ICAL.Time>,
  ) => {
    if (item.component.getFirstPropertyValue("status") === "CANCELLED") return;
    if (inicio.compare(fimJanela) > 0 || fim.compare(inicioJanela) < 0) return;
    const diaTodo = inicio.isDate;
    lista.push({
      tipo: "google",
      uid: `google-${uid}-${inicio.toString()}`,
      titulo: item.summary || "(sem título)",
      descricao: item.description || null,
      local: item.location || null,
      inicio: diaTodo ? inicio.toString() : inicio.toJSDate(),
      fim: diaTodo ? fim.toString() : fim.toJSDate(),
    });
  };

  for (const e of principais.values()) {
    if (!e.isRecurring()) {
      adicionar(e.uid, e, e.startDate, e.endDate ?? e.startDate);
      continue;
    }
    const it = e.iterator();
    for (let n = 0, prox = it.next(); prox && n < MAX_REPETICOES; n++, prox = it.next()) {
      if (prox.compare(fimJanela) > 0) break;
      const d = e.getOccurrenceDetails(prox);
      adicionar(e.uid, d.item, d.startDate, d.endDate);
    }
  }
  return lista;
}
