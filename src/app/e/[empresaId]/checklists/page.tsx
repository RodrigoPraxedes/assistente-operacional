import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { descreverRecorrencia } from "@/lib/recorrencia";
import { dataDeHoje } from "@/lib/contagens";
import { formatarDataHora } from "@/lib/formato";
import type { ChecklistModelo } from "@/lib/types";
import { FiltrosChecklists } from "./filtros-checklists";
import { Aviso, Cartao, Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";

function hora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}

export default async function PaginaChecklists({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ salvo?: string; excluido?: string; busca?: string; setor?: string; unidade?: string; qr?: string; situacao?: string }>;
}) {
  const { empresaId } = await params;
  const { salvo, excluido, ...filtros } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);

  const [{ data: modelos }, { data: unidades }, { data: setores }, { data: execucoes }, { data: recentes }] = await Promise.all([
    supabase.from("checklist_modelos").select("*").eq("empresa_id", empresaId).order("horario_preferencial"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    pode("checklist.ver_execucoes")
      ? supabase
          .from("checklist_execucoes")
          .select("id, modelo_nome, executor_nome, enviado_em, qtd_nao, canal, unidade_id")
          .eq("empresa_id", empresaId)
          .order("enviado_em", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    supabase
      .from("checklist_execucoes")
      .select("modelo_id, unidade_id, enviado_em")
      .eq("empresa_id", empresaId)
      .gte("enviado_em", new Date(Date.now() - 36 * 3600_000).toISOString())
      .order("enviado_em"),
  ]);
  const hoje = dataDeHoje(empresa.fuso_horario);
  const feitosHoje = (recentes ?? []).filter((x) => new Intl.DateTimeFormat("en-CA", { timeZone: empresa.fuso_horario }).format(new Date(x.enviado_em)) === hoje);
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id, s.nome]));
  const base = `/e/${empresaId}/checklists`;

  const normalizar = (t: string) => t.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const termo = normalizar(filtros.busca?.trim() ?? "");
  const filtrando = Boolean(filtros.busca || filtros.setor || filtros.unidade || filtros.qr || filtros.situacao);
  const visiveis = ((modelos ?? []) as ChecklistModelo[]).filter(
    (m) =>
      (!termo || normalizar(`${m.nome} ${m.descricao ?? ""} ${m.setor_id ? nomeSetor.get(m.setor_id) ?? "" : ""}`).includes(termo)) &&
      (!filtros.setor || m.setor_id === filtros.setor) &&
      (!filtros.unidade || m.unidade_id === filtros.unidade) &&
      (filtros.qr !== "com" || m.publico_qr) &&
      (filtros.qr !== "sem" || !m.publico_qr) &&
      (filtros.situacao !== "ativos" || m.ativo) &&
      (filtros.situacao !== "inativos" || !m.ativo),
  );

  return (
    <div className="space-y-6">
      <Titulo acoes={pode("checklist.editar_modelo") && <LinkBotao href={`${base}/novo`}>Novo check-list</LinkBotao>}>
        Check-lists
      </Titulo>
      {salvo && <Aviso tipo="sucesso">Check-list salvo.</Aviso>}
      {excluido && <Aviso tipo="sucesso">Check-list excluído. Os preenchimentos já enviados continuam no histórico.</Aviso>}

      {(modelos ?? []).length > 0 && (
        <FiltrosChecklists
          busca={filtros.busca ?? ""}
          setor={filtros.setor ?? ""}
          unidade={filtros.unidade ?? ""}
          qr={filtros.qr ?? ""}
          situacao={filtros.situacao ?? ""}
          setores={setores ?? []}
          unidades={unidades ?? []}
        />
      )}

      {(modelos ?? []).length === 0 ? (
        <Vazio>Nenhum check-list cadastrado ainda.</Vazio>
      ) : visiveis.length === 0 ? (
        <Vazio>{filtrando ? "Nenhum check-list encontrado com esses filtros." : "Nenhum check-list cadastrado ainda."}</Vazio>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visiveis.map((m) => {
            const alvo = m.unidade_id ? (unidades ?? []).filter((u) => u.id === m.unidade_id) : unidades ?? [];
            return (
              <li key={m.id}>
                <Cartao className={`space-y-2 ${m.ativo ? "" : "opacity-60"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{m.nome}</p>
                    <span className="text-sm text-slate-500">{m.horario_preferencial.slice(0, 5)}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {descreverRecorrencia(m.recorrencia)} · {m.unidade_id ? nomeUnidade.get(m.unidade_id) : "Todas as unidades"}
                  </p>
                  {feitosHoje.some((x) => x.modelo_id === m.id) && (
                    <p className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 size={14} />
                      {alvo.length > 1
                        ? `Feito hoje: ${alvo
                            .map((u) => {
                              const f = feitosHoje.filter((x) => x.modelo_id === m.id && x.unidade_id === u.id).at(-1);
                              return f ? `${u.nome} às ${hora(f.enviado_em, empresa.fuso_horario)}` : null;
                            })
                            .filter(Boolean)
                            .join(", ")}`
                        : `Feito hoje às ${hora(feitosHoje.filter((x) => x.modelo_id === m.id).at(-1)!.enviado_em, empresa.fuso_horario)}`}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {m.publico_qr && <Etiqueta cor="#2563eb">QR Code</Etiqueta>}
                    {!m.ativo && <Etiqueta>Inativo</Etiqueta>}
                    {m.ativo &&
                      pode("checklist.executar") &&
                      alvo.map((u) => (
                        <Link
                          key={u.id}
                          href={`${base}/${m.id}/preencher?unidade=${u.id}`}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
                        >
                          Preencher{alvo.length > 1 ? ` · ${u.nome}` : ""}
                        </Link>
                      ))}
                    {pode("checklist.editar_modelo") && (
                      <Link href={`${base}/${m.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                        Editar
                      </Link>
                    )}
                  </div>
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}

      {pode("checklist.ver_execucoes") && (
        <section>
          <h2 className="mb-2 font-medium">Preenchidos recentemente</h2>
          {(execucoes ?? []).length === 0 ? (
            <Vazio>Nenhum check-list preenchido ainda.</Vazio>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-superficie">
              {execucoes!.map((e) => (
                <li key={e.id}>
                  <Link href={`${base}/execucoes/${e.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-slate-50">
                    <span>
                      <span className="font-medium">{e.modelo_nome}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {nomeUnidade.get(e.unidade_id)} · {e.executor_nome} {e.canal === "qr" && "(QR)"}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {e.qtd_nao > 0 ? <Etiqueta cor="#dc2626">{e.qtd_nao} {e.qtd_nao === 1 ? "problema" : "problemas"}</Etiqueta> : <Etiqueta cor="#16a34a">OK</Etiqueta>}
                      <span className="text-xs text-slate-500">{formatarDataHora(e.enviado_em, empresa.fuso_horario)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
