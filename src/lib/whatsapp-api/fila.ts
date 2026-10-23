import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { urlDoSite } from "@/lib/whatsapp";
import { comoErroProvedor, provedorDe } from "./index";
import { sanitizarErro } from "./sanitizar";
import type { SituacaoMensagem, StatusConexao } from "./tipos";

// Trabalho fora da requisição (after() da tela/webhook e o cron diário):
// envio das mensagens confirmadas e processamento dos eventos recebidos.
// Usa a service_role porque roda sem usuário logado.

const MAX_TENTATIVAS_REDE = 3;
const ESPERA_BASE_S = 30;
// "enviando" parado há mais que isso: o processo caiu no meio, resultado desconhecido
const ENVIANDO_TRAVADO_MIN = 5;

interface Reservada {
  id: string;
  empresa_id: string;
  texto: string;
  origem: string;
  origem_id: string | null;
  pedido_id: string;
  tentativas: number;
  provedor: string;
  instancia: string;
  telefone: string;
}

// Endereço que a mensagem leva, por tipo de aviso (null = sem link)
function urlDaMensagem(m: { empresa_id: string; origem: string; origem_id: string | null }) {
  if (m.origem === "checklist" && m.origem_id) return urlDoSite(`/e/${m.empresa_id}/checklists/execucoes/${m.origem_id}`);
  if (m.origem === "contagem") return urlDoSite(`/e/${m.empresa_id}/contagens`);
  if ((m.origem === "tarefa" || m.origem === "conclusao" || m.origem === "lembrete" || m.origem === "prazo") && m.origem_id)
    return urlDoSite(`/e/${m.empresa_id}/tarefas/${m.origem_id}`);
  if (m.origem === "resumo") return urlDoSite(`/e/${m.empresa_id}/tarefas`);
  return null;
}

// Texto que sai de verdade (a prévia na tela usa a mesma função).
// com_link é decidido quando a mensagem nasce (chaves "Incluir link" da aba Automações).
// O link vai em linha própria, depois de uma linha em branco; check-list e contagem concluídos
// levam "Confira aqui:". Um texto com {link} escolhe onde o link entra.
export function textoFinal(m: { empresa_id: string; texto: string; origem: string; origem_id: string | null; com_link?: boolean }) {
  const marcado = /\{(link|url)\}/.test(m.texto);
  const url = m.com_link === false ? null : urlDaMensagem(m);
  if (marcado) {
    if (!url) return m.texto.split("\n").filter((l) => !/\{(link|url)\}/.test(l)).join("\n").trimEnd();
    return m.texto.replaceAll("{link}", url).replaceAll("{url}", url);
  }
  if (!url) return m.texto;
  return `${m.texto}\n\n${m.origem === "checklist" || m.origem === "contagem" ? `*Confira aqui:* ${url}` : url}`;
}

export async function processarMensagem(mensagemId: string) {
  const admin = createAdminClient();
  const { data } = await admin.rpc("whatsapp_reservar_envio", { p_mensagem: mensagemId });
  const m = (data as Reservada[] | null)?.[0];
  if (!m) return; // já foi pega, está pausada ou não está na fila

  const provedor = provedorDe(m.provedor);
  const { data: extra } = await admin.from("whatsapp_mensagens").select("com_link").eq("id", m.id).maybeSingle();
  try {
    const { id } = await provedor.enviarMensagem({
      instancia: m.instancia,
      numero: m.telefone,
      texto: textoFinal({ ...m, com_link: extra?.com_link ?? true }),
    });
    await admin
      .from("whatsapp_mensagens")
      .update({ situacao: "aceito", mensagem_externa_id: id, aceito_em: agora(), erro: null, updated_at: agora() })
      .eq("id", m.id)
      .eq("situacao", "enviando");
    if (m.provedor === "simulacao") await simularRecibos(m.id, id);
  } catch (e) {
    const erro = comoErroProvedor(e);
    const base = { erro: sanitizarErro(erro.message), updated_at: agora() };
    let mudanca: Record<string, unknown>;
    if (erro.tipo === "rede" && m.tentativas < MAX_TENTATIVAS_REDE) {
      // não chegou ao provedor: volta para a fila com espera crescente
      const espera = ESPERA_BASE_S * 2 ** (m.tentativas - 1);
      mudanca = { ...base, situacao: "na_fila", proxima_tentativa_em: new Date(Date.now() + espera * 1000).toISOString() };
    } else if (erro.tipo === "timeout" || erro.tipo === "desconhecido") {
      // pode ter saído: não reenvia sozinho, vira pendência para uma pessoa decidir
      mudanca = { ...base, situacao: "desconhecido" };
    } else {
      mudanca = { ...base, situacao: "falhou", falhou_em: agora() };
    }
    await admin.from("whatsapp_mensagens").update(mudanca).eq("id", m.id).eq("situacao", "enviando");
  }
}

