"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { soDigitos } from "@/lib/formato";
import { urlDoSite } from "@/lib/whatsapp";
import { comoErroProvedor, provedorDe } from "@/lib/whatsapp-api";
import { processarFila, processarMensagem, textoFinal } from "@/lib/whatsapp-api/fila";
import { sanitizarErro } from "@/lib/whatsapp-api/sanitizar";

type Aba = "/conexao" | "/avisos" | "/eventos" | "/destinatarios" | "/automacoes";

function voltar(empresaId: string, aba: Aba, params: Record<string, string> = {}): never {
  const q = new URLSearchParams(params).toString();
  redirect(`/e/${empresaId}/whatsapp${aba}${q ? `?${q}` : ""}`);
}

function atualizar(empresaId: string) {
  revalidatePath(`/e/${empresaId}/whatsapp`, "layout");
}

// Confere no banco (com o usuário logado) se ele gerencia esta conexão, inclusive a unidade
async function conexaoGerenciada(empresaId: string, conexaoId: string) {
  const ctx = await getContexto(empresaId);
  const [{ data: pode }, { data: conexao }] = await Promise.all([
    ctx.supabase.rpc("whatsapp_pode", { p_conexao: conexaoId, p_chave: "whatsapp.gerenciar" }),
    ctx.supabase
      .from("whatsapp_conexoes")
      .select("id, provedor, instancia")
      .eq("id", conexaoId)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);
  if (pode !== true || !conexao) voltar(empresaId, "/conexao", { erro: "Você não tem permissão para esta conexão." });
  return { ...ctx, conexao };
}

// ---------------------------------------------------------------------------
// Conexão
// ---------------------------------------------------------------------------

export async function criarConexao(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const provedor = String(form.get("provedor"));
  const unidade = String(form.get("unidade_id") ?? "") || null;
  const { error } = await supabase.rpc("whatsapp_criar_conexao", { p_empresa: empresaId, p_unidade: unidade, p_provedor: provedor });
  if (error) voltar(empresaId, "/conexao", { erro: error.message });
  atualizar(empresaId);
  voltar(empresaId, "/conexao", { ok: "Conexão criada. Os envios começam pausados." });
}

export async function atualizarStatus(empresaId: string, conexaoId: string) {
  const { supabase, conexao } = await conexaoGerenciada(empresaId, conexaoId);
  const provedor = provedorDe(conexao.provedor);
  try {
    const estado = await provedor.consultarConexao(conexao.instancia);
    await supabase.rpc("whatsapp_atualizar_estado", {
      p_conexao: conexaoId,
      p_status: estado.status,
      p_numero: estado.numeroMascarado,
      p_erro: null,
    });
  } catch (e) {
    const erro = comoErroProvedor(e);
    await supabase.rpc("whatsapp_atualizar_estado", {
      p_conexao: conexaoId,
      p_status: erro.tipo === "config" ? "desconectado" : "atencao",
      p_numero: null,
      p_erro: sanitizarErro(erro.message),
    });
  }
  atualizar(empresaId);
}

export type EstadoQr =
  | { qr: string | null; codigo: string | null; geradoEm: number; aviso?: string }
  | { conectado: true }
  | { erro: string }
  | undefined;

// QR Code: vai direto do provedor para a tela de quem gerencia. Não é gravado.
export async function gerarQr(_: EstadoQr, form: FormData): Promise<EstadoQr> {
  const empresaId = String(form.get("empresa_id"));
  const conexaoId = String(form.get("conexao_id"));
  const { supabase, conexao } = await conexaoGerenciada(empresaId, conexaoId);
  const provedor = provedorDe(conexao.provedor);
  try {
    // conectar cria a instância na primeira vez; os eventos só podem ser configurados depois
    // dela existir, e antes do QR ser lido, para o "conectado" chegar pelo webhook
    const r = await provedor.conectar(conexao.instancia);
    let aviso: string | undefined;
    const url = urlDoSite(`/api/whatsapp/webhook/${conexao.id}`);
    if (url.startsWith("https://")) {
      await provedor.configurarEventos(conexao.instancia, url);
      await supabase.rpc("whatsapp_marcar_webhook", { p_conexao: conexao.id });
    } else {
      aviso = "O app não está num endereço https: o status não será atualizado sozinho. Use “Atualizar status”.";
    }
    if (conexao.provedor !== "evolution" || r.jaConectado) {
      const estado = await provedor.consultarConexao(conexao.instancia);
      await supabase.rpc("whatsapp_atualizar_estado", {
        p_conexao: conexao.id,
        p_status: estado.status,
        p_numero: estado.numeroMascarado,
        p_erro: null,
      });
      revalidatePath(`/e/${empresaId}/whatsapp`, "layout");
      return { conectado: true };
    }
    await supabase.rpc("whatsapp_atualizar_estado", { p_conexao: conexao.id, p_status: "conectando", p_numero: null, p_erro: null });
    revalidatePath(`/e/${empresaId}/whatsapp`, "layout");
    if (!r.qr && !r.codigoPareamento) return { erro: "A Evolution não devolveu o QR Code. Tente de novo em alguns segundos." };
    return { qr: r.qr, codigo: r.codigoPareamento, geradoEm: Date.now(), aviso };
  } catch (e) {
    return { erro: sanitizarErro(comoErroProvedor(e).message) };
  }
}

export async function desconectar(empresaId: string, conexaoId: string) {
  const { supabase, conexao } = await conexaoGerenciada(empresaId, conexaoId);
  try {
    await provedorDe(conexao.provedor).desconectar(conexao.instancia);
  } catch (e) {
    voltar(empresaId, "/conexao", { erro: sanitizarErro(comoErroProvedor(e).message) });
  }
  // o histórico (avisos e eventos) continua; só o estado muda
  await supabase.rpc("whatsapp_atualizar_estado", { p_conexao: conexaoId, p_status: "desconectado", p_numero: null, p_erro: null });
  atualizar(empresaId);
}

export async function pausarEnvios(empresaId: string, conexaoId: string, pausado: boolean) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("whatsapp_pausar", { p_conexao: conexaoId, p_pausado: pausado });
  if (error) voltar(empresaId, "/conexao", { erro: error.message });
  atualizar(empresaId);
}

