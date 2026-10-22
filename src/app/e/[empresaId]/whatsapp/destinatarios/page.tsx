import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { mascararNumero } from "@/lib/whatsapp-api/sanitizar";
import { Aviso, Botao, Campo, Cartao, Etiqueta, Input, Select, Vazio, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { BotaoEnviar } from "@/components/botao-enviar";
import { alternarContato, editarContato, excluirContato, removerGatilho, salvarContato, salvarGatilho, vincularContato } from "../actions";

interface Contato {
  id: string;
  nome: string;
  telefone: string;
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

  const [{ data: contatos }, { data: membros }, { data: gatilhos }, { data: conexoes }, { data: modelos }] = await Promise.all([
    supabase
      .from("whatsapp_contatos")
      .select("id, nome, telefone, ativo, membro_id, autorizado_em, autorizador:membros!whatsapp_contatos_autorizado_por_fkey(nome)")
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
    supabase
      .from("whatsapp_conexoes")
      .select("id, provedor, unidades(nome)")
      .eq("empresa_id", empresaId)
      .order("provedor")
      .returns<{ id: string; provedor: string; unidades: { nome: string } | null }[]>(),
    supabase.from("checklist_modelos").select("id, nome").eq("empresa_id", empresaId).order("nome"),
  ]);
  const ativos = (contatos ?? []).filter((c) => c.ativo);

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
                      {c.nome} <span className="font-normal text-slate-500">{mascararNumero(c.telefone)}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Autorizado {c.autorizador ? `por ${c.autorizador.nome} ` : ""}em {formatarDataHora(c.autorizado_em, empresa.fuso_horario)}
                    </p>
                  </div>
                  {c.ativo && !c.membro_id && <Etiqueta>Sem colaborador</Etiqueta>}
                  {!c.ativo && <Etiqueta>Desativado</Etiqueta>}
                </summary>
                <div className="space-y-3 px-4 pb-3">
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

      <Cartao className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Avisos automáticos de check-list</h2>
          <p className="text-sm text-slate-500">
            Quando o check-list escolhido for concluído (ex.: Fechamento), o destinatário recebe um aviso. Com “Check-list
            concluído” ligado na aba Automações, o aviso sai sozinho; desligado, vira rascunho para alguém confirmar na aba Avisos.
          </p>
        </div>
        {conexoes?.length && ativos.length && modelos?.length ? (
          <form action={salvarGatilho.bind(null, empresaId)} className="grid gap-3 sm:grid-cols-3">
            <Campo rotulo="Check-list">
              <Select name="modelo_id" required>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Avisar">
              <Select name="contato_id" required>
                {ativos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Pelo número de">
              <Select name="conexao_id" required>
                {conexoes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.unidades?.nome ?? "Empresa toda"}
                    {c.provedor === "simulacao" && " (ensaio)"}
                  </option>
                ))}
              </Select>
            </Campo>
            <div className="sm:col-span-3">
              <BotaoEnviar>Criar regra</BotaoEnviar>
            </div>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Precisa de uma conexão, um destinatário ativo e um check-list cadastrado.</p>
        )}
        {(gatilhos ?? []).length > 0 && (
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
        )}
      </Cartao>
    </div>
  );
}