// Ensaio: o "provedor" devolve os recibos pelo mesmo caminho do webhook
// (inclusive um recibo repetido, que deve ser só contado)
async function simularRecibos(mensagemId: string, externoId: string) {
  const admin = createAdminClient();
  const { data: msg } = await admin.from("whatsapp_mensagens").select("conexao_id").eq("id", mensagemId).single();
  if (!msg) return;
  for (const status of ["DELIVERY_ACK", "DELIVERY_ACK", "READ"]) {
    const { data } = await admin.rpc("whatsapp_registrar_evento", {
      p_conexao: msg.conexao_id,
      p_externo: `upd:${externoId}:${status}`,
      p_tipo: "messages.update",
      p_resumo: { mensagem: externoId, status, propria: true, simulado: true },
    });
    const ev = (data as { id: string; novo: boolean }[] | null)?.[0];
    if (ev?.novo) await processarEvento(ev.id);
  }
}

const ORDEM: Partial<Record<SituacaoMensagem, number>> = { enviando: 0, desconhecido: 0, aceito: 1, entregue: 2, lido: 3 };

const STATUS_CONEXAO: Record<string, StatusConexao> = {
  open: "conectado",
  connecting: "conectando",
  close: "desconectado",
};

export async function processarEvento(eventoId: string) {
  const admin = createAdminClient();
  const { data: ev } = await admin
    .from("whatsapp_eventos")
    .select("id, conexao_id, tipo, situacao, resumo")
    .eq("id", eventoId)
    .single();
  if (!ev || ev.situacao !== "recebido") return;
  const resumo = (ev.resumo ?? {}) as Record<string, unknown>;

  const concluir = (situacao: "processado" | "ignorado" | "falhou", erro: string | null = null) =>
    admin
      .from("whatsapp_eventos")
      .update({ situacao, erro, processado_em: agora() })
      .eq("id", ev.id)
      .eq("situacao", "recebido");

  try {
    if (ev.tipo === "connection.update") {
      const status = STATUS_CONEXAO[String(resumo.estado)] ?? "atencao";
      await admin
        .from("whatsapp_conexoes")
        .update({
          status,
          ultimo_contato_em: agora(),
          updated_at: agora(),
          ...(typeof resumo.numero === "string" ? { numero_mascarado: resumo.numero } : {}),
          ultimo_erro: status === "atencao" ? `Estado informado: ${String(resumo.estado)}` : null,
        })
        .eq("id", ev.conexao_id);
      await concluir("processado");
      return;
    }

    if (ev.tipo === "messages.upsert") {
      // própria = enviada por esta integração ou pelo celular: nunca responder (evita ciclo)
      await concluir("ignorado", resumo.propria ? "Mensagem própria" : "Mensagem recebida: sem resposta automática nesta fase");
      return;
    }

    const externo = String(resumo.mensagem ?? "");
    const { data: msg } = await admin
      .from("whatsapp_mensagens")
      .select("id, situacao")
      .eq("conexao_id", ev.conexao_id)
      .eq("mensagem_externa_id", externo)
      .maybeSingle();

    if (ev.tipo === "send.message") {
      await concluir("ignorado", msg ? "Confirmação do próprio envio" : "Enviada fora do app");
      return;
    }

    // messages.update: recibos de entrega/leitura das nossas mensagens
    if (!msg) {
      await concluir("ignorado", "Não é um aviso enviado pelo app");
      return;
    }
    const status = String(resumo.status);
    const nova: SituacaoMensagem | null =
      status === "DELIVERY_ACK" ? "entregue" : status === "READ" || status === "PLAYED" ? "lido" : status === "ERROR" ? "falhou" : null;
    const atual = msg.situacao as SituacaoMensagem;
    const posicao = ORDEM[atual] ?? 99;
    const avanca = nova === "falhou" ? posicao < 2 : nova !== null && (ORDEM[nova] ?? 0) > posicao;
    if (!nova || !avanca) {
      await concluir("ignorado", "Sem mudança de situação");
      return;
    }
    const carimbo = nova === "entregue" ? "entregue_em" : nova === "lido" ? "lido_em" : "falhou_em";
    await admin
      .from("whatsapp_mensagens")
      .update({ situacao: nova, [carimbo]: agora(), updated_at: agora(), ...(nova === "falhou" ? { erro: "O WhatsApp informou erro no envio" } : {}) })
      .eq("id", msg.id);
    await concluir("processado");
  } catch (e) {
    await concluir("falhou", sanitizarErro(e));
  }
}

