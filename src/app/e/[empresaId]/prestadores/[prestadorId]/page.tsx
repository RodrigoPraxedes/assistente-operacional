import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { formatarData } from "@/lib/formato";
import type { Fornecedor, TipoServico } from "@/lib/types";
import { Aviso, Cartao, Titulo } from "@/components/ui";
import { FormPrestador } from "../form-prestador";

interface Atendimento {
  tarefa_id: string;
  numero: number;
  custo: number | null;
  tarefas: { titulo: string; created_at: string; concluida_em: string | null };
}

export default async function EditarPrestador({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; prestadorId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, prestadorId } = await params;
  const { erro } = await searchParams;
  const { supabase, empresa } = await exigirPermissao(empresaId, "prestadores.gerenciar");

  const [{ data: prestador }, { data: tipos }, { data: marcados }, { data: chamados }] = await Promise.all([
    supabase.from("fornecedores").select("*").eq("id", prestadorId).eq("empresa_id", empresaId).maybeSingle<Fornecedor>(),
    supabase.from("tipos_servico").select("*").eq("empresa_id", empresaId).order("nome").returns<TipoServico[]>(),
    supabase.from("fornecedor_tipos").select("tipo_id").eq("fornecedor_id", prestadorId),
    supabase
      .from("chamados")
      .select("tarefa_id, numero, custo, tarefas!inner(titulo, created_at, concluida_em)")
      .eq("empresa_id", empresaId)
      .eq("fornecedor_id", prestadorId)
      .order("numero", { ascending: false })
      .limit(100)
      .returns<Atendimento[]>(),
  ]);
  if (!prestador) notFound();

  const lista = chamados ?? [];
  const total = lista.reduce((s, c) => s + Number(c.custo ?? 0), 0);
  const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/prestadores`, rotulo: "Prestadores" }}>{prestador.nome}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <FormPrestador
        empresaId={empresaId}
        prestador={prestador}
        tipos={tipos ?? []}
        marcados={(marcados ?? []).map((m) => m.tipo_id as string)}
      />

      <Cartao className="space-y-3">
        <h2 id="chamados" className="font-medium">
          Chamados atendidos
        </h2>
        {lista.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum chamado ainda. Para registrar, escolha este prestador no chamado de manutenção.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-slate-100 text-sm">
              {lista.map((c) => (
                <li key={c.tarefa_id}>
                  <Link
                    href={`/e/${empresaId}/chamados/${c.tarefa_id}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 hover:text-blue-700"
                  >
                    <span className="text-slate-500">#{c.numero}</span>
                    <span className="min-w-0 flex-1 text-slate-800">{c.tarefas.titulo}</span>
                    <span className="text-xs text-slate-500">
                      {c.tarefas.concluida_em
                        ? `Concluído em ${formatarData(c.tarefas.concluida_em, empresa.fuso_horario)}`
                        : `Aberto em ${formatarData(c.tarefas.created_at, empresa.fuso_horario)}`}
                    </span>
                    {c.custo != null && <span className="text-xs text-slate-700">{moeda(Number(c.custo))}</span>}
                  </Link>
                </li>
              ))}
            </ul>
            {total > 0 && <p className="text-sm text-slate-600">Total gasto: {moeda(total)}</p>}
          </>
        )}
      </Cartao>
    </div>
  );
}
