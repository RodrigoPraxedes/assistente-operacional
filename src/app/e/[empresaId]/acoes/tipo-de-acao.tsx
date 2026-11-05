import Link from "next/link";
import { CalendarClock, Repeat } from "lucide-react";

// Nova ação: escolhe entre a ação que vira tarefa no dia e a que avisa antes de um vencimento.
// Os dois cadastros moram em Ações; cada um guarda do seu jeito.
export function TipoDeAcao({
  empresaId,
  atual,
  podeAcao,
  podeVencimento,
  manutencao = false,
}: {
  empresaId: string;
  atual: "acao" | "vencimento";
  podeAcao: boolean;
  podeVencimento: boolean;
  // aberto de Manutenções › Ações recorrentes: os dois formulários continuam lá
  manutencao?: boolean;
}) {
  const q = manutencao ? "?manutencao=1" : "";
  const opcoes = [
    {
      chave: "acao" as const,
      pode: podeAcao,
      href: `/e/${empresaId}/acoes/novo${q}`,
      icone: Repeat,
      titulo: "Tarefa no dia",
      texto: "Repete (todo dia, a cada 15 dias, a cada 4 meses...) e vira tarefa no dia marcado, com prazo.",
    },
    {
      chave: "vencimento" as const,
      pode: podeVencimento,
      href: `/e/${empresaId}/alertas/novo${q}`,
      icone: CalendarClock,
      titulo: "Avisos antes do vencimento",
      texto: "Uma data que não pode passar (licença, extintores, Dia das Mães). Cria tarefas X dias antes.",
    },
  ].filter((o) => o.pode);
  if (opcoes.length < 2) return null;

  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Tipo de ação">
      {opcoes.map((o) => {
        const ativo = o.chave === atual;
        const Icone = o.icone;
        return (
          <Link
            key={o.chave}
            href={o.href}
            role="radio"
            aria-checked={ativo}
            className={`rounded-xl border p-3 text-sm ${
              ativo ? "border-blue-600 bg-blue-50 ring-1 ring-blue-600" : "border-slate-200 bg-superficie hover:bg-slate-50"
            }`}
          >
            <span className={`flex items-center gap-2 font-medium ${ativo ? "text-blue-700" : "text-slate-800"}`}>
              <Icone className="h-4 w-4" aria-hidden /> {o.titulo}
            </span>
            <span className="mt-1 block text-xs text-slate-500">{o.texto}</span>
          </Link>
        );
      })}
    </div>
  );
}
