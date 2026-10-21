import type { Tarefa } from "@/lib/types";

// formulário do check-list (ou da contagem) de uma tarefa do Kanban (o envio conclui a tarefa do dia)
export const linkPreencher = (empresaId: string, t: Pick<Tarefa, "origem" | "origem_id" | "unidade_id" | "titulo">) => {
  const unidade: Record<string, string> = t.unidade_id ? { unidade: t.unidade_id } : {};
  if (t.origem === "contagem") {
    // o título da tarefa termina com " · <turno>" quando a contagem tem turnos
    const turno = t.titulo.includes(" · ") ? t.titulo.slice(t.titulo.lastIndexOf(" · ") + 3) : "";
    return `/e/${empresaId}/contagens/${t.origem_id}/preencher?${new URLSearchParams({
      ...unidade,
      ...(turno ? { turno } : {}),
      de: "tarefas",
    })}`;
  }
  return `/e/${empresaId}/checklists/${t.origem_id}/preencher?${new URLSearchParams({ ...unidade, de: "tarefas" })}`;
};

// origens que se concluem preenchendo um formulário (só vão para Concluído pelo envio ou pelo sistema)
export const viaFormulario = (origem: string) => origem === "checklist" || origem === "contagem";
