import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { PRIORIDADES, type Chamado, type Status, type Tarefa } from "@/lib/types";
import { LinkBotao, Select, Titulo } from "@/components/ui";
import { Kanban } from "../tarefas/kanban";

export default async function PaginaChamados({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ unidade?: string; equipamento?: string; prioridade?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const seteDiasAtras = new Date(Date.now() - 7 * 86_400_000).toISOString();

  let consulta = supabase
    .from("chamados")
    .select("*, tarefas!inner(*)")
    .eq("empresa_id", empresaId)
    .or(`concluida_em.is.null,concluida_em.gte.${seteDiasAtras}`, { referencedTable: "tarefas" })
    .order("numero", { ascending: false })
    .limit(300);
  if (filtros.unidade) consulta = consulta.eq("tarefas.unidade_id", filtros.unidade);
  if (filtros.equipamento) consulta = consulta.eq("equipamento_id", filtros.equipamento);
  if (filtros.prioridade) consulta = consulta.eq("prioridade", filtros.prioridade);

  const [{ data: status }, { data: chamados }, { data: membros }, { data: unidades }, { data: equipamentos }] =
    await Promise.all([
      supabase
        .from("status")
        .select("*")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .or("modulo.is.null,modulo.eq.chamado")
        .order("ordem"),
      consulta.returns<(Chamado & { tarefas: Tarefa })[]>(),
      supabase.from("membros").select("id, nome").eq("empresa_id", empresaId),
      supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("equipamentos").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    ]);

  const lista = chamados ?? [];
  const etiquetas = Object.fromEntries(
    lista.map((c) => [
      c.tarefa_id,
      [
        { texto: `#${c.numero}`, cor: "#475569" },
        { texto: PRIORIDADES[c.prioridade].rotulo, cor: PRIORIDADES[c.prioridade].cor },
      ],
    ]),
  );

  return (
    <div>
      <Titulo
        acoes={
          <>
            <LinkBotao variante="secundario" href={`/e/${empresaId}/prestadores`}>
              Prestadores
            </LinkBotao>
            <LinkBotao variante="secundario" href={`/e/${empresaId}/patrimonio`}>
              Patrimônio
            </LinkBotao>
            {pode("chamados.abrir") && <LinkBotao href={`/e/${empresaId}/chamados/novo`}>Abrir chamado</LinkBotao>}
          </>
        }
      >
        Manutenções
      </Titulo>

      <form className="mb-4 flex flex-wrap items-end gap-2">
        <Select name="prioridade" defaultValue={filtros.prioridade ?? ""} className="w-auto">
          <option value="">Todas as prioridades</option>
          {Object.entries(PRIORIDADES).map(([k, v]) => (
            <option key={k} value={k}>
              {v.rotulo}
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
        {(equipamentos?.length ?? 0) > 0 && (
          <Select name="equipamento" defaultValue={filtros.equipamento ?? ""} className="w-auto">
            <option value="">Todos os equipamentos</option>
            {equipamentos!.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Select>
        )}
        <button className="rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm">Filtrar</button>
        {(filtros.unidade || filtros.equipamento || filtros.prioridade) && (
          <Link href={`/e/${empresaId}/chamados`} className="px-2 py-2 text-sm text-slate-500">
            Limpar
          </Link>
        )}
      </form>

      <Kanban
        empresaId={empresaId}
        fuso={empresa.fuso_horario}
        status={(status ?? []) as Status[]}
        tarefas={lista.map((c) => c.tarefas)}
        nomes={{
          membros: Object.fromEntries((membros ?? []).map((m) => [m.id, m.nome])),
          unidades: Object.fromEntries((unidades ?? []).map((u) => [u.id, u.nome])),
        }}
        podeMover={pode("tarefas.mudar_status")}
        etiquetas={etiquetas}
      />
    </div>
  );
}
