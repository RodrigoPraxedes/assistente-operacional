import type { SupabaseClient } from "@supabase/supabase-js";
import { formatarData, formatarDataHora, formatarDia, hojeNoFuso, horaLocalParaUtc } from "@/lib/formato";
import { hojeIso, horarioTurno, ordenarTurnos, somarDias } from "@/lib/escala";
import { proximaOcorrencia, descreverRecorrencia } from "@/lib/recorrencia";
import {
  AUSENCIAS,
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
        prazo_em_horas: a.prazo_horas,
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
      .select("nome, descricao, horario, dias, setor_id, funcao_id, unidade_id, ativo")
      .eq("empresa_id", e.empresaId)
      .order("horario");
    if (args.incluir_inativas !== true) q = q.eq("ativo", true);
    const setor = texto(args.setor);
    if (setor) q = q.eq("setor_id", acharId(n.setores, setor, "Setor"));
    const funcao = texto(args.funcao);
    if (funcao) q = q.eq("funcao_id", acharId(funcoes ?? [], funcao, "Função"));
    const unidade = texto(args.unidade);
    if (unidade) q = q.or(`unidade_id.is.null,unidade_id.eq.${acharId(n.unidades, unidade, "Unidade")}`);
    const dia = DIAS_SEMANA.indexOf(texto(args.dia) ?? "");
    if (dia > 0) q = q.contains("dias", [dia]);
    const { data, error } = await q.returns<
      { nome: string; descricao: string | null; horario: string; dias: number[]; setor_id: string | null; funcao_id: string | null; unidade_id: string | null; ativo: boolean }[]
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
        setor: n.setor(r.setor_id) ?? undefined,
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
];