export async function processarAgora(empresaId: string) {
  const { pode } = await getContexto(empresaId);
  if (!pode("whatsapp.gerenciar")) voltar(empresaId, "/avisos", { erro: "Sem permissão." });
  await processarFila(20, 15_000);
  atualizar(empresaId);
}

// ---------------------------------------------------------------------------
// Destinatários e regras
// ---------------------------------------------------------------------------

export async function salvarContato(empresaId: string, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const nome = String(form.get("nome") ?? "").trim();
  let telefone = soDigitos(String(form.get("telefone") ?? ""));
  if (telefone.length === 10 || telefone.length === 11) telefone = `55${telefone}`;
  if (!nome) voltar(empresaId, "/destinatarios", { erro: "Informe o nome." });
  if (!/^\d{12,13}$/.test(telefone)) voltar(empresaId, "/destinatarios", { erro: "Telefone inválido. Use DDD + número, ex.: (21) 99999-8888." });
  const { error } = await supabase.from("whatsapp_contatos").insert({
    empresa_id: empresaId,
    nome,
    telefone,
    membro_id: String(form.get("membro_id") ?? "") || null,
    autorizado_por: membro.id,
  });
  if (error)
    voltar(empresaId, "/destinatarios", {
      erro: error.code === "23505" ? "Este telefone já está cadastrado." : error.message,
    });
  atualizar(empresaId);
  voltar(empresaId, "/destinatarios", { ok: "Destinatário autorizado." });
}

export async function alternarContato(empresaId: string, contatoId: string, ativo: boolean) {
  const { supabase, membro } = await getContexto(empresaId);
  const { error } = await supabase
    .from("whatsapp_contatos")
    .update(ativo ? { ativo, autorizado_por: membro.id, autorizado_em: new Date().toISOString() } : { ativo })
    .eq("id", contatoId);
  if (error) voltar(empresaId, "/destinatarios", { erro: error.message });
  atualizar(empresaId);
}

export async function salvarGatilho(empresaId: string, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const { error } = await supabase.from("whatsapp_gatilhos").insert({
    empresa_id: empresaId,
    conexao_id: String(form.get("conexao_id")),
    modelo_id: String(form.get("modelo_id")),
    contato_id: String(form.get("contato_id")),
    criado_por: membro.id,
  });
  if (error)
    voltar(empresaId, "/destinatarios", {
      erro: error.code === "23505" ? "Esta regra já existe." : "Não foi possível salvar a regra. Confira a conexão, o check-list e o destinatário.",
    });
  atualizar(empresaId);
}

