import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { linkPreencher } from "@/lib/checklist-link";
import { linkWhatsApp, mensagemTarefa } from "@/lib/whatsapp";
import { ORIGENS, type Tarefa } from "@/lib/types";
import { Aviso, Botao, Cartao, Etiqueta, Textarea, Titulo } from "@/components/ui";
import { CampoFotoCamera } from "@/components/campo-foto-camera";
import { BotaoEnviar } from "@/components/botao-enviar";
import { comentarTarefa, enviarFotoTarefa, marcarMinhaParte, mudarPrivacidadeTarefa, mudarResponsaveis } from "../actions";
import { BotaoExcluir } from "./botao-excluir";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";

const ACOES: Record<string, string> = {
  criada: "criou a tarefa",
  status: "mudou o status",
  prazo: "mudou o prazo",
  responsavel: "mudou os responsáveis",
};

export default async function DetalheTarefa({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; tarefaId: string }>;
  searchParams: Promise<{ nova?: string; erro?: string; responsaveis?: string; foto?: string }>;
}) {
  const { empresaId, tarefaId } = await params;
  const { nova, erro, responsaveis: responsaveisSalvos, foto: fotoEnviada } = await searchParams;
  const { supabase, empresa, membro, pode } = await getContexto(empresaId);

  const { data: tarefa } = await supabase.from("tarefas").select("*").eq("id", tarefaId).maybeSingle<Tarefa>();
  if (!tarefa) notFound();
  if (tarefa.origem === "chamado") redirect(`/e/${empresaId}/chamados/${tarefa.id}`);

  const [
    { data: status },
    { data: membros },
    { data: historico },
    { data: unidade },
    { data: execucao },
    { data: comentarios },
    { data: setores },
    { data: fotos },
  ] = await Promise.all([
      supabase.from("status").select("id, nome, cor, tipo").eq("empresa_id", empresaId),
      supabase.from("membros").select("id, nome, telefone, setor_id, ativo").eq("empresa_id", empresaId).order("nome"),
      supabase.from("tarefa_historico").select("*").eq("tarefa_id", tarefaId).order("created_at"),
      tarefa.unidade_id
        ? supabase.from("unidades").select("nome").eq("id", tarefa.unidade_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("checklist_execucoes").select("id").eq("tarefa_id", tarefaId).maybeSingle(),
      supabase.from("tarefa_comentarios").select("*").eq("tarefa_id", tarefaId).order("created_at"),
      supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("tarefa_fotos").select("id, path, membro_id, created_at").eq("tarefa_id", tarefaId).order("created_at"),
    ]);
  const urls = fotos?.length
    ? await supabase.storage.from("anexos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: [] };

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
  const responsaveis = tarefa.responsaveis.map((id) => mb.get(id)).filter((m) => !!m);
  // WhatsApp direto para a pessoa só quando é uma; com várias, escolhe o contato ou o grupo
  const responsavel = responsaveis.length === 1 ? responsaveis[0] : null;
  const emConjunto = responsaveis.length > 1;
  const encerrada = !!tarefa.concluida_em || !!tarefa.cancelada_em;
  const souResponsavel = tarefa.responsaveis.includes(membro.id);
  const minhaParteFeita = tarefa.partes_feitas.includes(membro.id);
  // check-list ainda pendente: botão para abrir o formulário
  const podePreencher =
    tarefa.origem === "checklist" &&
    !!tarefa.origem_id &&
    !execucao &&
    ["aberto", "em_andamento", "adiado"].includes(atual?.tipo ?? "") &&
    pode("checklist.executar");
  const podeExcluir = pode("tarefas.excluir") || (tarefa.origem === "avulsa" && tarefa.criado_por === membro.id);

  const texto = mensagemTarefa(tarefa, {
    empresaId,
    fuso: empresa.fuso_horario,
    responsavel: responsavel?.telefone ? responsavel.nome : null,
    status: atual?.nome,
  });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {nova && <Aviso tipo="sucesso">Tarefa criada.</Aviso>}
      {responsaveisSalvos && <Aviso tipo="sucesso">Responsáveis atualizados.</Aviso>}
      {fotoEnviada && <Aviso tipo="sucesso">Foto enviada.</Aviso>}
      {erro && <Aviso>{erro}</Aviso>}
      <Titulo voltar={{ href: `/e/${empresaId}/tarefas`, rotulo: "Tarefas" }}>{tarefa.titulo}</Titulo>

      <Cartao className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {atual && <Etiqueta cor={atual.cor}>{atual.nome}</Etiqueta>}
          <Etiqueta cor="#7c3aed">{ORIGENS[tarefa.origem]}</Etiqueta>
          {unidade && <Etiqueta>{unidade.nome}</Etiqueta>}
          {tarefa.privado && <Etiqueta>Privada</Etiqueta>}
          {tarefa.exige_foto && <Etiqueta>Pede foto</Etiqueta>}
        </div>
        {tarefa.descricao && <p className="whitespace-pre-wrap text-sm text-slate-700">{tarefa.descricao}</p>}
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">{responsaveis.length > 1 ? "Responsáveis" : "Responsável"}</dt>
          <dd>{responsaveis.map((m) => m.nome).join(", ") || "—"}</dd>
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
          {podePreencher && (
            <Link
              href={linkPreencher(empresaId, tarefa)}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Abrir check-list
            </Link>
          )}
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
          {podeExcluir && <BotaoExcluir empresaId={empresaId} tarefaId={tarefa.id} />}
        </div>
      </Cartao>

      {emConjunto && (
        <Cartao className="space-y-3">
          <div>
            <h2 className="font-medium">
              Partes feitas: {tarefa.partes_feitas.length} de {tarefa.responsaveis.length}
            </h2>
            <p className="text-xs text-slate-500">
              Tarefa em conjunto: cada responsável marca a sua parte. Quando todos marcarem, ela vai sozinha para
              Concluído.
            </p>
          </div>
          <ul className="space-y-1 text-sm">
            {responsaveis.map((m) => (
              <li key={m.id} className="flex items-center gap-2">
                {tarefa.partes_feitas.includes(m.id) ? (
                  <span className="text-green-700">✓</span>
                ) : (
                  <span className="text-slate-400">○</span>
                )}
                {m.nome}
              </li>
            ))}
          </ul>
          {souResponsavel && !encerrada && (
            <form action={marcarMinhaParte.bind(null, empresaId, tarefa.id, !minhaParteFeita)}>
              <Botao variante={minhaParteFeita ? "secundario" : "primario"}>
                {minhaParteFeita ? "Desfazer minha parte" : "Marcar minha parte como feita"}
              </Botao>
            </form>
          )}
        </Cartao>
      )}

      {tarefa.exige_foto && (
        <Cartao className="space-y-3">
          <h2 className="font-medium">Foto da conclusão</h2>
          {(fotos ?? []).length > 0 && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(fotos ?? []).map((f, n) => {
                const url = urls.data?.[n]?.signedUrl;
                return (
                  <figure key={f.id} className="space-y-1 text-xs text-slate-500">
                    {url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="Foto da tarefa" className="aspect-square w-full rounded-lg object-cover" />
                    )}
                    <figcaption>
                      {f.membro_id ? mb.get(f.membro_id)?.nome : ""} · {formatarDataHora(f.created_at, empresa.fuso_horario)}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          )}
          {!encerrada && (souResponsavel || pode("tarefas.mudar_status")) && !minhaParteFeita && (
            <form action={enviarFotoTarefa.bind(null, empresaId, tarefa.id)} className="space-y-3">
              <CampoFotoCamera nome="foto" rotulo="Tire a foto agora pela câmera" />
              <BotaoEnviar>{emConjunto ? "Enviar foto e marcar minha parte" : "Enviar foto e concluir"}</BotaoEnviar>
            </form>
          )}
          {!encerrada && (fotos ?? []).length === 0 && (
            <p className="text-xs text-slate-500">Esta tarefa só conclui com uma foto.</p>
          )}
        </Cartao>
      )}

      {pode("tarefas.criar") && !encerrada && (
        <Cartao>
          <form action={mudarResponsaveis.bind(null, empresaId, tarefa.id)} className="space-y-3">
            <SeletorResponsaveis
              name="responsaveis"
              inicial={tarefa.responsaveis}
              membros={(membros ?? []).filter((m) => m.ativo || tarefa.responsaveis.includes(m.id))}
              setores={setores ?? []}
              dica="Quem entrar recebe o aviso no WhatsApp (se a automação estiver ligada)."
            />
            <Botao variante="secundario">Salvar responsáveis</Botao>
          </form>
        </Cartao>
      )}

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
