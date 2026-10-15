"use client";

import { excluirTarefa } from "../actions";
import { Botao } from "@/components/ui";

export function BotaoExcluir({ empresaId, tarefaId }: { empresaId: string; tarefaId: string }) {
  return (
    <Botao
      variante="perigo"
      onClick={async () => {
        if (!confirm("Excluir de vez? Some do Kanban e do histórico.")) return;
        const r = await excluirTarefa(empresaId, tarefaId);
        if (r?.erro) alert(r.erro);
      }}
    >
      Excluir
    </Botao>
  );
}
