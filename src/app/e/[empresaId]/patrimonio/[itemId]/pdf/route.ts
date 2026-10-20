import { notFound } from "next/navigation";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { brl, dataCurta, montarTrajetoria } from "@/lib/patrimonio-trajetoria";
import { SITUACOES_PATRIMONIO, TIPOS_PATRIMONIO, type Chamado, type Equipamento, type EventoPatrimonio, type Tarefa } from "@/lib/types";

// A fonte padrão do PDF só tem caracteres do alfabeto latino: troca/descarta o resto.
const limpar = (t: string) =>
  t
    .replace(/[→]/g, ">")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/[^ -~ -ÿ]/g, "")
    .trim();

const MARGEM = 40;
const LARGURA = 595;
const ALTURA = 842;

export async function GET(req: Request, { params }: { params: Promise<{ empresaId: string; itemId: string }> }) {
  const { empresaId, itemId } = await params;
  const comValores = new URL(req.url).searchParams.get("valores") === "1";
  const { supabase, empresa } = await getContexto(empresaId);
  const fuso = empresa.fuso_horario;

  const { data: item } = await supabase.from("equipamentos").select("*").eq("id", itemId).eq("empresa_id", empresaId).maybeSingle<Equipamento>();
  if (!item) notFound();

  const [{ data: eventos }, { data: chamados }, { data: unidades }, { data: setores }, { data: status }] = await Promise.all([
    supabase.from("patrimonio_eventos").select("*").eq("equipamento_id", itemId).returns<EventoPatrimonio[]>(),
    supabase.from("chamados").select("*, tarefas!inner(*)").eq("equipamento_id", itemId).returns<(Chamado & { tarefas: Tarefa })[]>(),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("status").select("id, nome, cor").eq("empresa_id", empresaId),
  ]);
  const un = new Map((unidades ?? []).map((u) => [u.id, u.nome]));
  const st = new Map((status ?? []).map((s) => [s.id, s]));
  const listaChamados = chamados ?? [];
  const custoTotal =
    listaChamados.reduce((s, c) => s + Number(c.custo ?? 0), 0) +
    (eventos ?? []).filter((e) => e.tipo === "manutencao").reduce((s, e) => s + Number(e.valor ?? 0), 0);
  const linhas = montarTrajetoria({ item, eventos: eventos ?? [], chamados: listaChamados, un, st, fuso, empresaId });

  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);

  let foto: PDFImage | null = null;
  if (item.foto_path) {
    try {
      const { data: url } = await supabase.storage.from("anexos").createSignedUrl(item.foto_path, 120);
      const resp = url?.signedUrl ? await fetch(url.signedUrl) : null;
      if (resp?.ok) {
        const bytes = new Uint8Array(await resp.arrayBuffer());
        if (bytes[0] === 0xff) foto = await doc.embedJpg(bytes);
        else if (bytes[0] === 0x89) foto = await doc.embedPng(bytes);
      }
    } catch {
      // foto em formato não suportado (ex.: webp) ou indisponível: o PDF sai sem ela
    }
  }

  let pagina: PDFPage = doc.addPage([LARGURA, ALTURA]);
  let y = ALTURA - MARGEM;
  const util = LARGURA - 2 * MARGEM;

  const garantir = (altura: number) => {
    if (y - altura < MARGEM) {
      pagina = doc.addPage([LARGURA, ALTURA]);
      y = ALTURA - MARGEM;
    }
  };
  const quebrar = (texto: string, f: PDFFont, tam: number, largura: number) => {
    const out: string[] = [];
    let atual = "";
    for (const palavra of limpar(texto).split(" ")) {
      const teste = atual ? `${atual} ${palavra}` : palavra;
      if (f.widthOfTextAtSize(teste, tam) > largura && atual) {
        out.push(atual);
        atual = palavra;
      } else atual = teste;
    }
    if (atual) out.push(atual);
    return out;
  };
  const escrever = (texto: string, opts: { f?: PDFFont; tam?: number; cor?: [number, number, number]; x?: number; largura?: number } = {}) => {
    const f = opts.f ?? fonte;
    const tam = opts.tam ?? 10;
    for (const l of quebrar(texto, f, tam, opts.largura ?? util)) {
      garantir(tam + 4);
      y -= tam + 2;
      pagina.drawText(l, { x: opts.x ?? MARGEM, y, size: tam, font: f, color: rgb(...(opts.cor ?? [0.1, 0.13, 0.17])) });
    }
  };

  escrever(item.nome, { f: negrito, tam: 18 });
  escrever(`${empresa.nome} · ${SITUACOES_PATRIMONIO[item.situacao].rotulo} · ${TIPOS_PATRIMONIO[item.tipo]}`, { tam: 10, cor: [0.4, 0.45, 0.5] });
  y -= 10;

  const topo = y;
  let xDados = MARGEM;
  if (foto) {
    const esc = Math.min(130 / foto.width, 130 / foto.height);
    const w = foto.width * esc;
    const h = foto.height * esc;
    pagina.drawImage(foto, { x: MARGEM, y: y - h, width: w, height: h });
    xDados = MARGEM + 145;
  }
  const dados: [string, string | null | undefined][] = [
    ["Nº patrimônio/série", item.codigo],
    ["Marca", item.marca],
    ["Modelo", item.modelo],
    ["Setor", (setores ?? []).find((s) => s.id === item.setor_id)?.nome],
    ["Unidade", item.unidade_id ? un.get(item.unidade_id) : null],
    ["Data da compra", dataCurta(item.data_compra)],
    ["Comprado de", item.comprado_de],
    ["Nota fiscal", item.nota_fiscal],
    ["Garantia até", dataCurta(item.garantia_ate)],
    ...(comValores
      ? ([
          ["Valor de compra", brl(item.valor_compra)],
          ["Gasto com manutenção", custoTotal > 0 ? brl(custoTotal) : null],
        ] as [string, string | null][])
      : []),
  ];
  for (const [rotulo, v] of dados) {
    if (!v) continue;
    escrever(rotulo, { tam: 8, cor: [0.4, 0.45, 0.5], x: xDados, largura: LARGURA - MARGEM - xDados });
    escrever(v, { tam: 11, x: xDados, largura: LARGURA - MARGEM - xDados });
    y -= 2;
  }
  if (foto) y = Math.min(y, topo - Math.min(130, (130 / Math.max(foto.width, foto.height)) * foto.height));
  if (item.observacao) {
    y -= 8;
    escrever(item.observacao, { tam: 10 });
  }

  y -= 18;
  escrever("Trajetória", { f: negrito, tam: 13 });
  y -= 4;
  if (linhas.length === 0) escrever("Nada registrado ainda.", { cor: [0.4, 0.45, 0.5] });
  for (const l of linhas) {
    garantir(40);
    escrever(`${dataCurta(l.data)}  ${l.titulo}`, { f: negrito, tam: 10 });
    const extra = [l.detalhe, comValores ? l.valor : null, l.por && `por ${l.por}`].filter(Boolean).join(" · ");
    if (extra) escrever(extra, { tam: 9, cor: [0.35, 0.4, 0.45], x: MARGEM + 12, largura: util - 12 });
    y -= 6;
  }

  const rodape = limpar(`Gerado em ${formatarDataHora(new Date().toISOString(), fuso)} - Atalaia`);
  for (const p of doc.getPages()) {
    p.drawText(rodape, { x: MARGEM, y: 20, size: 8, font: fonte, color: rgb(0.55, 0.6, 0.65) });
  }

  const bytes = await doc.save();
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" },
  });
}
