import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarCentral } from "@/lib/qr";
import { Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CentralQr({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const central = await carregarCentral(token);
  if (!central) notFound();

  return (
    <>
      <div className="pt-4 text-center">
        <p className="text-sm text-slate-500">{central.empresa.nome}</p>
        <h1 className="text-2xl font-semibold">{central.unidade.nome}</h1>
        <p className="text-sm text-slate-500">Escolha o check-list para preencher</p>
      </div>
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
                <span className="text-sm text-slate-500">{m.horario_preferencial}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {central.colaboradores.length === 0 && (
        <p className="text-center text-xs text-slate-500">
          Nenhum colaborador com PIN nesta unidade. Peça ao gerente para cadastrar o seu PIN.
        </p>
      )}
    </>
  );
}
