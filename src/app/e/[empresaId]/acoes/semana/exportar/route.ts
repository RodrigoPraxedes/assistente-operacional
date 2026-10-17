import ExcelJS from "exceljs";
import { getContexto } from "@/lib/contexto";
import { dataValida, hojeIso, rotuloDia, segundaDaSemana } from "@/lib/escala";
import { carregarSemana } from "@/lib/semana-acoes";
import { respostaXlsx } from "@/lib/planilha";

export async function GET(req: Request, { params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const q = new URL(req.url).searchParams;
  const { supabase, empresa } = await getContexto(empresaId);
  const fuso = empresa.fuso_horario;
  const semana = q.get("semana") ?? undefined;
  const segunda = segundaDaSemana(dataValida(semana) ? semana : hojeIso(fuso));
  const { dias, porDia } = await carregarSemana(supabase, empresaId, fuso, segunda, {
    setor: q.get("setor") || undefined,
    categoria: q.get("categoria") || undefined,
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Semana");
  ws.columns = [
    { header: "Dia", width: 12 },
    { header: "Horário", width: 10 },
    { header: "Ação", width: 40 },
    { header: "Categoria", width: 20 },
    { header: "Responsáveis", width: 28 },
    { header: "Setor", width: 20 },
    { header: "Unidade", width: 22 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  for (const dia of dias) {
    for (const c of porDia.get(dia) ?? []) {
      ws.addRow([
        rotuloDia(dia),
        c.hora,
        c.acao.nome,
        c.categoria ?? "",
        c.responsaveis.join(", "),
        c.setor ?? "",
        c.unidade ?? "Todas",
      ]);
    }
  }
  return respostaXlsx(Buffer.from(await wb.xlsx.writeBuffer()), `acoes-semana-${segunda}.xlsx`);
}
