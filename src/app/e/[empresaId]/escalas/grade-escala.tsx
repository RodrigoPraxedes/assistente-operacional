"use client";

import { Fragment, useActionState, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";
import { AUSENCIAS } from "@/lib/types";
import { Aviso, Botao } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { salvarGrade } from "./actions";

export interface LinhaGrade {
  id: string;
  nome: string;
  cargo: string | null;
  setor: string;
  whatsapp: string | null;
}

interface TurnoGrade {
  id: string;
  nome: string;
  horario: string;
  cor: string;
}

const AUSENCIA_KEYS = Object.keys(AUSENCIAS) as (keyof typeof AUSENCIAS)[];

// Grade da semana: uma linha por pessoa, uma coluna por dia.
// Quem pode editar escolhe o turno (ou folga/férias/falta) em cada célula e salva tudo de uma vez.
export function GradeEscala({
  empresaId,
  unidadeId,
  dias,
  hoje,
  linhas,
  turnos,
  outrosTurnos,
  valores: iniciais,
  podeEditar,
}: {
  empresaId: string;
  unidadeId: string;
  dias: { data: string; rotulo: string }[];
  hoje: string;
  linhas: LinhaGrade[];
  turnos: TurnoGrade[];
  outrosTurnos: TurnoGrade[];
  valores: Record<string, string>;
  podeEditar: boolean;
}) {
  const [valores, setValores] = useState(iniciais);
  const [estado, acao] = useActionState(salvarGrade.bind(null, empresaId, unidadeId), undefined);

  const turnoPorId = useMemo(() => new Map([...turnos, ...outrosTurnos].map((t) => [t.id, t])), [turnos, outrosTurnos]);
  const alteradas = Object.keys({ ...iniciais, ...valores })
    .filter((k) => (iniciais[k] ?? "") !== (valores[k] ?? ""))
    .map((k) => {
      const [membro, data] = k.split("|");
      return { membro, data, valor: valores[k] ?? "" };
    });

  const visual = (valor: string) => {
    if (!valor) return null;
    if (valor in AUSENCIAS) {
      const a = AUSENCIAS[valor as keyof typeof AUSENCIAS];
      return { nome: a.rotulo, detalhe: null, cor: a.cor };
    }
    const t = turnoPorId.get(valor);
    return t ? { nome: t.nome, detalhe: t.horario, cor: t.cor } : { nome: "Turno", detalhe: null, cor: "#2563eb" };
  };
  const estiloCor = (cor: string) => ({
    backgroundColor: `${cor}1f`,
    color: `color-mix(in srgb, ${cor} 70%, var(--color-slate-900))`,
  });

  // quantas pessoas trabalham em cada dia (só turnos)
  const trabalhando = dias.map(
    (d) => linhas.filter((l) => turnoPorId.has(valores[`${l.id}|${d.data}`] ?? "")).length,
  );

  let setorAnterior = "";

  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="celulas" value={JSON.stringify(alteradas)} />
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      {estado?.ok && alteradas.length === 0 && <Aviso tipo="sucesso">Escala salva.</Aviso>}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="sticky left-0 z-10 min-w-40 bg-superficie px-3 py-2 font-medium">Colaborador</th>
              {dias.map((d) => (
                <th
                  key={d.data}
                  className={`min-w-28 px-2 py-2 text-center font-medium ${d.data === hoje ? "text-blue-700" : ""}`}
                >
                  {d.data === hoje ? "Hoje" : d.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const cabecalho = l.setor !== setorAnterior;
              setorAnterior = l.setor;
              return (
                <Fragment key={l.id}>
                  {cabecalho && (
                    <tr className="bg-slate-50">
                      <td
                        colSpan={dias.length + 1}
                        className="sticky left-0 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase"
                      >
                        {l.setor}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 bg-superficie px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{l.nome}</p>
                          {l.cargo && <p className="truncate text-xs text-slate-500">{l.cargo}</p>}
                        </div>
                        {l.whatsapp && (
                          <a
                            href={l.whatsapp}
                            target="_blank"
                            rel="noreferrer"
                            title="Enviar a escala da semana pelo WhatsApp"
                            aria-label={`Enviar a escala de ${l.nome} pelo WhatsApp`}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-green-700 hover:bg-green-50"
                          >
                            <MessageCircle className="h-4 w-4" aria-hidden />
                          </a>
                        )}
                      </div>
                    </td>
                    {dias.map((d) => {
                      const chave = `${l.id}|${d.data}`;
                      const valor = valores[chave] ?? "";
                      const v = visual(valor);
                      const mudou = (iniciais[chave] ?? "") !== valor;
                      return (
                        <td key={d.data} className={`px-1 py-1.5 text-center ${d.data === hoje ? "bg-blue-50" : ""}`}>
                          {podeEditar ? (
                            <select
                              aria-label={`${l.nome}, ${d.rotulo}`}
                              value={valor}
                              onChange={(e) => setValores((x) => ({ ...x, [chave]: e.target.value }))}
                              style={v ? estiloCor(v.cor) : undefined}
                              className={`min-h-10 w-full rounded-lg border px-1.5 text-xs font-medium outline-none focus:border-blue-500 focus:ring-3 focus:ring-blue-100 ${
                                mudou ? "border-blue-500" : "border-transparent"
                              } ${v ? "" : "bg-slate-50 text-slate-400"}`}
                            >
                              <option value="">—</option>
                              <optgroup label="Turnos">
                                {turnos.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.nome} · {t.horario}
                                  </option>
                                ))}
                                {valor && !(valor in AUSENCIAS) && !turnos.some((t) => t.id === valor) && (
                                  <option value={valor}>{v?.nome} (fora de uso)</option>
                                )}
                              </optgroup>
                              <optgroup label="Ausência">
                                {AUSENCIA_KEYS.map((k) => (
                                  <option key={k} value={k}>
                                    {AUSENCIAS[k].rotulo}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                          ) : v ? (
                            <span className="block rounded-lg px-1.5 py-1 text-xs font-medium" style={estiloCor(v.cor)}>
                              {v.nome}
                              {v.detalhe && <span className="block font-normal opacity-80">{v.detalhe}</span>}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 text-xs text-slate-500">
              <td className="sticky left-0 z-10 bg-superficie px-3 py-2">Trabalhando</td>
              {trabalhando.map((n, i) => (
                <td key={dias[i].data} className="px-2 py-2 text-center font-medium">
                  {n}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {podeEditar && (
        <div className="sticky bottom-3 flex flex-wrap items-center justify-end gap-2">
          {alteradas.length > 0 && (
            <>
              <span className="rounded-lg bg-superficie px-2 py-1 text-sm text-slate-600 shadow-sm">
                {alteradas.length} alteraç{alteradas.length === 1 ? "ão" : "ões"}
              </span>
              <Botao type="button" variante="secundario" onClick={() => setValores(iniciais)}>
                Descartar
              </Botao>
            </>
          )}
          <BotaoEnviar disabled={alteradas.length === 0}>Salvar escala</BotaoEnviar>
        </div>
      )}
    </form>
  );
}
