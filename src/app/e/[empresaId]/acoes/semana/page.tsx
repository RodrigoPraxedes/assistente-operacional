import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { ocorrencias } from "@/lib/recorrencia";
import { hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import {
  dataValida,
  diasDaSemana,
  hojeIso,
  rotuloDia,
  rotuloSemana,
  segundaDaSemana,
  somarDias,
} from "@/lib/escala";
import type { Acao } from "@/lib/types";
import { Botao, Select, Titulo } from "@/components/ui";

export default async function PaginaSemanaAcoes({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ semana?: string; setor?: string; categoria?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const fuso = empresa.fuso_horario;

  const hoje = hojeIso(fuso);
  const segunda = segundaDaSemana(dataValida(filtros.semana) ? filtros.semana : hoje);
  const dias = diasDaSemana(segunda);
  // meio-dia local da segunda: o motor conta "hoje + 6 dias" a partir daí
  const [y, m, d] = segunda.split("-").map(Number);
  const base = horaLocalParaUtc(y, m, d, 12, 0, fuso);

  const [{ data: acoes }, { data: membros }, { data: setores }, { data: categorias }] = await Promise.all([
    supabase.from("acoes").select("*").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("membros").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome, cor").eq("empresa_id", empresaId).order("nome"),
  ]);
  const membro = new Map((membros ?? []).map((x) => [x.id, x.nome.split(" ")[0]]));
  const cor = new Map((categorias ?? []).map((c) => [c.id, c.cor as string]));

  const porDia = new Map<string, { a: Acao; hora: string; ordem: number }[]>(dias.map((x) => [x, []]));
  for (const a of (acoes ?? []) as Acao[]) {
    if (filtros.setor && a.setor_id !== filtros.setor) continue;
    if (filtros.categoria && a.categoria_id !== filtros.categoria) continue;
    let datas: Date[] = [];
    try {
      datas = ocorrencias(
        { regra: a.recorrencia, horario: a.horario, inicio: a.data_inicial, fim: a.data_final, fuso },
        6,
        base,
      );
    } catch {
      continue;
    }
    for (const quando of datas) {
      const l = hojeNoFuso(fuso, quando);
      const dia = `${l.y}-${String(l.m).padStart(2, "0")}-${String(l.d).padStart(2, "0")}`;
      porDia.get(dia)?.push({ a, hora: a.horario.slice(0, 5), ordem: quando.getTime() });
    }
  }
  for (const lista of porDia.values()) lista.sort((x, y2) => x.ordem - y2.ordem);

  const url = (semana: string) => {
    const p = new URLSearchParams({ semana });
    if (filtros.setor) p.set("setor", filtros.setor);
    if (filtros.categoria) p.set("categoria", filtros.categoria);
    return `/e/${empresaId}/acoes/semana?${p}`;
  };
  const setaClasse =
    "flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-superficie text-slate-600 hover:bg-slate-100";

  return (
    <div className="space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/acoes`, rotulo: "Ações" }}>Semana das ações</Titulo>
      <p className="text-sm text-slate-500">
        O que está programado para cada dia, pela repetição de cada ação. Diferente do quadro de Tarefas, que mostra o
        que já entrou na fila.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={url(somarDias(segunda, -7))} aria-label="Semana anterior" className={setaClasse}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <span className="min-w-32 text-center text-sm font-medium text-slate-800">{rotuloSemana(segunda)}</span>
          <Link href={url(somarDias(segunda, 7))} aria-label="Próxima semana" className={setaClasse}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          {segunda !== segundaDaSemana(hoje) && (
            <Link href={url(segundaDaSemana(hoje))} className="px-2 text-sm text-blue-600">
              Esta semana
            </Link>
          )}
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="semana" value={segunda} />
          {(setores?.length ?? 0) > 0 && (
            <Select name="setor" defaultValue={filtros.setor ?? ""} className="w-auto" aria-label="Setor">
              <option value="">Todos os setores</option>
              {setores!.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          )}
          {(categorias?.length ?? 0) > 0 && (
            <Select name="categoria" defaultValue={filtros.categoria ?? ""} className="w-auto" aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {categorias!.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          )}
          {((setores?.length ?? 0) > 0 || (categorias?.length ?? 0) > 0) && (
            <Botao variante="secundario">Filtrar</Botao>
          )}
        </form>
      </div>

      <div className="grid gap-3 lg:grid-cols-7 lg:gap-2">
        {dias.map((dia) => {
          const lista = porDia.get(dia) ?? [];
          const ehHoje = dia === hoje;
          return (
            <section
              key={dia}
              className={`min-w-0 rounded-xl border p-2 ${ehHoje ? "border-blue-500" : "border-slate-200"} bg-slate-50`}
            >
              <h2 className={`mb-2 text-xs font-semibold uppercase ${ehHoje ? "text-blue-600" : "text-slate-600"}`}>
                {rotuloDia(dia)}
              </h2>
              {lista.length === 0 ? (
                <p className="py-2 text-xs text-slate-400">Nada programado</p>
              ) : (
                <ul className="space-y-2">
                  {lista.map(({ a, hora }) => {
                    const c = a.categoria_id ? cor.get(a.categoria_id) : undefined;
                    const nomes = a.responsaveis.map((id) => membro.get(id)).filter(Boolean);
                    const conteudo = (
                      <>
                        <span className="block text-xs text-slate-500">{hora}</span>
                        <span className="block break-words text-sm font-medium text-slate-900">{a.nome}</span>
                        {nomes.length > 0 && <span className="block text-xs text-slate-500">{nomes.join(", ")}</span>}
                      </>
                    );
                    const estilo = c
                      ? { backgroundColor: `${c}33`, borderColor: c }
                      : { backgroundColor: "var(--color-superficie)" };
                    const classe = "block rounded-lg border border-slate-200 p-2 shadow-sm";
                    return (
                      <li key={`${a.id}-${hora}`}>
                        {pode("acoes.editar") ? (
                          <Link href={`/e/${empresaId}/acoes/${a.id}`} className={classe} style={estilo}>
                            {conteudo}
                          </Link>
                        ) : (
                          <div className={classe} style={estilo}>
                            {conteudo}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
