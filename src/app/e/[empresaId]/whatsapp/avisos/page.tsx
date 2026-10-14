import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { textoFinal } from "@/lib/whatsapp-api/fila";
import { mascararNumero } from "@/lib/whatsapp-api/sanitizar";
import { SITUACAO_MENSAGEM, TEXTO_TESTE } from "@/lib/whatsapp-api/rotulos";
import type { SituacaoMensagem } from "@/lib/whatsapp-api/tipos";
import { Aviso, Botao, Cartao, Etiqueta, Vazio, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { FormAviso } from "./form-aviso";
import {
  cancelarRascunho,
  confirmarEnvio,
  criarRascunho,
  processarAgora,
  resolverPendencia,
  verificarNoProvedor,
} from "../actions";

interface Mensagem {
  id: string;
  empresa_id: string;
  conexao_id: string;
  texto: string;
  origem: string;
  origem_id: string | null;
  situacao: SituacaoMensagem;
  erro: string | null;
  tentativas: number;
  solicitado_por: string | null;
  created_at: string;
  confirmado_em: string | null;
  aceito_em: string | null;
  entregue_em: string | null;
  lido_em: string | null;
  falhou_em: string | null;
  whatsapp_contatos: { nome: string; telefone: string } | null;
  solicitante: { nome: string } | null;
  confirmador: { nome: string } | null;
}

const ORIGEM: Record<string, string> = {
  checklist: "Gerado pelo check-list",
  teste: "Teste",
  tarefa: "Automático: tarefa atribuída",
  resumo: "Automático: resumo do dia",
};

export default async function Avisos({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string; ok?: string; teste?: string }>;
}) {
  const { empresaId } = await params;
  const { erro, ok, teste } = await searchParams;
  const { supabase, empresa, membro, pode } = await getContexto(empresaId);
  const gerencia = pode("whatsapp.gerenciar");
  const fuso = empresa.fuso_horario;

  const [{ data: conexoes }, { data: contatos }, { data: mensagens }] = await Promise.all([
    supabase
      .from("whatsapp_conexoes")
      .select("id, provedor, envio_pausado, unidades(nome)")
      .eq("empresa_id", empresaId)
      .order("created_at")
      .returns<{ id: string; provedor: string; envio_pausado: boolean; unidades: { nome: string } | null }[]>(),
    supabase.from("whatsapp_contatos").select("id, nome, telefone").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase
      .from("whatsapp_mensagens")
      .select(
        "id, empresa_id, conexao_id, texto, origem, origem_id, situacao, erro, tentativas, solicitado_por, created_at, confirmado_em, aceito_em, entregue_em, lido_em, falhou_em, whatsapp_contatos(nome, telefone), solicitante:membros!whatsapp_mensagens_solicitado_por_fkey(nome), confirmador:membros!whatsapp_mensagens_confirmado_por_fkey(nome)",
      )
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(50)
      .returns<Mensagem[]>(),
  ]);
  const pausada = new Map((conexoes ?? []).map((c) => [c.id, c.envio_pausado]));
  const ensaio = new Set((conexoes ?? []).filter((c) => c.provedor === "simulacao").map((c) => c.id));
  const naFila = (mensagens ?? []).some((m) => m.situacao === "na_fila");

  return (
    <div className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}

      <Cartao className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-900">Novo aviso</h2>
          <Link href={`/e/${empresaId}/whatsapp/avisos${teste ? "" : "?teste=1"}`} className="text-sm text-blue-600 hover:underline">
            {teste ? "Escrever do zero" : "Usar texto de teste (fechamento)"}
          </Link>
        </div>
        {!conexoes?.length ? (
          <p className="text-sm text-slate-500">Conecte um número na aba Conexão primeiro.</p>
        ) : !contatos?.length ? (
          <p className="text-sm text-slate-500">
            Nenhum destinatário autorizado. {gerencia ? "Cadastre na aba Destinatários." : "Peça ao responsável para autorizar."}
          </p>
        ) : (
          <FormAviso
            key={teste ? "teste" : "livre"}
            acao={criarRascunho.bind(null, empresaId)}
            pedidoId={crypto.randomUUID()}
            conexoes={conexoes.map((c) => ({ id: c.id, rotulo: c.unidades?.nome ?? "Empresa toda" }))}
            contatos={contatos.map((c) => ({ id: c.id, rotulo: `${c.nome} · ${mascararNumero(c.telefone)}` }))}
            textoInicial={teste ? TEXTO_TESTE : ""}
            teste={!!teste}
          />
        )}
      </Cartao>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-700">Últimos avisos</h2>
        {gerencia && naFila && (
          <form action={processarAgora.bind(null, empresaId)}>
            <Botao variante="secundario">Processar fila agora</Botao>
          </form>
        )}
      </div>

      {!mensagens?.length && <Vazio>Nenhum aviso ainda.</Vazio>}
      <div className="space-y-3">
        {(mensagens ?? []).map((m) => {
          const s = SITUACAO_MENSAGEM[m.situacao];
          const meu = m.solicitado_por === membro.id;
          const etapas = [
            { rotulo: "Rascunho", em: m.created_at },
            { rotulo: "Confirmado", em: m.confirmado_em },
            { rotulo: "Aceito", em: m.aceito_em },
            { rotulo: "Entregue", em: m.entregue_em },
            { rotulo: "Lido", em: m.lido_em },
            { rotulo: "Falhou", em: m.falhou_em },
          ].filter((e) => e.em);
          return (
            <Cartao key={m.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">
                    {m.whatsapp_contatos?.nome}{" "}
                    <span className="font-normal text-slate-500">{mascararNumero(m.whatsapp_contatos?.telefone)}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {ORIGEM[m.origem] ?? "Manual"}
                    {ensaio.has(m.conexao_id) && " · ensaio"}
                    {m.solicitante && ` · preparado por ${m.solicitante.nome}`}
                    {m.confirmador && ` · confirmado por ${m.confirmador.nome}`}
                  </p>
                </div>
                <Etiqueta cor={s.cor}>{s.rotulo}</Etiqueta>
              </div>

              <details className="group">
                <summary className="cursor-pointer list-none text-sm whitespace-pre-wrap text-slate-700 group-open:hidden">
                  <span className="line-clamp-2">{m.texto}</span>
                </summary>
                <p className="rounded-lg bg-slate-100 p-3 text-sm whitespace-pre-wrap text-slate-800">{textoFinal(m)}</p>
              </details>

              <ol className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                {etapas.map((e) => (
                  <li key={e.rotulo}>
                    {e.rotulo} {formatarDataHora(e.em, fuso)}
                  </li>
                ))}
              </ol>

              {m.erro && <Aviso tipo={m.situacao === "desconhecido" ? "info" : "erro"}>{m.erro}</Aviso>}
              {m.situacao === "desconhecido" && (
                <p className="text-xs text-slate-500">
                  O provedor não respondeu a tempo: a mensagem pode ter saído ou não. Nada é reenviado sem você decidir.
                </p>
              )}

              {m.situacao === "rascunho" && (gerencia || meu) && (
                <div className="flex flex-wrap gap-2">
                  {gerencia && (
                    <form action={confirmarEnvio.bind(null, empresaId, m.id)}>
                      <BotaoConfirmar mensagem="Enviar este aviso agora? Sai uma única mensagem." className={estilos.botao}>
                        {pausada.get(m.conexao_id) ? "Confirmar (envios pausados)" : "Confirmar e enviar"}
                      </BotaoConfirmar>
                    </form>
                  )}
                  <form action={cancelarRascunho.bind(null, empresaId, m.id)}>
                    <Botao variante="secundario">Cancelar</Botao>
                  </form>
                </div>
              )}

              {m.situacao === "desconhecido" && gerencia && (
                <div className="flex flex-wrap gap-2">
                  {!ensaio.has(m.conexao_id) && (
                    <form action={verificarNoProvedor.bind(null, empresaId, m.id)}>
                      <Botao>Verificar no WhatsApp</Botao>
                    </form>
                  )}
                  <form action={resolverPendencia.bind(null, empresaId, m.id, "enviada")}>
                    <Botao variante="secundario">Chegou, marcar como enviado</Botao>
                  </form>
                  <form action={resolverPendencia.bind(null, empresaId, m.id, "reenviar")}>
                    <BotaoConfirmar
                      mensagem="Reenviar? Se a primeira tentativa tiver saído, a pessoa recebe duas vezes."
                      className={estilos.botaoSecundario}
                    >
                      Reenviar
                    </BotaoConfirmar>
                  </form>
                  <form action={resolverPendencia.bind(null, empresaId, m.id, "falhou")}>
                    <Botao variante="secundario">Marcar como falha</Botao>
                  </form>
                </div>
              )}
            </Cartao>
          );
        })}
      </div>
    </div>
  );
}
