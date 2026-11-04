import { formatarData } from "@/lib/formato";

// "Criada por Fulano em 04/11/2026 · atualizada em 05/11/2026" (sem autor nas fichas antigas)
export function carimbo(
  f: { created_at: string; updated_at: string; criador: { nome: string } | null },
  fuso: string,
) {
  const criada = formatarData(f.created_at, fuso);
  const atualizada = formatarData(f.updated_at, fuso);
  return [
    `Criada${f.criador ? ` por ${f.criador.nome}` : ""} em ${criada}`,
    atualizada !== criada ? `atualizada em ${atualizada}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
