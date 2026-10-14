import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import { Titulo } from "@/components/ui";
import { ImportarPlanilha } from "@/components/importacao/importar-planilha";
import { importarPatrimonio, lerPatrimonio } from "./actions";

export default async function ImportarPatrimonio({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirPermissao(empresaId, "patrimonio.gerenciar");
  const base = `/e/${empresaId}/patrimonio`;

  return (
    <div className="space-y-4">
      <Link href={base} className="text-sm text-slate-500">
        ← Patrimônio
      </Link>
      <Titulo>Importar planilha</Titulo>
      <ImportarPlanilha
        ler={lerPatrimonio.bind(null, empresaId)}
        importar={importarPatrimonio.bind(null, empresaId)}
        modeloHref={`${base}/importar/modelo`}
        voltarHref={base}
        instrucoes={
          <>
            <p>
              Use a planilha-modelo. A aba <b>Itens</b> tem um item por linha; só o nome é obrigatório. A aba{" "}
              <b>Histórico</b> (opcional) tem as manutenções: nome do item, data, o que foi feito, valor e quem fez.
            </p>
            <p>Unidade e setor são procurados pelo nome. Item com o mesmo nome de um já cadastrado não é duplicado: só recebe o histórico novo.</p>
          </>
        }
      />
    </div>
  );
}
