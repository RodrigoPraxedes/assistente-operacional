import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { provedorDe } from "@/lib/whatsapp-api";
import { mascararNumero, sanitizarErro } from "@/lib/whatsapp-api/sanitizar";
import { Aviso, Botao, Campo, Cartao, Etiqueta, Input, Select, Vazio, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { BotaoEnviar } from "@/components/botao-enviar";
import { alternarContato, criarRegraGrupo, editarContato, excluirContato, removerGatilho, renomearGrupo, salvarContato, salvarGrupo, vincularContato } from "../actions";

interface Contato {
  id: string;
  nome: string;
  telefone: string;
  tipo: "pessoa" | "grupo";
  ativo: boolean;
  membro_id: string | null;
  autorizado_em: string;
  autorizador: { nome: string } | null;
}

interface Gatilho {
  id: string;
  checklist_modelos: { nome: string } | null;
  whatsapp_contatos: { nome: string } | null;
  whatsapp_conexoes: { provedor: string; unidades: { nome: string } | null } | null;
}

export default async function Destinatarios({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { empresaId } = await params;
  const { erro, ok } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  if (!pode("whatsapp.gerenciar")) notFound();

  const [{ data: contatos }, { data: membros }, { data: gatilhos }, { data: modelos }, { data: conexoes }] = await Promise.all([
    supabase
      .from("whatsapp_contatos")
      .select("id, nome, telefone, tipo, ativo, membro_id, autorizado_em, autorizador:membros!whatsapp_contatos_autorizado_por_fkey(nome)")
      .eq("empresa_id", empresaId)
      .order("ativo", { ascending: false })
      .order("nome")
      .returns<Contato[]>(),
    supabase.from("membros").select("id, nome, telefone").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase
      .from("whatsapp_gatilhos")
      .select("id, checklist_modelos(nome), whatsapp_contatos(nome), whatsapp_conexoes(provedor, unidades(nome))")
      .eq("empresa_id", empresaId)
      .order("created_at")
      .returns<Gatilho[]>(),
    supabase.from("checklist_modelos").select("id, nome").eq("empresa_id", empresaId).order("nome"),
    supabase
      .from("whatsapp_conexoes")
      .select("provedor, instancia, status")
      .eq("empresa_id", empresaId)
      .neq("provedor", "simulacao")
      .eq("status", "conectado")
      .order("created_at"),
  ]);

  // grupos do número conectado (só a Evolution lista); sem lista, dá para colar o código à mão
  let grupos: { jid: string; nome: string; participantes: number | null }[] = [];
  let erroGrupos: string | null = null;
  const real = (conexoes ?? [])[0];
  if (real) {
    const provedor = provedorDe(real.provedor);
    try {
      grupos = (await provedor.listarGrupos?.(real.instancia)) ?? [];
    } catch (e) {
      erroGrupos = sanitizarErro(e);
    }
  }
  const jaCadastrados = new Set((contatos ?? []).map((c) => c.telefone));
  const gruposLivres = grupos.filter((g) => !jaCadastrados.has(g.jid));
  const gruposAtivos = (contatos ?? []).filter((c) => c.tipo === "grupo" && c.ativo);

  return (
    <div className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}

      <Cartao className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Autorizar destinatário</h2>
          <p className="text-sm text-slate-500">Só números autorizados aqui podem receber avisos. Comece com um único número de teste.</p>
        </div>
        <form action={salvarContato.bind(null, empresaId)} className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Nome">
            <Input name="nome" required maxLength={120} />
          </Campo>
          <Campo rotulo="WhatsApp (DDD + número)">
            <Input name="telefone" required inputMode="tel" placeholder="(21) 99999-8888" />
          </Campo>
          <Campo rotulo="Colaborador (opcional)">
            <Select name="membro_id" defaultValue="">
              <option value="">—</option>
              {(membros ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </Select>
          </Campo>
          <div className="flex items-end">
            <BotaoEnviar className="w-full">Autorizar</BotaoEnviar>
          </div>
        </form>
      </Cartao>

      <Cartao className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Autorizar grupo do WhatsApp</h2>
          <p className="text-sm text-slate-500">
            O aviso vai para o grupo todo, pelo número conectado (que precisa ser participante do grupo). Serve para o resultado de check-list
            e avisos manuais; tarefas e o resumo do dia continuam pessoais.
          </p>
        </div>
        {erroGrupos && <Aviso>Não consegui listar os grupos agora ({erroGrupos}). Informe o código do grupo à mão.</Aviso>}
        <form action={salvarGrupo.bind(null, empresaId)} className="grid gap-3 sm:grid-cols-2">
          {gruposLivres.length > 0 ? (
            <Campo rotulo="Grupo">
              <Select name="jid" required defaultValue="">
                <option value="">Escolher…</option>
                {gruposLivres.map((g) => (
                  <option key={g.jid} value={g.jid}>
                    {g.nome}
                    {g.participantes ? ` (${g.participantes})` : ""}
                  </option>
                ))}
              </Select>
            </Campo>
          ) : (
            <Campo rotulo="Código do grupo (1203...@g.us)">
              <Input name="jid" required placeholder="120363000000000000@g.us" />
            </Campo>
          )}
          <Campo rotulo="Nome para exibir">
            <Input name="nome" required maxLength={120} placeholder="Ex.: Gerência" />
          </Campo>
          <div className="sm:col-span-2">
            <BotaoEnviar className="w-full sm:w-auto">Autorizar grupo</BotaoEnviar>
          </div>
        </form>
        {!real && <p className="text-xs text-slate-500">Conecte um número real (Evolution) na aba Conexão para ver a lista de grupos.</p>}
      </Cartao>

      {gruposAtivos.length > 0 && (modelos ?? []).length > 0 && (
        <Cartao className="space-y-3">
          <div>
            <h2 className="font-semibold text-slate-900">Avisar grupo quando o check-list for concluído</h2>
            <p className="text-sm text-slate-500">A mensagem sai uma vez por check-list enviado, igual à de quem recebe o resultado.</p>
          </div>
          <form action={criarRegraGrupo.bind(null, empresaId)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Campo rotulo="Check-list">
              <Select name="modelo_id" required defaultValue="">
                <option value="">Escolher…</option>
                {(modelos ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Grupo">
              <Select name="contato_id" required defaultValue="">
                <option value="">Escolher…</option>
                {gruposAtivos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <BotaoEnviar>Criar regra</BotaoEnviar>
          </form>
        </Cartao>
      )}

      {!contatos?.length ? (
        <Vazio>Nenhum destinatário autorizado.</Vazio>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-superficie">
          {contatos.map((c) => (
            <li key={c.id} className="text-sm">
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">
                      {c.nome}{" "}
                      <span className="font-normal text-slate-500">{c.tipo === "grupo" ? "Grupo do WhatsApp" : mascararNumero(c.telefone)}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Autorizado {c.autorizador ? `por ${c.autorizador.nome} ` : ""}em {formatarDataHora(c.autorizado_em, empresa.fuso_horario)}
                    </p>
                  </div>
                  {c.ativo && c.tipo === "pessoa" && !c.membro_id && <Etiqueta>Sem colaborador</Etiqueta>}
                  {!c.ativo && <Etiqueta>Desativado</Etiqueta>}
                </summary>
                <div className="space-y-3 px-4 pb-3">
                  {c.tipo === "grupo" ? (
                    <form action={renomearGrupo.bind(null, empresaId, c.id)} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                      <Campo rotulo="Nome para exibir">
                        <Input name="nome" required maxLength={120} defaultValue={c.nome} />
                      </Campo>
                      <Botao variante="secundario">Salvar</Botao>
                    </form>
                  ) : (
                  <>
                  <form action={editarContato.bind(null, empresaId, c.id)} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                    <Campo rotulo="Nome">
                      <Input name="nome" required maxLength={120} defaultValue={c.nome} />
                    </Campo>
                    <Campo rotulo="WhatsApp (DDD + número)">
                      <Input name="telefone" required inputMode="tel" defaultValue={c.telefone.replace(/^55/, "")} />
                    </Campo>
                    <Botao variante="secundario">Salvar</Botao>
                  </form>
                  <p className="text-xs text-slate-500">Trocar o número autoriza o número novo agora; o antigo deixa de receber.</p>
                  {c.ativo && (
                    <form action={vincularContato.bind(null, empresaId, c.id)} className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Colaborador:</span>
                      <Select name="membro_id" defaultValue={c.membro_id ?? ""} required className="w-auto">
                        <option value="">Escolher…</option>
                        {(membros ?? []).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </Select>
                      <Botao variante="secundario">{c.membro_id ? "Trocar" : "Vincular"}</Botao>
                    </form>
                  )}
                  {c.ativo && !c.membro_id && <p className="text-xs text-slate-500">Sem colaborador, o número não recebe o resumo do dia.</p>}
                  </>
                  )}
                  <form action={alternarContato.bind(null, empresaId, c.id, !c.ativo)}>
                    <Botao variante="secundario">{c.ativo ? "Desativar" : "Reativar"}</Botao>
                  </form>
                  <form action={excluirContato.bind(null, empresaId, c.id)}>
                    <BotaoConfirmar
                      mensagem={`Excluir ${c.nome}? As regras de check-list ligadas a ele também são removidas. Se já recebeu avisos, use Desativar.`}
                      className={estilos.botaoPerigo}
                    >
                      Excluir
                    </BotaoConfirmar>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}

      {(gatilhos ?? []).length > 0 && (
      <Cartao className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Regras de aviso de check-list (grupos e números de fora)</h2>
          <p className="text-sm text-slate-500">
            Quem da equipe recebe o resultado se escolhe dentro de cada check-list (campo Recebe o resultado). Estas regras são de
            grupos e de números de fora da equipe e valem até você removê-las.
          </p>
        </div>
          <ul className="divide-y divide-slate-200 border-t border-slate-200">
            {gatilhos!.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <p className="min-w-0 flex-1 text-slate-700">
                  <strong>{g.checklist_modelos?.nome}</strong> concluído → avisar <strong>{g.whatsapp_contatos?.nome}</strong>
                  <span className="text-slate-500"> · {g.whatsapp_conexoes?.unidades?.nome ?? "Empresa toda"}</span>
                  {g.whatsapp_conexoes?.provedor === "simulacao" && (
                    <span className="text-slate-500"> (ensaio: sai pelo número real da unidade, se houver)</span>
                  )}
                </p>
                <form action={removerGatilho.bind(null, empresaId, g.id)}>
                  <BotaoConfirmar mensagem="Remover esta regra?" className={estilos.botaoPerigo}>
                    Remover
                  </BotaoConfirmar>
                </form>
              </li>
            ))}
          </ul>
      </Cartao>
      )}
    </div>
  );
}
