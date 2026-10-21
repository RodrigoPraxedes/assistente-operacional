"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoContagem = { erro: string } | { ok: true } | undefined;

// Recebe o preenchimento de uma contagem (app ou QR) e grava pelo banco,
// que confere a contagem, a unidade, o turno e calcula quanto falta para a meta.
export async function enviarContagem(_: EstadoContagem, form: FormData): Promise<EstadoContagem> {
  const canal = form.get("canal") === "qr" ? "qr" : "app";
  const contagemId = String(form.get("contagem_id") ?? "");
  const unidadeId = String(form.get("unidade_id") ?? "") || null;
  const data = String(form.get("data_ref") ?? "");
  const turno = String(form.get("turno") ?? "");
  const observacao = String(form.get("observacao") ?? "");
  const itens: string[] = JSON.parse(String(form.get("itens") ?? "[]"));
  const valores = itens.map((id) => ({
    item_id: id,
    quantidade: String(form.get(`qtd_${id}`) ?? "").trim(),
    vai_fazer: String(form.get(`vai_${id}`) ?? "").trim(),
  }));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Informe a data da contagem." };
  if (!valores.some((v) => v.quantidade !== "")) return { erro: "Preencha pelo menos uma quantidade." };

  const { error } =
    canal === "qr"
      ? await createAdminClient().rpc("qr_enviar_contagem", {
          p_token: String(form.get("token") ?? ""),
          p_contagem: contagemId,
          p_nome: String(form.get("executor_nome") ?? ""),
          p_data: data,
          p_turno: turno,
          p_valores: valores,
          p_observacao: observacao,
        })
      : await (await createClient()).rpc("enviar_contagem", {
          p_contagem: contagemId,
          p_unidade: unidadeId,
          p_data: data,
          p_turno: turno,
          p_valores: valores,
          p_observacao: observacao,
        });
  if (error) return { erro: error.message };
  return { ok: true };
}
