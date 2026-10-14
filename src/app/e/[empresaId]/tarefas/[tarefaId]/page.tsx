import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { linkWhatsApp, mensagemTarefa } from "@/lib/whatsapp";
import { ORIGENS, type Tarefa } from "@/lib/types";
import { Aviso, Botao, Cartao, Etiqueta, Textarea, Titulo } from "@/components/ui";
import { comentarTarefa, mudarPrivacidadeTarefa } from "../actions";
import { BotaoExcluir } from "./botao-excluir";

const ACOES: Record<string, string> = {
  criada: "criou a tarefa",
  status: "mudou o status",
  prazo: "mudou o prazo",
  responsavel: "mudou o responsável",
};

export default async function DetalheTarefa({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; tarefaId: string }>;
  searchParams: Promise<{ nova?: string; erro?: string }>;
}) {
  const { empresaId, tarefaId } = await params;
  const { nova, erro } = await searchParams;
  const { supabase, empresa, membro, pode } = await getContexto(empresaId);

  const { data: tarefa } = await supabase.from("tarefas").select("*").eq("id", tarefaId).maybeSingle<Tarefa>();
  if (!tarefa) notFound();
  if (tarefa.origem === "chamado") redirect(`/e/${empresaId}/chamados/${tarefa.id}`);

  const [{ data: status }, { data: membros }, { data: historico }, { data: unidade }, { data: execucao }, { data: comentarios }] =
    await Promise.all([
      supabase.from("status").select("id, nome, cor").eq("empresa_id", empresaId),
      supabase.from("membros").select("id, nome, telefone").eq("empresa_id", empresaId),
      supabase.from("tarefa_historico").select("*").eq("tarefa_id", tarefaId).order("created_at"),
      tarefa.unidade_id
        ? supabase.from("unidades").select("nome").eq("id", tarefa.unidade_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("checklist_execucoes").select("id").eq("tarefa_id", tarefaId).maybeSingle(),
      supabase.from("tarefa_comentarios").select("*").eq("tarefa_id", tarefaId).order("created_at"),
    ]);

  // etapa de plano (PMLP): nome do plano e equipe da etapa
  const [{ data: plano }, { data: equipe }] =
    tarefa.origem === "plano" && tarefa.origem_id
      ? await Promise.all([
          supabase.from("planos").select("id, nome").eq("id", tarefa.origem_id).maybeSingle(),
          supabase.from("plano_etapa_equipe").select("membro_id").eq("etapa_id", tarefa.id),
        ])
      : [{ data: null }, { data: [] }];

  const st = new Map((status ?? []).map((s) => [s.id, s]));
  const mb = new Map((membros ?? []).map((m) => [m.id, m]));
  const atual = st.get(tarefa.status_id);
  const responsavel = tarefa.responsavel_id ? mb.get(tarefa.responsavel_id) : null;

  const texto = mensagemTarefa(tarefa, {
    empresaId,
    fuso: empresa.fuso_horario,
    responsavel: responsavel?.telefone ? responsavel.nome : null,
    status: atual?.nome,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {nova && <Aviso tipo="sucesso">Tarefa criada.</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      <Titulo voltar={{ href: `/e/${empresaId}/tarefas`, rotulo: "Tarefas" }}>{tarefa.titulo}</Titulo>

      <Cartao className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {atual && <Etiqueta cor={atual.cor}>{atual.nome}</Etiqueta>}
          <Etiqueta cor="#7c3aed">{ORIGENS[tarefa.origem]}</Etiqueta>
          {unidade && <Etiqueta>{unidade.nome}</Etiqueta>}
          {tarefa.privado && <Etiqueta>Privada</Etiqueta>}
        </div>
        {tarefa.descricao && <p className="whitespace-pre-wrap text-sm text-slate-700">{tarefa.descricao}</p>}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">Responsável</dt>
          <dd>{responsavel?.nome ?? "—"}</dd>
          {plano && (
            <>
              <dt className="text-slate-500">Plano</dt>
              <dd>
                <Link href={`/e/${empresaId}/planos/${plano.id}`} className="text-blue-700">
                  {plano.nome}
                </Link>
              </dd>
            </>
          )}
          {(equipe ?? []).length > 0 && (
            <>
              <dt className="text-slate-500">Equipe</dt>
              <dd>{(equipe ?? []).map((q) => mb.get(q.membro_id)?.nome).join(", ")}</dd>
            </>
          )}
          <dt className="text-slate-500">Prazo</dt>
          <dd>{formatarDataHora(tarefa.prazo, empresa.fuso_horario) || "—"}</dd>
          <dt className="text-slate-500">Criada em</dt>
          <dd>{formatarDataHora(tarefa.created_at, empresa.fuso_horario)}</dd>
          {tarefa.concluida_em && (
            <>
              <dt className="text-slate-500">Concluída em</dt>
              <dd>{formatarDataHora(tarefa.concluida_em, empresa.fuso_horario)}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap gap-2 pt-2">
          <a
            href={linkWhatsApp(texto, responsavel?.telefone)}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            {responsavel?.telefone ? `Avisar ${responsavel.nome} no WhatsApp` : "Enviar no WhatsApp"}
          </a>
          {execucao && (
            <Link
              href={`/e/${empresaId}/checklists/execucoes/${execucao.id}`}
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm"
            >
              Ver check-list preenchido
            </Link>
          )}
          {(!tarefa.criado_por || tarefa.criado_por === membro.id) && (
            <form action={mudarPrivacidadeTarefa.bind(null, empresaId, tarefa.id, !tarefa.privado)}>
              <Botao variante="secundario">{tarefa.privado ? "Tornar pública" : "Tornar privada"}</Botao>
            </form>
          )}
          {pode("tarefas.excluir") && <BotaoExcluir empresaId={empresaId} tarefaId={tarefa.id} />}
        </div>
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Comentários</h2>
        <ul className="space-y-2 text-sm">
          {(comentarios ?? []).map((c) => (
            <li key={c.id} className="rounded-lg bg-slate-50 p-2">
              <p className="whitespace-pre-wrap">{c.texto}</p>
              <p className="text-xs text-slate-500">
                {c.membro_id ? mb.get(c.membro_id)?.nome : ""} · {formatarDataHora(c.created_at, empresa.fuso_horario)}
              </p>
            </li>
          ))}
        </ul>
        <form action={comentarTarefa.bind(null, empresaId, tarefa.id, `/e/${empresaId}/tarefas/${tarefa.id}`)} className="flex gap-2">
          <Textarea name="texto" rows={1} placeholder="Escreva um comentário" required />
          <Botao variante="secundario">Comentar</Botao>
        </form>
      </Cartao>

      <Cartao>
        <h2 className="mb-2 font-medium">Histórico</h2>
        <ol className="space-y-2 text-sm">
          {(historico ?? []).map((h) => (
            <li key={h.id} className="border-l-2 border-slate-200 pl-3">
              <p>
                <span className="font-medium">{h.membro_id ? mb.get(h.membro_id)?.nome : "Sistema"}</span>{" "}
                {ACOES[h.acao] ?? h.acao}
                {h.acao === "status" && (
                  <>
                    : {st.get(h.status_de)?.nome} → {st.get(h.status_para)?.nome}
                  </>
                )}
                {h.prazo_para && h.acao !== "criada" && h.prazo_para !== h.prazo_de && (
                  <> (prazo {formatarDataHora(h.prazo_para, empresa.fuso_horario)})</>
                )}
              </p>
              {h.comentario && <p className="text-slate-600">“{h.comentario}”</p>}
              <p className="text-xs text-slate-400">{formatarDataHora(h.created_at, empresa.fuso_horario)}</p>
            </li>
          ))}
        </ol>
      </Cartao>
    </div>
  );
}
