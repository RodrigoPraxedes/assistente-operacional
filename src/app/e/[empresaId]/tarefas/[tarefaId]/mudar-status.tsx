"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Botao, Input, Select } from "@/components/ui";
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
}: {
  empresaId: string;
  tarefaId: string;
  statusAtualId: string;
  anteriorNome: string | null;
  opcoes: Opcao[];
}) {
  const router = useRouter();
  const [novo, setNovo] = useState("");
  const [prazo, setPrazo] = useState("");
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  const tipo = opcoes.find((o) => o.id === novo)?.tipo;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!novo) return;
    if (tipo === "adiado" && !prazo) return setErro("Informe a nova data para adiar");
    if (tipo === "cancelado" && !comentario.trim()) return setErro("Informe o motivo do cancelamento");
    startTransition(async () => {
      const r = await moverTarefa(empresaId, tarefaId, novo, tipo === "adiado" ? prazo : undefined, comentario.trim());
      if (r.erro) return setErro(r.erro);
      setNovo("");
      setPrazo("");
      setComentario("");
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
    <form onSubmit={enviar} className="space-y-2 border-t border-slate-200 pt-3" data-atual={statusAtualId}>
      <label className="block text-sm font-medium text-slate-700" htmlFor="novo-status">
        Mudar status
      </label>
      {erro && <Aviso>{erro}</Aviso>}
      <div className="flex flex-wrap gap-2">
        <Select id="novo-status" value={novo} onChange={(e) => setNovo(e.target.value)} className="min-w-0 flex-1">
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
      {novo && (
        <Input
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder={tipo === "cancelado" ? "Motivo do cancelamento (obrigatório)" : "Comentário (opcional)"}
          required={tipo === "cancelado"}
        />
      )}
      {novo && <Botao disabled={pendente}>{pendente ? "Salvando…" : "Atualizar status"}</Botao>}
    </form>
  );
}
