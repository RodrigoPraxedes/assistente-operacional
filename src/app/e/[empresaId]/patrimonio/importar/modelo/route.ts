import { gerarModelo, respostaXlsx } from "@/lib/planilha";

export async function GET() {
  const xlsx = await gerarModelo([
    {
      nome: "Itens",
      colunas: [
        { titulo: "Nome", largura: 32 },
        { titulo: "Tipo" },
        { titulo: "Unidade" },
        { titulo: "Setor" },
        { titulo: "Código" },
        { titulo: "Marca" },
        { titulo: "Modelo" },
        { titulo: "Data da compra" },
        { titulo: "Valor da compra" },
        { titulo: "Comprado de" },
        { titulo: "Nota fiscal" },
        { titulo: "Garantia até" },
        { titulo: "Situação" },
        { titulo: "Observação", largura: 32 },
      ],
      exemplos: [
        ["Freezer vertical cozinha", "Equipamento", "", "Cozinha", "PAT-001", "Metalfrio", "VF55", "15/03/2024", 4280, "Loja X", "12345", "15/03/2025", "Em uso", ""],
      ],
    },
    {
      nome: "Histórico",
      colunas: [
        { titulo: "Item", largura: 32 },
        { titulo: "Data" },
        { titulo: "O que foi feito", largura: 48 },
        { titulo: "Valor" },
        { titulo: "Realizado por" },
        { titulo: "Observação", largura: 32 },
      ],
      exemplos: [["Freezer vertical cozinha", "10/08/2025", "Troca de gaxeta", 125, "Dinho", ""]],
    },
  ]);
  return respostaXlsx(xlsx, "modelo-patrimonio.xlsx");
}
