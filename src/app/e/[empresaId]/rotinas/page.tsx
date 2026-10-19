import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { DIAS_SEMANA, diaDeHoje, passosDe, rotuloDias } from "@/lib/rotinas";
import type { Rotina } from "@/lib/types";
import { Aviso, Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";
import { BotaoImprimir } from "../acoes/semana/botao-imprimir";
import { FiltrosRotinas } from "./filtros-rotinas";

export default async function PaginaRotinas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ dia?: string; setor?: string; funcao?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const podeEditar = pode("rotinas.editar");

  const [{ data: rotinas, error: erroRotinas }, { data: setores }, { data: funcoes }, { data: unidades }] = await Promise.all([
    supabase.from("rotinas").select("*").eq("empresa_id", empresaId).eq("ativo", true).order("horario").order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("funcoes").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId),
  ]);
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));
  const nomeFuncao = new Map((funcoes ?? []).map((f) => [f.id as string, f.nome as string]));
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id as string, u.nome as string]));
  const varias = (unidades ?? []).length > 1;

  const semana = filtros.dia === "semana";
  const hoje = diaDeHoje(empresa.fuso_horario);
  const dia = semana ? 0 : DIAS_SEMANA.some((d) => String(d.n) === filtros.dia) ? Number(filtros.dia) : hoje;
  const valorDia = semana ? "semana" : String(dia);

  const selecionados = (filtros.setor ?? "").split(",").filter((id) => nomeSetor.has(id));
  // 2 ou mais setores marcados: uma coluna por setor, lado a lado em cada horário
  const grade = !semana && selecionados.length >= 2;
  const colunas = (setores ?? []).filter((s) => selecionados.includes(s.id));

  const lista = ((rotinas ?? []) as Rotina[]).filter(
    (r) =>
      (selecionados.length === 0 || (r.setor_id !== null && selecionados.includes(r.setor_id))) &&
      (!filtros.funcao || r.funcao_id === filtros.funcao) &&
      (semana || r.dias.includes(dia)),
  );

  // o dia escolhido, agrupado por horário
  const porHorario = new Map<string, Rotina[]>();
  for (const r of lista) {
    const h = r.horario.slice(0, 5);
    porHorario.set(h, [...(porHorario.get(h) ?? []), r]);
  }

  const quem = (r: Rotina) => [r.funcao_id ? nomeFuncao.get(r.funcao_id) : null, r.setor_id ? nomeSetor.get(r.setor_id) : null];
  const tituloImpressao = semana ? "Rotinas da semana" : `Rotinas de ${DIAS_SEMANA[dia - 1].longo.toLowerCase()}`;

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Titulo
          acoes={
            podeEditar && (
              <>
                <LinkBotao variante="secundario" href={`/e/${empresaId}/rotinas/importar`}>
                  Importar planilha
                </LinkBotao>
                <LinkBotao href={`/e/${empresaId}/rotinas/novo`}>Nova rotina</LinkBotao>
              </>
            )
          }
        >
          Rotinas
        </Titulo>
        <p className="text-sm text-slate-500">
          O cronograma da operação: o que precisa estar pronto em cada horário e quem responde por isso. É uma referência,
          não cria tarefas. Para cobrar com prazo e responsável, use Ações.
        </p>
      </div>
      <h1 className="hidden text-xl font-semibold print:block">
        {tituloImpressao} · {empresa.nome}
      </h1>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <FiltrosRotinas
          dia={valorDia}
          setor={selecionados.join(",")}
          funcao={filtros.funcao ?? ""}
          setores={setores ?? []}
          funcoes={funcoes ?? []}
        />
        <div className="ml-auto">
          <BotaoImprimir />
        </div>
      </div>

      {erroRotinas ? (
        <Aviso>Não foi possível carregar as rotinas: {erroRotinas.message}</Aviso>
      ) : lista.length === 0 ? (
        <Vazio>
          {(rotinas ?? []).length === 0
            ? podeEditar
              ? "Nenhuma rotina cadastrada. Toque em Nova rotina para começar."
              : "Nenhuma rotina cadastrada."
            : "Nenhuma rotina para esse filtro."}
        </Vazio>
      ) : semana ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Hora</th>
                <th className="px-3 py-2">Atividade</th>
                <th className="px-3 py-2">Função</th>
                {DIAS_SEMANA.map((d) => (
                  <th key={d.n} className={`px-2 py-2 text-center ${d.n === hoje ? "text-blue-600" : ""}`}>
                    {d.curto}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lista.map((r) => (
                <tr key={r.id} className="print:break-inside-avoid">
                  <td className="whitespace-nowrap px-3 py-2 font-medium">{r.horario.slice(0, 5)}</td>
                  <td className="px-3 py-2">
                    {podeEditar ? (
                      <Link href={`/e/${empresaId}/rotinas/${r.id}`} className="text-blue-700 print:text-slate-900">
                        {r.nome}
                      </Link>
                    ) : (
                      r.nome
                    )}
                    {quem(r)[1] && <span className="block text-xs text-slate-500">{quem(r)[1]}</span>}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{quem(r)[0] ?? "—"}</td>
                  {DIAS_SEMANA.map((d) => (
                    <td key={d.n} className="px-2 py-2 text-center text-blue-600">
                      {r.dias.includes(d.n) ? "●" : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : grade ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
          <table className="w-full min-w-max table-fixed border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="sticky left-0 w-16 bg-slate-50 px-3 py-2">Hora</th>
                {colunas.map((c) => (
                  <th key={c.id} className="w-64 px-3 py-2">
                    {c.nome}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...porHorario.entries()].map(([hora, itens]) => (
                <tr key={hora} className="align-top print:break-inside-avoid">
                  <td className="sticky left-0 bg-superficie px-3 py-3 text-sm font-semibold text-slate-700">{hora}</td>
                  {colunas.map((c) => (
                    <td key={c.id} className="space-y-2 px-2 py-2">
                      {itens
                        .filter((r) => r.setor_id === c.id)
                        .map((r) => {
                          const passos = passosDe(r.descricao);
                          const [funcao] = quem(r);
                          return (
                            <div key={r.id} className="rounded-lg border border-slate-200 p-2">
                              <span className="font-medium text-slate-900">{r.nome}</span>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {funcao && <Etiqueta cor="#2563eb">{funcao}</Etiqueta>}
                                {r.dias.length < 7 && <span className="text-xs text-slate-500">{rotuloDias(r.dias)}</span>}
                                {podeEditar && (
                                  <Link href={`/e/${empresaId}/rotinas/${r.id}`} className="ml-auto text-xs text-blue-600 print:hidden">
                                    Editar
                                  </Link>
                                )}
                              </div>
                              {passos.length > 0 && (
                                <details className="mt-1 print:hidden">
                                  <summary className="cursor-pointer text-xs text-blue-600">Passo a passo ({passos.length})</summary>
                                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                                    {passos.map((p, i) => (
                                      <li key={i}>{p}</li>
                                    ))}
                                  </ol>
                                </details>
                              )}
                            </div>
                          );
                        })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {[...porHorario.entries()].map(([hora, itens]) => (
            <section key={hora} className="flex gap-3 print:break-inside-avoid">
              <h2 className="w-14 shrink-0 pt-3 text-sm font-semibold text-slate-700">{hora}</h2>
              <ul className="min-w-0 flex-1 space-y-2">
                {itens.map((r) => {
                  const passos = passosDe(r.descricao);
                  const [funcao, setor] = quem(r);
                  return (
                    <li key={r.id} className="rounded-xl border border-slate-200 bg-superficie p-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium text-slate-900">{r.nome}</span>
                        {funcao && <Etiqueta cor="#2563eb">{funcao}</Etiqueta>}
                        {setor && <Etiqueta>{setor}</Etiqueta>}
                        {varias && r.unidade_id && <Etiqueta>{nomeUnidade.get(r.unidade_id) ?? ""}</Etiqueta>}
                        {r.dias.length < 7 && <span className="text-xs text-slate-500">{rotuloDias(r.dias)}</span>}
                        {podeEditar && (
                          <Link
                            href={`/e/${empresaId}/rotinas/${r.id}`}
                            className="ml-auto text-xs text-blue-600 print:hidden"
                          >
                            Editar
                          </Link>
                        )}
                      </div>
                      {passos.length > 0 && (
                        <>
                          <details className="mt-2 print:hidden">
                            <summary className="cursor-pointer text-xs text-blue-600">
                              Passo a passo ({passos.length})
                            </summary>
                            <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                              {passos.map((p, i) => (
                                <li key={i}>{p}</li>
                              ))}
                            </ol>
                          </details>
                          <ol className="mt-1 hidden list-decimal space-y-0.5 pl-5 text-xs text-slate-700 print:block">
                            {passos.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ol>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
