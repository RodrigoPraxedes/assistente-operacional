"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { gerarTarefasRecorrentes } from "@/lib/gerar-tarefas";
import { regraValida } from "@/lib/recorrencia";
import { soDigitos } from "@/lib/formato";
import type { TipoResposta } from "@/lib/types";

interface ItemForm {
  id?: string;
  texto: string;
  tipo_resposta: TipoResposta;
  obrigatorio: boolean;
  permite_foto: boolean;
  foto_obrigatoria_se_nao: boolean;
  abre_chamado_se_nao?: boolean;
  prioridade_chamado?: string;
}

export async function salvarModelo(empresaId: string, _: { erro?: string } | undefined, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = String(form.get("id") ?? "") || null;
  const txt = (k: string) => String(form.get(k) ?? "").trim() || null;

  const recorrencia = txt("recorrencia") ?? "FREQ=DAILY";
  if (!regraValida(recorrencia)) return { erro: "Regra de recorrência inválida" };

  const itens: ItemForm[] = JSON.parse(String(form.get("itens") ?? "[]")).filter((i: ItemForm) => i.texto?.trim());
  if (!itens.length) return { erro: "Adicione pelo menos um item ao check-list" };

  const dados = {
    nome: txt("nome")!,
    descricao: txt("descricao"),
    unidade_id: txt("unidade_id"),
    setor_id: txt("setor_id"),
    categoria_id: txt("categoria_id"),
    responsavel_id: txt("responsavel_id"),
    horario_preferencial: txt("horario_preferencial") ?? "08:00",
    tolerancia_minutos: Number(form.get("tolerancia_minutos") ?? 30) || 0,
    recorrencia,
    publico_qr: form.get("publico_qr") === "on",
    modo_executor: form.get("modo_executor") === "usuarios" ? "usuarios" : "aberto",
    whatsapp_destino: soDigitos(txt("whatsapp_destino")) || null,
    ativo: form.get("ativo") !== "false",
  };

  let modeloId = id;
  if (id) {
    const { error } = await supabase.from("checklist_modelos").update(dados).eq("id", id);
    if (error) return { erro: error.message };
  } else {
    const { data, error } = await supabase
      .from("checklist_modelos")
      .insert({ ...dados, empresa_id: empresaId })
      .select("id")
      .single();
    if (error) return { erro: error.message };
    modeloId = data.id;
  }

  // sincroniza itens: atualiza os existentes, cria os novos, desativa os removidos
  const { data: existentes } = await supabase.from("checklist_itens").select("id").eq("modelo_id", modeloId!).eq("ativo", true);
  const mantidos = new Set(itens.filter((i) => i.id).map((i) => i.id));
  const removidos = (existentes ?? []).filter((e) => !mantidos.has(e.id)).map((e) => e.id);
  if (removidos.length) {
    await supabase.from("checklist_itens").update({ ativo: false }).in("id", removidos);
  }
  for (const [ordem, item] of itens.entries()) {
    const linha = {
      texto: item.texto.trim(),
      tipo_resposta: item.tipo_resposta,
      obrigatorio: item.obrigatorio,
      permite_foto: item.permite_foto,
      foto_obrigatoria_se_nao: item.tipo_resposta === "sim_nao" && item.foto_obrigatoria_se_nao,
      abre_chamado_se_nao: item.tipo_resposta === "sim_nao" && !!item.abre_chamado_se_nao,
      prioridade_chamado: item.prioridade_chamado ?? "media",
      ordem: ordem + 1,
    };
    const { error } = item.id
      ? await supabase.from("checklist_itens").update(linha).eq("id", item.id)
      : await supabase.from("checklist_itens").insert({ ...linha, modelo_id: modeloId!, empresa_id: empresaId });
    if (error) return { erro: error.message };
  }

  // já cria no Kanban as tarefas de hoje e dos próximos dias (precisa da service_role)
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await gerarTarefasRecorrentes({ modeloId: modeloId! });
    } catch (e) {
      console.error("Falha ao gerar tarefas do check-list", e);
    }
  }

  revalidatePath(`/e/${empresaId}/checklists`);
  redirect(`/e/${empresaId}/checklists?salvo=1`);
}
