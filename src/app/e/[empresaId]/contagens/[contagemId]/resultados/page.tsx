import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { carregarResultados, lerFiltros, somarPorDia, totalPorItem, type Valor } from "@/lib/contagem-resultados";
import { diaDaSemana, formatarQtd } from "@/lib/contagens";
import { DIAS_SEMANA } from "@/lib/rotinas";
import { formatarDia } from "@/lib/formato";
import { Aviso, Botao, Input, Select, Titulo, Vazio, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { excluirRegistro } from "../../actions";

const diaCurto = (data: string) => `${formatarDia(data).slice(0, 5)} ${DIAS_SEMANA[diaDaSemana(data) - 1].curto}`;

function hora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}

// Célula de um item: a quantidade e, com meta, quanto faltava (em vermelho)
function Celula({ v, usaMeta }: { v: Valor | undefined; usaMeta: boolean }) {
  return (
    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
      {formatarQtd(v?.quantidade)}
      {usaMeta && v?.a_fazer ? <span className="block text-xs font-medium text-red-700">−{formatarQtd(v.a_fazer)}</span> : null}
    </td>
  );
}

export default async function ResultadosContagem({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; contagemId: string }>;
  searchParams: Promise<{ de?: string; ate?: string; turno?: string; quem?: string; visao?: string; erro?: string }>;
}) {
  const { empresaId, contagemId } = await params;
  const sp = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  if (!pode("contagens.resultados") && !pode("contagens.editar")) notFound();
  const podeExcluir = pode("contagens.editar");

  const filtros = lerFiltros(sp, empresa.fuso_horario);
  const porDia = sp.visao === "dia";
  const dados = await carregarResultados(supabase, empresaId, contagemId, filtros);
  if (!dados) notFound();
  const { contagem, itens, registros } = dados;
  const dias = porDia ? somarPorDia(registros) : [];
  const total = totalPorItem(registros);

  const base = `/e/${empresaId}/contagens/${contagemId}/resultados`;
  const qs = new URLSearchParams({ de: filtros.de, ate: filtros.ate });
  if (filtros.turno) qs.set("turno", filtros.turno);
  if (filtros.quem) qs.set("quem", filtros.quem);
  const aqui = `${base}?${qs}${porDia ? "&visao=dia" : ""}`;
  const usaMeta = contagem.usa_meta;

  return (
    <div className="space-y-4">
      <Titulo
        voltar={{ href: `/e/${empresaId}/contagens`, rotulo: "Contagens" }}
        acoes={
          <a href={`${base}/excel?${qs}`} className={estilos.botaoSecundario}>
            <Download size={16} aria-hidden /> Baixar Excel
          </a>
        }
      >
        {contagem.nome}
      </Titulo>
      {sp.erro && <Aviso>{sp.erro}</Aviso>}

      <form method="get" className="flex flex-wrap items-end gap-2 text-sm">
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">De</span>
          <Input type="date" name="de" defaultValue={filtros.de} className="w-auto" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Até</span>
          <Input type="date" name="ate" defaultValue={filtros.ate} className="w-auto" />
        </label>
        {contagem.turnos.length > 0 && (
          <label className="space-y-1">
            <span className="block text-xs text-slate-500">Turno</span>
            <Select name="turno" defaultValue={filtros.turno} className="w-auto">
              <option value="">Todos</option>
              {contagem.turnos.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </label>
        )}
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Quem contou</span>
          <Input name="quem" defaultValue={filtros.quem} placeholder="Nome" className="w-36" />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-slate-500">Ver</span>
          <Select name="visao" defaultValue={porDia ? "dia" : ""} className="w-auto">
            <option value="">Cada envio</option>
            <option value="dia">Soma por dia</option>
          </Select>
        </label>
        <Botao type="submit" variante="secundario">
          Filtrar
        </Botao>
      </form>

      <p className="text-xs text-slate-500">
        {registros.length} envio(s) de {formatarDia(filtros.de)} a {formatarDia(filtros.ate)}.
        {usaMeta && ` Em vermelho, quanto faltava para a meta (${contagem.rotulo_falta.toLowerCase()}).`}
        {porDia && " Na soma por dia, o número pequeno é a diferença para o dia anterior."}
      </p>

      {registros.length === 0 ? (
        <Vazio>Nenhuma contagem nesse período.</Vazio>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2">Data</th>
                {!porDia && contagem.turnos.length > 0 && <th className="px-3 py-2">Turno</th>}
                {!porDia && <th className="px-3 py-2">Quem</th>}
                {porDia && <th className="px-3 py-2">Envios</th>}
                {itens.map((i) => (
                  <th key={i.id} className="min-w-24 px-3 py-2 text-right align-bottom font-medium">
                    {i.nome}
                    {i.unidade_medida && <span className="block font-normal text-slate-400">{i.unidade_medida}</span>}
                  </th>
                ))}
                {!porDia && <th className="min-w-40 px-3 py-2">Observação</th>}
                {!porDia && podeExcluir && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {porDia
                ? dias.map((d, k) => {
                    const anterior = dias[k + 1];
                    return (
                      <tr key={d.data}>
                        <td className="sticky left-0 bg-superficie px-3 py-2 font-medium whitespace-nowrap">{diaCurto(d.data)}</td>
                        <td className="px-3 py-2 text-slate-500">{d.envios}</td>
                        {itens.map((i) => {
                          const v = d.soma.get(i.id);
                          const ant = anterior?.soma.get(i.id)?.quantidade;
                          const dif = v?.quantidade != null && ant != null ? v.quantidade - ant : null;
                          return (
                            <td key={i.id} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                              {formatarQtd(v?.quantidade)}
                              {dif ? (
                                <span className={`block text-xs ${dif > 0 ? "text-green-700" : "text-slate-500"}`}>
                                  {dif > 0 ? "+" : "−"}
                                  {formatarQtd(Math.abs(dif))}
                                </span>
                              ) : null}
                              {usaMeta && v?.a_fazer ? <span className="block text-xs font-medium text-red-700">−{formatarQtd(v.a_fazer)}</span> : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                : registros.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="sticky left-0 bg-superficie px-3 py-2 whitespace-nowrap">
                        <span className="font-medium">{diaCurto(r.data_ref)}</span>
                        <span className="block text-xs text-slate-500">
                          {r.canal === "importacao" ? "planilha" : `${hora(r.enviado_em, empresa.fuso_horario)}${r.canal === "qr" ? " · QR" : ""}`}
                        </span>
                      </td>
                      {contagem.turnos.length > 0 && <td className="px-3 py-2">{r.turno ?? "—"}</td>}
                      <td className="px-3 py-2 whitespace-nowrap">{r.executor_nome}</td>
                      {itens.map((i) => (
                        <Celula key={i.id} v={r.valores.get(i.id)} usaMeta={usaMeta} />
                      ))}
                      <td className="px-3 py-2 text-slate-600">{r.observacao ?? ""}</td>
                      {podeExcluir && (
                        <td className="px-3 py-2">
                          <form action={excluirRegistro.bind(null, empresaId, contagemId, r.id, aqui)}>
                            <BotaoConfirmar
                              mensagem={`Apagar a contagem de ${formatarDia(r.data_ref)} feita por ${r.executor_nome}?`}
                              className="text-xs text-red-600"
                            >
                              Apagar
                            </BotaoConfirmar>
                          </form>
                        </td>
                      )}
                    </tr>
                  ))}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50 text-xs font-medium text-slate-700">
              <tr>
                <td className="sticky left-0 bg-slate-50 px-3 py-2">Total</td>
                <td className="px-3 py-2" colSpan={porDia ? 1 : contagem.turnos.length > 0 ? 2 : 1} />
                {itens.map((i) => (
                  <td key={i.id} className="px-3 py-2 text-right tabular-nums">
                    {formatarQtd(total.get(i.id))}
                  </td>
                ))}
                {!porDia && <td colSpan={podeExcluir ? 2 : 1} />}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
