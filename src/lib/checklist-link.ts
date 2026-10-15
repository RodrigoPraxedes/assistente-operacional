import type { Tarefa } from "@/lib/types";

// formulário do check-list de uma tarefa do Kanban (o envio conclui a tarefa do dia)
export const linkPreencher = (empresaId: string, t: Pick<Tarefa, "origem_id" | "unidade_id">) =>
  `/e/${empresaId}/checklists/${t.origem_id}/preencher?${new URLSearchParams({
    ...(t.unidade_id ? { unidade: t.unidade_id } : {}),
    de: "tarefas",
  })}`;
