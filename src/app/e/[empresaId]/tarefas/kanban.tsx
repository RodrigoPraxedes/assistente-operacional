"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { formatarDataHora, utcParaLocalInput } from "@/lib/formato";
import { ORIGENS, type Status, type Tarefa } from "@/lib/types";
import { Botao, Etiqueta, Input, Textarea } from "@/components/ui";
import { moverTarefa, retornarTarefa } from "./actions";

interface Props {
  empresaId: string;
  fuso: string;
  status: Status[];
  tarefas: Tarefa[];
  nomes: { membros: Record<string, string>; unidades: Record<string, string> };
  podeMover: boolean;
  // etiquetas extras por tarefa (ex.: prioridade e número do chamado)
  etiquetas?: Record<string, { texto: string; cor?: string }[]>;
}

// chamados abrem na própria página; o resto no detalhe da tarefa
const linkDe = (empresaId: string, t: Tarefa) =>
  t.origem === "chamado" ? `/e/${empresaId}/chamados/${t.id}` : `/e/${empresaId}/tarefas/${t.id}`;

export function Kanban({ empresaId, fuso, status, tarefas: iniciais, nomes, podeMover, etiquetas }: Props) {
  const [tarefas, setTarefas] = useState(iniciais);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [adiando, setAdiando] = useState<{ tarefa: Tarefa; statusId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setTarefas(iniciais), [iniciais]);

  const tipoDe = (statusId: string) => status.find((s) => s.id === statusId)?.tipo;
  const agora = Date.now();

  function aplicar(tarefaId: string, statusId: string, prazo?: string) {
    setTarefas((ts) =>
      ts.map((t) =>
        t.id === tarefaId
          ? {
              ...t,
              status_anterior_id: tipoDe(statusId) === "adiado" ? t.status_id : null,
              status_id: statusId,
              prazo: prazo ?? t.prazo,
            }
          : t,
      ),
    );
  }

  function mover(tarefa: Tarefa, statusId: string) {
    if (tarefa.status_id === statusId) return;
    if (tipoDe(statusId) === "adiado") {
      setAdiando({ tarefa, statusId });
      return;
    }
    const anterior = tarefas;
    aplicar(tarefa.id, statusId);
    startTransition(async () => {
      const r = await moverTarefa(empresaId, tarefa.id, statusId);
      if (r.erro) {
        setTarefas(anterior);
        setErro(r.erro);
      }
    });
  }

  function retornar(tarefa: Tarefa) {
    if (!tarefa.status_anterior_id) return;
    const anterior = tarefas;
    aplicar(tarefa.id, tarefa.status_anterior_id);
    startTransition(async () => {
      const r = await retornarTarefa(empresaId, tarefa.id);
      if (r.erro) {
        setTarefas(anterior);
        setErro(r.erro);
      }
    });
  }

  return (
    <>
      {erro && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {erro}
          <button onClick={() => setErro(null)} className="ml-4 text-red-600">
            fechar
          </button>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4">
        {status.map((s) => {
          const daColuna = tarefas.filter((t) => t.status_id === s.id);
          return (
            <section
              key={s.id}
              className="flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-2"
              onDragOver={(e) => podeMover && e.preventDefault()}
              onDrop={() => {
                const t = tarefas.find((x) => x.id === arrastando);
                if (t) mover(t, s.id);
                setArrastando(null);
              }}
            >
              <header className="mb-2 flex items-center justify-between px-1">
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.cor }} />
                  {s.nome}
                </span>
                <span className="text-xs text-slate-500">{daColuna.length}</span>
              </header>

              <div className="flex min-h-16 flex-col gap-2">
                {daColuna.map((t) => {
                  const aberta = ["aberto", "em_andamento"].includes(s.tipo);
                  const atrasada = aberta && t.prazo && new Date(t.prazo).getTime() < agora;
                  return (
                    <article
                      key={t.id}
                      draggable={podeMover}
                      onDragStart={() => setArrastando(t.id)}
                      className={`rounded-lg border bg-superficie p-3 text-sm shadow-sm ${atrasada ? "border-red-300" : "border-slate-200"} ${podeMover ? "cursor-grab" : ""}`}
                    >
                      <Link href={linkDe(empresaId, t)} className="font-medium text-slate-900 hover:text-blue-700">
                        {t.titulo}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {etiquetas?.[t.id]?.map((e) => (
                          <Etiqueta key={e.texto} cor={e.cor}>
                            {e.texto}
                          </Etiqueta>
                        ))}
                        {t.origem !== "avulsa" && !etiquetas?.[t.id] && <Etiqueta cor="#7c3aed">{ORIGENS[t.origem]}</Etiqueta>}
                        {t.unidade_id && <Etiqueta>{nomes.unidades[t.unidade_id]}</Etiqueta>}
                        {atrasada && <Etiqueta cor="#dc2626">Atrasada</Etiqueta>}
                      </div>
                      <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                        {t.responsavel_id && <p>Responsável: {nomes.membros[t.responsavel_id]}</p>}
                        {t.prazo && <p>Prazo: {formatarDataHora(t.prazo, fuso)}</p>}
                      </div>
                      {podeMover && (
                        <div className="mt-2 flex items-center gap-2">
                          <select
                            aria-label="Mover para"
                            value={t.status_id}
                            onChange={(e) => mover(t, e.target.value)}
                            className="min-w-0 flex-1 rounded border border-slate-200 bg-superficie px-1 py-1 text-xs"
                          >
                            {status.map((o) => (
                              <option key={o.id} value={o.id}>
                                {o.nome}
                              </option>
                            ))}
                          </select>
                          {s.tipo === "adiado" && t.status_anterior_id && (
                            <button onClick={() => retornar(t)} className="text-xs font-medium text-blue-600">
                              Retornar
                            </button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {adiando && (
        <DialogoAdiar
          tarefa={adiando.tarefa}
          fuso={fuso}
          onCancelar={() => setAdiando(null)}
          onConfirmar={(prazo, comentario) => {
            const { tarefa, statusId } = adiando;
            setAdiando(null);
            const anterior = tarefas;
            aplicar(tarefa.id, statusId);
            startTransition(async () => {
              const r = await moverTarefa(empresaId, tarefa.id, statusId, prazo, comentario);
              if (r.erro) {
                setTarefas(anterior);
                setErro(r.erro);
              }
            });
          }}
        />
      )}
    </>
  );
}

function DialogoAdiar({
  tarefa,
  fuso,
  onCancelar,
  onConfirmar,
}: {
  tarefa: Tarefa;
  fuso: string;
  onCancelar: () => void;
  onConfirmar: (prazo: string, comentario: string) => void;
}) {
  const [prazo, setPrazo] = useState("");
  const [comentario, setComentario] = useState("");
  const atual = utcParaLocalInput(tarefa.prazo, fuso);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4">
      <form
        className="w-full max-w-sm space-y-3 rounded-xl bg-superficie p-5 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (prazo && prazo !== atual) onConfirmar(prazo, comentario);
        }}
      >
        <h2 className="font-semibold">Adiar &quot;{tarefa.titulo}&quot;</h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Nova data</span>
          <Input type="datetime-local" required value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Motivo (opcional)</span>
          <Textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} />
        </label>
        {prazo && prazo === atual && <p className="text-xs text-red-600">Escolha uma data diferente do prazo atual.</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="secundario" onClick={onCancelar}>
            Cancelar
          </Botao>
          <Botao type="submit">Adiar</Botao>
        </div>
      </form>
    </div>
  );
}
