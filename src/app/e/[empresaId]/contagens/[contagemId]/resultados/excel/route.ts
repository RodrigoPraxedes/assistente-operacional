import ExcelJS from "exceljs";
import { getContexto } from "@/lib/contexto";
import { carregarResultados, lerFiltros } from "@/lib/contagem-resultados";
import { respostaXlsx, normalizar } from "@/lib/planilha";
import { rotuloItem } from "@/lib/contagens";

// Histórico da contagem em Excel, no formato das respostas do Google Forms:
// uma linha por envio e uma coluna por item.
export async function GET(req: Request, { params }: { params: Promise<{ empresaId: string; contagemId: string }> }) {
  const { empresaId, contagemId } = await params;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  if (!pode("contagens.resultados") && !pode("contagens.editar")) return new Response("Sem permissão", { status: 403 });

  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const filtros = lerFiltros(sp, empresa.fuso_horario);
  const dados = await carregarResultados(supabase, empresaId, contagemId, filtros);
  if (!dados) return new Response("Não encontrada", { status: 404 });
  const { contagem, itens, registros } = dados;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Respostas");
  const colunas = [
    { header: "Carimbo de data/hora", key: "enviado", width: 20 },
    { header: "Data da contagem", key: "data", width: 14 },
    ...(contagem.turnos.length ? [{ header: "Turno", key: "turno", width: 10 }] : []),
    { header: "Nome", key: "nome", width: 20 },
    ...itens.flatMap((i) => [
      { header: rotuloItem(i), key: `q_${i.id}`, width: 16 },
      ...(contagem.usa_meta
        ? [{ header: `${contagem.pede_vai_fazer ? "Sugestão" : contagem.rotulo_falta} - ${i.nome}`, key: `f_${i.id}`, width: 16 }]
        : []),
      ...(contagem.usa_meta && contagem.pede_vai_fazer
        ? [{ header: `${contagem.rotulo_falta} - ${i.nome}`, key: `v_${i.id}`, width: 16 }]
        : []),
    ]),
    { header: "Observação", key: "obs", width: 40 },
  ];
  ws.columns = colunas;
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: "top" };
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium", timeZone: empresa.fuso_horario });
  for (const r of [...registros].reverse()) {
    const [y, m, d] = r.data_ref.split("-").map(Number);
    const linha: Record<string, unknown> = {
      enviado: fmt.format(new Date(r.enviado_em)).replace(",", ""),
      data: new Date(Date.UTC(y, m - 1, d)),
      turno: r.turno ?? "",
      nome: r.executor_nome,
      obs: r.observacao ?? "",
    };
    for (const i of itens) {
      const v = r.valores.get(i.id);
      linha[`q_${i.id}`] = v?.quantidade ?? null;
      if (contagem.usa_meta) linha[`f_${i.id}`] = v?.a_fazer ?? null;
      if (contagem.usa_meta && contagem.pede_vai_fazer) linha[`v_${i.id}`] = v?.vai_fazer ?? null;
    }
    ws.addRow(linha);
  }
  ws.getColumn("data").numFmt = "dd/mm/yyyy";

  const nome = normalizar(contagem.nome).replace(/ /g, "-") || "contagem";
  return respostaXlsx(Buffer.from(await wb.xlsx.writeBuffer()), `${nome}-${filtros.de}-a-${filtros.ate}.xlsx`);
}
