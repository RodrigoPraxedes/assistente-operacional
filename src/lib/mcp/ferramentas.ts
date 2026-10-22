import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarData, formatarDataHora, formatarDia, hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import { hojeIso, horarioTurno, ordenarTurnos, somarDias } from "@/lib/escala";
import { diaDaSemana, metaDoDia } from "@/lib/contagens";
import { DIAS_SEMANA as DIAS_ROTINA } from "@/lib/rotinas";
import { proximaOcorrencia, descreverRecorrencia } from "@/lib/recorrencia";
import {
  AUSENCIAS,
  EVENTOS_PATRIMONIO,
  HORIZONTES,
  ORIGENS,
  PRIORIDADES,
  SITUACOES_PATRIMONIO,
  SITUACOES_PLANO,
  type Acao,
  type Alerta,
  type Horizonte,
  type Origem,
  type Prioridade,
  type SituacaoPatrimonio,
  type SituacaoPlano,
  type Status,
  type TipoEventoPatrimonio,
  type TipoEscala,
  type Turno,
} from "@/lib/types";

// Ferramentas de consulta do MCP. Tudo roda com o login da pessoa: o banco
// (RLS) já esconde o que ela não pode ver, inclusive itens privados. Aqui só
// juntamos os dados e trocamos ids por nomes e datas pelo fuso da empresa.

export type ContextoMcp = { supabase: SupabaseClient; usuarioId: string };

type Esquema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties?: boolean };

export interface Ferramenta {
  nome: string;
  titulo: string;
  descricao: string;
  parametros: Esquema;
  executar: (ctx: ContextoMcp, args: Record<string, unknown>) => Promise<unknown>;
}

const DIA = 86_400_000;
const PENDENTES = ["aberto", "em_andamento", "adiado"];

