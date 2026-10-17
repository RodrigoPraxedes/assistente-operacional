import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { descreverRecorrencia } from "@/lib/recorrencia";
import { formatarDataHora } from "@/lib/formato";
import type { ChecklistModelo } from "@/lib/types";
import { Aviso, Cartao, Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";

export default async function PaginaChecklists({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ salvo?: string; excluido?: string }>;
}) {
  const { empresaId } = await params;
  const { salvo, excluido } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);

  const [{ data: modelos }, { data: unidades }, { data: execucoes }] = await Promise.all([
    supabase.from("checklist_modelos").select("*").eq("empresa_id", empresaId).order("horario_preferencial"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    pode("checklist.ver_execucoes")
      ? supabase
          .from("checklist_execucoes")
          .select("id, modelo_nome, executor_nome, enviado_em, qtd_nao, canal, unidade_id")
          .eq("empresa_id", empresaId)
          .order("enviado_em", { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
  ]);
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const base = `/e/${empresaId}/checklists`;

  return (
    <div className="space-y-6">
      <Titulo acoes={pode("checklist.editar_modelo") && <LinkBotao href={`${base}/novo`}>Novo check-list</LinkBotao>}>
        Check-lists
      </Titulo>
      {salvo && <Aviso tipo="sucesso">Check-list salvo.</Aviso>}
      {excluido && <Aviso tipo="sucesso">Check-list excluído. Os preenchimentos já enviados continuam no histórico.</Aviso>}

      {(modelos ?? []).length === 0 ? (
        <Vazio>Nenhum check-list cadastrado ainda.</Vazio>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(modelos as ChecklistModelo[]).map((m) => {
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
                  <div className="flex flex-wrap gap-1">
                    {m.publico_qr && <Etiqueta cor="#2563eb">QR Code</Etiqueta>}
                    {!m.ativo && <Etiqueta>Inativo</Etiqueta>}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
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
