import Link from "next/link";
import type { EventoAgenda, TipoEvento } from "@/lib/agenda";
import { rotuloDia } from "@/lib/escala";

// cor da barrinha à esquerda de cada compromisso
const CORES: Record<TipoEvento, string> = {
  turno: "border-blue-500 bg-blue-50",
  folga: "border-green-500 bg-green-50",
  ferias: "border-green-500 bg-green-50",
  tarefa: "border-slate-400 bg-slate-50",
  previsto: "border-slate-300 border-dashed bg-superficie",
  google: "border-slate-300 bg-slate-100",
};

const hora = (d: Date, fuso: string) =>
  new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(d);

const diaLocal = (d: Date, fuso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: fuso }).format(d);

// Semana em 7 colunas no computador; no celular, um dia embaixo do outro
export function CalendarioSemana({
  dias,
  hoje,
  eventos,
  fuso,
}: {
  dias: string[];
  hoje: string;
  eventos: EventoAgenda[];
  fuso: string;
}) {
  const doDia = (dia: string) =>
    eventos
      // dia inteiro: aparece em todos os dias do evento (o fim é exclusivo)
      .filter((e) =>
        typeof e.inicio === "string"
          ? e.inicio === dia || (e.inicio < dia && dia < (e.fim as string))
          : diaLocal(e.inicio, fuso) === dia,
      )
      // dia inteiro primeiro, depois por horário
      .sort((a, b) => (typeof a.inicio === "string" ? -1 : typeof b.inicio === "string" ? 1 : +a.inicio - +b.inicio));

  return (
    <div className="grid gap-2 lg:grid-cols-7">
      {dias.map((dia) => {
        const lista = doDia(dia);
        const ehHoje = dia === hoje;
        return (
          <section
            key={dia}
            aria-label={rotuloDia(dia)}
            className={`rounded-xl lg:min-h-24 border bg-superficie p-2 ${ehHoje ? "border-blue-500" : "border-slate-200"}`}
          >
            <h3 className={`mb-2 px-1 text-sm font-semibold ${ehHoje ? "text-blue-600" : "text-slate-700"}`}>
              {rotuloDia(dia)}
              {ehHoje && <span className="ml-1 text-xs font-normal">· hoje</span>}
            </h3>
            {lista.length === 0 ? (
              <p className="px-1 text-xs text-slate-400">Livre</p>
            ) : (
              <ul className="space-y-1.5">
                {lista.map((e) => {
                  const conteudo = (
                    <>
                      <span className="block text-xs text-slate-500">
                        {typeof e.inicio === "string"
                          ? "Dia todo"
                          : e.tipo === "turno" || e.tipo === "google"
                            ? `${hora(e.inicio, fuso)}–${hora(e.fim as Date, fuso)}`
                            : hora(e.inicio, fuso)}
                        {e.atrasada && <span className="ml-1 font-medium text-red-600">atrasada</span>}
                        {e.tipo === "previsto" && <span className="ml-1">programada</span>}
                        {e.tipo === "google" && <span className="ml-1">Google</span>}
                      </span>
                      <span
                        className={`block text-sm leading-snug text-slate-800 ${e.concluida ? "text-slate-500 line-through" : ""}`}
                      >
                        {e.titulo}
                      </span>
                      {e.local && <span className="block text-xs text-slate-500">{e.local}</span>}
                    </>
                  );
                  const classe = `block rounded-lg border-l-4 px-2 py-1.5 ${e.atrasada ? "border-red-500 bg-red-50" : CORES[e.tipo]}`;
                  return (
                    <li key={e.uid}>
                      {e.caminho ? (
                        <Link href={e.caminho} className={`${classe} hover:brightness-95`}>
                          {conteudo}
                        </Link>
                      ) : (
                        <div className={classe}>{conteudo}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