const P_EMPRESA = {
  type: "string",
  description: "Nome (ou parte) ou id da empresa. Pode omitir se a pessoa só participa de uma.",
};
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const numero = (v: unknown, padrao: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), max) : padrao;
};
const dataIso = (v: unknown) => {
  const s = texto(v);
  if (!s) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Data inválida: ${s}. Use AAAA-MM-DD.`);
  return s;
};
const contem = (alvo: string | null | undefined, busca: string) =>
  (alvo ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes(busca.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase());

// ---------------------------------------------------------------------------
// Empresa e nomes
// ---------------------------------------------------------------------------

type MeuMembro = {
  id: string;
  nome: string;
  cargo: string | null;
  empresa_id: string;
  empresas: { id: string; nome: string; fuso_horario: string } | null;
};

async function minhasEmpresas(ctx: ContextoMcp) {
  const { data, error } = await ctx.supabase
    .from("membros")
    .select("id, nome, cargo, empresa_id, empresas(id, nome, fuso_horario)")
    .eq("usuario_id", ctx.usuarioId)
    .eq("ativo", true)
    .returns<MeuMembro[]>();
  if (error) throw new Error("Não consegui consultar suas empresas.");
  // empresa suspensa ou aguardando aprovação não aparece (o banco bloqueia)
  return (data ?? []).filter((m) => m.empresas);
}

async function escolherEmpresa(ctx: ContextoMcp, args: Record<string, unknown>) {
  const todas = await minhasEmpresas(ctx);
  if (todas.length === 0) throw new Error("Você não participa de nenhuma empresa ativa no Atalaia.");
  const busca = texto(args.empresa);
  const achadas = busca
    ? todas.filter((m) => m.empresa_id === busca || contem(m.empresas!.nome, busca))
    : todas;
  if (achadas.length === 1) {
    const m = achadas[0];
    return { empresaId: m.empresa_id, empresa: m.empresas!.nome, fuso: m.empresas!.fuso_horario, membroId: m.id };
  }
  const nomes = todas.map((m) => m.empresas!.nome).join(", ");
  throw new Error(
    achadas.length === 0
      ? `Empresa "${busca}" não encontrada. Suas empresas: ${nomes}.`
      : `Você participa de mais de uma empresa (${nomes}). Informe qual no parâmetro empresa.`,
  );
}

async function nomes(ctx: ContextoMcp, empresaId: string) {
  const sb = ctx.supabase;
  const [{ data: membros }, { data: setores }, { data: unidades }, { data: status }] = await Promise.all([
    sb.from("membros").select("id, nome, setor_id, cargo").eq("empresa_id", empresaId),
    sb.from("setores").select("id, nome").eq("empresa_id", empresaId),
    sb.from("unidades").select("id, nome").eq("empresa_id", empresaId),
    sb.from("status").select("*").eq("empresa_id", empresaId),
  ]);
  const st = (status ?? []) as Status[];
  const membro = new Map((membros ?? []).map((m) => [m.id as string, m.nome as string]));
  return {
    membros: membros ?? [],
    setores: setores ?? [],
    unidades: unidades ?? [],
    status: st,
    membro: (id: string | null | undefined) => (id ? (membro.get(id) ?? "—") : null),
    pessoas: (ids: string[] | null | undefined) => (ids ?? []).map((id) => membro.get(id) ?? "—"),
    setor: (id: string | null | undefined) => (id ? (setores ?? []).find((s) => s.id === id)?.nome ?? null : null),
    unidade: (id: string | null | undefined) => (id ? (unidades ?? []).find((u) => u.id === id)?.nome ?? null : null),
    statusNome: (id: string) => st.find((s) => s.id === id)?.nome ?? "—",
    tipoStatus: (id: string) => st.find((s) => s.id === id)?.tipo,
    idsPorTipo: (tipos: string[]) => st.filter((s) => tipos.includes(s.tipo)).map((s) => s.id),
  };
}

type Nomes = Awaited<ReturnType<typeof nomes>>;

function acharPessoas(n: Nomes, busca: string) {
  const ids = n.membros.filter((m) => contem(m.nome, busca)).map((m) => m.id as string);
  if (ids.length === 0) throw new Error(`Ninguém da equipe com o nome "${busca}".`);
  return ids;
}
function acharId(lista: { id: string; nome: string }[], busca: string, oque: string) {
  const achado = lista.find((x) => x.id === busca || contem(x.nome, busca));
  if (!achado) throw new Error(`${oque} "${busca}" não encontrado. Opções: ${lista.map((x) => x.nome).join(", ")}.`);
  return achado.id;
}

function janelaDoDia(fuso: string, dia?: string) {
  const h = dia ? { y: +dia.slice(0, 4), m: +dia.slice(5, 7), d: +dia.slice(8, 10) } : hojeNoFuso(fuso);
  return {
    inicio: horaLocalParaUtc(h.y, h.m, h.d, 0, 0, fuso).toISOString(),
    fim: horaLocalParaUtc(h.y, h.m, h.d, 23, 59, fuso).toISOString(),
  };
}

type TarefaLinha = {
  id: string;
  titulo: string;
  descricao: string | null;
  origem: Origem;
  status_id: string;
  prazo: string | null;
  ocorrencia_em: string | null;
  responsaveis: string[];
  setor_id: string | null;
  unidade_id: string | null;
  concluida_em: string | null;
  privado: boolean;
};
const CAMPOS_TAREFA =
  "id, titulo, descricao, origem, status_id, prazo, ocorrencia_em, responsaveis, setor_id, unidade_id, concluida_em, privado";

function descreverTarefa(t: TarefaLinha, n: Nomes, fuso: string, agora = Date.now()) {
  const atrasada = !!t.prazo && !t.concluida_em && PENDENTES.includes(n.tipoStatus(t.status_id) ?? "") && new Date(t.prazo).getTime() < agora;
  return {
    titulo: t.titulo,
    descricao: t.descricao || undefined,
    origem: ORIGENS[t.origem] ?? t.origem,
    status: n.statusNome(t.status_id),
    atrasada: atrasada || undefined,
    prazo: t.prazo ? formatarDataHora(t.prazo, fuso) : undefined,
    concluida_em: t.concluida_em ? formatarDataHora(t.concluida_em, fuso) : undefined,
    responsaveis: n.pessoas(t.responsaveis),
    setor: n.setor(t.setor_id) ?? undefined,
    unidade: n.unidade(t.unidade_id) ?? undefined,
    privada: t.privado || undefined,
  };
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

const minhas_empresas: Ferramenta = {
  nome: "minhas_empresas",
  titulo: "Minhas empresas",
  descricao: "Lista as empresas de que a pessoa participa no Atalaia, com cargo, unidades e fuso horário.",
  parametros: { type: "object", properties: {}, additionalProperties: false },
  async executar(ctx) {
    const todas = await minhasEmpresas(ctx);
    const ids = todas.map((m) => m.empresa_id);
    const { data: unidades } = await ctx.supabase.from("unidades").select("empresa_id, nome").in("empresa_id", ids).eq("ativo", true);
    return todas.map((m) => ({
      empresa: m.empresas!.nome,
      id: m.empresa_id,
      voce: m.nome,
      cargo: m.cargo,
      fuso_horario: m.empresas!.fuso_horario,
      unidades: (unidades ?? []).filter((u) => u.empresa_id === m.empresa_id).map((u) => u.nome),
    }));
  },
};

const resumo_do_dia: Ferramenta = {
  nome: "resumo_do_dia",
  titulo: "Resumo do dia",
  descricao:
    "O mesmo que o Painel do app: tarefas atrasadas, que vencem hoje, em andamento e concluídas hoje; check-lists do dia; manutenções abertas; quem trabalha hoje; alertas dos próximos 7 dias.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      so_minhas: { type: "boolean", description: "true = só o que está com a pessoa logada (Meu painel)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const sb = ctx.supabase;
    const minhas = args.so_minhas === true;
    const agora = new Date();
    const { inicio, fim } = janelaDoDia(e.fuso);
    const daquiUmaHora = new Date(agora.getTime() + 3_600_000).toISOString();
    const pend = n.idsPorTipo(PENDENTES);
    const deMim = <T extends { contains: (c: string, v: string[]) => T }>(q: T) => (minhas ? q.contains("responsaveis", [e.membroId]) : q);

    const [{ data: pendentes }, { count: concluidasHoje }, { data: checklists }, { data: chamados }, { data: escalas }, { data: alertas }] =
      await Promise.all([
        deMim(
          sb
            .from("tarefas")
            .select(CAMPOS_TAREFA)
            .eq("empresa_id", e.empresaId)
            .in("status_id", pend)
            .or(`ocorrencia_em.is.null,ocorrencia_em.lte.${fim}`)
            .or(`origem.neq.checklist,ocorrencia_em.lte.${daquiUmaHora}`)
            .limit(2000),
        ).returns<TarefaLinha[]>(),
        deMim(sb.from("tarefas").select("id", { count: "exact", head: true }).eq("empresa_id", e.empresaId).gte("concluida_em", inicio)),
        deMim(
          sb
            .from("tarefas")
            .select(CAMPOS_TAREFA)
            .eq("empresa_id", e.empresaId)
            .eq("origem", "checklist")
            .gte("ocorrencia_em", inicio)
            .lte("ocorrencia_em", fim)
            .limit(500),
        ).returns<TarefaLinha[]>(),
        (() => {
          let q = sb
            .from("chamados")
            .select("numero, prioridade, tarefas!inner(status_id, responsaveis)")
            .eq("empresa_id", e.empresaId)
            .in("tarefas.status_id", pend)
            .limit(500);
          if (minhas) q = q.contains("tarefas.responsaveis", [e.membroId]);
          return q.returns<{ numero: number; prioridade: Prioridade }[]>();
        })(),
        sb
          .from("escalas")
          .select("membro_id, tipo, turnos(nome, inicio, fim, periodo)")
          .eq("empresa_id", e.empresaId)
          .eq("data", hojeIso(e.fuso))
          .returns<{ membro_id: string; tipo: TipoEscala; turnos: Pick<Turno, "nome" | "inicio" | "fim" | "periodo"> | null }[]>(),
        sb.from("alertas").select("*").eq("empresa_id", e.empresaId).eq("ativo", true),
      ]);

    const ms = agora.getTime();
    const fimMs = new Date(fim).getTime();
    const lista = pendentes ?? [];
    const atrasadas = lista.filter((t) => t.prazo && new Date(t.prazo).getTime() < ms);
    const vencemHoje = lista.filter((t) => t.prazo && new Date(t.prazo).getTime() >= ms && new Date(t.prazo).getTime() <= fimMs);
    const cls = checklists ?? [];
    const tipo = (t: TarefaLinha) => n.tipoStatus(t.status_id);
    const abertas = chamados ?? [];
    const turnos = new Map<string, { turno: string; pessoas: string[] }>();
    for (const x of ordenarTurnos((escalas ?? []).filter((x) => x.tipo === "turno" && x.turnos).map((x) => ({ ...x.turnos!, x })))) {
      const chave = `${x.nome} (${horarioTurno(x)})`;
      const g = turnos.get(chave) ?? { turno: chave, pessoas: [] };
      g.pessoas.push(n.membro(x.x.membro_id) ?? "—");
      turnos.set(chave, g);
    }
    const sete = new Date(ms + 7 * DIA);
    const proximos = ((alertas ?? []) as Alerta[])
      .map((a) => ({ a, quando: proximaOcorrencia({ regra: a.recorrencia, horario: a.horario, inicio: a.data_evento, fuso: e.fuso }) }))
      .filter((x) => x.quando && x.quando <= sete)
      .sort((x, y) => x.quando!.getTime() - y.quando!.getTime())
      .map((x) => ({ alerta: x.a.nome, data: formatarData(x.quando!.toISOString(), e.fuso) }));

    return {
      empresa: e.empresa,
      hoje: formatarData(agora.toISOString(), e.fuso),
      recorte: minhas ? "só as minhas" : "geral (o que você pode ver)",
      tarefas: {
        atrasadas: atrasadas.length,
        vencem_hoje: vencemHoje.length,
        em_andamento: lista.filter((t) => tipo(t) === "em_andamento").length,
        concluidas_hoje: concluidasHoje ?? 0,
        atrasadas_exemplos: atrasadas
          .sort((a, b) => a.prazo!.localeCompare(b.prazo!))
          .slice(0, 10)
          .map((t) => ({ titulo: t.titulo, prazo: formatarDataHora(t.prazo, e.fuso), responsaveis: n.pessoas(t.responsaveis) })),
      },
      checklists_de_hoje: {
        total: cls.length,
        feitos: cls.filter((t) => tipo(t) === "concluido").length,
        nao_realizados_no_tempo: cls.filter((t) => tipo(t) === "cancelado").length,
        pendentes: cls.filter((t) => PENDENTES.includes(tipo(t) ?? "")).length,
      },
      manutencoes_abertas: {
        total: abertas.length,
        por_prioridade: Object.fromEntries(
          (Object.keys(PRIORIDADES) as Prioridade[])
            .map((p) => [PRIORIDADES[p].rotulo, abertas.filter((c) => c.prioridade === p).length])
            .filter(([, q]) => q),
        ),
      },
      escala_de_hoje: {
        turnos: [...turnos.values()],
        ausentes: (escalas ?? [])
          .filter((x) => x.tipo !== "turno")
          .map((x) => ({ pessoa: n.membro(x.membro_id), motivo: AUSENCIAS[x.tipo as Exclude<TipoEscala, "turno">].rotulo })),
      },
      alertas_proximos_7_dias: proximos,
    };
  },
};

const RECORTES = ["pendentes", "atrasadas", "hoje", "em_andamento", "adiadas", "concluidas", "canceladas", "todas"] as const;

const buscar_tarefas: Ferramenta = {
  nome: "buscar_tarefas",
  titulo: "Buscar tarefas",
  descricao:
    "Busca tarefas de todos os módulos (avulsas, check-lists, ações recorrentes, manutenções, alertas, etapas de projetos) com filtros. Ocorrências futuras de recorrências só aparecem com recorte 'todas' ou período.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      recorte: { type: "string", enum: [...RECORTES], description: "Padrão: pendentes (abertas, em andamento e adiadas)." },
      origem: { type: "string", enum: Object.keys(ORIGENS), description: "Módulo de onde veio a tarefa." },
      responsavel: { type: "string", description: "Nome (ou parte) de quem está com a tarefa." },
      so_minhas: { type: "boolean", description: "Só as tarefas da pessoa logada." },
      setor: { type: "string", description: "Nome do setor." },
      unidade: { type: "string", description: "Nome da unidade." },
      criada_por: { type: "string", description: "Nome (ou parte) de quem criou a tarefa." },
      categoria: { type: "string", description: "Nome da categoria." },
      texto: { type: "string", description: "Palavra no título ou na descrição." },
      prazo_de: { type: "string", description: "Prazo a partir deste dia (AAAA-MM-DD)." },
      prazo_ate: { type: "string", description: "Prazo até este dia (AAAA-MM-DD)." },
      limite: { type: "number", description: "Máximo de tarefas (padrão 50, máximo 200)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const recorte = (RECORTES as readonly string[]).includes(String(args.recorte)) ? String(args.recorte) : "pendentes";
    const limite = numero(args.limite, 50, 200);
    const agora = new Date();
    const { inicio, fim } = janelaDoDia(e.fuso);
    const de = dataIso(args.prazo_de);
    const ate = dataIso(args.prazo_ate);

    let q = ctx.supabase.from("tarefas").select(CAMPOS_TAREFA, { count: "exact" }).eq("empresa_id", e.empresaId);
    const tipos: Record<string, string[]> = {
      pendentes: PENDENTES,
      atrasadas: PENDENTES,
      hoje: PENDENTES,
      em_andamento: ["em_andamento"],
      adiadas: ["adiado"],
      concluidas: ["concluido"],
      canceladas: ["cancelado"],
    };
    if (tipos[recorte]) q = q.in("status_id", n.idsPorTipo(tipos[recorte]));
    if (["pendentes", "atrasadas", "hoje", "em_andamento", "adiadas"].includes(recorte) && !de && !ate) {
      // como no Kanban: sem ocorrências futuras
      q = q.or(`ocorrencia_em.is.null,ocorrencia_em.lte.${fim}`);
    }
    if (recorte === "atrasadas") q = q.lt("prazo", agora.toISOString());
    if (recorte === "hoje") q = q.gte("prazo", inicio).lte("prazo", fim);
    if (de) q = q.gte("prazo", janelaDoDia(e.fuso, de).inicio);
    if (ate) q = q.lte("prazo", janelaDoDia(e.fuso, ate).fim);
    if (texto(args.origem) && texto(args.origem)! in ORIGENS) q = q.eq("origem", texto(args.origem)!);
    if (args.so_minhas === true) q = q.contains("responsaveis", [e.membroId]);
    const resp = texto(args.responsavel);
    if (resp) q = q.overlaps("responsaveis", acharPessoas(n, resp));
    const setor = texto(args.setor);
    if (setor) q = q.eq("setor_id", acharId(n.setores, setor, "Setor"));
    const unidade = texto(args.unidade);
    if (unidade) q = q.eq("unidade_id", acharId(n.unidades, unidade, "Unidade"));
    const criador = texto(args.criada_por);
    if (criador) q = q.in("criado_por", acharPessoas(n, criador));
    const nomeCategoria = texto(args.categoria);
    if (nomeCategoria) {
      const { data: categorias } = await ctx.supabase.from("categorias").select("id, nome").eq("empresa_id", e.empresaId);
      q = q.eq("categoria_id", acharId(categorias ?? [], nomeCategoria, "Categoria"));
    }
    const busca = texto(args.texto)?.replace(/[%,()]/g, " ");
    if (busca) q = q.or(`titulo.ilike.%${busca}%,descricao.ilike.%${busca}%`);
    q =
      recorte === "concluidas"
        ? q.order("concluida_em", { ascending: false })
        : q.order("prazo", { ascending: true, nullsFirst: false });

    const { data, count, error } = await q.limit(limite).returns<TarefaLinha[]>();
    if (error) throw new Error("Não consegui buscar as tarefas.");
    return {
      empresa: e.empresa,
      recorte,
      encontradas: count ?? data?.length ?? 0,
      mostrando: data?.length ?? 0,
      tarefas: (data ?? []).map((t) => descreverTarefa(t, n, e.fuso, agora.getTime())),
    };
  },
};

const checklists_do_dia: Ferramenta = {
  nome: "checklists_do_dia",
  titulo: "Check-lists do dia",
  descricao:
    "Check-lists marcados para um dia (feitos, pendentes, não realizados no tempo) e os preenchimentos enviados, com os itens respondidos \"Não\" e observações.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      data: { type: "string", description: "Dia (AAAA-MM-DD). Padrão: hoje." },
      so_com_problema: { type: "boolean", description: "true = só os preenchimentos com algum item que conta como problema (cada item define se o problema é a resposta Não, Sim ou nenhuma)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const dia = dataIso(args.data);
    const { inicio, fim } = janelaDoDia(e.fuso, dia);
    const [{ data: tarefas }, { data: execucoes }] = await Promise.all([
      ctx.supabase
        .from("tarefas")
        .select(CAMPOS_TAREFA)
        .eq("empresa_id", e.empresaId)
        .eq("origem", "checklist")
        .gte("ocorrencia_em", inicio)
        .lte("ocorrencia_em", fim)
        .order("ocorrencia_em")
        .limit(500)
        .returns<TarefaLinha[]>(),
      (() => {
        let q = ctx.supabase
          .from("checklist_execucoes")
          .select("modelo_nome, executor_nome, canal, observacao, qtd_nao, enviado_em, unidade_id, checklist_respostas(item_texto, resposta, problema, ordem)")
          .eq("empresa_id", e.empresaId)
          .gte("enviado_em", inicio)
          .lte("enviado_em", fim)
          .order("enviado_em")
          .limit(200);
        if (args.so_com_problema === true) q = q.gt("qtd_nao", 0);
        return q.returns<
          {
            modelo_nome: string;
            executor_nome: string;
            canal: string;
            observacao: string | null;
            qtd_nao: number;
            enviado_em: string;
            unidade_id: string;
            checklist_respostas: { item_texto: string; resposta: string | null; problema: boolean; ordem: number }[];
          }[]
        >();
      })(),
    ]);
    const lista = tarefas ?? [];
    return {
      empresa: e.empresa,
      dia: dia ? formatarDia(dia) : formatarData(new Date().toISOString(), e.fuso),
      marcados: lista.map((t) => ({
        checklist: t.titulo,
        horario: t.ocorrencia_em ? formatarDataHora(t.ocorrencia_em, e.fuso) : undefined,
        situacao: n.statusNome(t.status_id),
        responsaveis: n.pessoas(t.responsaveis),
        unidade: n.unidade(t.unidade_id) ?? undefined,
      })),
      preenchimentos: (execucoes ?? []).map((x) => ({
        checklist: x.modelo_nome,
        quem: x.executor_nome,
        pelo: x.canal === "qr" ? "QR Code" : "app",
        enviado_em: formatarDataHora(x.enviado_em, e.fuso),
        unidade: n.unidade(x.unidade_id) ?? undefined,
        problemas: x.qtd_nao,
        itens_com_problema: x.checklist_respostas
          .filter((r) => r.problema)
          .sort((a, b) => a.ordem - b.ordem)
          .map((r) => r.item_texto),
        observacao: x.observacao || undefined,
      })),
    };
  },
};

const manutencoes: Ferramenta = {
  nome: "manutencoes",
  titulo: "Manutenções",
  descricao: "Chamados de manutenção com número, prioridade, status, responsáveis, prestador, equipamento, local, custo e há quantos dias estão abertos.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      situacao: { type: "string", enum: ["abertas", "concluidas", "todas"], description: "Padrão: abertas." },
      prioridade: { type: "string", enum: Object.keys(PRIORIDADES) },
      numero: { type: "number", description: "Número do chamado." },
      texto: { type: "string", description: "Palavra no título ou na descrição." },
      limite: { type: "number", description: "Padrão 50, máximo 200." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const situacao = ["abertas", "concluidas", "todas"].includes(String(args.situacao)) ? String(args.situacao) : "abertas";
    let q = ctx.supabase
      .from("chamados")
      .select(
        `numero, prioridade, local, custo, aberto_por_nome, created_at,
         fornecedores(nome, telefone), equipamentos(nome, codigo),
         tarefas!inner(${CAMPOS_TAREFA})`,
      )
      .eq("empresa_id", e.empresaId);
    if (situacao === "abertas") q = q.in("tarefas.status_id", n.idsPorTipo(PENDENTES));
    if (situacao === "concluidas") q = q.in("tarefas.status_id", n.idsPorTipo(["concluido"]));
    if (texto(args.prioridade) && texto(args.prioridade)! in PRIORIDADES) q = q.eq("prioridade", texto(args.prioridade)!);
    if (args.numero !== undefined) q = q.eq("numero", Number(args.numero));
    const busca = texto(args.texto)?.replace(/[%,()]/g, " ");
    if (busca) q = q.or(`titulo.ilike.%${busca}%,descricao.ilike.%${busca}%`, { referencedTable: "tarefas" });
    const { data, error } = await q
      .order("created_at", { ascending: situacao === "abertas" })
      .limit(numero(args.limite, 50, 200))
      .returns<
        {
          numero: number;
          prioridade: Prioridade;
          local: string | null;
          custo: number | null;
          aberto_por_nome: string | null;
          created_at: string;
          fornecedores: { nome: string; telefone: string | null } | null;
          equipamentos: { nome: string; codigo: string | null } | null;
          tarefas: TarefaLinha;
        }[]
      >();
    if (error) throw new Error("Não consegui buscar as manutenções.");
    const agora = Date.now();
    return {
      empresa: e.empresa,
      situacao,
      chamados: (data ?? []).map((c) => ({
        numero: c.numero,
        ...descreverTarefa(c.tarefas, n, e.fuso, agora),
        origem: undefined,
        prioridade: PRIORIDADES[c.prioridade]?.rotulo ?? c.prioridade,
        aberto_em: formatarDataHora(c.created_at, e.fuso),
        dias_aberto: c.tarefas.concluida_em ? undefined : Math.floor((agora - new Date(c.created_at).getTime()) / DIA),
        aberto_por: c.aberto_por_nome ?? undefined,
        local: c.local ?? undefined,
        equipamento: c.equipamentos ? [c.equipamentos.nome, c.equipamentos.codigo].filter(Boolean).join(" · ") : undefined,
        prestador: c.fornecedores ? [c.fornecedores.nome, c.fornecedores.telefone].filter(Boolean).join(" · ") : undefined,
        custo: c.custo ?? undefined,
      })),
    };
  },
};

const escala: Ferramenta = {
  nome: "escala",
  titulo: "Escala",
  descricao: "Quem trabalha em cada dia, em qual turno e unidade, e quem está de folga, férias ou falta. Até 31 dias por consulta.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      de: { type: "string", description: "Primeiro dia (AAAA-MM-DD). Padrão: hoje." },
      ate: { type: "string", description: "Último dia (AAAA-MM-DD). Padrão: igual ao primeiro." },
      pessoa: { type: "string", description: "Nome (ou parte) de um colaborador." },
      unidade: { type: "string", description: "Nome da unidade." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const de = dataIso(args.de) ?? hojeIso(e.fuso);
    let ate = dataIso(args.ate) ?? de;
    if (ate < de) throw new Error("O dia final vem antes do inicial.");
    if (ate > somarDias(de, 30)) ate = somarDias(de, 30);
    let q = ctx.supabase
      .from("escalas")
      .select("data, membro_id, tipo, unidade_id, observacao, turnos(nome, inicio, fim, periodo)")
      .eq("empresa_id", e.empresaId)
      .gte("data", de)
      .lte("data", ate)
      .order("data");
    const pessoa = texto(args.pessoa);
    if (pessoa) q = q.in("membro_id", acharPessoas(n, pessoa));
    const unidade = texto(args.unidade);
    if (unidade) q = q.eq("unidade_id", acharId(n.unidades, unidade, "Unidade"));
    const { data, error } = await q.limit(3000).returns<
      {
        data: string;
        membro_id: string;
        tipo: TipoEscala;
        unidade_id: string;
        observacao: string | null;
        turnos: Pick<Turno, "nome" | "inicio" | "fim" | "periodo"> | null;
      }[]
    >();
    if (error) throw new Error("Não consegui consultar a escala.");
    const dias = new Map<string, unknown[]>();
    for (const x of data ?? []) {
      const l = dias.get(x.data) ?? [];
      l.push({
        pessoa: n.membro(x.membro_id),
        ...(x.tipo === "turno" && x.turnos
          ? { turno: x.turnos.nome, horario: horarioTurno(x.turnos) }
          : { ausencia: AUSENCIAS[x.tipo as Exclude<TipoEscala, "turno">]?.rotulo }),
        unidade: n.unidades.length > 1 ? n.unidade(x.unidade_id) : undefined,
        observacao: x.observacao ?? undefined,
      });
      dias.set(x.data, l);
    }
    return {
      empresa: e.empresa,
      periodo: `${formatarDia(de)} a ${formatarDia(ate)}`,
      dias: [...dias.entries()].map(([d, pessoas]) => ({ dia: formatarDia(d), pessoas })),
      observacao: dias.size === 0 ? "Nada lançado na escala nesse período." : undefined,
    };
  },
};

const proximos_alertas: Ferramenta = {
  nome: "proximos_alertas",
  titulo: "Próximos alertas",
  descricao: "Alertas de datas importantes (vencimentos, renovações, aniversários etc.) que acontecem nos próximos dias, com a recorrência e os avisos programados.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      dias: { type: "number", description: "Quantos dias à frente (padrão 30, máximo 366)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const dias = numero(args.dias, 30, 366);
    const { data } = await ctx.supabase
      .from("alertas")
      .select("*, alerta_avisos(dias_antes, titulo, responsaveis)")
      .eq("empresa_id", e.empresaId)
      .eq("ativo", true);
    const limite = new Date(Date.now() + dias * DIA);
    const lista = ((data ?? []) as (Alerta & { alerta_avisos: { dias_antes: number; titulo: string; responsaveis: string[] }[] })[])
      .map((a) => ({ a, quando: proximaOcorrencia({ regra: a.recorrencia, horario: a.horario, inicio: a.data_evento, fuso: e.fuso }) }))
      .filter((x) => x.quando && x.quando <= limite)
      .sort((x, y) => x.quando!.getTime() - y.quando!.getTime());
    return {
      empresa: e.empresa,
      proximos_dias: dias,
      alertas: lista.map(({ a, quando }) => ({
        alerta: a.nome,
        descricao: a.descricao || undefined,
        data: formatarData(quando!.toISOString(), e.fuso),
        faltam_dias: Math.ceil((quando!.getTime() - Date.now()) / DIA),
        repete: a.recorrencia ? descreverRecorrencia(a.recorrencia) : "não repete",
        setor: n.setor(a.setor_id) ?? undefined,
        avisos: a.alerta_avisos
          .sort((x, y) => y.dias_antes - x.dias_antes)
          .map((v) => ({ quando: `${v.dias_antes} dia(s) antes`, acao: v.titulo, responsaveis: n.pessoas(v.responsaveis) })),
        privado: a.privado || undefined,
      })),
    };
  },
};

const planos: Ferramenta = {
  nome: "planos",
  titulo: "Projetos",
  descricao: "Projetos de médio e longo prazo (PMLP): situação, responsável, previsão, andamento das etapas, etapas atrasadas e próximas etapas.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      incluir_encerrados: { type: "boolean", description: "Incluir projetos concluídos e cancelados." },
      texto: { type: "string", description: "Parte do nome do projeto." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    let q = ctx.supabase.from("planos").select("*").eq("empresa_id", e.empresaId).order("fim_previsto", { nullsFirst: false });
    if (args.incluir_encerrados !== true) q = q.not("situacao", "in", "(concluido,cancelado)");
    const busca = texto(args.texto)?.replace(/[%,()]/g, " ");
    if (busca) q = q.ilike("nome", `%${busca}%`);
    const { data: lista, error } = await q.limit(100).returns<
      {
        id: string;
        nome: string;
        objetivo: string | null;
        horizonte: Horizonte;
        situacao: SituacaoPlano;
        inicio: string | null;
        fim_previsto: string | null;
        responsavel_id: string | null;
        setor_id: string | null;
        privado: boolean;
      }[]
    >();
    if (error) throw new Error("Não consegui consultar os projetos.");
    const ids = (lista ?? []).map((p) => p.id);
    const { data: etapas } = ids.length
      ? await ctx.supabase
          .from("tarefas")
          .select(`${CAMPOS_TAREFA}, origem_id`)
          .eq("empresa_id", e.empresaId)
          .eq("origem", "plano")
          .in("origem_id", ids)
          .returns<(TarefaLinha & { origem_id: string })[]>()
      : { data: [] };
    const agora = Date.now();
    return {
      empresa: e.empresa,
      planos: (lista ?? []).map((p) => {
        const minhas = (etapas ?? []).filter((t) => t.origem_id === p.id);
        const abertas = minhas.filter((t) => PENDENTES.includes(n.tipoStatus(t.status_id) ?? ""));
        return {
          plano: p.nome,
          objetivo: p.objetivo || undefined,
          situacao: SITUACOES_PLANO[p.situacao]?.rotulo ?? p.situacao,
          horizonte: HORIZONTES[p.horizonte]?.rotulo,
          responsavel: n.membro(p.responsavel_id) ?? undefined,
          setor: n.setor(p.setor_id) ?? undefined,
          inicio: p.inicio ? formatarDia(p.inicio) : undefined,
          fim_previsto: p.fim_previsto ? formatarDia(p.fim_previsto) : undefined,
          etapas: {
            total: minhas.length,
            concluidas: minhas.filter((t) => n.tipoStatus(t.status_id) === "concluido").length,
            atrasadas: abertas.filter((t) => t.prazo && new Date(t.prazo).getTime() < agora).length,
          },
          proximas_etapas: abertas
            .sort((a, b) => (a.prazo ?? "9").localeCompare(b.prazo ?? "9"))
            .slice(0, 5)
            .map((t) => descreverTarefa(t, n, e.fuso, agora))
            .map((t) => ({ ...t, origem: undefined })),
          privado: p.privado || undefined,
        };
      }),
    };
  },
};

const equipe: Ferramenta = {
  nome: "equipe",
  titulo: "Equipe",
  descricao: "Colaboradores da empresa com cargo, setor, perfil de acesso e WhatsApp.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Parte do nome ou do cargo." },
      setor: { type: "string", description: "Nome do setor." },
      incluir_inativos: { type: "boolean" },
      sem_whatsapp: { type: "boolean", description: "true = só quem não tem WhatsApp cadastrado." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    let q = ctx.supabase
      .from("membros")
      .select("nome, cargo, telefone, email, setor_id, dono, ativo, usuario_id, perfis(nome)")
      .eq("empresa_id", e.empresaId)
      .order("nome");
    if (args.incluir_inativos !== true) q = q.eq("ativo", true);
    const setor = texto(args.setor);
    if (setor) q = q.eq("setor_id", acharId(n.setores, setor, "Setor"));
    const { data, error } = await q.returns<
      {
        nome: string;
        cargo: string | null;
        telefone: string | null;
        email: string | null;
        setor_id: string | null;
        dono: boolean;
        ativo: boolean;
        usuario_id: string | null;
        perfis: { nome: string } | null;
      }[]
    >();
    if (error) throw new Error("Não consegui consultar a equipe.");
    const busca = texto(args.texto);
    return {
      empresa: e.empresa,
      colaboradores: (data ?? [])
        .filter((m) => !busca || contem(m.nome, busca) || contem(m.cargo, busca))
        .filter((m) => args.sem_whatsapp !== true || !m.telefone)
        .map((m) => ({
          nome: m.nome,
          cargo: m.cargo ?? undefined,
          setor: n.setor(m.setor_id) ?? undefined,
          perfil: m.dono ? "Dono" : (m.perfis?.nome ?? undefined),
          whatsapp: m.telefone ?? undefined,
          email: m.email ?? undefined,
          usa_o_app: !!m.usuario_id,
          inativo: !m.ativo || undefined,
        })),
    };
  },
};

const prestadores: Ferramenta = {
  nome: "prestadores",
  titulo: "Prestadores",
  descricao: "Prestadores de serviço cadastrados (eletricista, refrigeração etc.) com contatos e tipos de serviço.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Parte do nome, da especialidade ou do tipo de serviço." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const [{ data, error }, { data: tipos }] = await Promise.all([
      ctx.supabase
        .from("fornecedores")
        .select("*, fornecedor_tipos(tipo_id)")
        .eq("empresa_id", e.empresaId)
        .eq("ativo", true)
        .order("nome")
        .returns<
          {
            nome: string;
            especialidade: string | null;
            telefone: string | null;
            telefone2: string | null;
            email: string | null;
            fornecedor_tipos: { tipo_id: string }[];
          }[]
        >(),
      ctx.supabase.from("tipos_servico").select("id, nome").eq("empresa_id", e.empresaId),
    ]);
    if (error) throw new Error("Não consegui consultar os prestadores.");
    const nomeTipo = new Map((tipos ?? []).map((t) => [t.id, t.nome as string]));
    const busca = texto(args.texto);
    return {
      empresa: e.empresa,
      prestadores: (data ?? [])
        .map((p) => ({
          nome: p.nome,
          servicos: p.fornecedor_tipos.map((t) => nomeTipo.get(t.tipo_id)).filter(Boolean) as string[],
          especialidade: p.especialidade ?? undefined,
          telefones: [p.telefone, p.telefone2].filter(Boolean),
          email: p.email ?? undefined,
        }))
        .filter((p) => !busca || [p.nome, p.especialidade, ...p.servicos].some((x) => contem(x, busca))),
    };
  },
};

const patrimonio: Ferramenta = {
  nome: "patrimonio",
  titulo: "Patrimônio",
  descricao: "Equipamentos, móveis e outros bens: situação (em uso, em manutenção, parado...), unidade, marca/modelo, compra e garantia.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Parte do nome, código, marca ou modelo." },
      situacao: { type: "string", enum: Object.keys(SITUACOES_PATRIMONIO) },
      unidade: { type: "string", description: "Nome da unidade." },
      garantia_vence_em_dias: { type: "number", description: "Só bens com garantia vencendo nos próximos N dias." },
      limite: { type: "number", description: "Padrão 100, máximo 500." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    let q = ctx.supabase
      .from("equipamentos")
      .select("nome, codigo, marca, modelo, tipo, situacao, unidade_id, setor_id, data_compra, valor_compra, garantia_ate, observacao")
      .eq("empresa_id", e.empresaId)
      .eq("ativo", true)
      .order("nome");
    if (texto(args.situacao) && texto(args.situacao)! in SITUACOES_PATRIMONIO) q = q.eq("situacao", texto(args.situacao)!);
    const unidade = texto(args.unidade);
    if (unidade) q = q.eq("unidade_id", acharId(n.unidades, unidade, "Unidade"));
    if (args.garantia_vence_em_dias !== undefined) {
      const hoje = hojeIso(e.fuso);
      q = q.gte("garantia_ate", hoje).lte("garantia_ate", somarDias(hoje, numero(args.garantia_vence_em_dias, 30, 3650)));
    }
    const busca = texto(args.texto)?.replace(/[%,()]/g, " ");
    if (busca) q = q.or(`nome.ilike.%${busca}%,codigo.ilike.%${busca}%,marca.ilike.%${busca}%,modelo.ilike.%${busca}%`);
    const { data, error } = await q.limit(numero(args.limite, 100, 500)).returns<
      {
        nome: string;
        codigo: string | null;
        marca: string | null;
        modelo: string | null;
        situacao: SituacaoPatrimonio;
        unidade_id: string | null;
        setor_id: string | null;
        data_compra: string | null;
        valor_compra: number | null;
        garantia_ate: string | null;
        observacao: string | null;
      }[]
    >();
    if (error) throw new Error("Não consegui consultar o patrimônio.");
    return {
      empresa: e.empresa,
      bens: (data ?? []).map((b) => ({
        nome: b.nome,
        codigo: b.codigo ?? undefined,
        marca_modelo: [b.marca, b.modelo].filter(Boolean).join(" ") || undefined,
        situacao: SITUACOES_PATRIMONIO[b.situacao]?.rotulo ?? b.situacao,
        unidade: n.unidade(b.unidade_id) ?? undefined,
        setor: n.setor(b.setor_id) ?? undefined,
        comprado_em: b.data_compra ? formatarDia(b.data_compra) : undefined,
        valor: b.valor_compra ?? undefined,
        garantia_ate: b.garantia_ate ? formatarDia(b.garantia_ate) : undefined,
        observacao: b.observacao ?? undefined,
      })),
    };
  },
};

const SITUACOES_ATIVIDADE = ["ativas", "pausadas", "todas"] as const;
const situacaoAtividade = (v: unknown) => ((SITUACOES_ATIVIDADE as readonly string[]).includes(String(v)) ? String(v) : "ativas");

const acoes_recorrentes: Ferramenta = {
  nome: "acoes_recorrentes",
  titulo: "Ações recorrentes",
  descricao:
    "Varre a seção Ações recorrentes (os cadastros, não as tarefas geradas): inclui as que ainda não geraram tarefa. Mostra título, descrição, responsáveis, repetição, horário, prazo, setor, unidade, categoria, início/fim, próxima ocorrência e se está ativa ou pausada. Itens privados só aparecem para quem pode vê-los.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Palavra no nome ou na descrição (sem acento, sem diferenciar maiúsculas)." },
      situacao: { type: "string", enum: [...SITUACOES_ATIVIDADE], description: "Padrão: ativas." },
      responsavel: { type: "string", description: "Nome (ou parte) de um dos responsáveis." },
      so_minhas: { type: "boolean", description: "Só as ações em que a pessoa logada é responsável." },
      setor: { type: "string", description: "Nome do setor." },
      unidade: { type: "string", description: "Nome da unidade." },
      categoria: { type: "string", description: "Nome da categoria." },
      proximos_dias: { type: "number", description: "Só as que têm próxima ocorrência nos próximos N dias (máximo 730)." },
      limite: { type: "number", description: "Padrão 100, máximo 500." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const sit = situacaoAtividade(args.situacao);
    let q = ctx.supabase.from("acoes").select("*").eq("empresa_id", e.empresaId).order("nome");
    if (sit === "ativas") q = q.eq("ativo", true);
    if (sit === "pausadas") q = q.eq("ativo", false);
    if (args.so_minhas === true) q = q.contains("responsaveis", [e.membroId]);
    const resp = texto(args.responsavel);
    if (resp) q = q.overlaps("responsaveis", acharPessoas(n, resp));
    const setor = texto(args.setor);
    if (setor) q = q.eq("setor_id", acharId(n.setores, setor, "Setor"));
    const unidade = texto(args.unidade);
    if (unidade) q = q.eq("unidade_id", acharId(n.unidades, unidade, "Unidade"));
    const nomeCategoria = texto(args.categoria);
    const { data: categorias } = await ctx.supabase.from("categorias").select("id, nome").eq("empresa_id", e.empresaId);
    if (nomeCategoria) q = q.eq("categoria_id", acharId(categorias ?? [], nomeCategoria, "Categoria"));
    const { data, error } = await q.returns<Acao[]>();
    if (error) throw new Error("Não consegui consultar as ações recorrentes.");

    const busca = texto(args.texto);
    const dias = args.proximos_dias !== undefined ? numero(args.proximos_dias, 30, 730) : undefined;
    const limiteData = dias ? new Date(Date.now() + dias * DIA) : undefined;
    const categoria = (id: string | null) => (id ? ((categorias ?? []).find((c) => c.id === id)?.nome ?? null) : null);
    const lista = (data ?? [])
      .filter((a) => !busca || contem(a.nome, busca) || contem(a.descricao, busca))
      .map((a) => ({
        a,
        proxima: a.ativo
          ? proximaOcorrencia({ regra: a.recorrencia, horario: a.horario, inicio: a.data_inicial, fim: a.data_final, fuso: e.fuso })
          : null,
      }))
      .filter((x) => !limiteData || (x.proxima && x.proxima <= limiteData))
      .sort((x, y) => (x.proxima?.getTime() ?? Infinity) - (y.proxima?.getTime() ?? Infinity));
    const mostradas = lista.slice(0, numero(args.limite, 100, 500));
    return {
      empresa: e.empresa,
      situacao: sit,
      encontradas: lista.length,
      mostrando: mostradas.length,
      acoes: mostradas.map(({ a, proxima }) => ({
        acao: a.nome,
        descricao: a.descricao || undefined,
        situacao: a.ativo ? "ativa" : "pausada",
        responsaveis: n.pessoas(a.responsaveis),
        repete: a.recorrencia ? descreverRecorrencia(a.recorrencia) : "não repete (uma vez só)",
        horario: a.horario.slice(0, 5),
        prazo_em_horas: Math.round((a.prazo_minutos / 60) * 100) / 100,
        proxima_ocorrencia: proxima ? formatarDataHora(proxima.toISOString(), e.fuso) : undefined,
        sem_proxima_ocorrencia: (a.ativo && !proxima) || undefined,
        inicio: formatarDia(a.data_inicial),
        fim: a.data_final ? formatarDia(a.data_final) : undefined,
        setor: n.setor(a.setor_id) ?? undefined,
        unidade: n.unidade(a.unidade_id) ?? undefined,
        categoria: categoria(a.categoria_id) ?? undefined,
        privada: a.privado || undefined,
      })),
    };
  },
};

const DIAS_SEMANA = ["", "seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const rotinas: Ferramenta = {
  nome: "rotinas",
  titulo: "Rotinas",
  descricao:
    "Rotinas do dia a dia (cronograma de referência, não geram tarefas): horário, dias da semana, passo a passo, setor, função e unidade. Dá para ver só as de um dia da semana ou de um setor.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Palavra no nome ou no passo a passo." },
      setor: { type: "string", description: "Nome do setor." },
      funcao: { type: "string", description: "Nome da função (cargo)." },
      unidade: { type: "string", description: "Nome da unidade (inclui as que valem para todas)." },
      dia: { type: "string", enum: DIAS_SEMANA.slice(1), description: "Só as que valem neste dia da semana." },
      incluir_inativas: { type: "boolean" },
      limite: { type: "number", description: "Padrão 100, máximo 500." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const { data: funcoes } = await ctx.supabase.from("funcoes").select("id, nome").eq("empresa_id", e.empresaId);
    let q = ctx.supabase
      .from("rotinas")
      .select("nome, descricao, horario, dias, setor_ids, funcao_id, unidade_id, ativo")
      .eq("empresa_id", e.empresaId)
      .order("horario");
    if (args.incluir_inativas !== true) q = q.eq("ativo", true);
    const setor = texto(args.setor);
    if (setor) q = q.contains("setor_ids", [acharId(n.setores, setor, "Setor")]);
    const funcao = texto(args.funcao);
    if (funcao) q = q.eq("funcao_id", acharId(funcoes ?? [], funcao, "Função"));
    const unidade = texto(args.unidade);
    if (unidade) q = q.or(`unidade_id.is.null,unidade_id.eq.${acharId(n.unidades, unidade, "Unidade")}`);
    const dia = DIAS_SEMANA.indexOf(texto(args.dia) ?? "");
    if (dia > 0) q = q.contains("dias", [dia]);
    const { data, error } = await q.returns<
      { nome: string; descricao: string | null; horario: string; dias: number[]; setor_ids: string[]; funcao_id: string | null; unidade_id: string | null; ativo: boolean }[]
    >();
    if (error) throw new Error("Não consegui consultar as rotinas.");
    const busca = texto(args.texto);
    const lista = (data ?? []).filter((r) => !busca || contem(r.nome, busca) || contem(r.descricao, busca));
    const mostradas = lista.slice(0, numero(args.limite, 100, 500));
    return {
      empresa: e.empresa,
      encontradas: lista.length,
      mostrando: mostradas.length,
      rotinas: mostradas.map((r) => ({
        rotina: r.nome,
        horario: r.horario.slice(0, 5),
        dias: r.dias.length === 7 ? "todos os dias" : [...r.dias].sort().map((d) => DIAS_SEMANA[d]).join(", "),
        passo_a_passo: r.descricao || undefined,
        setores: r.setor_ids.map((id) => n.setor(id)).filter(Boolean),
        funcao: (funcoes ?? []).find((f) => f.id === r.funcao_id)?.nome,
        unidade: n.unidade(r.unidade_id) ?? "todas as unidades",
        inativa: !r.ativo || undefined,
      })),
    };
  },
};

const modelos_de_checklist: Ferramenta = {
  nome: "modelos_de_checklist",
  titulo: "Modelos de check-list",
  descricao:
    "Os modelos de check-list cadastrados (inclusive os que ainda não geraram tarefa): horário, repetição, tolerância, setor, unidade, responsável e os itens de cada um.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Parte do nome do modelo." },
      setor: { type: "string", description: "Nome do setor." },
      unidade: { type: "string", description: "Nome da unidade." },
      incluir_inativos: { type: "boolean" },
      com_itens: { type: "boolean", description: "true = lista os itens de cada modelo (padrão: só a quantidade)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    let q = ctx.supabase
      .from("checklist_modelos")
      .select("id, nome, descricao, horario_preferencial, tolerancia_minutos, recorrencia, setor_id, unidade_id, responsavel_id, ativo, checklist_itens(texto, ordem)")
      .eq("empresa_id", e.empresaId)
      .order("nome");
    if (args.incluir_inativos !== true) q = q.eq("ativo", true);
    const setor = texto(args.setor);
    if (setor) q = q.eq("setor_id", acharId(n.setores, setor, "Setor"));
    const unidade = texto(args.unidade);
    if (unidade) q = q.eq("unidade_id", acharId(n.unidades, unidade, "Unidade"));
    const { data, error } = await q.returns<
      {
        nome: string;
        descricao: string | null;
        horario_preferencial: string;
        tolerancia_minutos: number;
        recorrencia: string;
        setor_id: string | null;
        unidade_id: string | null;
        responsavel_id: string | null;
        ativo: boolean;
        checklist_itens: { texto: string; ordem: number }[];
      }[]
    >();
    if (error) throw new Error("Não consegui consultar os modelos de check-list.");
    const busca = texto(args.texto);
    return {
      empresa: e.empresa,
      modelos: (data ?? [])
        .filter((m) => !busca || contem(m.nome, busca))
        .map((m) => ({
          modelo: m.nome,
          descricao: m.descricao || undefined,
          horario: m.horario_preferencial.slice(0, 5),
          repete: descreverRecorrencia(m.recorrencia),
          tolerancia_minutos: m.tolerancia_minutos,
          setor: n.setor(m.setor_id) ?? undefined,
          unidade: n.unidade(m.unidade_id) ?? "todas as unidades",
          responsavel: n.membro(m.responsavel_id) ?? undefined,
          itens: args.com_itens === true ? [...m.checklist_itens].sort((a, b) => a.ordem - b.ordem).map((i) => i.texto) : m.checklist_itens.length,
          inativo: !m.ativo || undefined,
        })),
    };
  },
};

const carga_por_pessoa: Ferramenta = {
  nome: "carga_por_pessoa",
  titulo: "Carga de tarefas por pessoa",
  descricao:
    "Quanto cada pessoa tem na mão: tarefas pendentes, atrasadas, que vencem hoje, em andamento e concluídas nos últimos N dias. Tarefa com vários responsáveis conta para cada um. Ordenado por quem tem mais atrasadas.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      setor: { type: "string", description: "Só tarefas deste setor." },
      origem: { type: "string", enum: Object.keys(ORIGENS), description: "Só tarefas deste módulo." },
      dias_concluidas: { type: "number", description: "Janela das concluídas, em dias (padrão 7, máximo 90)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const agora = Date.now();
    const { fim } = janelaDoDia(e.fuso);
    const dias = numero(args.dias_concluidas, 7, 90);
    const desde = new Date(agora - dias * DIA).toISOString();
    const setor = texto(args.setor) ? acharId(n.setores, texto(args.setor)!, "Setor") : undefined;
    const origem = texto(args.origem) && texto(args.origem)! in ORIGENS ? texto(args.origem)! : undefined;
    const filtros = <T extends { eq: (c: string, v: string) => T }>(q: T) => {
      if (setor) q = q.eq("setor_id", setor);
      if (origem) q = q.eq("origem", origem);
      return q;
    };
    const [{ data: abertas }, { data: feitas }] = await Promise.all([
      filtros(
        ctx.supabase
          .from("tarefas")
          .select(CAMPOS_TAREFA)
          .eq("empresa_id", e.empresaId)
          .in("status_id", n.idsPorTipo(PENDENTES))
          .or(`ocorrencia_em.is.null,ocorrencia_em.lte.${fim}`)
          .limit(3000),
      ).returns<TarefaLinha[]>(),
      filtros(
        ctx.supabase.from("tarefas").select("responsaveis").eq("empresa_id", e.empresaId).gte("concluida_em", desde).limit(3000),
      ).returns<{ responsaveis: string[] }[]>(),
    ]);
    const fimMs = new Date(fim).getTime();
    const linhas = new Map<string, { pendentes: number; atrasadas: number; vencem_hoje: number; em_andamento: number; concluidas: number }>();
    const linha = (id: string) => {
      if (!linhas.has(id)) linhas.set(id, { pendentes: 0, atrasadas: 0, vencem_hoje: 0, em_andamento: 0, concluidas: 0 });
      return linhas.get(id)!;
    };
    let semResponsavel = 0;
    for (const t of abertas ?? []) {
      const prazo = t.prazo ? new Date(t.prazo).getTime() : null;
      if (t.responsaveis.length === 0) semResponsavel++;
      for (const id of t.responsaveis) {
        const l = linha(id);
        l.pendentes++;
        if (prazo !== null && prazo < agora) l.atrasadas++;
        else if (prazo !== null && prazo <= fimMs) l.vencem_hoje++;
        if (n.tipoStatus(t.status_id) === "em_andamento") l.em_andamento++;
      }
    }
    for (const t of feitas ?? []) for (const id of t.responsaveis) linha(id).concluidas++;
    return {
      empresa: e.empresa,
      concluidas_nos_ultimos_dias: dias,
      pendentes_sem_responsavel: semResponsavel,
      pessoas: [...linhas.entries()]
        .map(([id, l]) => ({ pessoa: n.membro(id), ...l }))
        .sort((a, b) => b.atrasadas - a.atrasadas || b.pendentes - a.pendentes),
    };
  },
};

const taxa_de_checklists: Ferramenta = {
  nome: "taxa_de_checklists",
  titulo: "Taxa de check-lists",
  descricao:
    "Cumprimento dos check-lists num período: por check-list, quantos foram marcados, feitos, não realizados no tempo e ainda pendentes (com a % de feitos), mais os itens que mais deram problema.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      de: { type: "string", description: "Primeiro dia (AAAA-MM-DD). Padrão: 7 dias atrás." },
      ate: { type: "string", description: "Último dia (AAAA-MM-DD). Padrão: hoje." },
      unidade: { type: "string", description: "Nome da unidade." },
      setor: { type: "string", description: "Nome do setor." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const hoje = hojeIso(e.fuso);
    const de = dataIso(args.de) ?? somarDias(hoje, -7);
    const ate = dataIso(args.ate) ?? hoje;
    const inicio = janelaDoDia(e.fuso, de).inicio;
    const fim = janelaDoDia(e.fuso, ate).fim;
    const unidade = texto(args.unidade) ? acharId(n.unidades, texto(args.unidade)!, "Unidade") : undefined;
    const setor = texto(args.setor) ? acharId(n.setores, texto(args.setor)!, "Setor") : undefined;
    let qt = ctx.supabase
      .from("tarefas")
      .select(CAMPOS_TAREFA)
      .eq("empresa_id", e.empresaId)
      .eq("origem", "checklist")
      .gte("ocorrencia_em", inicio)
      .lte("ocorrencia_em", fim)
      .limit(5000);
    let qe = ctx.supabase
      .from("checklist_execucoes")
      .select("checklist_respostas(item_texto, problema)")
      .eq("empresa_id", e.empresaId)
      .gte("enviado_em", inicio)
      .lte("enviado_em", fim)
      .limit(2000);
    if (unidade) {
      qt = qt.eq("unidade_id", unidade);
      qe = qe.eq("unidade_id", unidade);
    }
    if (setor) {
      qt = qt.eq("setor_id", setor);
      qe = qe.eq("setor_id", setor);
    }
    const [{ data: tarefas }, { data: execucoes }] = await Promise.all([
      qt.returns<TarefaLinha[]>(),
      qe.returns<{ checklist_respostas: { item_texto: string; problema: boolean }[] }[]>(),
    ]);
    const porNome = new Map<string, { marcados: number; feitos: number; nao_realizados: number; pendentes: number }>();
    for (const t of tarefas ?? []) {
      const l = porNome.get(t.titulo) ?? { marcados: 0, feitos: 0, nao_realizados: 0, pendentes: 0 };
      l.marcados++;
      const tipo = n.tipoStatus(t.status_id);
      if (tipo === "concluido") l.feitos++;
      else if (tipo === "cancelado") l.nao_realizados++;
      else l.pendentes++;
      porNome.set(t.titulo, l);
    }
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
    const lista = [...porNome.entries()].map(([checklist, l]) => ({ checklist, ...l, percentual_feitos: pct(l.feitos, l.marcados) }));
    const total = lista.reduce((s, l) => ({ marcados: s.marcados + l.marcados, feitos: s.feitos + l.feitos }), { marcados: 0, feitos: 0 });
    const problemas = new Map<string, number>();
    for (const x of execucoes ?? []) for (const r of x.checklist_respostas) if (r.problema) problemas.set(r.item_texto, (problemas.get(r.item_texto) ?? 0) + 1);
    return {
      empresa: e.empresa,
      periodo: `${formatarDia(de)} a ${formatarDia(ate)}`,
      geral: { ...total, percentual_feitos: pct(total.feitos, total.marcados) },
      por_checklist: lista.sort((a, b) => (a.percentual_feitos ?? 101) - (b.percentual_feitos ?? 101)),
      itens_que_mais_deram_problema: [...problemas.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([item, vezes]) => ({ item, vezes })),
    };
  },
};

const indicadores_manutencao: Ferramenta = {
  nome: "indicadores_manutencao",
  titulo: "Indicadores de manutenção",
  descricao:
    "Panorama dos chamados de manutenção num período (padrão: 30 dias): abertos e concluídos, tempo médio para resolver (por prioridade), custo, desempenho por prestador e equipamentos com defeito repetido (2 ou mais chamados).",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      dias: { type: "number", description: "Chamados abertos nos últimos N dias (padrão 30, máximo 365)." },
      equipamento: { type: "string", description: "Parte do nome ou código do equipamento." },
      prestador: { type: "string", description: "Parte do nome do prestador." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const dias = numero(args.dias, 30, 365);
    const desde = new Date(Date.now() - dias * DIA).toISOString();
    const { data, error } = await ctx.supabase
      .from("chamados")
      .select("numero, prioridade, custo, created_at, equipamento_id, fornecedor_id, fornecedores(nome), equipamentos(nome, codigo), tarefas!inner(status_id, concluida_em)")
      .eq("empresa_id", e.empresaId)
      .gte("created_at", desde)
      .limit(2000)
      .returns<
        {
          numero: number;
          prioridade: Prioridade;
          custo: number | null;
          created_at: string;
          equipamento_id: string | null;
          fornecedor_id: string | null;
          fornecedores: { nome: string } | null;
          equipamentos: { nome: string; codigo: string | null } | null;
          tarefas: { status_id: string; concluida_em: string | null };
        }[]
      >();
    if (error) throw new Error("Não consegui consultar as manutenções.");
    const filtroEq = texto(args.equipamento);
    const filtroPr = texto(args.prestador);
    const lista = (data ?? []).filter(
      (c) =>
        (!filtroEq || contem(c.equipamentos?.nome, filtroEq) || contem(c.equipamentos?.codigo, filtroEq)) &&
        (!filtroPr || contem(c.fornecedores?.nome, filtroPr)),
    );
    const diasAteResolver = (c: (typeof lista)[number]) =>
      c.tarefas.concluida_em && n.tipoStatus(c.tarefas.status_id) === "concluido"
        ? (new Date(c.tarefas.concluida_em).getTime() - new Date(c.created_at).getTime()) / DIA
        : null;
    const media = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const resolvidos = (xs: typeof lista) => xs.map(diasAteResolver).filter((x): x is number => x !== null);
    const custo = (xs: typeof lista) => xs.reduce((t, c) => t + (c.custo ?? 0), 0);
    const abertos = lista.filter((c) => PENDENTES.includes(n.tipoStatus(c.tarefas.status_id) ?? ""));

    const porPrestador = new Map<string, typeof lista>();
    const porEquipamento = new Map<string, typeof lista>();
    for (const c of lista) {
      if (c.fornecedor_id) porPrestador.set(c.fornecedor_id, [...(porPrestador.get(c.fornecedor_id) ?? []), c]);
      if (c.equipamento_id) porEquipamento.set(c.equipamento_id, [...(porEquipamento.get(c.equipamento_id) ?? []), c]);
    }
    return {
      empresa: e.empresa,
      ultimos_dias: dias,
      chamados: lista.length,
      ainda_abertos: abertos.length,
      concluidos: resolvidos(lista).length,
      tempo_medio_para_resolver_dias: media(resolvidos(lista)),
      custo_total: custo(lista) || undefined,
      por_prioridade: (Object.keys(PRIORIDADES) as Prioridade[])
        .map((p) => {
          const xs = lista.filter((c) => c.prioridade === p);
          return { prioridade: PRIORIDADES[p].rotulo, chamados: xs.length, abertos: xs.filter((c) => abertos.includes(c)).length, tempo_medio_dias: media(resolvidos(xs)) };
        })
        .filter((x) => x.chamados),
      por_prestador: [...porPrestador.values()]
        .map((xs) => ({ prestador: xs[0].fornecedores?.nome ?? "—", chamados: xs.length, concluidos: resolvidos(xs).length, tempo_medio_dias: media(resolvidos(xs)), custo: custo(xs) || undefined }))
        .sort((a, b) => b.chamados - a.chamados),
      chamados_sem_prestador: lista.filter((c) => !c.fornecedor_id).length,
      equipamentos_com_defeito_repetido: [...porEquipamento.values()]
        .filter((xs) => xs.length >= 2)
        .map((xs) => ({
          equipamento: [xs[0].equipamentos?.nome, xs[0].equipamentos?.codigo].filter(Boolean).join(" · "),
          chamados: xs.length,
          numeros: xs.map((c) => c.numero),
          custo: custo(xs) || undefined,
        }))
        .sort((a, b) => b.chamados - a.chamados),
    };
  },
};

const cobertura_da_escala: Ferramenta = {
  nome: "cobertura_da_escala",
  titulo: "Cobertura da escala",
  descricao:
    "Mostra dias e setores sem ninguém escalado (nenhum colaborador do setor em turno) e o resumo por pessoa no período: dias trabalhados, folgas, férias e faltas. Até 31 dias.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      de: { type: "string", description: "Primeiro dia (AAAA-MM-DD). Padrão: hoje." },
      ate: { type: "string", description: "Último dia (AAAA-MM-DD). Padrão: 6 dias depois do primeiro." },
      unidade: { type: "string", description: "Nome da unidade." },
      setor: { type: "string", description: "Nome do setor." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const de = dataIso(args.de) ?? hojeIso(e.fuso);
    let ate = dataIso(args.ate) ?? somarDias(de, 6);
    if (ate < de) throw new Error("O dia final vem antes do inicial.");
    if (ate > somarDias(de, 30)) ate = somarDias(de, 30);
    const unidade = texto(args.unidade) ? acharId(n.unidades, texto(args.unidade)!, "Unidade") : undefined;
    const setorFiltro = texto(args.setor) ? acharId(n.setores, texto(args.setor)!, "Setor") : undefined;
    let q = ctx.supabase
      .from("escalas")
      .select("data, membro_id, tipo, setor_id")
      .eq("empresa_id", e.empresaId)
      .gte("data", de)
      .lte("data", ate);
    if (unidade) q = q.eq("unidade_id", unidade);
    const [{ data, error }, { data: ativos }] = await Promise.all([
      q.limit(5000).returns<{ data: string; membro_id: string; tipo: TipoEscala; setor_id: string | null }[]>(),
      ctx.supabase.from("setores").select("id").eq("empresa_id", e.empresaId).eq("ativo", true),
    ]);
    if (error) throw new Error("Não consegui consultar a escala.");
    const setorDe = (membroId: string, setorId: string | null) => setorId ?? n.membros.find((m) => m.id === membroId)?.setor_id ?? null;
    const lancamentos = (data ?? []).map((x) => ({ ...x, setor: setorDe(x.membro_id, x.setor_id) }));
    // só setores que têm gente cadastrada contam como "descobertos"
    const comGente = new Set(n.membros.map((m) => m.setor_id as string | null).filter(Boolean));
    const setores = (ativos ?? []).map((s) => s.id as string).filter((id) => comGente.has(id) && (!setorFiltro || id === setorFiltro));

    const descobertos: { dia: string; setores: string[] }[] = [];
    for (let d = de; d <= ate; d = somarDias(d, 1)) {
      const faltando = setores.filter((sid) => !lancamentos.some((x) => x.data === d && x.tipo === "turno" && x.setor === sid));
      if (faltando.length) descobertos.push({ dia: formatarDia(d), setores: faltando.map((sid) => n.setor(sid) ?? "—") });
    }
    const porPessoa = new Map<string, { trabalhou: number; folgas: number; ferias: number; faltas: number }>();
    for (const x of lancamentos) {
      if (setorFiltro && x.setor !== setorFiltro) continue;
      const l = porPessoa.get(x.membro_id) ?? { trabalhou: 0, folgas: 0, ferias: 0, faltas: 0 };
      if (x.tipo === "turno") l.trabalhou++;
      else if (x.tipo === "folga") l.folgas++;
      else if (x.tipo === "ferias") l.ferias++;
      else l.faltas++;
      porPessoa.set(x.membro_id, l);
    }
    return {
      empresa: e.empresa,
      periodo: `${formatarDia(de)} a ${formatarDia(ate)}`,
      dias_com_setor_sem_ninguem: descobertos,
      por_pessoa: [...porPessoa.entries()]
        .map(([id, l]) => ({ pessoa: n.membro(id), dias_trabalhados: l.trabalhou, folgas: l.folgas, ferias: l.ferias, faltas: l.faltas }))
        .sort((a, b) => b.faltas - a.faltas || b.dias_trabalhados - a.dias_trabalhados),
      observacao: lancamentos.length === 0 ? "Nada lançado na escala nesse período." : undefined,
    };
  },
};

const historico_da_tarefa: Ferramenta = {
  nome: "historico_da_tarefa",
  titulo: "Histórico e comentários de tarefa",
  descricao:
    "Para as tarefas que combinam com a busca (até 5): o que aconteceu com cada uma (criada, status, prazo adiado, quem mexeu e quando) e os comentários. Use texto, número do chamado ou origem para achar a tarefa.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Palavra no título da tarefa." },
      chamado: { type: "number", description: "Número do chamado de manutenção." },
      origem: { type: "string", enum: Object.keys(ORIGENS) },
      incluir_concluidas: { type: "boolean", description: "Padrão: também busca as concluídas." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    let ids: string[] | undefined;
    if (args.chamado !== undefined) {
      const { data } = await ctx.supabase.from("chamados").select("tarefa_id").eq("empresa_id", e.empresaId).eq("numero", Number(args.chamado));
      ids = (data ?? []).map((c) => c.tarefa_id as string);
    }
    const busca = texto(args.texto)?.replace(/[%,()]/g, " ");
    if (!busca && !ids) throw new Error("Informe o texto do título ou o número do chamado.");
    let q = ctx.supabase.from("tarefas").select(CAMPOS_TAREFA).eq("empresa_id", e.empresaId);
    if (ids) q = q.in("id", ids);
    if (busca) q = q.ilike("titulo", `%${busca}%`);
    if (texto(args.origem) && texto(args.origem)! in ORIGENS) q = q.eq("origem", texto(args.origem)!);
    if (args.incluir_concluidas === false) q = q.in("status_id", n.idsPorTipo(PENDENTES));
    const { data: tarefas, error } = await q.order("created_at", { ascending: false }).limit(5).returns<(TarefaLinha & { id: string })[]>();
    if (error) throw new Error("Não consegui buscar as tarefas.");
    const lista = tarefas ?? [];
    const tids = lista.map((t) => t.id);
    const [{ data: hist }, { data: coms }] = tids.length
      ? await Promise.all([
          ctx.supabase
            .from("tarefa_historico")
            .select("tarefa_id, membro_id, acao, status_de, status_para, prazo_de, prazo_para, comentario, created_at")
            .in("tarefa_id", tids)
            .order("created_at")
            .limit(500)
            .returns<
              { tarefa_id: string; membro_id: string | null; acao: string; status_de: string | null; status_para: string | null; prazo_de: string | null; prazo_para: string | null; comentario: string | null; created_at: string }[]
            >(),
          ctx.supabase
            .from("tarefa_comentarios")
            .select("tarefa_id, membro_id, texto, created_at")
            .in("tarefa_id", tids)
            .order("created_at")
            .limit(500)
            .returns<{ tarefa_id: string; membro_id: string | null; texto: string; created_at: string }[]>(),
        ])
      : [{ data: [] }, { data: [] }];
    return {
      empresa: e.empresa,
      tarefas: lista.map((t) => ({
        ...descreverTarefa(t, n, e.fuso),
        historico: (hist ?? [])
          .filter((h) => h.tarefa_id === t.id)
          .map((h) => ({
            quando: formatarDataHora(h.created_at, e.fuso),
            quem: n.membro(h.membro_id) ?? undefined,
            acao: h.acao,
            status: h.status_para ? `${h.status_de ? n.statusNome(h.status_de) + " → " : ""}${n.statusNome(h.status_para)}` : undefined,
            prazo: h.prazo_para ? `${h.prazo_de ? formatarDataHora(h.prazo_de, e.fuso) + " → " : ""}${formatarDataHora(h.prazo_para, e.fuso)}` : undefined,
            motivo: h.comentario || undefined,
          })),
        comentarios: (coms ?? [])
          .filter((c) => c.tarefa_id === t.id)
          .map((c) => ({ quando: formatarDataHora(c.created_at, e.fuso), quem: n.membro(c.membro_id) ?? undefined, texto: c.texto })),
      })),
    };
  },
};

const alertas_cadastrados: Ferramenta = {
  nome: "alertas_cadastrados",
  titulo: "Alertas cadastrados",
  descricao:
    "Todos os alertas de datas (ativos e pausados) com avisos, responsáveis e próxima data, apontando problemas: alerta sem avisos, aviso sem ninguém responsável, e quantas tarefas cada aviso já gerou (histórico dos avisos disparados).",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Palavra no nome do alerta." },
      situacao: { type: "string", enum: [...SITUACOES_ATIVIDADE], description: "Padrão: ativas." },
      so_com_problema: { type: "boolean", description: "true = só alertas sem avisos ou com aviso sem responsável." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const sit = situacaoAtividade(args.situacao);
    let q = ctx.supabase
      .from("alertas")
      .select("*, alerta_avisos(id, dias_antes, titulo, responsaveis)")
      .eq("empresa_id", e.empresaId)
      .order("nome");
    if (sit === "ativas") q = q.eq("ativo", true);
    if (sit === "pausadas") q = q.eq("ativo", false);
    const { data, error } = await q.returns<(Alerta & { alerta_avisos: { id: string; dias_antes: number; titulo: string; responsaveis: string[] }[] })[]>();
    if (error) throw new Error("Não consegui consultar os alertas.");
    const avisoIds = (data ?? []).flatMap((a) => a.alerta_avisos.map((v) => v.id));
    const { data: geradas } = avisoIds.length
      ? await ctx.supabase.from("tarefas").select("origem_id, prazo").eq("empresa_id", e.empresaId).eq("origem", "alerta").in("origem_id", avisoIds).limit(5000).returns<{ origem_id: string; prazo: string | null }[]>()
      : { data: [] };
    const busca = texto(args.texto);
    const lista = (data ?? [])
      .filter((a) => !busca || contem(a.nome, busca))
      .map((a) => {
        const avisos = a.alerta_avisos.sort((x, y) => y.dias_antes - x.dias_antes).map((v) => {
          const donos = v.responsaveis.length ? v.responsaveis : a.responsavel_id ? [a.responsavel_id] : [];
          const minhas = (geradas ?? []).filter((t) => t.origem_id === v.id);
          return {
            quando: `${v.dias_antes} dia(s) antes`,
            acao: v.titulo,
            responsaveis: n.pessoas(donos),
            sem_responsavel: donos.length === 0 || undefined,
            tarefas_ja_geradas: minhas.length,
          };
        });
        return {
          alerta: a.nome,
          descricao: a.descricao || undefined,
          situacao: a.ativo ? "ativo" : "pausado",
          proxima_data: a.ativo
            ? (() => {
                const p = proximaOcorrencia({ regra: a.recorrencia, horario: a.horario, inicio: a.data_evento, fuso: e.fuso });
                return p ? formatarData(p.toISOString(), e.fuso) : undefined;
              })()
            : undefined,
          repete: a.recorrencia ? descreverRecorrencia(a.recorrencia) : "não repete",
          responsavel_padrao: n.membro(a.responsavel_id) ?? undefined,
          setor: n.setor(a.setor_id) ?? undefined,
          sem_avisos: avisos.length === 0 || undefined,
          avisos,
          privado: a.privado || undefined,
        };
      })
      .filter((a) => args.so_com_problema !== true || a.sem_avisos || a.avisos.some((v) => v.sem_responsavel));
    return { empresa: e.empresa, situacao: sit, alertas: lista };
  },
};

const chamados_do_prestador: Ferramenta = {
  nome: "chamados_do_prestador",
  titulo: "Chamados por prestador",
  descricao: "Histórico de um prestador de serviço: os chamados de manutenção em que atuou, com equipamento, situação, datas e custo.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      prestador: { type: "string", description: "Parte do nome do prestador." },
      limite: { type: "number", description: "Padrão 50, máximo 200." },
    },
    required: ["prestador"],
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const busca = texto(args.prestador);
    if (!busca) throw new Error("Informe o nome do prestador.");
    const { data: fornecedores } = await ctx.supabase.from("fornecedores").select("id, nome").eq("empresa_id", e.empresaId);
    const achados = (fornecedores ?? []).filter((f) => contem(f.nome, busca));
    if (achados.length === 0) throw new Error(`Prestador "${busca}" não encontrado.`);
    const { data, error } = await ctx.supabase
      .from("chamados")
      .select("numero, prioridade, custo, created_at, fornecedor_id, equipamentos(nome, codigo), tarefas!inner(titulo, status_id, concluida_em)")
      .eq("empresa_id", e.empresaId)
      .in("fornecedor_id", achados.map((f) => f.id))
      .order("created_at", { ascending: false })
      .limit(numero(args.limite, 50, 200))
      .returns<
        {
          numero: number;
          prioridade: Prioridade;
          custo: number | null;
          created_at: string;
          fornecedor_id: string;
          equipamentos: { nome: string; codigo: string | null } | null;
          tarefas: { titulo: string; status_id: string; concluida_em: string | null };
        }[]
      >();
    if (error) throw new Error("Não consegui consultar os chamados.");
    return {
      empresa: e.empresa,
      prestadores: achados.map((f) => f.nome),
      chamados: (data ?? []).map((c) => ({
        numero: c.numero,
        prestador: achados.find((f) => f.id === c.fornecedor_id)?.nome,
        titulo: c.tarefas.titulo,
        prioridade: PRIORIDADES[c.prioridade]?.rotulo ?? c.prioridade,
        situacao: n.statusNome(c.tarefas.status_id),
        equipamento: c.equipamentos ? [c.equipamentos.nome, c.equipamentos.codigo].filter(Boolean).join(" · ") : undefined,
        aberto_em: formatarDataHora(c.created_at, e.fuso),
        concluido_em: c.tarefas.concluida_em ? formatarDataHora(c.tarefas.concluida_em, e.fuso) : undefined,
        custo: c.custo ?? undefined,
      })),
    };
  },
};

const whatsapp_status: Ferramenta = {
  nome: "whatsapp_status",
  titulo: "Status do WhatsApp",
  descricao:
    "Conexões de WhatsApp (conectada ou não, envio pausado, último erro) e a fila de mensagens dos últimos dias: quantas por situação e as que falharam. Só aparece para quem tem acesso ao WhatsApp no app.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      dias: { type: "number", description: "Janela das mensagens, em dias (padrão 2, máximo 30)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const dias = numero(args.dias, 2, 30);
    const desde = new Date(Date.now() - dias * DIA).toISOString();
    const [{ data: conexoes }, { data: mensagens }] = await Promise.all([
      ctx.supabase
        .from("whatsapp_conexoes")
        .select("provedor, status, numero_mascarado, unidade_id, envio_pausado, ultimo_contato_em, ultimo_erro")
        .eq("empresa_id", e.empresaId)
        .returns<
          { provedor: string; status: string; numero_mascarado: string | null; unidade_id: string | null; envio_pausado: boolean; ultimo_contato_em: string | null; ultimo_erro: string | null }[]
        >(),
      ctx.supabase
        .from("whatsapp_mensagens")
        .select("situacao, origem, erro, tentativas, created_at, whatsapp_contatos(nome)")
        .eq("empresa_id", e.empresaId)
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .limit(2000)
        .returns<{ situacao: string; origem: string; erro: string | null; tentativas: number; created_at: string; whatsapp_contatos: { nome: string } | null }[]>(),
    ]);
    const msgs = mensagens ?? [];
    const porSituacao: Record<string, number> = {};
    for (const m of msgs) porSituacao[m.situacao] = (porSituacao[m.situacao] ?? 0) + 1;
    return {
      empresa: e.empresa,
      conexoes: (conexoes ?? []).map((c) => ({
        provedor: c.provedor,
        unidade: n.unidade(c.unidade_id) ?? "empresa toda",
        numero: c.numero_mascarado ?? undefined,
        situacao: c.status,
        envio_pausado: c.envio_pausado || undefined,
        ultimo_contato: c.ultimo_contato_em ? formatarDataHora(c.ultimo_contato_em, e.fuso) : undefined,
        ultimo_erro: c.ultimo_erro ?? undefined,
      })),
      mensagens: {
        ultimos_dias: dias,
        total: msgs.length,
        por_situacao: porSituacao,
        falhas_recentes: msgs
          .filter((m) => m.situacao === "falhou")
          .slice(0, 10)
          .map((m) => ({ para: m.whatsapp_contatos?.nome, quando: formatarDataHora(m.created_at, e.fuso), motivo: m.erro ?? undefined, tentativas: m.tentativas })),
      },
      observacao: (conexoes ?? []).length === 0 ? "Nenhuma conexão de WhatsApp visível para você." : undefined,
    };
  },
};

const historico_do_equipamento: Ferramenta = {
  nome: "historico_do_equipamento",
  titulo: "Histórico do equipamento",
  descricao:
    "Histórico de manutenção de um bem do Patrimônio (busca por nome, código, marca ou modelo; vendidos e aposentados também): trajetória (manutenções, trocas de unidade e situação, venda), chamados ligados com solução e custo, total gasto, e ações recorrentes e tarefas ligadas. Filtra por período e por tipo de evento.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      equipamento: { type: "string", description: "Nome, código, marca ou modelo do bem." },
      de: { type: "string", description: "A partir deste dia (AAAA-MM-DD)." },
      ate: { type: "string", description: "Até este dia (AAAA-MM-DD)." },
      tipo_evento: { type: "string", enum: Object.keys(EVENTOS_PATRIMONIO), description: "Só eventos deste tipo na trajetória." },
    },
    required: ["equipamento"],
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    const busca = texto(args.equipamento)?.replace(/[%,()]/g, " ");
    if (!busca) throw new Error("Informe o nome, código, marca ou modelo do equipamento.");
    const de = dataIso(args.de);
    const ate = dataIso(args.ate);
    const tipoEvento = texto(args.tipo_evento) && texto(args.tipo_evento)! in EVENTOS_PATRIMONIO ? texto(args.tipo_evento)! : undefined;
    const { data: itens, error } = await ctx.supabase
      .from("equipamentos")
      .select("id, nome, codigo, marca, modelo, situacao, unidade_id, garantia_ate")
      .eq("empresa_id", e.empresaId)
      .or(`nome.ilike.%${busca}%,codigo.ilike.%${busca}%,marca.ilike.%${busca}%,modelo.ilike.%${busca}%`)
      .order("nome")
      .limit(4)
      .returns<{ id: string; nome: string; codigo: string | null; marca: string | null; modelo: string | null; situacao: SituacaoPatrimonio; unidade_id: string | null; garantia_ate: string | null }[]>();
    if (error) throw new Error("Não consegui buscar o equipamento.");
    if (!itens?.length) throw new Error(`Nenhum equipamento encontrado para "${busca}".`);
    const mostrados = itens.slice(0, 3);
    const ids = mostrados.map((i) => i.id);
    const agora = Date.now();

    let qe = ctx.supabase
      .from("patrimonio_eventos")
      .select("equipamento_id, tipo, data, valor, descricao, situacao_nova, unidade_origem_id, unidade_destino_id, membro_nome")
      .eq("empresa_id", e.empresaId)
      .in("equipamento_id", ids)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (de) qe = qe.gte("data", de);
    if (ate) qe = qe.lte("data", ate);
    if (tipoEvento) qe = qe.eq("tipo", tipoEvento);
    let qc = ctx.supabase
      .from("chamados")
      .select("equipamento_id, numero, prioridade, custo, solucao, created_at, fornecedores(nome), tarefas!inner(titulo, status_id, concluida_em)")
      .eq("empresa_id", e.empresaId)
      .in("equipamento_id", ids)
      .order("created_at", { ascending: false })
      .limit(300);
    if (de) qc = qc.gte("created_at", janelaDoDia(e.fuso, de).inicio);
    if (ate) qc = qc.lte("created_at", janelaDoDia(e.fuso, ate).fim);
    const [{ data: eventos }, { data: chamados }, { data: acoes }, { data: tarefas }] = await Promise.all([
      qe.returns<
        {
          equipamento_id: string;
          tipo: TipoEventoPatrimonio;
          data: string;
          valor: number | null;
          descricao: string | null;
          situacao_nova: string | null;
          unidade_origem_id: string | null;
          unidade_destino_id: string | null;
          membro_nome: string | null;
        }[]
      >(),
      qc.returns<
        {
          equipamento_id: string;
          numero: number;
          prioridade: Prioridade;
          custo: number | null;
          solucao: string | null;
          created_at: string;
          fornecedores: { nome: string } | null;
          tarefas: { titulo: string; status_id: string; concluida_em: string | null };
        }[]
      >(),
      ctx.supabase
        .from("acoes")
        .select("equipamento_id, nome, recorrencia, horario, data_inicial, data_final, ativo, responsaveis")
        .eq("empresa_id", e.empresaId)
        .in("equipamento_id", ids)
        .returns<{ equipamento_id: string; nome: string; recorrencia: string | null; horario: string; data_inicial: string; data_final: string | null; ativo: boolean; responsaveis: string[] }[]>(),
      ctx.supabase
        .from("tarefas")
        .select(`${CAMPOS_TAREFA}, equipamento_id`)
        .eq("empresa_id", e.empresaId)
        .in("equipamento_id", ids)
        .neq("origem", "chamado")
        .order("prazo", { ascending: false, nullsFirst: false })
        .limit(100)
        .returns<(TarefaLinha & { equipamento_id: string })[]>(),
    ]);
    const soma = (xs: (number | null)[]) => xs.reduce<number>((t, v) => t + Number(v ?? 0), 0);
    return {
      empresa: e.empresa,
      periodo: de || ate ? `${de ? formatarDia(de) : "início"} a ${ate ? formatarDia(ate) : "hoje"}` : "tudo",
      equipamentos_encontrados: itens.length,
      observacao: itens.length > 3 ? "Mais de 3 equipamentos combinam; mostrando os 3 primeiros. Refine a busca (nome completo ou código)." : undefined,
      equipamentos: mostrados.map((i) => {
        const evs = (eventos ?? []).filter((x) => x.equipamento_id === i.id);
        const chs = (chamados ?? []).filter((x) => x.equipamento_id === i.id);
        const custoEventos = soma(evs.filter((x) => x.tipo === "manutencao").map((x) => x.valor));
        const custoChamados = soma(chs.map((x) => x.custo));
        return {
          equipamento: [i.nome, i.codigo].filter(Boolean).join(" · "),
          marca_modelo: [i.marca, i.modelo].filter(Boolean).join(" ") || undefined,
          situacao: SITUACOES_PATRIMONIO[i.situacao]?.rotulo ?? i.situacao,
          unidade: n.unidade(i.unidade_id) ?? undefined,
          garantia_ate: i.garantia_ate ? formatarDia(i.garantia_ate) : undefined,
          manutencoes_registradas: evs.filter((x) => x.tipo === "manutencao").length,
          chamados_total: chs.length,
          gasto_com_manutencao: {
            eventos_de_manutencao: custoEventos,
            custo_dos_chamados: custoChamados,
            observacao: "Os dois valores podem se sobrepor se o mesmo conserto foi lançado nos dois lugares; não somei.",
          },
          trajetoria: evs.map((x) => ({
            data: formatarDia(x.data),
            evento: EVENTOS_PATRIMONIO[x.tipo] ?? x.tipo,
            descricao: x.descricao || undefined,
            valor: x.valor ?? undefined,
            situacao_nova: x.situacao_nova ? (SITUACOES_PATRIMONIO[x.situacao_nova as SituacaoPatrimonio]?.rotulo ?? x.situacao_nova) : undefined,
            de_unidade: n.unidade(x.unidade_origem_id) ?? undefined,
            para_unidade: n.unidade(x.unidade_destino_id) ?? undefined,
            registrado_por: x.membro_nome ?? undefined,
          })),
          chamados: chs.map((c) => ({
            numero: c.numero,
            titulo: c.tarefas.titulo,
            prioridade: PRIORIDADES[c.prioridade]?.rotulo ?? c.prioridade,
            situacao: n.statusNome(c.tarefas.status_id),
            aberto_em: formatarDataHora(c.created_at, e.fuso),
            concluido_em: c.tarefas.concluida_em ? formatarDataHora(c.tarefas.concluida_em, e.fuso) : undefined,
            dias_aberto: c.tarefas.concluida_em ? undefined : Math.floor((agora - new Date(c.created_at).getTime()) / DIA),
            prestador: c.fornecedores?.nome,
            solucao: c.solucao || undefined,
            custo: c.custo ?? undefined,
          })),
          acoes_recorrentes: (acoes ?? [])
            .filter((a) => a.equipamento_id === i.id)
            .map((a) => ({
              acao: a.nome,
              situacao: a.ativo ? "ativa" : "pausada",
              repete: a.recorrencia ? descreverRecorrencia(a.recorrencia) : "não repete",
              horario: a.horario.slice(0, 5),
              responsaveis: n.pessoas(a.responsaveis),
              proxima: a.ativo
                ? (() => {
                    const p = proximaOcorrencia({ regra: a.recorrencia, horario: a.horario, inicio: a.data_inicial, fim: a.data_final, fuso: e.fuso });
                    return p ? formatarDataHora(p.toISOString(), e.fuso) : undefined;
                  })()
                : undefined,
            })),
          tarefas_ligadas: (tarefas ?? []).filter((t) => t.equipamento_id === i.id).map((t) => descreverTarefa(t, n, e.fuso, agora)),
        };
      }),
    };
  },
};

// ---------------------------------------------------------------------------
// Contagens
// ---------------------------------------------------------------------------

type ContagemLinha = {
  id: string;
  nome: string;
  descricao: string | null;
  unidade_id: string | null;
  setor_id: string | null;
  turnos: string[];
  usa_meta: boolean;
  rotulo_falta: string;
  pede_vai_fazer: boolean;
  agendada: boolean;
  horarios: string[];
  ativo: boolean;
};
type ItemLinha = {
  id: string;
  contagem_id: string;
  nome: string;
  unidade_medida: string | null;
  metas: (number | null)[] | null;
  meta_dia_seguinte: boolean;
  ativo: boolean;
  ordem: number;
};

const SEL_CONTAGEM = "id, nome, descricao, unidade_id, setor_id, turnos, usa_meta, rotulo_falta, pede_vai_fazer, agendada, horarios, ativo";
const SEL_ITEM = "id, contagem_id, nome, unidade_medida, metas, meta_dia_seguinte, ativo, ordem";

async function acharContagem(ctx: ContextoMcp, empresaId: string, busca: string) {
  const { data, error } = await ctx.supabase
    .from("contagens")
    .select(SEL_CONTAGEM)
    .eq("empresa_id", empresaId)
    .returns<ContagemLinha[]>();
  if (error) throw new Error("Não consegui consultar as contagens.");
  const lista = data ?? [];
  const achadas = lista.filter((c) => c.id === busca || contem(c.nome, busca));
  if (achadas.length === 0) throw new Error(`Contagem "${busca}" não encontrada. Opções: ${lista.map((c) => c.nome).join(", ")}.`);
  const exata = achadas.find((c) => c.nome.toLowerCase() === busca.toLowerCase());
  if (achadas.length > 1 && !exata) throw new Error(`Mais de uma contagem com "${busca}": ${achadas.map((c) => c.nome).join(", ")}.`);
  return exata ?? achadas[0];
}

const metasPorDia = (metas: (number | null)[] | null) =>
  metas && metas.some((m) => m !== null)
    ? Object.fromEntries(DIAS_ROTINA.map((d, i) => [d.curto, metaDoDia(metas, i + 1)]))
    : undefined;

const contagens: Ferramenta = {
  nome: "contagens",
  titulo: "Contagens cadastradas",
  descricao:
    "As contagens de quantidades por turno (ex.: churrasqueira, embalar saladas): turnos, se usa meta, horário agendado, unidade, setor e os itens de cada uma com unidade de medida e a meta por dia da semana.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      texto: { type: "string", description: "Parte do nome da contagem." },
      incluir_inativas: { type: "boolean" },
      com_itens: { type: "boolean", description: "true = lista os itens com as metas por dia (padrão: só a quantidade de itens)." },
    },
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const n = await nomes(ctx, e.empresaId);
    let q = ctx.supabase.from("contagens").select(SEL_CONTAGEM).eq("empresa_id", e.empresaId).order("nome");
    if (args.incluir_inativas !== true) q = q.eq("ativo", true);
    const { data, error } = await q.returns<ContagemLinha[]>();
    if (error) throw new Error("Não consegui consultar as contagens.");
    const busca = texto(args.texto);
    const lista = (data ?? []).filter((c) => !busca || contem(c.nome, busca));
    const { data: itens } = lista.length
      ? await ctx.supabase
          .from("contagem_itens")
          .select(SEL_ITEM)
          .in("contagem_id", lista.map((c) => c.id))
          .eq("ativo", true)
          .order("ordem")
          .returns<ItemLinha[]>()
      : { data: [] as ItemLinha[] };
    return {
      empresa: e.empresa,
      contagens: lista.map((c) => {
        const deles = (itens ?? []).filter((i) => i.contagem_id === c.id);
        return {
          contagem: c.nome,
          descricao: c.descricao || undefined,
          turnos: c.turnos.length ? c.turnos : undefined,
          unidade: n.unidade(c.unidade_id) ?? "todas as unidades",
          setor: n.setor(c.setor_id) ?? undefined,
          usa_meta: c.usa_meta,
          coluna_falta: c.usa_meta ? c.rotulo_falta : undefined,
          pede_o_que_vai_fazer: c.pede_vai_fazer || undefined,
          horarios: c.agendada ? c.horarios.map((h) => h.slice(0, 5)) : undefined,
          itens:
            args.com_itens === true
              ? deles.map((i) => ({
                  item: i.nome,
                  unidade_medida: i.unidade_medida ?? undefined,
                  metas_por_dia: metasPorDia(i.metas),
                  meta_e_do_dia_seguinte: i.meta_dia_seguinte || undefined,
                }))
              : deles.length,
          inativa: !c.ativo || undefined,
        };
      }),
    };
  },
};

type ValorLinha = { item_id: string; quantidade: number | null; meta: number | null; a_fazer: number | null; vai_fazer: number | null };
type RegistroLinha = {
  id: string;
  data_ref: string;
  turno: string | null;
  executor_nome: string;
  canal: string;
  observacao: string | null;
  enviado_em: string;
  contagem_valores: ValorLinha[];
};

const resultados_de_contagem: Ferramenta = {
  nome: "resultados_de_contagem",
  titulo: "Resultados de uma contagem",
  descricao:
    "Os registros de uma contagem num período (padrão: últimos 7 dias): data, turno, quem contou e, por item, a quantidade, a meta do dia, o que faltava (a_fazer) e o que a pessoa disse que vai fazer (vai_fazer). Exige a permissão de ver resultados das contagens; sem ela só aparecem os registros feitos pela própria pessoa.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      contagem: { type: "string", description: "Nome (ou parte) da contagem." },
      de: { type: "string", description: "Data inicial AAAA-MM-DD." },
      ate: { type: "string", description: "Data final AAAA-MM-DD." },
      turno: { type: "string", description: "Ex.: Dia ou Noite." },
      quem: { type: "string", description: "Parte do nome de quem contou." },
      item: { type: "string", description: "Parte do nome de um item, para ver só ele." },
      limite: { type: "number", description: "Máximo de registros (padrão 30, máximo 100); os mais recentes primeiro." },
    },
    required: ["contagem"],
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const c = await acharContagem(ctx, e.empresaId, texto(args.contagem) ?? "");
    const hoje = hojeIso(e.fuso);
    const ate = dataIso(args.ate) ?? hoje;
    const de = dataIso(args.de) ?? somarDias(ate, -6);
    const limite = numero(args.limite, 30, 100);
    const { data: itens } = await ctx.supabase
      .from("contagem_itens")
      .select(SEL_ITEM)
      .eq("contagem_id", c.id)
      .order("ordem")
      .returns<ItemLinha[]>();
    const nomeItem = new Map((itens ?? []).map((i) => [i.id, i]));
    const filtroItem = texto(args.item);
    const idsItem = filtroItem ? (itens ?? []).filter((i) => contem(i.nome, filtroItem)).map((i) => i.id) : null;
    if (idsItem && idsItem.length === 0) throw new Error(`Item "${filtroItem}" não existe nessa contagem. Itens: ${(itens ?? []).map((i) => i.nome).join(", ")}.`);

    let q = ctx.supabase
      .from("contagem_registros")
      .select("id, data_ref, turno, executor_nome, canal, observacao, enviado_em, contagem_valores(item_id, quantidade, meta, a_fazer, vai_fazer)")
      .eq("contagem_id", c.id)
      .gte("data_ref", de)
      .lte("data_ref", ate)
      .order("data_ref", { ascending: false })
      .order("enviado_em", { ascending: false })
      .limit(limite + 1);
    const turno = texto(args.turno);
    if (turno) q = q.ilike("turno", turno);
    const { data, error } = await q.returns<RegistroLinha[]>();
    if (error) throw new Error("Não consegui consultar os resultados da contagem.");
    const quem = texto(args.quem);
    const todos = (data ?? []).filter((r) => !quem || contem(r.executor_nome, quem));
    const registros = todos.slice(0, limite);
    return {
      empresa: e.empresa,
      contagem: c.nome,
      periodo: `${formatarDia(de)} a ${formatarDia(ate)}`,
      truncado: todos.length > limite ? `Mostrando só os ${limite} mais recentes; reduza o período ou aumente o limite.` : undefined,
      total: registros.length,
      registros: registros.map((r) => ({
        data: formatarDia(r.data_ref),
        turno: r.turno ?? undefined,
        quem_contou: r.executor_nome,
        canal: r.canal,
        enviado_em: formatarDataHora(r.enviado_em, e.fuso),
        observacao: r.observacao || undefined,
        itens: r.contagem_valores
          .filter((v) => !idsItem || idsItem.includes(v.item_id))
          .sort((a, b) => (nomeItem.get(a.item_id)?.ordem ?? 0) - (nomeItem.get(b.item_id)?.ordem ?? 0))
          .map((v) => ({
            item: nomeItem.get(v.item_id)?.nome ?? "—",
            unidade_medida: nomeItem.get(v.item_id)?.unidade_medida ?? undefined,
            quantidade: v.quantidade,
            meta: v.meta ?? undefined,
            [c.rotulo_falta.toLowerCase() || "a_fazer"]: v.a_fazer ?? undefined,
            vai_fazer: v.vai_fazer ?? undefined,
          })),
      })),
    };
  },
};

const comparar_itens_de_contagem: Ferramenta = {
  nome: "comparar_itens_de_contagem",
  titulo: "Comparar itens de contagens",
  descricao:
    "Soma por dia a quantidade de itens (de uma ou de várias contagens) lado a lado, como a tela Comparar. Ex.: frango contado x frango produzido x frango retirado. Padrão: últimos 30 dias, até 12 itens.",
  parametros: {
    type: "object",
    properties: {
      empresa: P_EMPRESA,
      itens: {
        type: "array",
        items: { type: "string" },
        description: 'Itens a comparar, como "Frango" ou "Contagem: Frango" (parte do nome do item, opcionalmente prefixado pela contagem e dois-pontos). Cada texto pode casar vários itens.',
      },
      de: { type: "string", description: "Data inicial AAAA-MM-DD." },
      ate: { type: "string", description: "Data final AAAA-MM-DD." },
    },
    required: ["itens"],
    additionalProperties: false,
  },
  async executar(ctx, args) {
    const e = await escolherEmpresa(ctx, args);
    const pedidos = (Array.isArray(args.itens) ? args.itens : []).map(texto).filter((x): x is string => !!x);
    if (pedidos.length === 0) throw new Error("Informe ao menos um item em itens.");
    const hoje = hojeIso(e.fuso);
    const ate = dataIso(args.ate) ?? hoje;
    const de = dataIso(args.de) ?? somarDias(ate, -29);
    const [{ data: cs }, { data: todos }] = await Promise.all([
      ctx.supabase.from("contagens").select("id, nome").eq("empresa_id", e.empresaId).returns<{ id: string; nome: string }[]>(),
      ctx.supabase
        .from("contagem_itens")
        .select("id, contagem_id, nome, unidade_medida")
        .eq("empresa_id", e.empresaId)
        .eq("ativo", true)
        .returns<{ id: string; contagem_id: string; nome: string; unidade_medida: string | null }[]>(),
    ]);
    const nomeContagem = new Map((cs ?? []).map((c) => [c.id, c.nome]));
    const escolhidos = new Map<string, NonNullable<typeof todos>[number]>();
    for (const p of pedidos) {
      const [a, b] = p.includes(":") ? [p.slice(0, p.indexOf(":")).trim(), p.slice(p.indexOf(":") + 1).trim()] : ["", p];
      for (const i of todos ?? []) {
        if (contem(i.nome, b) && (!a || contem(nomeContagem.get(i.contagem_id), a))) escolhidos.set(i.id, i);
      }
    }
    if (escolhidos.size === 0) throw new Error("Nenhum item encontrado. Use contagens com com_itens=true para ver os nomes.");
    if (escolhidos.size > 12) throw new Error(`Os textos casam ${escolhidos.size} itens; o máximo é 12. Seja mais específico (use "Contagem: Item").`);

    const soma = new Map<string, Map<string, number>>();
    for (let desde = 0; desde < 50000; desde += 1000) {
      const { data, error } = await ctx.supabase
        .from("contagem_valores")
        .select("item_id, quantidade, contagem_registros!inner(data_ref)")
        .in("item_id", [...escolhidos.keys()])
        .not("quantidade", "is", null)
        .gte("contagem_registros.data_ref", de)
        .lte("contagem_registros.data_ref", ate)
        .order("registro_id")
        .order("item_id")
        .range(desde, desde + 999);
      if (error) throw new Error("Não consegui consultar os valores das contagens.");
      for (const v of (data ?? []) as unknown as { item_id: string; quantidade: number; contagem_registros: { data_ref: string } }[]) {
        const dia = soma.get(v.contagem_registros.data_ref) ?? new Map<string, number>();
        dia.set(v.item_id, (dia.get(v.item_id) ?? 0) + Number(v.quantidade));
        soma.set(v.contagem_registros.data_ref, dia);
      }
      if ((data ?? []).length < 1000) break;
    }
    const rotulo = (i: { id: string; nome: string; contagem_id: string; unidade_medida: string | null }) =>
      `${nomeContagem.get(i.contagem_id) ?? "—"}: ${i.nome}${i.unidade_medida ? ` (${i.unidade_medida})` : ""}`;
    const itens = [...escolhidos.values()];
    return {
      empresa: e.empresa,
      periodo: `${formatarDia(de)} a ${formatarDia(ate)}`,
      itens: itens.map(rotulo),
      total_do_periodo: Object.fromEntries(
        itens.map((i) => [rotulo(i), [...soma.values()].reduce((t, d) => t + (d.get(i.id) ?? 0), 0)]),
      ),
      por_dia: [...soma.keys()]
        .sort((a, b) => b.localeCompare(a))
        .map((d) => ({
          data: formatarDia(d),
          dia_da_semana: DIAS_ROTINA[diaDaSemana(d) - 1]?.longo,
          ...Object.fromEntries(itens.map((i) => [rotulo(i), soma.get(d)?.get(i.id) ?? null])),
        })),
    };
  },
};

export const FERRAMENTAS: Ferramenta[] = [
  minhas_empresas,
  resumo_do_dia,
  buscar_tarefas,
  checklists_do_dia,
  manutencoes,
  escala,
  proximos_alertas,
  planos,
  equipe,
  prestadores,
  patrimonio,
  acoes_recorrentes,
  rotinas,
  modelos_de_checklist,
  carga_por_pessoa,
  taxa_de_checklists,
  indicadores_manutencao,
  cobertura_da_escala,
  historico_da_tarefa,
  alertas_cadastrados,
  chamados_do_prestador,
  whatsapp_status,
  historico_do_equipamento,
  contagens,
  resultados_de_contagem,
  comparar_itens_de_contagem,
];
