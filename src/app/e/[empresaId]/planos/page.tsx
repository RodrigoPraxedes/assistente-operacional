import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { formatarDia, hojeNoFuso } from "@/lib/formato";
import { HORIZONTES, SITUACOES_PLANO, type Plano } from "@/lib/types";
import { Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";
import { BarraProgresso, contarEtapas } from "./progresso";

export default async function PaginaPlanos({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ todos?: string }>;
}) {
  const { empresaId } = await params;
  const { todos } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);

  const [{ data: planos }, { data: etapas }, { data: status }, { data: membros }] = await Promise.all([
    supabase.from("planos").select("*").eq("empresa_id", empresaId).order("fim_previsto", { nullsFirst: false }),
    supabase.from("tarefas").select("origem_id, status_id").eq("empresa_id", empresaId).eq("origem", "plano"),
    supabase.from("status").select("id, tipo").eq("empresa_id", empresaId),
    supabase.from("membros").select("id, nome").eq("empresa_id", empresaId),
  ]);
  const tipo = new Map((status ?? []).map((s) => [s.id, s.tipo as string]));
  const nome = new Map((membros ?? []).map((m) => [m.id, m.nome]));
  const h = hojeNoFuso(empresa.fuso_horario);
  const hoje = `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;

  const lista = ((planos ?? []) as Plano[]).filter(
    (p) => todos || (p.situacao !== "concluido" && p.situacao !== "cancelado"),
  );
  const encerrados = (planos ?? []).length - lista.length;

  return (
    <div className="space-y-4">
      <Titulo acoes={pode("planos.editar") && <LinkBotao href={`/e/${empresaId}/planos/novo`}>Novo plano</LinkBotao>}>
        Planos de médio e longo prazo
      </Titulo>
      <p className="text-sm text-slate-500">
        Projetos que levam meses e têm várias etapas, uma dependendo da outra (ex.: reforma do letreiro). Cada etapa vira
        uma tarefa no Kanban para o responsável e a equipe dela.
      </p>

      {lista.length === 0 ? (
        <Vazio>
          {encerrados > 0 ? "Nenhum plano em aberto." : "Nenhum plano cadastrado."} Ex.: reforma do letreiro, troca do
          sistema de exaustão, abertura de nova unidade.
        </Vazio>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((p) => {
            const conta = contarEtapas(
              (etapas ?? []).filter((e) => e.origem_id === p.id).map((e) => tipo.get(e.status_id)),
            );
            const situacao = SITUACOES_PLANO[p.situacao];
            const atrasado =
              p.fim_previsto && p.fim_previsto < hoje && p.situacao !== "concluido" && p.situacao !== "cancelado";
            return (
              <li key={p.id}>
                <Link
                  href={`/e/${empresaId}/planos/${p.id}`}
                  className="block space-y-3 rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm transition-colors duration-150 hover:border-blue-300"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-slate-900">{p.nome}</p>
                    <div className="flex flex-wrap gap-1">
                      <Etiqueta cor={situacao.cor}>{situacao.rotulo}</Etiqueta>
                      {atrasado && <Etiqueta cor="#dc2626">Atrasado</Etiqueta>}
                      {p.privado && <Etiqueta>Privado</Etiqueta>}
                    </div>
                  </div>
                  <BarraProgresso conta={conta} />
                  <p className="text-xs text-slate-500">
                    {HORIZONTES[p.horizonte].rotulo}
                    {p.fim_previsto && ` · até ${formatarDia(p.fim_previsto)}`}
                    {p.responsavel_id && ` · ${nome.get(p.responsavel_id) ?? ""}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {encerrados > 0 && !todos && (
        <Link href={`/e/${empresaId}/planos?todos=1`} className="inline-block text-sm text-blue-700">
          Ver também os {encerrados} concluídos ou cancelados
        </Link>
      )}
      {todos && (
        <Link href={`/e/${empresaId}/planos`} className="inline-block text-sm text-blue-700">
          Ver só os em aberto
        </Link>
      )}
    </div>
  );
}
