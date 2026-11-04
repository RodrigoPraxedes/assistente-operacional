import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { Cartao, Etiqueta, LinkBotao, Titulo } from "@/components/ui";
import type { Bloco } from "../../blocos";
import { carimbo } from "../../carimbo";
import { BotaoExportar } from "./botao-exportar";

// Leitura da ficha montada no Atalaia: feita para o celular e para imprimir.
export default async function VerFicha({ params }: { params: Promise<{ empresaId: string; fichaId: string }> }) {
  const { empresaId, fichaId } = await params;
  const { supabase, pode, empresa } = await getContexto(empresaId);
  const { data: ficha } = await supabase
    .from("fichas")
    .select("id, tipo, titulo, descricao, foto_path, blocos, created_at, updated_at, ficha_categorias(nome), criador:membros!fichas_criado_por_fkey(nome)")
    .eq("id", fichaId)
    .eq("empresa_id", empresaId)
    .maybeSingle<{
      id: string;
      tipo: string;
      titulo: string;
      descricao: string | null;
      foto_path: string | null;
      blocos: Bloco[];
      created_at: string;
      updated_at: string;
      ficha_categorias: { nome: string } | null;
      criador: { nome: string } | null;
    }>();
  if (!ficha || ficha.tipo !== "montada") notFound();
  const fotoUrl = ficha.foto_path
    ? (await supabase.storage.from("fichas").createSignedUrl(ficha.foto_path, 3600)).data?.signedUrl
    : null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="print:hidden">
        <Titulo
          voltar={{ href: `/e/${empresaId}/fichas`, rotulo: "Fichas" }}
          acoes={
            <>
              <BotaoExportar />
              {pode("fichas.gerenciar") && (
                <LinkBotao variante="secundario" href={`/e/${empresaId}/fichas/${fichaId}`}>
                  Editar
                </LinkBotao>
              )}
            </>
          }
        >
          Ficha
        </Titulo>
      </div>

      <Cartao className="space-y-5 p-5 print:border-0 print:p-0 print:shadow-none">
        <header className="space-y-1">
          {ficha.ficha_categorias?.nome && <Etiqueta>{ficha.ficha_categorias.nome}</Etiqueta>}
          <h2 className="text-2xl font-semibold text-slate-900">{ficha.titulo}</h2>
          {ficha.descricao && <p className="whitespace-pre-line text-slate-600">{ficha.descricao}</p>}
          <p className="text-xs text-slate-500">
            {empresa.nome} · {carimbo(ficha, empresa.fuso_horario)}
          </p>
        </header>

        {fotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={fotoUrl} alt={ficha.titulo} className="max-h-96 w-full rounded-xl border border-slate-200 object-contain print:max-h-72" />
        )}

        {ficha.blocos.map((b, i) => (
          <section key={i} className="space-y-2 print:break-inside-avoid">
            <h3 className="text-lg font-semibold text-slate-900">{b.titulo}</h3>
            <ConteudoBloco bloco={b} />
          </section>
        ))}
      </Cartao>
    </div>
  );
}

function ConteudoBloco({ bloco: b }: { bloco: Bloco }) {
  if (b.tipo === "texto") return <p className="whitespace-pre-line text-slate-700">{b.texto}</p>;
  if (b.tipo === "passos") {
    return (
      <ol className="space-y-2">
        {b.itens.map((p, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
              {i + 1}
            </span>
            <span className="whitespace-pre-line text-slate-700">{p}</span>
          </li>
        ))}
      </ol>
    );
  }
  if (b.tipo === "especificacoes") {
    return (
      <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200">
        {b.itens.map((it, i) => (
          <div key={i} className="flex gap-3 px-3 py-2 text-sm">
            <dt className="w-2/5 shrink-0 font-medium text-slate-600">{it.nome}</dt>
            <dd className="text-slate-900">{it.valor}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <table className="w-full overflow-hidden rounded-lg border border-slate-200 text-sm">
      <thead className="bg-slate-50 text-left text-slate-600">
        <tr>
          <th className="px-3 py-2 font-medium">Item</th>
          <th className="px-3 py-2 text-right font-medium">Qtd.</th>
          <th className="px-3 py-2 font-medium">Unid.</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {b.itens.map((it, i) => (
          <tr key={i}>
            <td className="px-3 py-2 text-slate-900">{it.nome}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-900">{it.quantidade}</td>
            <td className="px-3 py-2 text-slate-600">{it.unidade}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