// Intervalo entre duas mensagens seguidas: rajadas são o que mais chama a
// atenção do WhatsApp para números usados por API não oficial
const INTERVALO_MIN_MS = 3_000;
const INTERVALO_MAX_MS = 7_000;

// Avisos que podem esperar (tarefa atribuída e conclusão); lembretes e resumos têm hora própria
const ORIGENS_SEM_MADRUGADA = new Set(["tarefa", "conclusao", "prazo"]);
const SILENCIO_INICIO_H = 22;
const SILENCIO_FIM_H = 8;

function ehMadrugada(fuso = "America/Sao_Paulo", agoraDate = new Date()) {
  const h = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: fuso }).format(agoraDate));
  return h >= SILENCIO_INICIO_H || h < SILENCIO_FIM_H;
}

// Varredura: chamada pelos crons e pelo botão "Processar fila" da tela.
// prazoMs: para de enviar quando o tempo acaba (o resto fica para a próxima)
export async function processarFila(limite = 20, prazoMs = 40_000) {
  const inicio = Date.now();
  const admin = createAdminClient();
  const limiteTravado = new Date(Date.now() - ENVIANDO_TRAVADO_MIN * 60_000).toISOString();
  await admin
    .from("whatsapp_mensagens")
    .update({ situacao: "desconhecido", erro: "O envio foi interrompido no meio. Confira no celular.", updated_at: agora() })
    .eq("situacao", "enviando")
    .lt("enviado_em", limiteTravado);

  const { data: fila } = await admin
    .from("whatsapp_mensagens")
    .select("id, empresa_id, origem, empresas(fuso_horario)")
    .eq("situacao", "na_fila")
    .lte("proxima_tentativa_em", agora())
    .order("proxima_tentativa_em")
    .limit(limite * 10)
    .returns<{ id: string; empresa_id: string; origem: string; empresas: { fuso_horario: string } | null }[]>();
  // avisos de tarefa não saem de madrugada: ficam na fila até as 8h da empresa
  const aEnviar = (fila ?? []).filter((m) => !(ORIGENS_SEM_MADRUGADA.has(m.origem) && ehMadrugada(m.empresas?.fuso_horario))).slice(0, limite);
  let enviadas = 0;
  for (const m of aEnviar) {
    if (enviadas > 0) {
      if (Date.now() - inicio > prazoMs) break;
      await esperar(INTERVALO_MIN_MS + Math.random() * (INTERVALO_MAX_MS - INTERVALO_MIN_MS));
    }
    await processarMensagem(m.id);
    enviadas++;
  }

  const { data: eventos } = await admin
    .from("whatsapp_eventos")
    .select("id")
    .eq("situacao", "recebido")
    .order("recebido_em")
    .limit(limite * 5);
  for (const e of eventos ?? []) await processarEvento(e.id);

  return { mensagens: enviadas, eventos: eventos?.length ?? 0 };
}

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function agora() {
  return new Date().toISOString();
}
