"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Botao, Input, Select, Textarea } from "@/components/ui";
import { utcParaLocalInput } from "@/lib/formato";
import { moverTarefa, retornarTarefa } from "../actions";

interface Opcao {
  id: string;
  nome: string;
  tipo: string;
}

export function MudarStatus({
  empresaId,
  tarefaId,
  statusAtualId,
  anteriorNome,
  opcoes,
  chamado,
}: {
  empresaId: string;
  tarefaId: string;
  statusAtualId: string;
  anteriorNome: string | null;
  opcoes: Opcao[];
  // Só no chamado: data/hora do ato (pode ser retroativa), valor e solução ao concluir
  chamado?: { fuso: string; custo: number | null; solucao: string | null };
}) {
  const router = useRouter();
  const [novo, setNovo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [comentario, setComentario] = useState("");
  const [quando, setQuando] = useState("");
  const [custo, setCusto] = useState(chamado?.custo != null ? String(chamado.custo) : "");
  const [solucao, setSolucao] = useState(chamado?.solucao ?? "");
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const tipo = opcoes.find((o) => o.id === novo)?.tipo;

  const concluindoChamado = !!chamado && tipo === "concluido";
  const faltando = [!custo.trim() && "o valor", !solucao.trim() && "a descrição da solução"].filter(Boolean) as string[];

  function escolher(id: string) {
    setNovo(id);
    // o ato acontece agora, mas o registro pode ser retroativo
    if (chamado && id && !quando) setQuando(utcParaLocalInput(new Date().toISOString(), chamado.fuso));
  }

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!novo) return;
    if (tipo === "adiado" && !prazo) return setErro("Informe a nova data para adiar");
    if (tipo === "cancelado" && !comentario.trim()) return setErro("Informe o motivo do cancelamento");
    if (concluindoChamado && faltando.length) return setConfirmar(true);
    gravar();
  }

  function gravar() {
    setConfirmar(false);
    startTransition(async () => {
      const valor = Number(custo.replace(",", "."));
      const r = await moverTarefa(
        empresaId,
        tarefaId,
        novo,
        tipo === "adiado" ? prazo : undefined,
        comentario.trim(),
        chamado ? quando : undefined,
        concluindoChamado ? { descricao: solucao.trim(), custo: custo.trim() && !Number.isNaN(valor) ? valor : null } : undefined,
      );
      if (r.erro) return setErro(r.erro);
      setNovo("");
      setPrazo("");
      setComentario("");
      setQuando("");
      router.refresh();
    });
  }

  function retornar() {
    setErro(null);
    startTransition(async () => {
      const r = await retornarTarefa(empresaId, tarefaId);
      if (r.erro) return setErro(r.erro);
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-2 rounded-lg border-2 border-l-[6px] border-blue-500 bg-blue-50 p-3" data-atual={statusAtualId}>
      <label className="block text-sm font-medium text-slate-700" htmlFor="novo-status">
        Mudar status
      </label>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Select id="novo-status" value={novo} onChange={(e) => escolher(e.target.value)} className="min-w-0 flex-1">
          <option value="">Escolha o novo status</option>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.nome}
            </option>
          ))}
        </Select>
        {anteriorNome && (
          <Botao type="button" variante="secundario" onClick={retornar} disabled={pendente}>
            Retornar a {anteriorNome}
          </Botao>
        )}
      </div>
      {tipo === "adiado" && (
        <Input type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} title="Nova data" required />
      )}
      {chamado && novo && (
        <label className="block text-sm text-slate-700">
          Data e hora do ato
          <Input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} required />
        </label>
      )}
      {concluindoChamado && (
        <>
          <label className="block text-sm text-slate-700">
            Valor gasto (R$)
            <Input type="number" step="0.01" min="0" value={custo} onChange={(e) => setCusto(e.target.value)} />
          </label>
          <label className="block text-sm text-slate-700">
            Solução do caso
            <Textarea rows={3} value={solucao} onChange={(e) => setSolucao(e.target.value)} placeholder="O que foi feito para resolver" />
          </label>
        </>
      )}
      {novo && (
        <Input
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder={tipo === "cancelado" ? "Motivo do cancelamento (obrigatório)" : "Comentário (opcional)"}
          required={tipo === "cancelado"}
        />
      )}
      {novo && <Botao disabled={pendente}>{pendente ? "Salvando…" : "Atualizar status"}</Botao>}
      {confirmar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm space-y-3 rounded-xl bg-superficie p-4 shadow-xl">
            <h3 className="font-medium text-slate-900">Salvar sem descrição de solução e valor?</h3>
            <p className="text-sm text-slate-600">Falta informar {faltando.join(" e ")}.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setConfirmar(false)}>
                Voltar e preencher
              </Botao>
              <Botao type="button" onClick={gravar}>
                Salvar assim mesmo
              </Botao>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
