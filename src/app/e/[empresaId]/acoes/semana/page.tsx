import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { dataValida, hojeIso, rotuloSemana, segundaDaSemana, somarDias } from "@/lib/escala";
import { carregarSemana } from "@/lib/semana-acoes";
import { QuadroSemana } from "@/components/quadro-semana";
import { Titulo } from "@/components/ui";
import { BotaoImprimir } from "./botao-imprimir";
import { FiltrosSemana } from "./filtros-semana";

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
  const { dias, porDia, setores, categorias } = await carregarSemana(supabase, empresaId, fuso, segunda, filtros);

  const consulta = (semana: string) => {
    const p = new URLSearchParams({ semana });
    if (filtros.setor) p.set("setor", filtros.setor);
    if (filtros.categoria) p.set("categoria", filtros.categoria);
    return p.toString();
  };
  const url = (semana: string) => `/e/${empresaId}/acoes/semana?${consulta(semana)}`;
  const setaClasse =
    "flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-superficie text-slate-600 hover:bg-slate-100";

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <Titulo voltar={{ href: `/e/${empresaId}/acoes`, rotulo: "Ações" }}>Semana das ações</Titulo>
        <p className="text-sm text-slate-500">
          O que está programado para cada dia, pela repetição de cada ação. Diferente do quadro de Tarefas, que mostra o
          que já entrou na fila.
        </p>
      </div>
      <h1 className="hidden text-xl font-semibold print:block">
        Ações da semana, {rotuloSemana(segunda)} · {empresa.nome}
      </h1>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div className="flex items-center gap-1">
          <Link href={url(somarDias(segunda, -7))} aria-label="Semana anterior" className={setaClasse}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <span className="min-w-24 text-center text-sm font-medium text-slate-800">{rotuloSemana(segunda)}</span>
          <Link href={url(somarDias(segunda, 7))} aria-label="Próxima semana" className={setaClasse}>
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
          {segunda !== segundaDaSemana(hoje) && (
            <Link href={url(segundaDaSemana(hoje))} className="px-2 text-sm text-blue-600">
              Esta semana
            </Link>
          )}
        </div>
        <FiltrosSemana
          semana={segunda}
          setor={filtros.setor ?? ""}
          categoria={filtros.categoria ?? ""}
          setores={setores}
          categorias={categorias}
        />
        <div className="ml-auto">
          <BotaoImprimir />
        </div>
      </div>

      <QuadroSemana dias={dias} porDia={porDia} hoje={hoje} empresaId={empresaId} podeAbrir={pode("acoes.editar")} />
    </div>
  );
}
