"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatarDataHora } from "@/lib/formato";
import { linkWhatsApp, urlDoSite } from "@/lib/whatsapp";
import { RESPOSTAS_SIM_NAO } from "@/lib/types";

export type EstadoEnvio =
  | { erro: string }
  | { ok: true; execucaoId: string; whatsapp: string; resumo: string; automatico: boolean }
  | undefined;

type SupabaseQualquer = Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createAdminClient>;

interface ItemEnviado {
  id: string;
  texto: string;
  tipo_resposta: string;
}

const ROTULO = Object.fromEntries(RESPOSTAS_SIM_NAO.map((r) => [r.valor, r.rotulo]));
// "Não" que não é problema (item configurado assim) sai neutro, sem ❌
const MARCA: Record<string, string> = { sim: "✅", nao: "❌", em_processo: "⏳" };

// Recebe o formulário de preenchimento (app ou QR), sobe as fotos e grava.
// Salvar sempre grava no banco; o WhatsApp é aberto depois com o resumo.
export async function enviarChecklist(_: EstadoEnvio, form: FormData): Promise<EstadoEnvio> {
  const canal = form.get("canal") === "qr" ? "qr" : "app";
  const modeloId = String(form.get("modelo_id"));
  const unidadeId = String(form.get("unidade_id") ?? "");
  let empresaId = String(form.get("empresa_id"));
  const token = String(form.get("token") ?? "");
  const membroId = String(form.get("membro_id") ?? "");
  const pin = String(form.get("pin") ?? "");
  // check-list aberto: nome digitado, sem PIN (o banco confere se o modelo é aberto)
  const aberto = form.get("modo_executor") === "aberto";
  const executorNome = String(form.get("executor_nome") ?? "").trim();
  const itens: ItemEnviado[] = JSON.parse(String(form.get("itens") ?? "[]"));

  let supabase: SupabaseQualquer;
  if (canal === "qr") {
    supabase = createAdminClient();
    if (aberto) {
      if (!executorNome) return { erro: "Digite o seu nome." };
      // confere antes de subir fotos: sem PIN, só vale para check-list aberto
      const { data: modelo } = await supabase.rpc("qr_modelo", { p_token: token, p_modelo: modeloId });
      if ((modelo as { modo_executor?: string } | null)?.modo_executor !== "aberto")
        return { erro: "Este check-list pede nome e PIN. Atualize a página." };
    } else {
      if (!membroId) return { erro: "Escolha o seu nome." };
      const { data: resultado, error } = await supabase.rpc("qr_validar_pin", {
        p_token: token,
        p_membro: membroId,
        p_pin: pin,
      });
      if (error) return { erro: error.message };
      if (resultado === "bloqueado") return { erro: "Muitas tentativas erradas. Aguarde 15 minutos ou fale com o gestor." };
      if (resultado !== "ok") return { erro: "PIN incorreto." };
    }
    // no canal público a empresa vem do QR, nunca do formulário
    const { data: central } = await supabase.rpc("qr_central", { p_token: token });
    if (!central) return { erro: "QR Code inválido." };
    empresaId = (central as { empresa: { id: string } }).empresa.id;
  } else {
    supabase = await createClient();
  }

  // monta respostas e sobe as fotos
  const respostas: {
    item_id: string;
    resposta: string;
    valor_numero: string;
    valor_texto: string;
    observacao: string;
    foto_path: string | null;
  }[] = [];
  for (const item of itens) {
    let foto_path: string | null = null;
    const foto = form.get(`foto_${item.id}`);
    if (foto instanceof File && foto.size > 0) {
      const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
      foto_path = `${empresaId}/checklists/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("anexos").upload(foto_path, foto, { contentType: foto.type });
      if (error) return { erro: `Não foi possível enviar a foto de "${item.texto}": ${error.message}` };
    }
    respostas.push({
      item_id: item.id,
      resposta: String(form.get(`resposta_${item.id}`) ?? ""),
      valor_numero: String(form.get(`numero_${item.id}`) ?? "").replace(",", "."),
      valor_texto: String(form.get(`texto_${item.id}`) ?? ""),
      observacao: String(form.get(`obs_${item.id}`) ?? ""),
      foto_path,
    });
  }

  const observacao = String(form.get("observacao") ?? "");
  const { data: execucaoId, error } =
    canal === "qr" && aberto
      ? await supabase.rpc("qr_enviar_checklist_aberto", {
          p_token: token,
          p_modelo: modeloId,
          p_nome: executorNome,
          p_respostas: respostas,
          p_observacao: observacao,
        })
      : canal === "qr"
      ? await supabase.rpc("qr_enviar_checklist", {
          p_token: token,
          p_modelo: modeloId,
          p_membro: membroId,
          p_pin: pin,
          p_respostas: respostas,
          p_observacao: observacao,
        })
      : await supabase.rpc("enviar_checklist", {
          p_modelo: modeloId,
          p_unidade: unidadeId,
          p_respostas: respostas,
          p_observacao: observacao,
        });
  if (error) return { erro: error.message };

  // resumo para o WhatsApp (link wa.me só leva texto; fotos ficam no link da execução)
  const { data: exec } = await supabase
    .from("checklist_execucoes")
    .select("modelo_nome, executor_nome, enviado_em, qtd_nao, unidades(nome), empresas(fuso_horario), checklist_modelos(whatsapp_destino)")
    .eq("id", execucaoId)
    .single<{
      modelo_nome: string;
      executor_nome: string;
      enviado_em: string;
      qtd_nao: number;
      unidades: { nome: string } | null;
      empresas: { fuso_horario: string } | null;
      checklist_modelos: { whatsapp_destino: string | null } | null;
    }>();

  const { data: marcadas } = await supabase
    .from("checklist_respostas")
    .select("item_id, problema")
    .eq("execucao_id", execucaoId as string)
    .eq("problema", true);
  const problemas = new Set((marcadas ?? []).map((m) => m.item_id as string));

  const linhas = itens
    .map((i) => {
      const r = respostas.find((x) => x.item_id === i.id);
      if (!r) return null;
      const valor =
        i.tipo_resposta === "sim_nao" ? ROTULO[r.resposta] : i.tipo_resposta === "numero" ? r.valor_numero : r.valor_texto;
      if (!valor) return null;
      const marca = problemas.has(i.id) ? "❌" : r.resposta === "nao" ? "➖" : (MARCA[r.resposta] ?? "•");
      return `${marca} ${i.texto}: ${valor}${r.observacao ? ` (${r.observacao})` : ""}`;
    })
    .filter(Boolean);

  const emProcesso = respostas.filter((r) => r.resposta === "em_processo").length;
  const resumo = [
    `*${exec?.modelo_nome}* — ${exec?.unidades?.nome ?? ""}`,
    `Por ${exec?.executor_nome} em ${formatarDataHora(exec?.enviado_em, exec?.empresas?.fuso_horario)}`,
    exec?.qtd_nao ? `⚠️ ${exec.qtd_nao} item(ns) com problema` : emProcesso ? null : "Tudo certo ✅",
    emProcesso ? `⏳ ${emProcesso} item(ns) em processo` : null,
    "",
    ...linhas,
    observacao ? `\nObs.: ${observacao}` : "",
    "",
    `Detalhes e fotos: ${urlDoSite(`/e/${empresaId}/checklists/execucoes/${execucaoId}`)}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  // o banco já enfileirou o aviso automático (Evolution)? Então o botão manual vira só plano B
  const { count: avisos } = await createAdminClient()
    .from("whatsapp_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("origem", "checklist")
    .eq("origem_id", execucaoId as string);

  return {
    ok: true,
    execucaoId: execucaoId as string,
    automatico: (avisos ?? 0) > 0,
    resumo,
    whatsapp: linkWhatsApp(resumo, exec?.checklist_modelos?.whatsapp_destino),
  };
}
