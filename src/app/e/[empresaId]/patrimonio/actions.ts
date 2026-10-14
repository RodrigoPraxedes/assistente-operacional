"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;
const valor = (f: FormData, k: string) => {
  const v = txt(f, k);
  return v ? Number(v.replace(",", ".")) : null;
};

// Cadastro e edição do item (dados fixos: nome, código, compra, garantia, foto).
// Situação e unidade de um item já cadastrado mudam pelos registros do histórico.
export async function salvarItem(empresaId: string, itemId: string | null, _: { erro?: string } | undefined, form: FormData) {
  const { supabase } = await getContexto(empresaId);

  let foto_path: string | undefined;
  const foto = form.get("foto");
  if (foto instanceof File && foto.size > 0) {
    const ext = (foto.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg");
    foto_path = `${empresaId}/patrimonio/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("anexos").upload(foto_path, foto, { contentType: foto.type });
    if (error) return { erro: `Não foi possível enviar a foto: ${error.message}` };
  }

  const dados = {
    nome: txt(form, "nome") ?? "",
    tipo: txt(form, "tipo") ?? "equipamento",
    codigo: txt(form, "codigo"),
    marca: txt(form, "marca"),
    modelo: txt(form, "modelo"),
    setor_id: txt(form, "setor_id"),
    data_compra: txt(form, "data_compra"),
    valor_compra: valor(form, "valor_compra"),
    comprado_de: txt(form, "comprado_de"),
    nota_fiscal: txt(form, "nota_fiscal"),
    garantia_ate: txt(form, "garantia_ate"),
    observacao: txt(form, "observacao"),
    ...(foto_path ? { foto_path } : {}),
  };
  if (!dados.nome) return { erro: "Dê um nome ao item" };

  if (itemId) {
    const { error } = await supabase.from("equipamentos").update(dados).eq("id", itemId).eq("empresa_id", empresaId);
    if (error) return { erro: error.message };
    revalidatePath(`/e/${empresaId}/patrimonio`);
    redirect(`/e/${empresaId}/patrimonio/${itemId}?salvo=1`);
  }

  const { data, error } = await supabase
    .from("equipamentos")
    .insert({ ...dados, empresa_id: empresaId, unidade_id: txt(form, "unidade_id"), situacao: txt(form, "situacao") ?? "em_uso" })
    .select("id")
    .single();
  if (error) return { erro: error.message };
  revalidatePath(`/e/${empresaId}/patrimonio`);
  redirect(`/e/${empresaId}/patrimonio/${data.id}?novo=1`);
}

export async function registrarEvento(empresaId: string, itemId: string, _: { erro?: string } | undefined, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const { error } = await supabase.rpc("registrar_evento_patrimonio", {
    p_equipamento: itemId,
    p_tipo: txt(form, "tipo") ?? "",
    p_data: txt(form, "data"),
    p_valor: valor(form, "valor"),
    p_descricao: txt(form, "descricao"),
    p_situacao: txt(form, "situacao"),
    p_unidade: txt(form, "unidade_id"),
  });
  if (error) return { erro: error.message };
  revalidatePath(`/e/${empresaId}/patrimonio`);
  redirect(`/e/${empresaId}/patrimonio/${itemId}?registrado=1`);
}

// Apaga um registro lançado por engano (não desfaz o efeito na situação/unidade)
export async function excluirEvento(empresaId: string, itemId: string, eventoId: string) {
  const { supabase } = await getContexto(empresaId);
  const caminho = `/e/${empresaId}/patrimonio/${itemId}`;
  const { error } = await supabase.from("patrimonio_eventos").delete().eq("id", eventoId);
  if (error) redirect(`${caminho}?erro=${encodeURIComponent(error.message)}`);
  revalidatePath(caminho);
}
