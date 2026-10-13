import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import { ORIGENS, type Origem, type Status, type Tarefa } from "@/lib/types";
import { LinkBotao, Select, Titulo } from "@/components/ui";
import { Kanban } from "./kanban";

export default async function PaginaTarefas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ origem?: string; unidade?: string; minhas?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, empresa, membro, pode } = await getContexto(empresaId);

  // fim de hoje no fuso da empresa: ocorrências futuras (amanhã...) ficam escondidas
  const hoje = hojeNoFuso(empresa.fuso_horario);
  const fimDeHoje = horaLocalParaUtc(hoje.y, hoje.m, hoje.d, 23, 59, empresa.fuso_horario).toISOString();
  const seteDiasAtras = new Date(Date.now() - 7 * 86_400_000).toISOString();

  let consulta = supabase
    .from("tarefas")
    .select("*")
    .eq("empresa_id", empresaId)
    .or(`ocorrencia_em.is.null,ocorrencia_em.lte.${fimDeHoje}`)
    .or(`concluida_em.is.null,concluida_em.gte.${seteDiasAtras}`)
    .order("prazo", { ascending: true, nullsFirst: false })
    .limit(500);
  if (filtros.origem) consulta = consulta.eq("origem", filtros.origem);
  if (filtros.unidade) consulta = consulta.eq("unidade_id", filtros.unidade);
  if (filtros.minhas) consulta = consulta.eq("responsavel_id", membro.id);

  const [{ data: status }, { data: tarefas }, { data: membros }, { data: unidades }] = await Promise.all([
    supabase.from("status").select("*").eq("empresa_id", empresaId).eq("ativo", true).order("ordem"),
    consulta,
    supabase.from("membros").select("id, nome, telefone").eq("empresa_id", empresaId),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);

  const nomes = {
    membros: Object.fromEntries((membros ?? []).map((m) => [m.id, m.nome])),
    unidades: Object.fromEntries((unidades ?? []).map((u) => [u.id, u.nome])),
  };

  return (
    <div>
      <Titulo acoes={pode("tarefas.criar") && <LinkBotao href={`/e/${empresaId}/tarefas/nova`}>Nova tarefa</LinkBotao>}>
        Tarefas
      </Titulo>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Select name="origem" defaultValue={filtros.origem ?? ""} className="w-auto">
          <option value="">Todos os módulos</option>
          {(Object.keys(ORIGENS) as Origem[]).map((o) => (
            <option key={o} value={o}>
              {ORIGENS[o]}
            </option>
          ))}
        </Select>
        {(unidades?.length ?? 0) > 1 && (
          <Select name="unidade" defaultValue={filtros.unidade ?? ""} className="w-auto">
            <option value="">Todas as unidades</option>
            {unidades!.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        )}
        <label className="flex items-center gap-2 px-2 text-sm">
          <input type="checkbox" name="minhas" value="1" defaultChecked={!!filtros.minhas} /> Só as minhas
        </label>
        <button className="rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm">Filtrar</button>
        {(filtros.origem || filtros.unidade || filtros.minhas) && (
          <Link href={`/e/${empresaId}/tarefas`} className="px-2 py-2 text-sm text-slate-500">
            Limpar
          </Link>
        )}
      </form>

      <Kanban
        empresaId={empresaId}
        fuso={empresa.fuso_horario}
        status={((status ?? []) as Status[]).filter(
          // status de um módulo só (ex.: "Aguardando peça") aparecem aqui quando têm tarefas
          (s) => !s.modulo || (tarefas ?? []).some((t) => t.status_id === s.id),
        )}
        tarefas={(tarefas ?? []) as Tarefa[]}
        nomes={nomes}
        podeMover={pode("tarefas.mudar_status")}
      />
    </div>
  );
}
