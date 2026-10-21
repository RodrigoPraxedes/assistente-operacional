"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Aviso, Botao, Input } from "@/components/ui";
import { SeletorComBusca } from "@/components/seletor-com-busca";
import { criarPrestadorRapido } from "@/app/e/[empresaId]/prestadores/actions";

type Opcao = { id: string; nome: string };

// Prestador com busca e atalho "+" para cadastrar um novo sem sair da tela (nome e telefone; o resto se completa em Prestadores)
export function SeletorPrestador({
  empresaId,
  name = "fornecedor_id",
  opcoes,
  inicial = "",
  podeCadastrar,
}: {
  empresaId: string;
  name?: string;
  opcoes: Opcao[];
  inicial?: string;
  podeCadastrar: boolean;
}) {
  const [lista, setLista] = useState(opcoes);
  const [escolhido, setEscolhido] = useState(inicial);
  const [versao, setVersao] = useState(0);
  const [novo, setNovo] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function cadastrar() {
    setErro(null);
    startTransition(async () => {
      const r = await criarPrestadorRapido(empresaId, nome, telefone);
      if ("erro" in r) return setErro(r.erro);
      setLista((l) => [...l, { id: r.id, nome: r.nome }].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      setEscolhido(r.id);
      setVersao((v) => v + 1);
      setNovo(false);
      setNome("");
      setTelefone("");
    });
  }

  const enter = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      cadastrar();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <SeletorComBusca key={versao} name={name} opcoes={lista} inicial={escolhido} className="min-w-0 flex-1" />
        {podeCadastrar && (
          <Botao type="button" variante="secundario" onClick={() => setNovo((n) => !n)} aria-label="Cadastrar novo prestador" title="Cadastrar novo prestador">
            <Plus size={16} />
          </Botao>
        )}
      </div>
      {novo && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          {erro && <Aviso>{erro}</Aviso>}
          <Input value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={enter} placeholder="Nome do prestador" />
          <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} onKeyDown={enter} placeholder="Telefone com DDD" inputMode="tel" />
          <div className="flex gap-2">
            <Botao type="button" onClick={cadastrar} disabled={pendente}>
              {pendente ? "Salvando…" : "Cadastrar e escolher"}
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setNovo(false)}>
              Cancelar
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
