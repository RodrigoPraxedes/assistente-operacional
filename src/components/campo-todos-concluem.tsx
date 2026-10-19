// Chave das tarefas com 2+ responsáveis: ligada, cada um marca a sua parte e a
// tarefa conclui quando todos marcam; desligada, qualquer responsável conclui.
export function CampoTodosConcluem({ padrao = false }: { padrao?: boolean }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name="todos_concluem" defaultChecked={padrao} className="mt-1" />
      <span>
        Todos os responsáveis precisam concluir
        <span className="block text-xs text-slate-500">
          Vale só com 2 ou mais responsáveis. Desligado, qualquer um deles conclui e a tarefa fecha para todos.
        </span>
      </span>
    </label>
  );
}
