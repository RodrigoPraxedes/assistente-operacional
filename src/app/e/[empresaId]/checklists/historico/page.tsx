import Link from "next/link";
import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora, localParaUtc } from "@/lib/formato";
import { Botao, Cartao, Etiqueta, Input, Select, Titulo, Vazio } from "@/components/ui";

const POR_PAGINA = 30;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

type Filtros = { de?: string; ate?: string; modelo?: string; unidade?: string; quem?: string; resultado?: string; pagina?: string };

export default async function PaginaHistoricoChecklists({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<Filtros>;
}) {
  const { empresaId } = await params;
  const f = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  if (!pode("checklist.ver_execucoes")) notFound();

  const pagina = Math.max(1, Number(f.pagina) || 1);
  const quem = f.quem?.trim().replace(/[%,()]/g, " ") ?? "";

  let consulta = supabase
    .from("checklist_execucoes")
    .select("id, modelo_nome, executor_nome, enviado_em, qtd_nao, canal, unidade_id", { count: "exact" })
    .eq("empresa_id", empresaId)
    .order("enviado_em", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (f.de && DATA.test(f.de)) consulta = consulta.gte("enviado_em", localParaUtc(`${f.de}T00:00`, empresa.fuso_horario));
  if (f.ate && DATA.test(f.ate)) {
    const [y, m, d] = f.ate.split("-").map(Number);
    const proximo = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    consulta = consulta.lt("enviado_em", localParaUtc(`${proximo}T00:00`, empresa.fuso_horario));
  }
  if (f.modelo) consulta = consulta.eq("modelo_id", f.modelo);
  if (f.unidade) consulta = consulta.eq("unidade_id", f.unidade);
  if (quem) consulta = consulta.ilike("executor_nome", `%${quem}%`);
  if (f.resultado === "problemas") consulta = consulta.gt("qtd_nao", 0);
  if (f.resultado === "ok") consulta = consulta.eq("qtd_nao", 0);

  const [{ data: execucoes, count }, { data: modelos }, { data: unidades }] = await Promise.all([
    consulta,
    supabase.from("checklist_modelos").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).order("nome"),
  ]);
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const base = `/e/${empresaId}/checklists`;
  const total = count ?? 0;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const filtrando = Boolean(f.de || f.ate || f.modelo || f.unidade || quem || f.resultado);

  const link = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, pagina: String(p) })) if (v) q.set(k, v);
    return `${base}/historico?${q}`;
  };

  return (
    <div className="space-y-6">
      <Titulo voltar={{ href: base, rotulo: "Check-lists" }}>Histórico de preenchimentos</Titulo>

      <form className="flex flex-wrap items-end gap-2">
        <label className="flex-[1_1_9rem] text-xs text-slate-500">
          De
          <Input type="date" name="de" defaultValue={f.de ?? ""} />
        </label>
        <label className="flex-[1_1_9rem] text-xs text-slate-500">
          Até
          <Input type="date" name="ate" defaultValue={f.ate ?? ""} />
        </label>
        <label className="flex-[1_1_12rem] text-xs text-slate-500">
          Check-list
          <Select name="modelo" defaultValue={f.modelo ?? ""}>
            <option value="">Todos</option>
            {(modelos ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </label>
        {(unidades ?? []).length > 1 && (
          <label className="flex-[1_1_9rem] text-xs text-slate-500">
            Unidade
            <Select name="unidade" defaultValue={f.unidade ?? ""}>
              <option value="">Todas</option>
              {(unidades ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex-[1_1_10rem] text-xs text-slate-500">
          Quem preencheu
          <Input type="search" name="quem" defaultValue={quem} placeholder="Nome" />
        </label>
        <label className="flex-[1_1_9rem] text-xs text-slate-500">
          Resultado
          <Select name="resultado" defaultValue={f.resultado ?? ""}>
            <option value="">Todos</option>
            <option value="problemas">Com problemas</option>
            <option value="ok">Tudo OK</option>
          </Select>
        </label>
        <Botao type="submit">Pesquisar</Botao>
        {filtrando && (
          <Link href={`${base}/historico`} className="px-2 py-2 text-sm text-slate-500">
            Limpar
          </Link>
        )}
      </form>

      <p className="text-sm text-slate-500">
        {total} {total === 1 ? "preenchimento encontrado" : "preenchimentos encontrados"}
      </p>

      {(execucoes ?? []).length === 0 ? (
        <Vazio>{filtrando ? "Nenhum preenchimento com esses filtros." : "Nenhum check-list preenchido ainda."}</Vazio>
      ) : (
        <Cartao className="p-0">
          <ul className="divide-y divide-slate-100">
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
        </Cartao>
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          {pagina > 1 ? <Link href={link(pagina - 1)} className="text-blue-600">‹ Mais recentes</Link> : <span />}
          <span className="text-slate-500">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? <Link href={link(pagina + 1)} className="text-blue-600">Mais antigos ›</Link> : <span />}
        </div>
      )}
    </div>
  );
}
