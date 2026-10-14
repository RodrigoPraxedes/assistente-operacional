"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoChamadoQr = { erro: string } | { ok: true } | undefined;

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

// Chamado de manutenção aberto pela central pública (QR Code), sem login.
// A empresa vem do QR, nunca do formulário.
export async function abrirChamadoQr(_: EstadoChamadoQr, form: FormData): Promise<EstadoChamadoQr> {
  const token = String(form.get("token") ?? "");
  const nome = txt(form, "nome");
  const titulo = txt(form, "titulo");
  if (!nome) return { erro: "Digite o seu nome." };
  if (!titulo) return { erro: "Conte o que está com problema." };

  const supabase = createAdminClient();
  const { data: central } = await supabase.rpc("qr_central", { p_token: token });
  if (!central) return { erro: "QR Code inválido." };
  const empresaId = (central as { empresa: { id: string } }).empresa.id;

  const fotos: string[] = [];
  for (const foto of form.getAll("fotos").slice(0, 5)) {
    if (!(foto instanceof File) || foto.size === 0) continue;
    const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    const caminho = `${empresaId}/chamados/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("anexos").upload(caminho, foto, { contentType: foto.type });
    if (error) return { erro: `Não foi possível enviar a foto: ${error.message}` };
    fotos.push(caminho);
  }

  const { error } = await supabase.rpc("qr_abrir_chamado", {
    p_token: token,
    p_nome: nome,
    p_titulo: titulo,
    p_descricao: txt(form, "descricao"),
    p_setor: txt(form, "setor_id"),
    p_equipamento: txt(form, "equipamento_id"),
    p_local: txt(form, "local"),
    p_fotos: fotos,
  });
  if (error) return { erro: error.message };
  return { ok: true };
}
