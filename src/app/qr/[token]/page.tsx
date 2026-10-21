import Link from "next/link";
import { CheckCircle2, ClipboardList, Wrench } from "lucide-react";
import { notFound } from "next/navigation";
import { carregarCentral } from "@/lib/qr";
import { Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

function hora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}

export default async function CentralQr({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const central = await carregarCentral(token);
  if (!central) notFound();

  return (
    <>
      <div className="pt-4 text-center">
        <p className="text-sm text-slate-500">{central.empresa.nome}</p>
        <h1 className="text-2xl font-semibold">{central.unidade.nome}</h1>
        <p className="text-sm text-slate-500">{(central.contagens ?? []).length ? "Escolha o que vai preencher" : "Escolha o check-list para preencher"}</p>
      </div>
      <Link
        href={`/qr/${token}/chamado`}
        className="flex items-center gap-3 rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm hover:border-blue-400"
      >
        <Wrench size={20} className="shrink-0 text-blue-600" />
        <span>
          <span className="block font-medium">Solicitar manutenção</span>
          <span className="text-sm text-slate-500">Algo quebrado ou com problema? Abra um chamado.</span>
        </span>
      </Link>
      {central.modelos.length === 0 ? (
        <Vazio>Nenhum check-list disponível nesta unidade.</Vazio>
      ) : (
        <ul className="space-y-2">
          {central.modelos.map((m) => (
            <li key={m.id}>
              <Link
                href={`/qr/${token}/${m.id}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm hover:border-blue-400"
              >
                <span>
                  <span className="block font-medium">{m.nome}</span>
                  {m.descricao && <span className="text-sm text-slate-500">{m.descricao}</span>}
                </span>
                <span className="shrink-0 pl-2 text-right text-sm text-slate-500">
                  {m.horario_preferencial}
                  {m.feito_hoje_em && (
                    <span className="mt-1 flex items-center justify-end gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 size={14} />
                      Feito hoje às {hora(m.feito_hoje_em, central.empresa.fuso_horario)}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(central.contagens ?? []).length > 0 && (
        <section className="space-y-2">
          <h2 className="pt-2 text-sm font-medium text-slate-500">Contagens</h2>
          <ul className="space-y-2">
            {central.contagens!.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/qr/${token}/contagem/${c.id}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm hover:border-blue-400"
                >
                  <ClipboardList size={20} className="shrink-0 text-blue-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.nome}</span>
                    {c.descricao && <span className="text-sm text-slate-500">{c.descricao}</span>}
                  </span>
                  {c.feito_hoje_em && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 size={14} />
                      Feito hoje às {hora(c.feito_hoje_em, central.empresa.fuso_horario)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {central.colaboradores.length === 0 && central.modelos.some((m) => m.modo_executor === "usuarios") && (
        <p className="text-center text-xs text-slate-500">
          Nenhum colaborador com PIN nesta unidade. Peça ao gestor para cadastrar o seu PIN.
        </p>
      )}
    </>
  );
}
