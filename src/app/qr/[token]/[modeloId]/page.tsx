import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarCentral, carregarModeloQr } from "@/lib/qr";
import { FormPreencher } from "@/components/checklist/form-preencher";

export const dynamic = "force-dynamic";

export default async function PreencherQr({ params }: { params: Promise<{ token: string; modeloId: string }> }) {
  const { token, modeloId } = await params;
  const [central, modelo] = await Promise.all([carregarCentral(token), carregarModeloQr(token, modeloId)]);
  if (!central || !modelo) notFound();

  return (
    <>
      <Link href={`/qr/${token}`} className="text-sm text-slate-500">
        ← {central.unidade.nome}
      </Link>
      <div>
        <h1 className="text-xl font-semibold">{modelo.nome}</h1>
        {modelo.descricao && <p className="text-sm text-slate-500">{modelo.descricao}</p>}
      </div>
      <FormPreencher
        canal="qr"
        empresaId={central.empresa.id}
        modeloId={modelo.id}
        token={token}
        modoExecutor={modelo.modo_executor}
        colaboradores={central.colaboradores}
        itens={modelo.itens}
        voltar={{ href: `/qr/${token}`, rotulo: "Voltar à central da unidade" }}
      />
    </>
  );
}