export async function removerGatilho(empresaId: string, gatilhoId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("whatsapp_gatilhos").delete().eq("id", gatilhoId);
  if (error) voltar(empresaId, "/destinatarios", { erro: error.message });
  atualizar(empresaId);
}

// ---------------------------------------------------------------------------
// Automações
// ---------------------------------------------------------------------------

export async function salvarAutomacoes(empresaId: string, form: FormData) {
  const { supabase, membro, pode } = await getContexto(empresaId);
  if (!pode("whatsapp.gerenciar")) voltar(empresaId, "/automacoes", { erro: "Sem permissão." });
  const hora = String(form.get("resumo_hora") ?? "07:00");
  const limite = Number(form.get("limite_diario"));
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) voltar(empresaId, "/automacoes", { erro: "Horário inválido." });
  if (!Number.isInteger(limite) || limite < 1 || limite > 1000)
    voltar(empresaId, "/automacoes", { erro: "O limite diário deve ficar entre 1 e 1.000." });
  const { error } = await supabase.from("whatsapp_automacoes").upsert({
    empresa_id: empresaId,
    aviso_tarefa: form.get("aviso_tarefa") === "on",
    resumo_dia: form.get("resumo_dia") === "on",
    aviso_conclusao: form.get("aviso_conclusao") === "on",
    checklist_auto: form.get("checklist_auto") === "on",
    boas_vindas: form.get("boas_vindas") === "on",
    lembrete_checklist: form.get("lembrete_checklist") === "on",
    link_tarefa: form.get("link_tarefa") === "on",
    link_conclusao: form.get("link_conclusao") === "on",
    link_checklist: form.get("link_checklist") === "on",
    link_lembrete: form.get("link_lembrete") === "on",
    link_resumo: form.get("link_resumo") === "on",
    contato_duvidas: form.get("contato_duvidas") === "on",
    resumo_hora: hora,
    limite_diario: limite,
    atualizado_por: membro.id,
    updated_at: new Date().toISOString(),
  });
  if (error) voltar(empresaId, "/automacoes", { erro: error.message });
  atualizar(empresaId);
  voltar(empresaId, "/automacoes", { ok: "Automações salvas." });
}

