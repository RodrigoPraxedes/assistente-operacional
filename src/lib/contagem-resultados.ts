import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Contagem, ContagemItem } from "@/lib/types";
import { dataDeHoje, somarDias } from "@/lib/contagens";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface FiltrosResultado {
  de: string;
  ate: string;
  turno: string;
  quem: string;
}

export interface Valor {
  quantidade: number | null;
  meta: number | null;
  a_fazer: number | null;
  vai_fazer: number | null;
}

export interface Registro {
  id: string;
  data_ref: string;
  turno: string | null;
  executor_nome: string;
  enviado_em: string;
  canal: string;
  observacao: string | null;
  remessa: boolean;
  valores: Map<string, Valor>;
}

const dataValida = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

// Filtros da URL; sem período, os últimos 30 dias
export function lerFiltros(sp: Partial<Record<keyof FiltrosResultado, string>>, fuso: string): FiltrosResultado {
  const ate = dataValida(sp.ate) ?? dataDeHoje(fuso);
  const de = dataValida(sp.de) ?? somarDias(ate, -29);
  return { de: de <= ate ? de : ate, ate, turno: sp.turno ?? "", quem: (sp.quem ?? "").trim() };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// Contagem, itens (os inativos só se aparecem no período) e os envios do período, do mais novo ao mais antigo
export async function carregarResultados(supabase: Supabase, empresaId: string, contagemId: string, f: FiltrosResultado) {
  const [{ data: contagem }, { data: todosItens }] = await Promise.all([
    supabase.from("contagens").select("*").eq("id", contagemId).eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("contagem_itens").select("*").eq("contagem_id", contagemId).order("ativo", { ascending: false }).order("ordem"),
  ]);
  if (!contagem) return null;

  const registros: Registro[] = [];
  // o banco devolve no máximo 1000 linhas por vez
  for (let desde = 0; desde < 20000; desde += 1000) {
    let q = supabase
      .from("contagem_registros")
      .select("id, data_ref, turno, executor_nome, enviado_em, canal, observacao, remessa, contagem_valores(item_id, quantidade, meta, a_fazer, vai_fazer)")
      .eq("contagem_id", contagemId)
      .gte("data_ref", f.de)
      .lte("data_ref", f.ate)
      .order("data_ref", { ascending: false })
      .order("enviado_em", { ascending: false })
      .range(desde, desde + 999);
    if (f.turno) q = q.eq("turno", f.turno);
    if (f.quem) q = q.ilike("executor_nome", `%${f.quem.replace(/[%_]/g, "")}%`);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      const valores = new Map<string, Valor>();
      for (const v of (r.contagem_valores ?? []) as { item_id: string; quantidade: unknown; meta: unknown; a_fazer: unknown; vai_fazer: unknown }[])
        valores.set(v.item_id, { quantidade: num(v.quantidade), meta: num(v.meta), a_fazer: num(v.a_fazer), vai_fazer: num(v.vai_fazer) });
      registros.push({ ...r, valores } as Registro);
    }
    if ((data ?? []).length < 1000) break;
  }

  const usados = new Set(registros.flatMap((r) => [...r.valores.entries()].filter(([, v]) => v.quantidade !== null).map(([id]) => id)));
  const itens = ((todosItens ?? []) as ContagemItem[]).filter((i) => i.ativo || usados.has(i.id));
  return { contagem: contagem as Contagem, itens, registros };
}

export interface Dia {
  data: string;
  envios: number;
  soma: Map<string, Valor>;
}

// soma das quantidades (e do que faltava e do que foi feito) de cada item por dia
export function somarPorDia(registros: Registro[]): Dia[] {
  const dias = new Map<string, Dia>();
  for (const r of registros) {
    const d = dias.get(r.data_ref) ?? { data: r.data_ref, envios: 0, soma: new Map() };
    d.envios++;
    for (const [id, v] of r.valores) {
      const s = d.soma.get(id) ?? { quantidade: null, meta: null, a_fazer: null, vai_fazer: null };
      // remessa é complemento: o "Tem" dela não entra na soma, só o que vai fazer
      if (v.quantidade !== null && !r.remessa) s.quantidade = (s.quantidade ?? 0) + v.quantidade;
      if (v.a_fazer !== null) s.a_fazer = (s.a_fazer ?? 0) + v.a_fazer;
      if (v.vai_fazer !== null) s.vai_fazer = (s.vai_fazer ?? 0) + v.vai_fazer;
      d.soma.set(id, s);
    }
    dias.set(r.data_ref, d);
  }
  return [...dias.values()].sort((a, b) => b.data.localeCompare(a.data));
}

