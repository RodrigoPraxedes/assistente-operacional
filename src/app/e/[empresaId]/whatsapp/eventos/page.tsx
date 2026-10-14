import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { SITUACAO_EVENTO, TIPO_EVENTO } from "@/lib/whatsapp-api/rotulos";
import { Cartao, Etiqueta, Vazio } from "@/components/ui";

interface Evento {
  id: string;
  tipo: string;
  situacao: string;
  repeticoes: number;
  resumo: Record<string, unknown>;
  erro: string | null;
  recebido_em: string;
  processado_em: string | null;
}

// Saúde da integração: só contagens e resumos sem conteúdo pessoal
export default async function Eventos({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  if (!pode("whatsapp.gerenciar")) notFound();
  const desde = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const { data: eventos } = await supabase
    .from("whatsapp_eventos")
    .select("id, tipo, situacao, repeticoes, resumo, erro, recebido_em, processado_em")
    .eq("empresa_id", empresaId)
    .gte("recebido_em", desde)
    .order("recebido_em", { ascending: false })
    .limit(500)
    .returns<Evento[]>();
  const lista = eventos ?? [];
  const contar = (s: string) => lista.filter((e) => e.situacao === s).length;
  const numeros = [
    { rotulo: "Recebidos", valor: lista.length },
    { rotulo: "Processados", valor: contar("processado") },
    { rotulo: "Ignorados", valor: contar("ignorado") },
    { rotulo: "Duplicados", valor: lista.reduce((t, e) => t + e.repeticoes, 0) },
    { rotulo: "Falhas", valor: contar("falhou"), alerta: true },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {numeros.map((n) => (
          <Cartao key={n.rotulo} className="p-3">
            <p className="text-xs text-slate-500">{n.rotulo}</p>
            <p className={`text-2xl font-semibold ${n.alerta && n.valor > 0 ? "text-red-600" : "text-slate-900"}`}>{n.valor}</p>
          </Cartao>
        ))}
      </div>
      <p className="text-xs text-slate-500">Últimos 7 dias. Duplicados = entregas repetidas do mesmo evento, contadas e descartadas.</p>

      {!lista.length && <Vazio>Nenhum evento recebido nos últimos 7 dias.</Vazio>}
      <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-superficie">
        {lista.slice(0, 100).map((e) => {
          const s = SITUACAO_EVENTO[e.situacao] ?? SITUACAO_EVENTO.recebido;
          return (
            <li key={e.id}>
              <details>
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span className="font-medium text-slate-900">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span>
                  <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
                  {e.repeticoes > 0 && <Etiqueta>+{e.repeticoes} repetido</Etiqueta>}
                  <span className="ml-auto text-xs text-slate-500">{formatarDataHora(e.recebido_em, empresa.fuso_horario)}</span>
                </summary>
                <div className="space-y-2 px-4 pb-3 text-xs">
                  {e.erro && <p className="text-slate-600">{e.erro}</p>}
                  <pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-slate-700">{JSON.stringify(e.resumo, null, 2)}</pre>
                  {e.processado_em && <p className="text-slate-500">Processado em {formatarDataHora(e.processado_em, empresa.fuso_horario)}</p>}
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
