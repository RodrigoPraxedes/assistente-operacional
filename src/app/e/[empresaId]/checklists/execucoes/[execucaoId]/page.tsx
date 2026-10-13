import Link from "next/link";
import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { RESPOSTAS_SIM_NAO } from "@/lib/types";
import { Cartao, Etiqueta, Titulo } from "@/components/ui";

const ROTULO = Object.fromEntries(RESPOSTAS_SIM_NAO.map((r) => [r.valor, r.rotulo]));
const COR: Record<string, string> = { sim: "#16a34a", nao: "#dc2626", em_processo: "#d97706", na: "#64748b" };

export default async function Execucao({ params }: { params: Promise<{ empresaId: string; execucaoId: string }> }) {
  const { empresaId, execucaoId } = await params;
  const { supabase, empresa } = await getContexto(empresaId);

  const [{ data: exec }, { data: respostas }] = await Promise.all([
    supabase.from("checklist_execucoes").select("*, unidades(nome)").eq("id", execucaoId).eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("checklist_respostas").select("*").eq("execucao_id", execucaoId).order("ordem"),
  ]);
  if (!exec) notFound();

  const caminhos = (respostas ?? []).map((r) => r.foto_path).filter(Boolean) as string[];
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("anexos").createSignedUrls(caminhos, 3600)
    : { data: [] };
  const url = new Map<string, string>();
  for (const a of assinadas ?? []) if (a.path && a.signedUrl) url.set(a.path, a.signedUrl);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/e/${empresaId}/checklists`} className="text-sm text-slate-500">
        ← Check-lists
      </Link>
      <Titulo>{exec.modelo_nome}</Titulo>
      <Cartao className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <p>
          <span className="text-slate-500">Unidade:</span> {exec.unidades?.nome}
        </p>
        <p>
          <span className="text-slate-500">Executor:</span> {exec.executor_nome} {exec.canal === "qr" && "(QR Code)"}
        </p>
        <p>
          <span className="text-slate-500">Enviado:</span> {formatarDataHora(exec.enviado_em, empresa.fuso_horario)}
        </p>
        <p>
          <span className="text-slate-500">Versão do modelo:</span> {exec.modelo_versao}
        </p>
        {exec.tarefa_id && (
          <Link href={`/e/${empresaId}/tarefas/${exec.tarefa_id}`} className="text-blue-600">
            Ver tarefa no Kanban
          </Link>
        )}
      </Cartao>

      <ol className="space-y-2">
        {(respostas ?? []).map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{r.item_texto}</p>
              {r.tipo_resposta === "sim_nao" ? (
                r.resposta && <Etiqueta cor={COR[r.resposta]}>{ROTULO[r.resposta]}</Etiqueta>
              ) : (
                <span className="font-medium">{r.tipo_resposta === "numero" ? r.valor_numero : null}</span>
              )}
            </div>
            {r.valor_texto && <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.valor_texto}</p>}
            {r.observacao && <p className="mt-1 text-slate-600">Obs.: {r.observacao}</p>}
            {r.foto_path && url.get(r.foto_path) && (
              <a href={url.get(r.foto_path)} target="_blank" rel="noopener">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url.get(r.foto_path)} alt={`Foto: ${r.item_texto}`} className="mt-2 max-h-64 rounded-lg" />
              </a>
            )}
          </li>
        ))}
      </ol>
      {exec.observacao && (
        <Cartao>
          <p className="text-sm">
            <span className="font-medium">Observação geral:</span> {exec.observacao}
          </p>
        </Cartao>
      )}
    </div>
  );
}
