"use server";

import { revalidatePath } from "next/cache";
import { getContexto } from "@/lib/contexto";
import { campo, data, lerPlanilha, normalizar, texto, valor, type Linha } from "@/lib/planilha";
import { SITUACOES_PATRIMONIO, TIPOS_PATRIMONIO } from "@/lib/types";
import type { EstadoImportacao, EstadoLeitura } from "@/components/importacao/tipos";

interface EventoImport {
  data: string;
  descricao: string;
  valor: number | null;
}

interface ItemImport {
  nome: string;
  tipo: string;
  unidade_id: string | null;
  setor_id: string | null;
  codigo: string | null;
  marca: string | null;
  modelo: string | null;
  data_compra: string | null;
  valor_compra: number | null;
  comprado_de: string | null;
  nota_fiscal: string | null;
  garantia_ate: string | null;
  situacao: string;
  observacao: string | null;
  eventos: EventoImport[];
}

// rótulo (sem acento) → chave, ex.: "em manutencao" → "em_manutencao"
const porRotulo = (mapa: Record<string, string>) =>
  new Map(Object.entries(mapa).flatMap(([k, v]) => [[normalizar(v), k], [normalizar(k), k]]));
const TIPOS = porRotulo(TIPOS_PATRIMONIO);
const SITUACOES = porRotulo(Object.fromEntries(Object.entries(SITUACOES_PATRIMONIO).map(([k, v]) => [k, v.rotulo])));

