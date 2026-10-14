"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { soDigitos } from "@/lib/formato";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

// Prestador = linha de fornecedores (a mesma que os chamados usam)
export async function salvarPrestador(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const id = txt(form, "id");
  const base = `/e/${empresaId}/prestadores`;
  const voltar = id ? `${base}/${id}` : `${base}/novo`;

  const nome = txt(form, "nome");
  const telefone = soDigitos(txt(form, "telefone"));
  if (!nome) redirect(`${voltar}?erro=${encodeURIComponent("Informe o nome")}`);
  if (!telefone) redirect(`${voltar}?erro=${encodeURIComponent("Informe o telefone")}`);

  const dados = {
    nome,
    telefone,
    telefone2: soDigitos(txt(form, "telefone2")) || null,
    email: txt(form, "email"),
    ativo: form.get("ativo") !== "false",
  };
  const { data, error } = id
    ? await supabase.from("fornecedores").update(dados).eq("id", id).select("id").single()
    : await supabase.from("fornecedores").insert({ ...dados, empresa_id: empresaId }).select("id").single();
  if (error) redirect(`${voltar}?erro=${encodeURIComponent(error.message)}`);
  const prestadorId = data!.id as string;

  // tipo novo digitado no próprio cadastro
  const tipos = form.getAll("tipos").map(String).filter(Boolean);
  const novoTipo = txt(form, "novo_tipo");
  if (novoTipo) {
    const criado = await criarTipo(supabase, empresaId, novoTipo);
    if ("erro" in criado) redirect(`${base}/${prestadorId}?erro=${encodeURIComponent(criado.erro)}`);
    tipos.push(criado.id);
  }

  const { error: e2 } = await supabase.rpc("definir_tipos_prestador", { p_fornecedor: prestadorId, p_tipos: tipos });
  if (e2) redirect(`${base}/${prestadorId}?erro=${encodeURIComponent(e2.message)}`);

  revalidatePath(base);
  redirect(`${base}?salvo=1`);
}

type Supabase = Awaited<ReturnType<typeof getContexto>>["supabase"];

// Cria o tipo ou reaproveita um com o mesmo nome (reativando se estava fora de uso)
async function criarTipo(supabase: Supabase, empresaId: string, nome: string): Promise<{ id: string } | { erro: string }> {
  const { data: existente } = await supabase
    .from("tipos_servico")
    .select("id, ativo")
    .eq("empresa_id", empresaId)
    .ilike("nome", nome.replace(/[\\%_]/g, "\\$&"))
    .maybeSingle();
  if (existente) {
    if (!existente.ativo) await supabase.from("tipos_servico").update({ ativo: true }).eq("id", existente.id);
    return { id: existente.id as string };
  }
  const { data, error } = await supabase
    .from("tipos_servico")
    .insert({ empresa_id: empresaId, nome })
    .select("id")
    .single();
  if (error) return { erro: error.message };
  return { id: data.id as string };
}

export async function salvarTipoServico(empresaId: string, form: FormData) {
  const { supabase } = await getContexto(empresaId);
  const caminho = `/e/${empresaId}/prestadores/tipos`;
  const id = txt(form, "id");
  const nome = txt(form, "nome");
  if (!nome) redirect(`${caminho}?erro=${encodeURIComponent("Informe o nome do serviço")}`);

  if (id) {
    const { error } = await supabase
      .from("tipos_servico")
      .update({ nome, ativo: form.get("ativo") !== "false" })
      .eq("id", id);
    if (error) {
      const msg = error.code === "23505" ? "Já existe um serviço com esse nome" : error.message;
      redirect(`${caminho}?erro=${encodeURIComponent(msg)}`);
    }
  } else {
    const criado = await criarTipo(supabase, empresaId, nome);
    if ("erro" in criado) redirect(`${caminho}?erro=${encodeURIComponent(criado.erro)}`);
  }
  revalidatePath(`/e/${empresaId}/prestadores`, "layout");
}
