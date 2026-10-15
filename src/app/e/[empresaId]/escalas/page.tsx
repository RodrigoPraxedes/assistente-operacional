import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import {
  dataValida,
  diasDaSemana,
  hojeIso,
  horarioTurno,
  ordenarTurnos,
  rotuloDia,
  rotuloSemana,
  segundaDaSemana,
  somarDias,
} from "@/lib/escala";
import { linkWhatsApp } from "@/lib/whatsapp";
import { AUSENCIAS, type Escala, type Turno } from "@/lib/types";
import { Aviso, Botao, Cartao, Etiqueta, LinkBotao, Select, Titulo, Vazio } from "@/components/ui";
import { copiarSemanaAnterior } from "./actions";
import { GradeEscala, type LinhaGrade } from "./grade-escala";

export default async function PaginaEscalas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ unidade?: string; setor?: string; semana?: string; aviso?: string; erro?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, empresa, membro: eu, pode } = await getContexto(empresaId);
  const hoje = hojeIso(empresa.fuso_horario);
  const segunda = segundaDaSemana(dataValida(filtros.semana) ? filtros.semana : hoje);
  const dias = diasDaSemana(segunda);

  const [{ data: unidades }, { data: minhasUnidades }, { data: setores }] = await Promise.all([
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("membro_unidades").select("unidade_id").eq("membro_id", eu.id),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  if (!unidades?.length) return <Vazio>Cadastre uma unidade em Configurações para montar a escala.</Vazio>;

  // unidade aberta: a da URL, senão a primeira em que a pessoa trabalha
  const minhas = new Set((minhasUnidades ?? []).map((u) => u.unidade_id));
  const unidade =
    unidades.find((u) => u.id === filtros.unidade) ?? unidades.find((u) => minhas.has(u.id)) ?? unidades[0];
  const setorFiltro = setores?.find((s) => s.id === filtros.setor)?.id ?? null;

  const [{ data: membros }, { data: daUnidade }, { data: turnos }, { data: escalas }, { data: meus }, { count: pendentes }] =
    await Promise.all([
      supabase
        .from("membros")
        .select("id, nome, cargo, telefone, setor_id, todas_unidades")
        .eq("empresa_id", empresaId)
        .eq("ativo", true)
        .order("nome"),
      supabase.from("membro_unidades").select("membro_id").eq("unidade_id", unidade.id),
      supabase.from("turnos").select("*").eq("empresa_id", empresaId),
      supabase
        .from("escalas")
        .select("*")
        .eq("unidade_id", unidade.id)
        .gte("data", dias[0])
        .lte("data", dias[6]),
      supabase
        .from("escalas")
        .select("*")
        .eq("membro_id", eu.id)
        .gte("data", hoje)
        .lte("data", somarDias(hoje, 13))
        .order("data"),
      supabase
        .from("escala_trocas")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresaId)
        .eq("status", "pendente"),
    ]);

  const todosTurnos = ordenarTurnos((turnos ?? []) as Turno[]);
  const turnoPorId = new Map(todosTurnos.map((t) => [t.id, t]));
  const turnosDaUnidade = todosTurnos.filter((t) => t.ativo && (!t.unidade_id || t.unidade_id === unidade.id));
  const lancamentos = (escalas ?? []) as Escala[];
  const nomeSetor = new Map((setores ?? []).map((s) => [s.id, s.nome]));
  const nomeUnidade = new Map(unidades.map((u) => [u.id, u.nome]));

  // na grade: quem trabalha na unidade (ou em todas) e quem já tem algo marcado nela na semana
  const naUnidade = new Set((daUnidade ?? []).map((m) => m.membro_id));
  const comLancamento = new Set(lancamentos.map((e) => e.membro_id));
  const pessoas = (membros ?? []).filter(
    (m) =>
      (m.todas_unidades || naUnidade.has(m.id) || comLancamento.has(m.id)) &&
      (!setorFiltro || m.setor_id === setorFiltro),
  );

  const valores: Record<string, string> = {};
  for (const e of lancamentos) valores[`${e.membro_id}|${e.data}`] = e.tipo === "turno" ? e.turno_id! : e.tipo;

  const descrever = (e: Pick<Escala, "tipo" | "turno_id">) => {
    if (e.tipo !== "turno") return AUSENCIAS[e.tipo].rotulo;
    const t = turnoPorId.get(e.turno_id!);
    return t ? `${t.nome} (${horarioTurno(t)})` : "Turno";
  };

  const linhas: LinhaGrade[] = pessoas
    .map((m) => {
      const semana = dias
        .map((d) => {
          const e = lancamentos.find((x) => x.membro_id === m.id && x.data === d);
          return e ? `${rotuloDia(d)}: ${descrever(e)}` : null;
        })
        .filter(Boolean);
      const texto = `Olá, ${m.nome.split(" ")[0]}! Sua escala de ${rotuloSemana(segunda)} em ${unidade.nome}:\n${semana.join("\n")}`;
      return {
        id: m.id,
        nome: m.nome,
        cargo: m.cargo,
        setor: m.setor_id ? (nomeSetor.get(m.setor_id) ?? "Sem setor") : "Sem setor",
        whatsapp: semana.length ? linkWhatsApp(texto, m.telefone) : null,
      };
    })
    .sort((a, b) => (a.setor === "Sem setor" ? 1 : 0) - (b.setor === "Sem setor" ? 1 : 0) || a.setor.localeCompare(b.setor));

  const podeEditar = pode("escalas.editar");
  const url = (semana: string) =>
    `/e/${empresaId}/escalas?unidade=${unidade.id}&semana=${semana}${setorFiltro ? `&setor=${setorFiltro}` : ""}`;

  return (
    <div className="space-y-4">
      <Titulo
        acoes={
          <>
            <LinkBotao variante="secundario" href={`/e/${empresaId}/escalas/trocas`}>
              Trocas
              {!!pendentes && <Etiqueta cor="#d97706">{pendentes}</Etiqueta>}
            </LinkBotao>
            {podeEditar && (
              <LinkBotao variante="secundario" href={`/e/${empresaId}/escalas/turnos`}>
                Turnos
              </LinkBotao>
            )}
          </>
        }
      >
        Escalas
      </Titulo>
      {filtros.erro && <Aviso>{filtros.erro}</Aviso>}
      {filtros.aviso === "copiada" && <Aviso tipo="sucesso">Semana anterior copiada para os dias em branco.</Aviso>}
      {filtros.aviso === "nada" && <Aviso tipo="info">Não havia nada a copiar da semana anterior para os dias em branco.</Aviso>}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link
            href={url(somarDias(segunda, -7))}
            aria-label="Semana anterior"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-superficie text-slate-600 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          <span className="min-w-32 text-center text-sm font-medium text-slate-800">{rotuloSemana(segunda)}</span>
          <Link
            href={url(somarDias(segunda, 7))}
            aria-label="Próxima semana"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-superficie text-slate-600 hover:bg-slate-100"
          >
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
          {unidades.length > 1 && (
            <Select name="unidade" defaultValue={unidade.id} className="w-auto">
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </Select>
          )}
          {(setores?.length ?? 0) > 0 && (
            <Select name="setor" defaultValue={setorFiltro ?? ""} className="w-auto">
              <option value="">Todos os setores</option>
              {setores!.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          )}
          {(unidades.length > 1 || (setores?.length ?? 0) > 0) && (
            <Botao variante="secundario">Filtrar</Botao>
          )}
        </form>
        {podeEditar && pessoas.length > 0 && (
          <form action={copiarSemanaAnterior.bind(null, empresaId)} className="ml-auto">
            <input type="hidden" name="unidade" value={unidade.id} />
            <input type="hidden" name="semana" value={segunda} />
            <input type="hidden" name="setor" value={setorFiltro ?? ""} />
            <input type="hidden" name="membros" value={pessoas.map((p) => p.id).join(",")} />
            <Botao variante="secundario" title="Preenche só os dias em branco">
              Copiar semana anterior
            </Botao>
          </form>
        )}
      </div>

      {podeEditar && turnosDaUnidade.length === 0 && (
        <Aviso tipo="info">
          Comece cadastrando os turnos (ex.: Abertura 06:00–14:00, Fechamento 14:00–22:00, ou só Manhã/Tarde/Noite) em{" "}
          <Link href={`/e/${empresaId}/escalas/turnos`} className="font-medium underline">
            Turnos
          </Link>
          .
        </Aviso>
      )}

      {pessoas.length === 0 ? (
        <Vazio>Nenhum colaborador nesta unidade{setorFiltro ? " e setor" : ""}. Vincule colaboradores em Configurações › Colaboradores.</Vazio>
      ) : (
        <GradeEscala
          key={`${unidade.id}|${segunda}|${setorFiltro}`}
          empresaId={empresaId}
          unidadeId={unidade.id}
          dias={dias.map((d) => ({ data: d, rotulo: rotuloDia(d) }))}
          hoje={hoje}
          linhas={linhas}
          turnos={turnosDaUnidade.map((t) => ({ id: t.id, nome: t.nome, horario: horarioTurno(t), cor: t.cor }))}
          // turnos inativos ou de outra unidade que ainda aparecem em dias já marcados
          outrosTurnos={todosTurnos
            .filter((t) => !turnosDaUnidade.includes(t))
            .map((t) => ({ id: t.id, nome: t.nome, horario: horarioTurno(t), cor: t.cor }))}
          valores={valores}
          podeEditar={podeEditar}
        />
      )}

      {(meus?.length ?? 0) > 0 && (
        <Cartao className="space-y-2">
          <h2 className="font-medium">Seus próximos dias</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {((meus ?? []) as Escala[]).map((e) => {
              const t = e.turno_id ? turnoPorId.get(e.turno_id) : null;
              const cor = t?.cor ?? (e.tipo !== "turno" ? AUSENCIAS[e.tipo].cor : "#2563eb");
              return (
                <li key={e.id} className="rounded-lg border border-slate-200 px-3 py-1.5">
                  <span className="font-medium text-slate-800">{e.data === hoje ? "Hoje" : rotuloDia(e.data)}</span>{" "}
                  <Etiqueta cor={cor}>{e.tipo === "turno" ? (t?.nome ?? "Turno") : AUSENCIAS[e.tipo].rotulo}</Etiqueta>
                  {t && <span className="ml-1 text-xs text-slate-500">{horarioTurno(t)}</span>}
                  {e.unidade_id !== unidade.id && (
                    <span className="ml-1 text-xs text-slate-500">· {nomeUnidade.get(e.unidade_id)}</span>
                  )}
                </li>
              );
            })}
          </ul>
          <Link href={`/e/${empresaId}/escalas/trocas`} className="text-xs text-blue-600">
            Precisa trocar algum dia? Peça a troca aqui
          </Link>
        </Cartao>
      )}
    </div>
  );
}