// Lê a planilha (abas "Itens" e "Histórico") e devolve a prévia.
export async function lerPatrimonio(empresaId: string, _: EstadoLeitura, form: FormData): Promise<EstadoLeitura> {
  const { supabase, pode } = await getContexto(empresaId);
  if (!pode("patrimonio.gerenciar")) return { erro: "Você não tem permissão para alterar o patrimônio." };
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha (.xlsx)." };
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "A planilha passa de 4 MB. Divida em partes e importe uma de cada vez." };

  let abas: Awaited<ReturnType<typeof lerPlanilha>>;
  try {
    abas = await lerPlanilha(arquivo);
  } catch {
    return { erro: "Não consegui ler o arquivo. Salve como Excel (.xlsx) e tente de novo." };
  }
  const abaItens = abas.get("itens") ?? [...abas.values()][0];
  const abaHistorico = abas.get("historico");
  if (!abaItens || (abaItens === abaHistorico && !abas.get("itens"))) return { erro: "A planilha precisa da aba \"Itens\"." };

  const [{ data: unidades }, { data: setores }] = await Promise.all([
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true),
  ]);
  const unidadePorNome = new Map((unidades ?? []).map((u) => [normalizar(u.nome), u.id as string]));
  const setorPorNome = new Map((setores ?? []).map((s) => [normalizar(s.nome), s.id as string]));

  const avisos: string[] = [];
  const itens = new Map<string, ItemImport>();
  const ref = (aba: string, l: Linha) => `${aba}, linha ${l._linha}`;

  for (const l of abaItens.linhas) {
    const nome = texto(campo(l, "nome", "item", "equipamento"));
    if (!nome) {
      avisos.push(`${ref(abaItens.nome, l)}: sem nome, ignorada.`);
      continue;
    }
    const chave = normalizar(nome);
    if (itens.has(chave)) {
      avisos.push(`${ref(abaItens.nome, l)}: "${nome}" repetido, usei só a primeira linha.`);
      continue;
    }
    const nomeUnidade = texto(campo(l, "unidade"));
    const nomeSetor = texto(campo(l, "setor", "area"));
    const unidade_id = nomeUnidade ? unidadePorNome.get(normalizar(nomeUnidade)) ?? null : null;
    const setor_id = nomeSetor ? setorPorNome.get(normalizar(nomeSetor)) ?? null : null;
    if (nomeUnidade && !unidade_id) avisos.push(`${ref(abaItens.nome, l)}: unidade "${nomeUnidade}" não existe, ficou sem unidade.`);
    if (nomeSetor && !setor_id) avisos.push(`${ref(abaItens.nome, l)}: setor "${nomeSetor}" não existe, ficou sem setor.`);

    const tipoTxt = texto(campo(l, "tipo"));
    const situacaoTxt = texto(campo(l, "situacao"));
    const tipo = tipoTxt ? TIPOS.get(normalizar(tipoTxt)) : "equipamento";
    const situacao = situacaoTxt ? SITUACOES.get(normalizar(situacaoTxt)) : "em_uso";
    if (!tipo) avisos.push(`${ref(abaItens.nome, l)}: tipo "${tipoTxt}" desconhecido, usei Equipamento.`);
    if (!situacao) avisos.push(`${ref(abaItens.nome, l)}: situação "${situacaoTxt}" desconhecida, usei Em uso.`);

    const compraTxt = campo(l, "data da compra", "data compra");
    const data_compra = compraTxt ? data(compraTxt) : null;
    if (compraTxt && !data_compra) avisos.push(`${ref(abaItens.nome, l)}: data da compra "${texto(compraTxt)}" não reconhecida.`);
    const garantiaTxt = campo(l, "garantia ate", "garantia");
    const garantia_ate = garantiaTxt ? data(garantiaTxt) : null;
    if (garantiaTxt && !garantia_ate) avisos.push(`${ref(abaItens.nome, l)}: garantia "${texto(garantiaTxt)}" não reconhecida.`);

    itens.set(chave, {
      nome: nome.slice(0, 200),
      tipo: tipo ?? "equipamento",
      unidade_id,
      setor_id,
      codigo: texto(campo(l, "codigo", "patrimonio", "numero de serie")),
      marca: texto(campo(l, "marca")),
      modelo: texto(campo(l, "modelo")),
      data_compra,
      valor_compra: valor(campo(l, "valor da compra", "valor compra", "valor")),
      comprado_de: texto(campo(l, "comprado de", "fornecedor", "loja")),
      nota_fiscal: texto(campo(l, "nota fiscal", "nf")),
      garantia_ate,
      situacao: situacao ?? "em_uso",
      observacao: texto(campo(l, "observacao", "obs")),
      eventos: [],
    });
  }

  let totalEventos = 0;
  for (const l of abaHistorico?.linhas ?? []) {
    const nome = texto(campo(l, "item", "nome", "equipamento"));
    const item = nome ? itens.get(normalizar(nome)) : undefined;
    if (!item) {
      avisos.push(`${ref(abaHistorico!.nome, l)}: item "${nome ?? ""}" não está na aba Itens, ignorada.`);
      continue;
    }
    const dataTxt = campo(l, "data");
    const quando = data(dataTxt);
    const feito = texto(campo(l, "o que foi feito", "evento", "descricao", "servico"));
    if (!quando || !feito) {
      avisos.push(`${ref(abaHistorico!.nome, l)}: sem data válida ou sem descrição, ignorada.`);
      continue;
    }
    const valorBruto = campo(l, "valor");
    const v = valor(valorBruto);
    const por = texto(campo(l, "realizado por", "prestador", "por"));
    const obs = texto(campo(l, "observacao", "obs"));
    const descricao = [
      feito,
      por ? `por ${por}` : null,
      valorBruto !== null && v === null ? `valor: ${texto(valorBruto)}` : null,
      obs,
    ]
      .filter(Boolean)
      .join(" · ");
    item.eventos.push({ data: quando, descricao: descricao.slice(0, 2000), valor: v });
    totalEventos++;
  }

  const lista = [...itens.values()];
  if (!lista.length) return { erro: "Nenhum item encontrado na aba Itens." };
  return {
    previa: {
      resumo: [
        `${lista.length} item(ns) na planilha (os que já existem com o mesmo nome serão reaproveitados)`,
        `${totalEventos} registro(s) de histórico`,
      ],
      avisos,
      cabecalho: ["Item", "Tipo", "Compra", "Valor", "Histórico"],
      linhas: lista.slice(0, 15).map((i) => [
        i.nome,
        TIPOS_PATRIMONIO[i.tipo as keyof typeof TIPOS_PATRIMONIO],
        i.data_compra?.split("-").reverse().join("/") ?? "",
        i.valor_compra?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) ?? "",
        String(i.eventos.length),
      ]),
      dados: JSON.stringify(lista),
    },
  };
}

export async function importarPatrimonio(empresaId: string, _: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const { supabase } = await getContexto(empresaId);
  let itens: unknown;
  try {
    itens = JSON.parse(String(form.get("dados") ?? "[]"));
  } catch {
    return { erro: "Leia a planilha de novo." };
  }
  const { data: r, error } = await supabase.rpc("importar_patrimonio", { p_empresa: empresaId, p_itens: itens });
  if (error) return { erro: error.message };
  const res = r as { itens_novos: number; itens_existentes: number; eventos: number };
  revalidatePath(`/e/${empresaId}/patrimonio`);
  return {
    ok: `Importação concluída: ${res.itens_novos} item(ns) novo(s), ${res.itens_existentes} já existia(m) e ${res.eventos} registro(s) de histórico.`,
  };
}
