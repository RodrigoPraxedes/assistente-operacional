"use server";

import { revalidatePath } from "next/cache";
import { getContexto } from "@/lib/contexto";
import { soDigitos } from "@/lib/formato";
import { campo, lerPlanilha, normalizar, texto } from "@/lib/planilha";
import type { EstadoImportacao, EstadoLeitura } from "@/components/importacao/tipos";

interface PrestadorImport {
  nome: string;
  telefone: string | null;
  telefone2: string | null;
  email: string | null;
  tipos: string[];
}

// telefone vindo do Excel pode chegar como número (perde o zero, mas não o DDD)
const fone = (v: unknown) => soDigitos(texto(v)) || null;

// Lê a primeira aba (ou "Prestadores") e devolve a prévia.
export async function lerPrestadores(empresaId: string, _: EstadoLeitura, form: FormData): Promise<EstadoLeitura> {
  const { pode } = await getContexto(empresaId);
  if (!pode("prestadores.gerenciar")) return { erro: "Você não tem permissão para cadastrar prestadores." };
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha (.xlsx)." };
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "A planilha passa de 4 MB. Divida em partes e importe uma de cada vez." };

  let abas: Awaited<ReturnType<typeof lerPlanilha>>;
  try {
    abas = await lerPlanilha(arquivo);
  } catch {
    return { erro: "Não consegui ler o arquivo. Salve como Excel (.xlsx) e tente de novo." };
  }
  const aba = abas.get("prestadores") ?? [...abas.values()][0];
  if (!aba) return { erro: "A planilha está vazia." };

  const avisos: string[] = [];
  const prestadores = new Map<string, PrestadorImport>();
  for (const l of aba.linhas) {
    const nome = texto(campo(l, "nome", "prestador", "empresa"));
    if (!nome) {
      avisos.push(`Linha ${l._linha}: sem nome, ignorada.`);
      continue;
    }
    const chave = normalizar(nome);
    if (prestadores.has(chave)) {
      avisos.push(`Linha ${l._linha}: "${nome}" repetido, usei só a primeira linha.`);
      continue;
    }
    const telefone = fone(campo(l, "telefone", "whatsapp", "celular", "telefone 1"));
    if (!telefone) avisos.push(`Linha ${l._linha}: "${nome}" sem telefone.`);
    const tipos = (texto(campo(l, "tipos de servico", "tipo de servico", "servicos", "especialidade")) ?? "")
      .split(/[,;/]/)
      .map((t) => t.trim())
      .filter(Boolean);
    prestadores.set(chave, {
      nome: nome.slice(0, 200),
      telefone,
      telefone2: fone(campo(l, "telefone 2", "telefone2", "outro telefone")),
      email: texto(campo(l, "email", "e mail")),
      tipos,
    });
  }

  const lista = [...prestadores.values()];
  if (!lista.length) return { erro: "Nenhum prestador encontrado na planilha." };
  return {
    previa: {
      resumo: [`${lista.length} prestador(es) na planilha (os que já existem com o mesmo nome só ganham o que faltava)`],
      avisos,
      cabecalho: ["Nome", "Telefone", "Tipos de serviço"],
      linhas: lista.slice(0, 15).map((p) => [p.nome, p.telefone ?? "", p.tipos.join(", ")]),
      dados: JSON.stringify(lista),
    },
  };
}

export async function importarPrestadores(empresaId: string, _: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const { supabase } = await getContexto(empresaId);
  let linhas: unknown;
  try {
    linhas = JSON.parse(String(form.get("dados") ?? "[]"));
  } catch {
    return { erro: "Leia a planilha de novo." };
  }
  const { data: r, error } = await supabase.rpc("importar_prestadores", { p_empresa: empresaId, p_linhas: linhas });
  if (error) return { erro: error.message };
  const res = r as { novos: number; existentes: number };
  revalidatePath(`/e/${empresaId}/prestadores`);
  return { ok: `Importação concluída: ${res.novos} prestador(es) novo(s) e ${res.existentes} já existia(m).` };
}
