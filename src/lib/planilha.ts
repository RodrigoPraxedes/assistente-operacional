import "server-only";
import ExcelJS from "exceljs";

// Leitura e geração de planilhas Excel para as importações (Patrimônio, Prestadores).
// Os cabeçalhos são comparados sem acento, maiúsculas e pontuação, então
// "Data da compra", "DATA DA COMPRA" e "data compra" caem na mesma coluna.

export type Linha = Record<string, unknown> & { _linha: number };

export const normalizar = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// valor "puro" da célula (fórmula vira o resultado, texto rico vira texto)
function valorCelula(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return valorCelula(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((p) => p.text).join("");
    if ("text" in v) return String(v.text);
    if ("error" in v) return null;
  }
  return v;
}

// Lê todas as abas: { nome da aba normalizado: { nome, linhas } }, onde cada linha
// é um objeto { cabeçalho normalizado: valor }. A primeira linha não vazia é o cabeçalho.
export async function lerPlanilha(arquivo: File) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await arquivo.arrayBuffer());
  const abas = new Map<string, { nome: string; linhas: Linha[] }>();
  wb.eachSheet((ws) => {
    let cabecalho: string[] | null = null;
    const linhas: Linha[] = [];
    ws.eachRow({ includeEmpty: false }, (row, n) => {
      const valores = (row.values as ExcelJS.CellValue[]).slice(1).map(valorCelula);
      if (!cabecalho) {
        cabecalho = valores.map(normalizar);
        return;
      }
      if (valores.every((v) => v === null || String(v).trim() === "")) return;
      const linha: Linha = { _linha: n };
      cabecalho.forEach((c, i) => {
        if (c) linha[c] = valores[i] ?? null;
      });
      linhas.push(linha);
    });
    abas.set(normalizar(ws.name), { nome: ws.name, linhas });
  });
  return abas;
}

// primeiro valor preenchido entre os nomes de coluna aceitos
export function campo(linha: Linha, ...nomes: string[]) {
  for (const n of nomes) {
    const v = linha[normalizar(n)];
    if (v !== null && v !== undefined && String(v).trim() !== "") return v;
  }
  return null;
}

export const texto = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);

const MESES = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// Data como "AAAA-MM-DD". Aceita data do Excel, 31/12/2024, 2024-12-31 e "novembro 2020".
export function data(v: unknown): string | null {
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // número de série do Excel (dias desde 1899-12-30)
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = normalizar(v);
  let m = s.match(/^(\d{1,2}) (\d{1,2}) (\d{2,4})$/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return valida(ano, m[2], m[1]);
  }
  m = s.match(/^(\d{4}) (\d{1,2}) (\d{1,2})/);
  if (m) return valida(m[1], m[2], m[3]);
  m = s.match(new RegExp(`(${MESES.join("|")})(?: de)? (\\d{4})`));
  if (m) return valida(m[2], String(MESES.indexOf(m[1]) + 1), "1");
  return null;
}

function valida(ano: string, mes: string, dia: string) {
  const iso = `${ano.padStart(4, "0")}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

// Valor em reais. Aceita número, "1.234,56", "R$ 380" e "380.5". Texto sem número → null.
export function valor(v: unknown): number | null {
  if (typeof v === "number") return isFinite(v) ? Math.round(v * 100) / 100 : null;
  const s = String(v ?? "").replace(/r\$|\s/gi, "");
  if (!/^-?[\d.,]+$/.test(s)) return null;
  const n = s.includes(",") ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}

// Planilha-modelo: uma aba por tabela, cabeçalho em negrito e uma linha de exemplo
export async function gerarModelo(abas: { nome: string; colunas: { titulo: string; largura?: number }[]; exemplos: unknown[][] }[]) {
  const wb = new ExcelJS.Workbook();
  for (const aba of abas) {
    const ws = wb.addWorksheet(aba.nome);
    ws.columns = aba.colunas.map((c) => ({ header: c.titulo, width: c.largura ?? 18 }));
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const e of aba.exemplos) ws.addRow(e);
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function respostaXlsx(conteudo: Buffer, arquivo: string) {
  return new Response(new Uint8Array(conteudo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
    },
  });
}
