import { gerarModelo, respostaXlsx } from "@/lib/planilha";

export async function GET() {
  const xlsx = await gerarModelo([
    {
      nome: "Prestadores",
      colunas: [
        { titulo: "Nome", largura: 32 },
        { titulo: "Telefone" },
        { titulo: "Telefone 2" },
        { titulo: "E-mail", largura: 28 },
        { titulo: "Tipos de serviço", largura: 36 },
      ],
      exemplos: [["Rogério do ar", "21999998888", "", "", "Refrigeração, Ar-condicionado"]],
    },
  ]);
  return respostaXlsx(xlsx, "modelo-prestadores.xlsx");
}