// Cria destinatários para os colaboradores ativos que têm celular no cadastro
// e ainda não estão autorizados (nem por número nem por colaborador)
export async function autorizarEquipe(empresaId: string) {
  const { supabase, membro, pode } = await getContexto(empresaId);
  if (!pode("whatsapp.gerenciar")) voltar(empresaId, "/automacoes", { erro: "Sem permissão." });
  const [{ data: membros }, { data: contatos }] = await Promise.all([
    supabase.from("membros").select("id, nome, telefone").eq("empresa_id", empresaId).eq("ativo", true),
    supabase.from("whatsapp_contatos").select("membro_id, telefone").eq("empresa_id", empresaId),
  ]);
  const ligados = new Set((contatos ?? []).map((c) => c.membro_id).filter(Boolean));
  const numeros = new Set((contatos ?? []).map((c) => c.telefone));
  const novos: { empresa_id: string; nome: string; telefone: string; membro_id: string; autorizado_por: string }[] = [];
  for (const m of membros ?? []) {
    let telefone = soDigitos(m.telefone);
    if (telefone.length === 10 || telefone.length === 11) telefone = `55${telefone}`;
    if (ligados.has(m.id) || !/^\d{12,13}$/.test(telefone) || numeros.has(telefone)) continue;
    numeros.add(telefone);
    novos.push({ empresa_id: empresaId, nome: m.nome, telefone, membro_id: m.id, autorizado_por: membro.id });
  }
  if (novos.length) {
    const { error } = await supabase.from("whatsapp_contatos").insert(novos);
    if (error) voltar(empresaId, "/automacoes", { erro: error.message });
  }
  atualizar(empresaId);
  voltar(empresaId, "/automacoes", {
    ok: novos.length ? `${novos.length} colaborador(es) autorizado(s).` : "Nenhum colaborador novo com celular no cadastro.",
  });
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

export async function criarRascunho(empresaId: string, form: FormData) {
  const { supabase, membro } = await getContexto(empresaId);
  const texto = String(form.get("texto") ?? "").trim();
  if (!texto) voltar(empresaId, "/avisos", { erro: "Escreva a mensagem." });
  if (texto.length > 2000) voltar(empresaId, "/avisos", { erro: "Mensagem longa demais (máximo 2.000 caracteres)." });
  const { error } = await supabase.from("whatsapp_mensagens").insert({
    empresa_id: empresaId,
    conexao_id: String(form.get("conexao_id")),
    contato_id: String(form.get("contato_id")),
    // chave de idempotência gerada quando o formulário abriu: enviar 2x não duplica
    pedido_id: String(form.get("pedido_id")),
    texto,
    origem: form.get("origem") === "teste" ? "teste" : "manual",
    solicitado_por: membro.id,
  });
  if (error && error.code !== "23505") voltar(empresaId, "/avisos", { erro: "Não foi possível salvar o rascunho. Confira a conexão e o destinatário." });
  atualizar(empresaId);
  voltar(empresaId, "/avisos", { ok: "Rascunho salvo. Confira a prévia e confirme o envio." });
}

export async function confirmarEnvio(empresaId: string, mensagemId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("whatsapp_confirmar", { p_mensagem: mensagemId });
  if (error) voltar(empresaId, "/avisos", { erro: error.message });
  // envio fora da requisição: a tela volta na hora e a fila trabalha em seguida
  after(() => processarMensagem(mensagemId));
  atualizar(empresaId);
  voltar(empresaId, "/avisos", { ok: "Confirmado. O aviso entrou na fila de envio." });
}

export async function cancelarRascunho(empresaId: string, mensagemId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("whatsapp_cancelar", { p_mensagem: mensagemId });
  if (error) voltar(empresaId, "/avisos", { erro: error.message });
  atualizar(empresaId);
}

export async function resolverPendencia(empresaId: string, mensagemId: string, acao: "reenviar" | "enviada" | "falhou") {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("whatsapp_resolver_pendencia", { p_mensagem: mensagemId, p_acao: acao });
  if (error) voltar(empresaId, "/avisos", { erro: error.message });
  if (acao === "reenviar") after(() => processarMensagem(mensagemId));
  atualizar(empresaId);
}

// Depois de um timeout: pergunta ao provedor se a mensagem saiu antes de qualquer reenvio
export async function verificarNoProvedor(empresaId: string, mensagemId: string) {
  const { supabase } = await getContexto(empresaId);
  const { data: m } = await supabase
    .from("whatsapp_mensagens")
    .select("id, empresa_id, conexao_id, texto, origem, origem_id, com_link, enviado_em, situacao, whatsapp_contatos(telefone), whatsapp_conexoes(provedor, instancia)")
    .eq("id", mensagemId)
    .maybeSingle<{
      id: string;
      empresa_id: string;
      conexao_id: string;
      texto: string;
      origem: string;
      origem_id: string | null;
      com_link: boolean;
      enviado_em: string | null;
      situacao: string;
      whatsapp_contatos: { telefone: string } | null;
      whatsapp_conexoes: { provedor: string; instancia: string } | null;
    }>();
  if (!m || m.situacao !== "desconhecido" || !m.whatsapp_conexoes || !m.whatsapp_contatos)
    voltar(empresaId, "/avisos", { erro: "Este aviso não está pendente." });
  await conexaoGerenciada(empresaId, m.conexao_id);
  const inicio = new Date(m.enviado_em ?? Date.now());
  let achado: string | null = null;
  try {
    achado = await provedorDe(m.whatsapp_conexoes.provedor).procurarEnviada({
      instancia: m.whatsapp_conexoes.instancia,
      numero: m.whatsapp_contatos.telefone,
      texto: textoFinal(m),
      desde: new Date(inicio.getTime() - 60_000),
      ate: new Date(inicio.getTime() + 15 * 60_000),
    });
  } catch (e) {
    voltar(empresaId, "/avisos", { erro: `Não consegui consultar o provedor: ${sanitizarErro(comoErroProvedor(e).message)}` });
  }
  if (!achado)
    voltar(empresaId, "/avisos", {
      erro: "Não encontrei este aviso no WhatsApp conectado. Se não chegou no celular, use “Reenviar”.",
    });
  await supabase.rpc("whatsapp_resolver_pendencia", { p_mensagem: mensagemId, p_acao: "enviada", p_externo: achado });
  atualizar(empresaId);
  voltar(empresaId, "/avisos", { ok: "Encontrei o aviso no WhatsApp: marcado como aceito, sem reenviar." });
}
