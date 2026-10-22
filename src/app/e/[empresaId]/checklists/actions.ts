"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { gerarTarefasRecorrentes } from "@/lib/gerar-tarefas";
import { regraValida } from "@/lib/recorrencia";
import { soDigitos } from "@/lib/formato";
import type { ProblemaQuando, TipoResposta } from "@/lib/types";

interface ItemForm {
  id?: string;
  texto: string;
  tipo_resposta: TipoResposta;
  obrigatorio: boolean;
  permite_foto: boolean;
  foto_obrigatoria?: boolean;
  foto_obrigatoria_se_nao: boolean;
  permite_na?: boolean;
  problema_quando?: ProblemaQuando;
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

  const responsaveis = form.getAll("responsaveis").map(String).filter(Boolean);
  if (!responsaveis.length) return { erro: "Escolha ao menos um responsável pelo check-list" };
  const resultados = form.getAll("resultado_membros").map(String).filter(Boolean);
  const resultado = resultados[0] ?? null;
  // o link de WhatsApp ao final do preenchimento vai para a primeira pessoa que recebe o resultado
  const { data: destino } = resultado
    ? await supabase.from("membros").select("telefone").eq("id", resultado).eq("empresa_id", empresaId).maybeSingle()
    : { data: null };
  let telefone = soDigitos(destino?.telefone);
  if (telefone.length === 10 || telefone.length === 11) telefone = `55${telefone}`;
  const lembrete = Number(form.get("lembrete_minutos") ?? 30);

  const dados = {
    nome: txt("nome")!,
    descricao: txt("descricao"),
    unidade_id: txt("unidade_id"),
    setor_id: txt("setor_id"),
    categoria_id: txt("categoria_id"),
    responsaveis,
    resultado_membros: resultados,
    lembrete_minutos: Number.isInteger(lembrete) && lembrete >= 0 && lembrete <= 720 ? lembrete : 30,
    horario_preferencial: txt("horario_preferencial") ?? "08:00",
    tolerancia_minutos: Number(form.get("tolerancia_minutos") ?? 30) || 0,
    recorrencia,
    publico_qr: form.get("publico_qr") === "on",
    modo_executor: form.get("modo_executor") === "usuarios" ? "usuarios" : "aberto",
    // sem "recebe o resultado", mantém o número que já estava cadastrado
    ...(telefone ? { whatsapp_destino: telefone } : {}),
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
    const problemaQuando = item.tipo_resposta === "sim_nao" ? (item.problema_quando ?? "nao") : "nao";
    // foto e chamado automáticos valem para o "Não"; só fazem sentido quando "Não" é o problema
    const regraNao = item.tipo_resposta === "sim_nao" && problemaQuando === "nao";
    const linha = {
      texto: item.texto.trim(),
      tipo_resposta: item.tipo_resposta,
      obrigatorio: item.obrigatorio,
      permite_foto: item.permite_foto,
      foto_obrigatoria: item.permite_foto && !!item.foto_obrigatoria,
      foto_obrigatoria_se_nao: regraNao && item.foto_obrigatoria_se_nao,
      problema_quando: problemaQuando,
      permite_na: item.permite_na ?? true,
      abre_chamado_se_nao: regraNao && !!item.abre_chamado_se_nao,
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
  // "Salvar e copiar": abre o formulário novo já preenchido
  if (form.get("continuar")) redirect(`/e/${empresaId}/checklists/novo?copiar=${modeloId}`);
  redirect(`/e/${empresaId}/checklists?salvo=1`);
}

// Exclui o check-list; os preenchimentos já enviados continuam no histórico
export async function excluirChecklist(empresaId: string, modeloId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("excluir_checklist", { p_modelo: modeloId });
  if (error) redirect(`/e/${empresaId}/checklists/${modeloId}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/e/${empresaId}/checklists`);
  redirect(`/e/${empresaId}/checklists?excluido=1`);
}
