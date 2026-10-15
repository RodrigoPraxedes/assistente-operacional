import Link from "next/link";
import { notFound } from "next/navigation";
import { Cartao, LinkBotao, Titulo } from "@/components/ui";
import { SECOES, secaoPorSlug } from "../conteudo";

export default async function PaginaSecaoGuia({ params }: { params: Promise<{ empresaId: string; secao: string }> }) {
  const { empresaId, secao: slug } = await params;
  const secao = secaoPorSlug(slug);
  if (!secao) notFound();

  const base = `/e/${empresaId}`;
  const i = SECOES.indexOf(secao);
  const anterior = SECOES[i - 1];
  const proxima = SECOES[i + 1];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo
        voltar={{ href: `${base}/guia`, rotulo: "Guia" }}
        acoes={
          secao.tela && (
            <LinkBotao variante="secundario" href={`${base}${secao.tela}`}>
              Abrir {secao.titulo}
            </LinkBotao>
          )
        }
      >
        {secao.titulo}
      </Titulo>
      <p className="text-slate-700">{secao.paraQue}</p>

      {secao.topicos.map((t) => (
        <Cartao key={t.titulo} className="space-y-3">
          <h2 className="font-semibold text-slate-900">{t.titulo}</h2>
          <ol className="space-y-2.5">
            {t.passos.map((p, n) => (
              <li key={n} className="flex gap-3 text-sm text-slate-700">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                  {n + 1}
                </span>
                <span className="pt-0.5">{p}</span>
              </li>
            ))}
          </ol>
        </Cartao>
      ))}

      {secao.dicas && (
        <Cartao className="space-y-2">
          <h2 className="font-semibold text-slate-900">Bom saber</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {secao.dicas.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </Cartao>
      )}

      <nav aria-label="Outras seções do guia" className="flex justify-between gap-3 pt-2 text-sm">
        {anterior ? (
          <Link href={`${base}/guia/${anterior.slug}`} className="text-blue-600 hover:underline">
            ‹ {anterior.titulo}
          </Link>
        ) : (
          <span />
        )}
        {proxima && (
          <Link href={`${base}/guia/${proxima.slug}`} className="text-right text-blue-600 hover:underline">
            {proxima.titulo} ›
          </Link>
        )}
      </nav>
    </div>
  );
}
