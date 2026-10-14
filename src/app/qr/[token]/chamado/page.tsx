import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarCentral, carregarDadosChamado } from "@/lib/qr";
import { FormChamadoQr } from "./form";

export const dynamic = "force-dynamic";

export default async function ChamadoQr({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [central, dados] = await Promise.all([carregarCentral(token), carregarDadosChamado(token)]);
  if (!central || !dados) notFound();

  return (
    <>
      <Link href={`/qr/${token}`} className="text-sm text-slate-500">
        ← {central.unidade.nome}
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Solicitar manutenção</h1>
        <p className="text-sm text-slate-500">Conte o que está com problema. A gestão acompanha o chamado.</p>
      </div>
      <FormChamadoQr token={token} setores={dados.setores} equipamentos={dados.equipamentos} />
    </>
  );
}