// totais do período por item: o que foi contado, o que faltava para a meta e o que a pessoa disse que ia fazer
export function totaisPorItem(registros: Registro[]) {
  const contado = new Map<string, number>();
  const falta = new Map<string, number>();
  const feito = new Map<string, number>();
  const soma = (m: Map<string, number>, id: string, n: number | null) => {
    if (n !== null) m.set(id, (m.get(id) ?? 0) + n);
  };
  for (const r of registros)
    for (const [id, v] of r.valores) {
      // remessa é complemento: o "Tem" dela não entra no contado
      if (!r.remessa) soma(contado, id, v.quantidade);
      soma(falta, id, v.a_fazer);
      soma(feito, id, v.vai_fazer);
    }
  return { contado, falta, feito };
}

export interface PontoFluxo {
  // o que foi contado no início do turno (a contagem mais recente, sem as remessas)
  tem: number | null;
  meta: number | null;
  // o que entrou no turno: o que disseram que iam fazer (com as remessas) ou, sem esse campo, a sugestão
  entrada: number | null;
  // o que saiu no turno: tem + entrada − o que foi contado no turno seguinte
  saida: number | null;
}

export interface DiaFluxo {
  data: string;
  // turno → item → ponto
  turnos: Map<string, Map<string, PontoFluxo>>;
}

// Fluxo entre turnos: por dia e turno (na ordem da contagem), o saldo contado, a entrada,
// e a saída até a contagem do turno seguinte (o "Tem" dele é o que sobrou). O último turno
// do dia segue para o primeiro do dia seguinte. Devolve do dia mais novo ao mais antigo.
export function fluxoPorTurno(registros: Registro[], turnos: string[]): DiaFluxo[] {
  const dias = new Map<string, DiaFluxo>();
  const ponto = (data: string, turno: string, item: string) => {
    const d = dias.get(data) ?? { data, turnos: new Map() };
    dias.set(data, d);
    const t = d.turnos.get(turno) ?? new Map<string, PontoFluxo>();
    d.turnos.set(turno, t);
    const p = t.get(item) ?? { tem: null, meta: null, entrada: null, saida: null };
    t.set(item, p);
    return p;
  };
  // os registros vêm do mais novo ao mais antigo: a primeira contagem vista é a que vale
  const visto = new Set<string>();
  for (const r of registros) {
    if (!r.turno || !turnos.includes(r.turno)) continue;
    for (const [id, v] of r.valores) {
      const p = ponto(r.data_ref, r.turno, id);
      const entrada = v.vai_fazer ?? v.a_fazer;
      if (entrada !== null) p.entrada = (p.entrada ?? 0) + entrada;
      const chave = `${r.data_ref}|${r.turno}|${id}`;
      if (!r.remessa && v.quantidade !== null && !visto.has(chave)) {
        visto.add(chave);
        p.tem = v.quantidade;
        p.meta = v.meta;
      }
    }
  }

  const ordem = [...dias.values()].sort((a, b) => a.data.localeCompare(b.data));
  // turno seguinte de cada (dia, turno): o próximo do mesmo dia ou o primeiro do dia seguinte
  const seguinte = (data: string, k: number) =>
    k + 1 < turnos.length ? dias.get(data)?.turnos.get(turnos[k + 1]) : dias.get(somarDias(data, 1))?.turnos.get(turnos[0]);
  for (const d of ordem)
    turnos.forEach((t, k) => {
      const prox = seguinte(d.data, k);
      for (const [id, p] of d.turnos.get(t) ?? []) {
        const n = prox?.get(id);
        if (p.tem !== null && n?.tem != null) p.saida = p.tem + (p.entrada ?? 0) - n.tem;
      }
    });
  return ordem.reverse();
}
