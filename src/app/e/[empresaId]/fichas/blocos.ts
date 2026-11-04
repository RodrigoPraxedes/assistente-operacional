// Blocos da ficha montada no Atalaia (coluna fichas.blocos). Usado no servidor e no navegador.

export type TipoBloco = "lista" | "especificacoes" | "passos" | "texto";

export interface ItemLista {
  nome: string;
  quantidade: string;
  unidade: string;
}
export interface ItemEspec {
  nome: string;
  valor: string;
}

export type Bloco =
  | { tipo: "lista"; titulo: string; itens: ItemLista[] }
  | { tipo: "especificacoes"; titulo: string; itens: ItemEspec[] }
  | { tipo: "passos"; titulo: string; itens: string[] }
  | { tipo: "texto"; titulo: string; texto: string };

export const TIPOS_BLOCO: { tipo: TipoBloco; rotulo: string; titulo: string; dica: string }[] = [
  { tipo: "lista", rotulo: "Lista com quantidade", titulo: "Ingredientes", dica: "Ingredientes, Materiais, Peças" },
  { tipo: "especificacoes", rotulo: "Especificações", titulo: "Especificações", dica: "Voltagem, Validade, Rendimento" },
  { tipo: "passos", rotulo: "Passo a passo", titulo: "Modo de preparo", dica: "Modo de preparo, Procedimento" },
  { tipo: "texto", rotulo: "Texto livre", titulo: "Observações", dica: "Observações, Cuidados" },
];

export function blocoVazio(tipo: TipoBloco): Bloco {
  const titulo = TIPOS_BLOCO.find((t) => t.tipo === tipo)!.titulo;
  if (tipo === "lista") return { tipo, titulo, itens: [{ nome: "", quantidade: "", unidade: "" }] };
  if (tipo === "especificacoes") return { tipo, titulo, itens: [{ nome: "", valor: "" }] };
  if (tipo === "passos") return { tipo, titulo, itens: [""] };
  return { tipo, titulo, texto: "" };
}

const s = (v: unknown, max = 2000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const lista = (v: unknown) => (Array.isArray(v) ? v.slice(0, 200) : []);

// Limpa o que veio do formulário: tira linhas vazias e blocos sem conteúdo.
export function limparBlocos(bruto: unknown): Bloco[] {
  const saida: Bloco[] = [];
  for (const b of lista(bruto).slice(0, 30) as Record<string, unknown>[]) {
    const titulo = s(b?.titulo, 120);
    if (b?.tipo === "lista") {
      const itens = lista(b.itens)
        .map((i: Record<string, unknown>) => ({ nome: s(i?.nome, 200), quantidade: s(i?.quantidade, 40), unidade: s(i?.unidade, 40) }))
        .filter((i) => i.nome);
      if (itens.length) saida.push({ tipo: "lista", titulo, itens });
    } else if (b?.tipo === "especificacoes") {
      const itens = lista(b.itens)
        .map((i: Record<string, unknown>) => ({ nome: s(i?.nome, 200), valor: s(i?.valor, 500) }))
        .filter((i) => i.nome || i.valor);
      if (itens.length) saida.push({ tipo: "especificacoes", titulo, itens });
    } else if (b?.tipo === "passos") {
      const itens = lista(b.itens).map((i) => s(i, 2000)).filter(Boolean);
      if (itens.length) saida.push({ tipo: "passos", titulo, itens });
    } else if (b?.tipo === "texto") {
      const texto = s(b.texto, 10000);
      if (texto) saida.push({ tipo: "texto", titulo, texto });
    }
  }
  return saida;
}

// Texto corrido dos blocos, para a busca da lista
export function textoDosBlocos(blocos: Bloco[]) {
  return blocos
    .map((b) =>
      [
        b.titulo,
        b.tipo === "texto"
          ? b.texto
          : b.tipo === "passos"
            ? b.itens.join(" ")
            : b.tipo === "lista"
              ? b.itens.map((i) => i.nome).join(" ")
              : b.itens.map((i) => `${i.nome} ${i.valor}`).join(" "),
      ].join(" "),
    )
    .join(" ");
}
