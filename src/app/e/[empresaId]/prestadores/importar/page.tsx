import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import { Titulo } from "@/components/ui";
import { ImportarPlanilha } from "@/components/importacao/importar-planilha";
import { importarPrestadores, lerPrestadores } from "./actions";

export default async function ImportarPrestadores({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirPermissao(empresaId, "prestadores.gerenciar");
  const base = `/e/${empresaId}/prestadores`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={base} className="text-sm text-slate-500">
        ← Prestadores
      </Link>
      <Titulo>Importar planilha</Titulo>
      <ImportarPlanilha
        ler={lerPrestadores.bind(null, empresaId)}
        importar={importarPrestadores.bind(null, empresaId)}
        modeloHref={`${base}/importar/modelo`}
        voltarHref={base}
        instrucoes={
          <>
            <p>
              Use a planilha-modelo: um prestador por linha, com nome, telefone (com DDD), outro telefone, e-mail e tipos de
              serviço separados por vírgula (ex.: Refrigeração, Elétrica).
            </p>
            <p>Tipos de serviço que ainda não existem são criados. Prestador com o mesmo nome de um já cadastrado não é duplicado.</p>
          </>
        }
      />
    </div>
  );
}
