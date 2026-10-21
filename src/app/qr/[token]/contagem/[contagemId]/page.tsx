import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarCentral, carregarContagemQr } from "@/lib/qr";
import { dataDeHoje } from "@/lib/contagens";
import { FormContagem } from "@/components/contagem/form-contagem";

export const dynamic = "force-dynamic";

export default async function ContagemQr({ params }: { params: Promise<{ token: string; contagemId: string }> }) {
  const { token, contagemId } = await params;
  const [central, contagem] = await Promise.all([carregarCentral(token), carregarContagemQr(token, contagemId)]);
  if (!central || !contagem) notFound();

  return (
    <>
      <Link href={`/qr/${token}`} className="text-sm text-slate-500">
        ← {central.unidade.nome}
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{contagem.nome}</h1>
        {contagem.descricao && <p className="text-sm text-slate-500">{contagem.descricao}</p>}
      </div>
      <FormContagem
        canal="qr"
        contagem={contagem}
        token={token}
        hoje={dataDeHoje(central.empresa.fuso_horario)}
        voltar={{ href: `/qr/${token}`, rotulo: "Voltar à central da unidade" }}
      />
    </>
  );
}
