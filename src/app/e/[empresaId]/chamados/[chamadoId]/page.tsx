import Link from "next/link";
import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora, rotuloPrestador, utcParaLocalInput } from "@/lib/formato";
import { linkWhatsApp, urlDoSite } from "@/lib/whatsapp";
import { PRIORIDADES, type Chamado, type Tarefa } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Etiqueta, Input, Select, Textarea, Titulo } from "@/components/ui";
import { comentarTarefa } from "../../tarefas/actions";
import { atualizarChamado, delegarChamado } from "../actions";
import { SeletorResponsaveis } from "@/components/seletor-responsaveis";
import { SeletorPrestador } from "@/components/seletor-prestador";
import { CampoFotos } from "./campo-fotos";
import { MudarStatus } from "../../tarefas/[tarefaId]/mudar-status";
import { BotaoExcluir } from "../../tarefas/[tarefaId]/botao-excluir";

export default async function DetalheChamado({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; chamadoId: string }>;
  searchParams: Promise<{ novo?: string; salvo?: string; erro?: string }>;
}) {
  const { empresaId, chamadoId } = await params;
  const avisos = await searchParams;
  const { supabase, empresa, membro, pode } = await getContexto(empresaId);
  const fuso = empresa.fuso_horario;
  const caminho = `/e/${empresaId}/chamados/${chamadoId}`;

  const { data: chamado } = await supabase
    .from("chamados")
    .select("*, tarefas!inner(*)")
    .eq("tarefa_id", chamadoId)
    .eq("empresa_id", empresaId)
    .maybeSingle<Chamado & { tarefas: Tarefa }>();
  if (!chamado) notFound();
  const t = chamado.tarefas;

  const [{ data: status }, { data: membros }, { data: unidades }, { data: equipamentos }, { data: fornecedores }, { data: fotos }, { data: comentarios }, { data: historico }] =
    await Promise.all([
      supabase.from("status").select("id, nome, cor, tipo, ativo, modulo").eq("empresa_id", empresaId).order("ordem"),
      supabase.from("membros").select("id, nome, telefone, ativo").eq("empresa_id", empresaId).order("nome"),
      supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId),
      supabase.from("equipamentos").select("id, nome, codigo, ativo").eq("empresa_id", empresaId).order("nome"),
      supabase.from("fornecedores").select("id, nome, telefone, ativo, tipos_servico(nome)").eq("empresa_id", empresaId).order("nome"),
      supabase.from("chamado_fotos").select("id, path, created_at").eq("tarefa_id", chamadoId).order("created_at"),
      supabase.from("tarefa_comentarios").select("*").eq("tarefa_id", chamadoId).order("created_at"),
      supabase.from("tarefa_historico").select("*").eq("tarefa_id", chamadoId).order("created_at"),
    ]);

  const { data: central } = await supabase.from("empresas").select("chamados_central_ativo, chamados_central").eq("id", empresaId).single();
  const euRecebo = (central?.chamados_central ?? []).includes(membro.id);
  const podeDelegar = !t.concluida_em && (pode("chamados.gerenciar") || euRecebo);

  const caminhos = (fotos ?? []).map((f) => f.path);
  const { data: assinadas } = caminhos.length
    ? await supabase.storage.from("anexos").createSignedUrls(caminhos, 3600)
    : { data: [] };
  const urls = (assinadas ?? []).filter((a) => a.signedUrl).map((a) => a.signedUrl as string);

  const st = new Map((status ?? []).map((s) => [s.id, s]));
  const mb = new Map((membros ?? []).map((m) => [m.id, m]));
  const atual = st.get(t.status_id);
  const responsavel = t.responsavel_id ? mb.get(t.responsavel_id) : null;
  const fornecedor = (fornecedores ?? []).find((f) => f.id === chamado.fornecedor_id);
  const equipamento = (equipamentos ?? []).find((e) => e.id === chamado.equipamento_id);
  const unidade = (unidades ?? []).find((u) => u.id === t.unidade_id);
  const prio = PRIORIDADES[chamado.prioridade];
  const statusDisponiveis = (status ?? []).filter((s) => s.ativo && (!s.modulo || s.modulo === "chamado"));

  const { data: setor } = t.setor_id
    ? await supabase.from("setores").select("nome").eq("id", t.setor_id).maybeSingle()
    : { data: null };

  // Fornecedor é externo e não usa o app: sem prioridade e sem link
  const mensagemFornecedor = [
    fornecedor ? `Olá, ${fornecedor.nome.trim().split(/\s+/)[0]}! 👋` : null,
    `*Segue chamado:* #${chamado.numero}`,
    `*O que:* ${t.titulo}`,
    t.descricao ? `*Descrição:* ${t.descricao}` : null,
    unidade || chamado.local ? `*Local:* ${[unidade?.nome, chamado.local].filter(Boolean).join(" · ")}` : null,
    setor ? `*Setor:* ${setor.nome}` : null,
    t.prazo ? `*Prazo previsto:* ${formatarDataHora(t.prazo, fuso)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const mensagem = [
    `*Chamado #${chamado.numero}* (${prio.rotulo})`,
    t.titulo,
    unidade ? `Local: ${unidade.nome}${chamado.local ? ` · ${chamado.local}` : ""}` : chamado.local,
    equipamento ? `Equipamento: ${equipamento.nome}` : null,
    t.descricao,
    t.prazo ? `Prazo: ${formatarDataHora(t.prazo, fuso)}` : null,
    urlDoSite(caminho),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {avisos.novo && <Aviso tipo="sucesso">Chamado aberto.</Aviso>}
      {avisos.salvo && <Aviso tipo="sucesso">Salvo.</Aviso>}
      {avisos.erro && <Aviso>{avisos.erro}</Aviso>}

      <Titulo voltar={{ href: `/e/${empresaId}/chamados`, rotulo: "Manutenções" }}>
        <span className="text-slate-400">#{chamado.numero}</span> {t.titulo}
      </Titulo>

      <Cartao className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {atual && <Etiqueta cor={atual.cor}>{atual.nome}</Etiqueta>}
          <Etiqueta cor={prio.cor}>{prio.rotulo}</Etiqueta>
          {unidade && <Etiqueta>{unidade.nome}</Etiqueta>}
          {t.prazo && t.concluida_em === null && new Date(t.prazo) < new Date() && <Etiqueta cor="#dc2626">Atrasado</Etiqueta>}
        </div>
        {t.descricao && <p className="whitespace-pre-wrap text-sm text-slate-700">{t.descricao}</p>}
        {chamado.solucao && (
          <div className="rounded-lg bg-green-50 p-2 text-sm text-slate-700">
            <p className="text-xs font-medium text-green-700">Solução</p>
            <p className="whitespace-pre-wrap">{chamado.solucao}</p>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Aberto por</dt>
            <dd>{chamado.aberto_por_nome ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Aberto em</dt>
            <dd>{formatarDataHora(chamado.created_at, fuso)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Prazo</dt>
            <dd>{formatarDataHora(t.prazo, fuso) || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Equipamento</dt>
            <dd>
              {equipamento ? (
                <Link href={`/e/${empresaId}/patrimonio/${equipamento.id}`} className="text-blue-600 hover:underline">
                  {equipamento.nome}
                  {equipamento.codigo ? ` (${equipamento.codigo})` : ""}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Local</dt>
            <dd>{chamado.local ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Responsável</dt>
            <dd>{(t.responsaveis ?? []).map((id) => mb.get(id)?.nome).filter(Boolean).join(", ") || "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Prestador</dt>
            <dd>{fornecedor?.nome ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Custo</dt>
            <dd>
              {chamado.custo != null
                ? Number(chamado.custo).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "—"}
            </dd>
          </div>
          {t.concluida_em && (
            <div>
              <dt className="text-slate-500">Concluído em</dt>
              <dd>{formatarDataHora(t.concluida_em, fuso)}</dd>
            </div>
          )}
        </dl>
        {chamado.execucao_id && (
          <Link href={`/e/${empresaId}/checklists/execucoes/${chamado.execucao_id}`} className="text-sm text-blue-600">
            Ver o check-list que abriu este chamado
          </Link>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {responsavel && (
            <a
              href={linkWhatsApp(mensagem, responsavel.telefone)}
              target="_blank"
              rel="noopener"
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white"
            >
              WhatsApp para {responsavel.nome}
            </a>
          )}
          {fornecedor && (
            <a
              href={linkWhatsApp(mensagemFornecedor, fornecedor.telefone)}
              target="_blank"
              rel="noopener"
              className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white"
            >
              WhatsApp para {fornecedor.nome}
            </a>
          )}
          {!responsavel && !fornecedor && (
            <a href={linkWhatsApp(mensagem)} target="_blank" rel="noopener" className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white">
              Enviar no WhatsApp
            </a>
          )}
          {(pode("tarefas.excluir") || t.criado_por === membro.id) && (
            <BotaoExcluir empresaId={empresaId} tarefaId={t.id} />
          )}
        </div>
      </Cartao>

      {pode("tarefas.mudar_status") && !t.concluida_em && statusDisponiveis.length > 0 && (
        <Cartao>
          <MudarStatus
            empresaId={empresaId}
            tarefaId={t.id}
            statusAtualId={t.status_id}
            anteriorNome={atual?.tipo === "adiado" && t.status_anterior_id ? (st.get(t.status_anterior_id)?.nome ?? null) : null}
            opcoes={statusDisponiveis.filter((s) => s.id !== t.status_id).map((s) => ({ id: s.id, nome: s.nome, tipo: s.tipo }))}
            chamado={{ fuso, custo: chamado.custo, solucao: chamado.solucao }}
          />
        </Cartao>
      )}

      {podeDelegar && (
        <Cartao>
          <h2 className="mb-1 font-medium">{euRecebo ? "Delegar este chamado" : "Responsáveis"}</h2>
          <p className="mb-3 text-xs text-slate-500">
            {euRecebo
              ? "Se não delegar, o chamado continua com você. Quem entrar na lista recebe o aviso do que fazer; mantenha seu nome para compartilhar."
              : "Quem entrar na lista recebe o aviso do chamado."}
          </p>
          <form action={delegarChamado.bind(null, empresaId, t.id)} className="space-y-3">
            <SeletorResponsaveis
              rotulo="Quem acompanha"
              membros={(membros ?? []).filter((m) => m.ativo || (t.responsaveis ?? []).includes(m.id))}
              name="responsaveis"
              inicial={t.responsaveis ?? []}
            />
            <Botao>Salvar</Botao>
          </form>
        </Cartao>
      )}

      {pode("chamados.gerenciar") && (
        <Cartao>
          <h2 className="mb-2 font-medium">Gestão</h2>
          <form action={atualizarChamado.bind(null, empresaId, t.id)} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Campo rotulo="Título">
                <Input name="titulo" required defaultValue={t.titulo} />
              </Campo>
            </div>
            <div className="sm:col-span-2">
              <Campo rotulo="Descrição">
                <Textarea name="descricao" rows={3} defaultValue={t.descricao ?? ""} />
              </Campo>
            </div>
            <Campo rotulo="Prioridade">
              <Select name="prioridade" defaultValue={chamado.prioridade}>
                {Object.entries(PRIORIDADES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.rotulo}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Prazo">
              <Input type="datetime-local" name="prazo" defaultValue={utcParaLocalInput(t.prazo, fuso)} />
            </Campo>
            <Campo rotulo="Prestador que atendeu">
              <SeletorPrestador
                empresaId={empresaId}
                opcoes={(fornecedores ?? [])
                  .filter((f) => f.ativo || f.id === chamado.fornecedor_id)
                  .map((f) => ({ id: f.id, nome: rotuloPrestador(f) }))}
                inicial={chamado.fornecedor_id ?? ""}
                podeCadastrar={pode("prestadores.gerenciar")}
              />
            </Campo>
            <Campo rotulo="Equipamento">
              <Select name="equipamento_id" defaultValue={chamado.equipamento_id ?? ""}>
                <option value="">—</option>
                {(equipamentos ?? []).filter((e) => e.ativo || e.id === chamado.equipamento_id).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Local">
              <Input name="local" defaultValue={chamado.local ?? ""} />
            </Campo>
            <Campo rotulo="Custo (R$)">
              <Input name="custo" type="number" step="0.01" min="0" defaultValue={chamado.custo ?? ""} />
            </Campo>
            <div className="flex items-end">
              <Botao>Salvar</Botao>
            </div>
          </form>
        </Cartao>
      )}

      <Cartao className="space-y-3">
        <h2 className="font-medium">Fotos</h2>
        {urls.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {urls.map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="Foto do chamado" className="aspect-square w-full rounded-lg object-cover" />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">Nenhuma foto.</p>
        )}
        <CampoFotos empresaId={empresaId} tarefaId={t.id} />
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Comentários</h2>
        <ul className="space-y-2 text-sm">
          {(comentarios ?? []).map((c) => (
            <li key={c.id} className="rounded-lg bg-slate-50 p-2">
              <p className="whitespace-pre-wrap">{c.texto}</p>
              <p className="text-xs text-slate-500">
                {c.membro_id ? mb.get(c.membro_id)?.nome : ""} · {formatarDataHora(c.created_at, fuso)}
              </p>
            </li>
          ))}
        </ul>
        <form action={comentarTarefa.bind(null, empresaId, t.id, caminho)} className="flex gap-2">
          <Textarea name="texto" rows={1} placeholder="Escreva um comentário" required />
          <Botao variante="secundario">Comentar</Botao>
        </form>
      </Cartao>

      <Cartao>
        <h2 className="mb-2 font-medium">Histórico</h2>
        <ol className="space-y-1 text-sm">
          {(historico ?? []).map((h) => (
            <li key={h.id} className="text-slate-600">
              <span className="text-xs text-slate-400">{formatarDataHora(h.created_at, fuso)}</span>{" "}
              <span className="font-medium text-slate-800">{h.membro_id ? mb.get(h.membro_id)?.nome : "Sistema"}</span>{" "}
              {h.acao === "criada"
                ? "abriu o chamado"
                : h.acao === "status"
                  ? `mudou de ${st.get(h.status_de)?.nome} para ${st.get(h.status_para)?.nome}`
                  : h.acao === "prazo"
                    ? `mudou o prazo para ${formatarDataHora(h.prazo_para, fuso)}`
                    : "mudou o responsável"}
              {h.comentario && <> — “{h.comentario}”</>}
            </li>
          ))}
        </ol>
      </Cartao>
    </div>
  );
}
