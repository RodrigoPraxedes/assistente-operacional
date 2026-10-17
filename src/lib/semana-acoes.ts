import type { SupabaseClient } from "@supabase/supabase-js";
import { ocorrencias } from "@/lib/recorrencia";
import { hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import { diasDaSemana } from "@/lib/escala";
import type { Acao } from "@/lib/types";

export type CartaoSemana = {
  acao: Acao;
  hora: string;
  cor: string | null;
  categoria: string | null;
  responsaveis: string[];
  setor: string | null;
  unidade: string | null;
};

// Ações previstas para cada dia da semana que começa em "segunda" (AAAA-MM-DD),
// calculadas pela regra de repetição: concluir uma tarefa não tira a ação do quadro.
// A regra de acesso do banco já esconde as ações privadas de quem não pode vê-las.
export async function carregarSemana(
  supabase: SupabaseClient,
  empresaId: string,
  fuso: string,
  segunda: string,
  filtros: { setor?: string; categoria?: string; membroId?: string } = {},
) {
  const dias = diasDaSemana(segunda);
  const [y, m, d] = segunda.split("-").map(Number);
  // meio-dia local da segunda: o motor conta "hoje + 6 dias" a partir daí
  const base = horaLocalParaUtc(y, m, d, 12, 0, fuso);

  const [{ data: acoes }, { data: membros }, { data: setores }, { data: categorias }, { data: unidades }] =
    await Promise.all([
      supabase.from("acoes").select("*").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("membros").select("id, nome").eq("empresa_id", empresaId),
      supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("categorias").select("id, nome, cor").eq("empresa_id", empresaId).order("nome"),
      supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId),
    ]);
  const membro = new Map((membros ?? []).map((x) => [x.id as string, (x.nome as string).split(" ")[0]]));
  const categoria = new Map((categorias ?? []).map((c) => [c.id as string, c as { nome: string; cor: string }]));
  const setor = new Map((setores ?? []).map((s) => [s.id as string, s.nome as string]));
  const unidade = new Map((unidades ?? []).map((u) => [u.id as string, u.nome as string]));

  const porDia = new Map<string, (CartaoSemana & { ordem: number })[]>(dias.map((x) => [x, []]));
  for (const a of (acoes ?? []) as Acao[]) {
    if (filtros.setor && a.setor_id !== filtros.setor) continue;
    if (filtros.categoria && a.categoria_id !== filtros.categoria) continue;
    if (filtros.membroId && !a.responsaveis.includes(filtros.membroId)) continue;
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
    const cat = a.categoria_id ? categoria.get(a.categoria_id) : undefined;
    for (const quando of datas) {
      const l = hojeNoFuso(fuso, quando);
      const dia = `${l.y}-${String(l.m).padStart(2, "0")}-${String(l.d).padStart(2, "0")}`;
      porDia.get(dia)?.push({
        acao: a,
        hora: a.horario.slice(0, 5),
        cor: cat?.cor ?? null,
        categoria: cat?.nome ?? null,
        responsaveis: a.responsaveis.map((id) => membro.get(id)).filter((n): n is string => !!n),
        setor: a.setor_id ? (setor.get(a.setor_id) ?? null) : null,
        unidade: a.unidade_id ? (unidade.get(a.unidade_id) ?? null) : null,
        ordem: quando.getTime(),
      });
    }
  }
  for (const lista of porDia.values()) lista.sort((a, b) => a.ordem - b.ordem);

  return { dias, porDia: porDia as Map<string, CartaoSemana[]>, setores: setores ?? [], categorias: categorias ?? [] };
}
