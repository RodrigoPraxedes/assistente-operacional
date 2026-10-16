import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { descreverRecorrencia, proximaOcorrencia } from "@/lib/recorrencia";
import { formatarData, formatarDataHora } from "@/lib/formato";
import type { Acao } from "@/lib/types";
import { Aviso, Etiqueta, Input, LinkBotao, Select, Titulo, Vazio } from "@/components/ui";

export default async function PaginaAcoes({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ salvo?: string; q?: string; setor?: string; categoria?: string }>;
}) {
  const { empresaId } = await params;
  const { salvo, q, setor, categoria } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);

  const [{ data: acoes }, { data: unidades }, { data: membros }, { data: setores }, { data: categorias }] = await Promise.all([
    supabase.from("acoes").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("membros").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome").eq("empresa_id", empresaId).order("nome"),
  ]);
  const unidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const membro = new Map((membros ?? []).map((m) => [m.id, m.nome]));
  const fuso = empresa.fuso_horario;

  // busca (sem acento nem maiúsculas) e filtros de setor e categoria
  const normalizar = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const termo = normalizar((q ?? "").trim());
  const filtrando = !!(termo || setor || categoria);

  const linhas = ((acoes ?? []) as Acao[])
    .filter(
      (a) =>
        (!termo || normalizar(`${a.nome} ${a.descricao ?? ""}`).includes(termo)) &&
        (!setor || a.setor_id === setor) &&
        (!categoria || a.categoria_id === categoria),
    )
    .map((a) => ({
      a,
      proxima: a.ativo
        ? proximaOcorrencia({ regra: a.recorrencia, horario: a.horario, inicio: a.data_inicial, fim: a.data_final, fuso })
        : null,
    }))
    .sort((x, y) => (x.proxima?.getTime() ?? Infinity) - (y.proxima?.getTime() ?? Infinity));

  return (
    <div className="space-y-4">
      <Titulo acoes={pode("acoes.editar") && <LinkBotao href={`/e/${empresaId}/acoes/novo`}>Nova ação</LinkBotao>}>
        Ações recorrentes
      </Titulo>
      {salvo && <Aviso tipo="sucesso">Ação salva.</Aviso>}
      <p className="text-sm text-slate-500">
        Cada ocorrência vira uma tarefa no Kanban, que aparece no dia marcado para o responsável.
      </p>

      <form className="flex flex-wrap items-end gap-2">
        <Input name="q" type="search" defaultValue={q ?? ""} placeholder="Pesquisar ação" className="w-auto min-w-48 flex-1" />
        {(setores?.length ?? 0) > 0 && (
          <Select name="setor" defaultValue={setor ?? ""} className="w-auto">
            <option value="">Todos os setores</option>
            {setores!.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </Select>
        )}
        {(categorias?.length ?? 0) > 0 && (
          <Select name="categoria" defaultValue={categoria ?? ""} className="w-auto">
            <option value="">Todas as categorias</option>
            {categorias!.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        )}
        <button className="rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm">Filtrar</button>
        {filtrando && (
          <Link href={`/e/${empresaId}/acoes`} className="px-2 py-2 text-sm text-slate-500">
            Limpar
          </Link>
        )}
      </form>

      {linhas.length === 0 && filtrando ? (
        <Vazio>Nenhuma ação encontrada com esses filtros.</Vazio>
      ) : linhas.length === 0 ? (
        <Vazio>Nenhuma ação cadastrada. Ex.: limpeza da caixa d&apos;água a cada 6 meses, pagar aluguel todo dia 10.</Vazio>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-superficie">
          {linhas.map(({ a, proxima }) => (
            <li key={a.id} className={`flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${a.ativo ? "" : "opacity-60"}`}>
              <div>
                {pode("acoes.editar") ? (
                  <Link href={`/e/${empresaId}/acoes/${a.id}`} className="font-medium text-blue-700">
                    {a.nome}
                  </Link>
                ) : (
                  <span className="font-medium">{a.nome}</span>
                )}
                {a.privado && (
                  <>
                    {" "}
                    <Etiqueta>Privada</Etiqueta>
                  </>
                )}
                <p className="text-xs text-slate-500">
                  {descreverRecorrencia(a.recorrencia)} · {a.horario.slice(0, 5)} ·{" "}
                  {a.unidade_id ? unidade.get(a.unidade_id) : "Todas as unidades"}
                  {a.responsaveis.length > 0 && ` · ${a.responsaveis.map((id) => membro.get(id)).join(", ")}`}
                  {a.data_final && ` · até ${formatarData(`${a.data_final}T12:00:00Z`, fuso)}`}
                </p>
              </div>
              <div className="text-right text-xs">
                {!a.ativo ? (
                  <Etiqueta>Inativa</Etiqueta>
                ) : proxima ? (
                  <span className="text-slate-600">Próxima: {formatarDataHora(proxima.toISOString(), fuso)}</span>
                ) : (
                  <Etiqueta>Encerrada</Etiqueta>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
