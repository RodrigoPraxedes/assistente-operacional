import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { descreverRecorrencia, proximaOcorrencia } from "@/lib/recorrencia";
import { formatarData, hojeNoFuso } from "@/lib/formato";
import type { Alerta, AlertaAviso } from "@/lib/types";
import { Aviso, Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";

const DIA = 86_400_000;

export default async function PaginaAlertas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { empresaId } = await params;
  const { salvo } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);

  const [{ data: alertas }, { data: avisos }, { data: unidades }] = await Promise.all([
    supabase.from("alertas").select("*").eq("empresa_id", empresaId),
    supabase.from("alerta_avisos").select("*").eq("empresa_id", empresaId).order("dias_antes", { ascending: false }),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId),
  ]);
  const unidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const fuso = empresa.fuso_horario;
  const h = hojeNoFuso(fuso);
  const hoje = Date.UTC(h.y, h.m - 1, h.d);

  const linhas = ((alertas ?? []) as Alerta[])
    .map((a) => {
      const proxima = a.ativo
        ? proximaOcorrencia({
            regra: a.recorrencia,
            horario: a.horario,
            inicio: a.data_evento,
            fuso,
          })
        : null;
      let faltam: number | null = null;
      if (proxima) {
        const d = hojeNoFuso(fuso, proxima);
        faltam = Math.round((Date.UTC(d.y, d.m - 1, d.d) - hoje) / DIA);
      }
      return {
        a,
        proxima,
        faltam,
        avisos: ((avisos ?? []) as AlertaAviso[]).filter((v) => v.alerta_id === a.id),
      };
    })
    .sort((x, y) => (x.proxima?.getTime() ?? Infinity) - (y.proxima?.getTime() ?? Infinity));

  return (
    <div className="space-y-4">
      <Titulo
        acoes={pode("alertas.editar") && <LinkBotao href={`/e/${empresaId}/alertas/novo`}>Novo alerta</LinkBotao>}
      >
        Alertas de datas
      </Titulo>
      {salvo && <Aviso tipo="sucesso">Alerta salvo.</Aviso>}
      <p className="text-sm text-slate-500">
        Datas que não podem passar batido. Alguns dias antes, cada aviso vira uma tarefa no Kanban para o responsável.
      </p>

      {linhas.length === 0 ? (
        <Vazio>Nenhum alerta cadastrado. Ex.: vencimento do alvará, AVCB, contrato de aluguel, dedetização.</Vazio>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-superficie">
          {linhas.map(({ a, proxima, faltam, avisos: vs }) => (
            <li
              key={a.id}
              className={`flex flex-wrap items-center justify-between gap-2 p-3 text-sm ${a.ativo ? "" : "opacity-60"}`}
            >
              <div>
                {pode("alertas.editar") ? (
                  <Link href={`/e/${empresaId}/alertas/${a.id}`} className="font-medium text-blue-700">
                    {a.nome}
                  </Link>
                ) : (
                  <span className="font-medium">{a.nome}</span>
                )}
                <p className="text-xs text-slate-500">
                  {descreverRecorrencia(a.recorrencia)} · {a.unidade_id ? unidade.get(a.unidade_id) : "Empresa toda"}
                  {vs.length > 0 &&
                    ` · avisos: ${vs.map((v) => (v.dias_antes === 0 ? "no dia" : `${v.dias_antes}d`)).join(", ")}`}
                </p>
              </div>
              <div className="text-right text-xs">
                {!a.ativo ? (
                  <Etiqueta>Inativo</Etiqueta>
                ) : proxima && faltam !== null ? (
                  <div className="space-y-1">
                    <p className="text-slate-600">{formatarData(proxima.toISOString(), fuso)}</p>
                    <Etiqueta cor={faltam <= 7 ? "#dc2626" : faltam <= 30 ? "#d97706" : "#16a34a"}>
                      {faltam === 0 ? "Hoje" : faltam === 1 ? "Amanhã" : `Faltam ${faltam} dias`}
                    </Etiqueta>
                  </div>
                ) : (
                  <Etiqueta>Já passou</Etiqueta>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
