"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { gerarTarefasRecorrentes } from "@/lib/gerar-tarefas";
import { regraValida } from "@/lib/recorrencia";

interface ItemForm {
  id?: string;
  nome: string;
  unidade_medida: string;
  metas: string[];
}

const numeroOuNulo = (s: string | undefined) => {
  const v = String(s ?? "").trim().replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return isFinite(n) && n >= 0 ? n : null;
};

export async function salvarContagem(empresaId: string, _: { erro?: string } | undefined, form: FormData) {
  const { supabase, pode } = await getContexto(empresaId);
  if (!pode("contagens.editar")) return { erro: "Você não tem permissão para editar contagens." };
  const id = String(form.get("id") ?? "") || null;
  const txt = (k: string) => String(form.get(k) ?? "").trim() || null;

  const nome = txt("nome");
  if (!nome) return { erro: "Informe o nome da contagem" };
  const usaMeta = form.get("usa_meta") === "on";
  const itens: ItemForm[] = JSON.parse(String(form.get("itens") ?? "[]")).filter((i: ItemForm) => i.nome?.trim());
  if (!itens.length) return { erro: "Adicione pelo menos um item" };

  const turnos = [...new Set(String(form.get("turnos") ?? "").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 6);

  // agenda: um horário por turno (sem turno, um só), na ordem dos turnos
  const agendada = form.get("agendada") === "on";
  const horarios = (turnos.length ? turnos : [""]).map((_, i) => txt(`horario_${i}`));
  const recorrencia = txt("recorrencia") ?? "FREQ=DAILY";
  const responsaveis = form.getAll("responsaveis").map(String).filter(Boolean);
  const inteiro = (k: string, padrao: number, max: number) => {
    const n = Number(form.get(k) ?? padrao);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : padrao;
  };
  if (agendada) {
    if (horarios.some((h) => !h || !/^\d{2}:\d{2}$/.test(h)))
      return { erro: turnos.length ? "Informe o horário de cada turno" : "Informe o horário da contagem" };
    if (!regraValida(recorrencia)) return { erro: "Regra de repetição inválida" };
    if (!responsaveis.length) return { erro: "Escolha ao menos um responsável pela contagem" };
  }

  const dados = {
    nome,
    descricao: txt("descricao"),
    unidade_id: txt("unidade_id"),
    setor_id: txt("setor_id"),
    turnos,
    usa_meta: usaMeta,
    rotulo_falta: txt("rotulo_falta")?.slice(0, 30) ?? "Falta",
    pede_vai_fazer: usaMeta && form.get("pede_vai_fazer") === "on",
    publico_qr: form.get("publico_qr") === "on",
    ativo: form.get("ativo") !== "false",
    agendada,
    // agenda desligada guarda o que estava preenchido, para religar depois
    ...(agendada || horarios.every(Boolean) ? { horarios } : {}),
    recorrencia: regraValida(recorrencia) ? recorrencia : "FREQ=DAILY",
    tolerancia_minutos: inteiro("tolerancia_minutos", 30, 1440),
    lembrete_minutos: inteiro("lembrete_minutos", 30, 720),
    responsaveis,
    resultado_membro_id: txt("resultado_membro_id"),
  };

  let contagemId = id;
  if (id) {
    const { error } = await supabase.from("contagens").update(dados).eq("id", id);
    if (error) return { erro: error.message };
  } else {
    const { data, error } = await supabase.from("contagens").insert({ ...dados, empresa_id: empresaId }).select("id").single();
    if (error) return { erro: error.message };
    contagemId = data.id;
  }

  // sincroniza itens: atualiza os existentes, cria os novos, desativa os removidos (o histórico guarda o nome)
  const { data: atuais } = await supabase.from("contagem_itens").select("id").eq("contagem_id", contagemId!).eq("ativo", true);
  const mantidos = new Set(itens.map((i) => i.id).filter(Boolean));
  const removidos = (atuais ?? []).map((a) => a.id as string).filter((x) => !mantidos.has(x));
  if (removidos.length) {
    const { error } = await supabase.from("contagem_itens").update({ ativo: false }).in("id", removidos);
    if (error) return { erro: error.message };
  }
  for (const [ordem, i] of itens.entries()) {
    const metas = Array.from({ length: 7 }, (_, d) => numeroOuNulo(i.metas?.[d]));
    const linha = {
      nome: i.nome.trim().slice(0, 120),
      unidade_medida: i.unidade_medida?.trim().slice(0, 40) || null,
      ordem,
      metas: metas.some((m) => m !== null) ? metas : null,
    };
    const { error } = i.id
      ? await supabase.from("contagem_itens").update(linha).eq("id", i.id)
      : await supabase.from("contagem_itens").insert({ ...linha, contagem_id: contagemId, empresa_id: empresaId });
    if (error) return { erro: error.message };
  }

  // já cria no Kanban as tarefas de hoje e dos próximos dias (precisa da service_role)
  if (agendada && dados.ativo && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await gerarTarefasRecorrentes({ contagemId: contagemId! });
    } catch (e) {
      console.error("Falha ao gerar tarefas da contagem", e);
    }
  }

  revalidatePath(`/e/${empresaId}/contagens`);
  redirect(`/e/${empresaId}/contagens?salvo=1`);
}

export async function excluirContagem(empresaId: string, contagemId: string) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.from("contagens").delete().eq("id", contagemId);
  if (error) redirect(`/e/${empresaId}/contagens/${contagemId}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/e/${empresaId}/contagens`);
  redirect(`/e/${empresaId}/contagens?excluido=1`);
}

// apaga um envio errado (ex.: contagem duplicada) do histórico
export async function excluirRegistro(empresaId: string, contagemId: string, registroId: string, voltar: string) {
  const { supabase } = await getContexto(empresaId);
  if (!voltar.startsWith(`/e/${empresaId}/contagens/`)) voltar = `/e/${empresaId}/contagens/${contagemId}/resultados`;
  const { error } = await supabase.from("contagem_registros").delete().eq("id", registroId).eq("contagem_id", contagemId);
  if (error) redirect(`${voltar}${voltar.includes("?") ? "&" : "?"}erro=${encodeURIComponent(error.message)}`);
  revalidatePath(`/e/${empresaId}/contagens/${contagemId}/resultados`);
  redirect(voltar);
}
