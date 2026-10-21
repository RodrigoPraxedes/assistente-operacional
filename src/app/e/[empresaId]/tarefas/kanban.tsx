"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { ListChecks, MessageCircle } from "lucide-react";
import { linkPreencher } from "@/lib/checklist-link";
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
  // quadro (padrão) ou lista
  visao?: "kanban" | "lista";
  // colunas do quadro; sem isso, todos os status
  colunas?: Status[];
  // link do WhatsApp com a mensagem pronta, por tarefa
  whatsapp?: Record<string, string>;
  // quem pode preencher check-list ganha o atalho para o formulário
  podePreencher?: boolean;
}

// chamados abrem na própria página; o resto no detalhe da tarefa
const linkDe = (empresaId: string, t: Tarefa) =>
  t.origem === "chamado" ? `/e/${empresaId}/chamados/${t.id}` : `/e/${empresaId}/tarefas/${t.id}`;

export function Kanban({
  empresaId,
  fuso,
  status,
  tarefas: iniciais,
  nomes,
  podeMover,
  etiquetas,
  visao = "kanban",
  colunas = status,
  whatsapp,
  podePreencher = false,
}: Props) {
  const [tarefas, setTarefas] = useState(iniciais);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [adiando, setAdiando] = useState<{ tarefa: Tarefa; statusId: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => setTarefas(iniciais), [iniciais]);

  // arrastar pelo toque (celular): segurar o cartão um instante e arrastar até a coluna.
  // O arrastar nativo do navegador (draggable) só funciona com mouse.
  const [mouse, setMouse] = useState(true);
  const [toque, setToque] = useState<{ id: string; x: number; y: number; coluna: string | null } | null>(null);
  const quadro = useRef<HTMLDivElement>(null);
  const gesto = useRef<{ id: string; x: number; y: number; timer?: ReturnType<typeof setTimeout>; ativo: boolean } | null>(null);
  const soltarEm = useRef<(id: string, statusId: string) => void>(() => {});
  soltarEm.current = (id, statusId) => {
    const t = tarefas.find((x) => x.id === id);
    if (t) mover(t, statusId);
  };

  useEffect(() => {
    setMouse(window.matchMedia("(pointer: fine)").matches);
  }, []);

  useEffect(() => {
    if (!podeMover) return;
    let rolagem: number | null = null;
    let dx = 0;
    const colunaEm = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest("[data-coluna]") as HTMLElement | null)?.dataset.coluna ?? null;
    const rolar = () => {
      if (quadro.current && dx) quadro.current.scrollLeft += dx;
      rolagem = dx ? requestAnimationFrame(rolar) : null;
    };
    const parar = () => {
      if (gesto.current?.timer) clearTimeout(gesto.current.timer);
      gesto.current = null;
      dx = 0;
      setToque(null);
    };
    const aoMover = (e: TouchEvent) => {
      const g = gesto.current;
      if (!g) return;
      const { clientX: x, clientY: y } = e.touches[0];
      if (!g.ativo) {
        // mexeu antes de segurar: é rolagem normal da tela
        if (Math.hypot(x - g.x, y - g.y) > 8) parar();
        return;
      }
      e.preventDefault();
      // perto da borda do quadro, rola para os lados
      const r = quadro.current?.getBoundingClientRect();
      dx = r ? (x < r.left + 40 ? -8 : x > r.right - 40 ? 8 : 0) : 0;
      if (dx && rolagem === null) rolagem = requestAnimationFrame(rolar);
      setToque({ id: g.id, x, y, coluna: colunaEm(x, y) });
    };
    const aoSoltar = (e: TouchEvent) => {
      const g = gesto.current;
      if (g?.ativo) {
        e.preventDefault(); // não abre o link do cartão
        const { clientX: x, clientY: y } = e.changedTouches[0];
        const coluna = colunaEm(x, y);
        if (coluna) soltarEm.current(g.id, coluna);
      }
      parar();
    };
    document.addEventListener("touchmove", aoMover, { passive: false });
    document.addEventListener("touchend", aoSoltar, { passive: false });
    document.addEventListener("touchcancel", parar);
    return () => {
      document.removeEventListener("touchmove", aoMover);
      document.removeEventListener("touchend", aoSoltar);
      document.removeEventListener("touchcancel", parar);
      if (rolagem !== null) cancelAnimationFrame(rolagem);
    };
  }, [podeMover]);

  function segurar(e: React.TouchEvent, id: string) {
    if (!podeMover || e.touches.length > 1) return;
    // não começa ao tocar na caixa de status ou nos botões
    if ((e.target as HTMLElement).closest("select, button, [data-sem-arrastar]")) return;
    const { clientX: x, clientY: y } = e.touches[0];
    const g = { id, x, y, ativo: false } as NonNullable<typeof gesto.current>;
    g.timer = setTimeout(() => {
      g.ativo = true;
      navigator.vibrate?.(15);
      setToque({ id, x, y, coluna: null });
    }, 350);
    gesto.current = g;
  }

  const tipoDe = (statusId: string) => status.find((s) => s.id === statusId)?.tipo;
  const agora = Date.now();
  const atrasada = (t: Tarefa) =>
    ["aberto", "em_andamento"].includes(tipoDe(t.status_id) ?? "") && !!t.prazo && new Date(t.prazo).getTime() < agora;

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

  // check-list é feito ou não feito: só vai para Concluído
  const podeIrPara = (t: Tarefa, statusId: string) => t.origem !== "checklist" || tipoDe(statusId) === "concluido";

  function mover(tarefa: Tarefa, statusId: string) {
    if (tarefa.status_id === statusId) return;
    if (!podeIrPara(tarefa, statusId)) {
      setErro("Check-list só pode ir para Concluído (feito ou não feito)");
      return;
    }
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

  const etiquetasDe = (t: Tarefa) => (
    <>
      {etiquetas?.[t.id]?.map((e) => (
        <Etiqueta key={e.texto} cor={e.cor}>
          {e.texto}
        </Etiqueta>
      ))}
      {t.origem !== "avulsa" && !etiquetas?.[t.id] && <Etiqueta cor="#7c3aed">{ORIGENS[t.origem]}</Etiqueta>}
      {t.unidade_id && <Etiqueta>{nomes.unidades[t.unidade_id]}</Etiqueta>}
      {atrasada(t) && <Etiqueta cor="#dc2626">Atrasada</Etiqueta>}
      {t.privado && <Etiqueta>Privada</Etiqueta>}
      {t.exige_foto && !t.concluida_em && <Etiqueta>Pede foto</Etiqueta>}
    </>
  );

  // check-list ainda pendente: atalho para preencher
  const preenchivel = (t: Tarefa) =>
    podePreencher &&
    t.origem === "checklist" &&
    !!t.origem_id &&
    ["aberto", "em_andamento", "adiado"].includes(tipoDe(t.status_id) ?? "");

  // trocar status, retornar do adiado, abrir o check-list e mandar no WhatsApp
  const controles = (t: Tarefa) => {
    const atual = status.find((s) => s.id === t.status_id);
    return (
      <div className="flex items-center gap-2">
        {podeMover && !t.concluida_em ? (
          <select
            aria-label="Mover para"
            value={t.status_id}
            onChange={(e) => mover(t, e.target.value)}
            className="min-w-0 flex-1 rounded border border-slate-200 bg-superficie px-1 py-1 text-xs"
          >
            {/* status de outro módulo (ex.: "Aguardando peça" do chamado) não aparecem */}
            {status
              .filter((o) => (!o.modulo || o.modulo === t.origem || o.id === t.status_id) && (o.id === t.status_id || podeIrPara(t, o.id)))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
          </select>
        ) : (
          atual && (
            <span className="flex-1">
              <Etiqueta cor={atual.cor}>{atual.nome}</Etiqueta>
            </span>
          )
        )}
        {podeMover && atual?.tipo === "adiado" && t.status_anterior_id && (
          <button onClick={() => retornar(t)} className="text-xs font-medium text-blue-600">
            Retornar
          </button>
        )}
        {preenchivel(t) && (
          <Link
            href={linkPreencher(empresaId, t)}
            title="Abrir check-list"
            aria-label={`Abrir o check-list "${t.titulo}"`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700"
          >
            <ListChecks className="h-4 w-4" aria-hidden />
          </Link>
        )}
        {whatsapp?.[t.id] && (
          <a
            href={whatsapp[t.id]}
            target="_blank"
            rel="noopener"
            title="Enviar no WhatsApp"
            aria-label={`Enviar "${t.titulo}" no WhatsApp`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-600 text-white hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
          </a>
        )}
      </div>
    );
  };

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

      {visao === "lista" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-superficie">
          {tarefas.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Nenhuma tarefa com esses filtros.</p>
          ) : (
            <ul className="divide-y divide-slate-200">
              {tarefas.map((t) => {
                const s = status.find((x) => x.id === t.status_id);
                return (
                  <li
                    key={t.id}
                    className={`flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:gap-4 ${atrasada(t) ? "border-l-4 border-red-500 bg-red-50" : ""}`}
                  >
                    <span
                      className="hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block"
                      style={{ backgroundColor: s?.cor }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <Link href={linkDe(empresaId, t)} className="font-medium text-slate-900 hover:text-blue-700">
                        {t.titulo}
                      </Link>
                      <div className="mt-1 flex flex-wrap gap-1">{etiquetasDe(t)}</div>
                    </div>
                    <div className="space-y-0.5 text-xs text-slate-500 sm:w-48">
                      {t.responsaveis.length > 0 && <p>{rotuloResponsaveis(t, nomes.membros)}</p>}
                          {t.responsaveis.length > 1 && t.todos_concluem && (
                            <p>
                              Partes feitas: {t.partes_feitas.length} de {t.responsaveis.length}
                            </p>
                          )}
                      {t.prazo && <p>Prazo: {formatarDataHora(t.prazo, fuso)}</p>}
                    </div>
                    <div className="sm:w-56">{controles(t)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : (
        <div ref={quadro} className="flex gap-3 overflow-x-auto pb-4">
          {colunas.map((s) => {
            const daColuna = tarefas.filter((t) => t.status_id === s.id);
            return (
              <section
                key={s.id}
                data-coluna={s.id}
                className={`flex w-72 shrink-0 flex-col rounded-xl bg-slate-100 p-2 ${toque?.coluna === s.id ? "ring-2 ring-blue-500" : ""}`}
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
                    return (
                      <article
                        key={t.id}
                        draggable={podeMover && mouse && !t.concluida_em}
                        onDragStart={() => setArrastando(t.id)}
                        onTouchStart={(e) => !t.concluida_em && segurar(e, t.id)}
                        onContextMenu={(e) => toque?.id === t.id && e.preventDefault()}
                        className={`select-none rounded-lg border p-3 text-sm shadow-sm [-webkit-touch-callout:none] ${atrasada(t) ? "border-2 border-l-[6px] border-red-500 bg-red-50" : "border-slate-200 bg-superficie"} ${podeMover ? "cursor-grab" : ""} ${toque?.id === t.id ? "opacity-40" : ""}`}
                      >
                        <Link href={linkDe(empresaId, t)} className="font-medium text-slate-900 hover:text-blue-700">
                          {t.titulo}
                        </Link>
                        <div className="mt-1 flex flex-wrap gap-1">{etiquetasDe(t)}</div>
                        <div className="mt-2 space-y-0.5 text-xs text-slate-500">
                          {t.responsaveis.length > 0 && <p>{rotuloResponsaveis(t, nomes.membros)}</p>}
                          {t.responsaveis.length > 1 && t.todos_concluem && (
                            <p>
                              Partes feitas: {t.partes_feitas.length} de {t.responsaveis.length}
                            </p>
                          )}
                          {t.prazo && <p>Prazo: {formatarDataHora(t.prazo, fuso)}</p>}
                        </div>
                        {(podeMover || whatsapp?.[t.id] || preenchivel(t)) && <div className="mt-2">{controles(t)}</div>}
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {toque && (
        // cópia do cartão que segue o dedo
        <div
          className="pointer-events-none fixed z-40 w-64 -translate-x-1/2 -translate-y-1/2 rotate-2 rounded-lg border border-blue-300 bg-superficie p-3 text-sm font-medium shadow-lg"
          style={{ left: toque.x, top: toque.y }}
        >
          {tarefas.find((t) => t.id === toque.id)?.titulo}
        </div>
      )}

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

function rotuloResponsaveis(t: Tarefa, membros: Record<string, string>) {
  const lista = t.responsaveis.map((id) => membros[id]).filter(Boolean);
  return `${lista.length > 1 ? "Responsáveis" : "Responsável"}: ${lista.join(", ")}`;
}
