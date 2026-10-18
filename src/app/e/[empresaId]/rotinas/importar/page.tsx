import { exigirPermissao } from "@/lib/contexto";
import { Titulo } from "@/components/ui";
import { ImportarPlanilha } from "@/components/importacao/importar-planilha";
import { importarRotinas, lerRotinas } from "./actions";

export default async function ImportarRotinas({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  await exigirPermissao(empresaId, "rotinas.editar");
  const base = `/e/${empresaId}/rotinas`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo voltar={{ href: base, rotulo: "Rotinas" }}>Importar planilha</Titulo>
      <ImportarPlanilha
        ler={lerRotinas.bind(null, empresaId)}
        importar={importarRotinas.bind(null, empresaId)}
        voltarHref={base}
        instrucoes={
          <>
            <p>
              Envie a planilha de respostas do levantamento (Google Forms exportado em Excel): uma linha por pessoa, com o setor e
              as colunas &quot;8:00h &gt; atividade chave 1&quot;, e assim por diante.
            </p>
            <p>
              Cada atividade vira uma rotina naquele horário, todos os dias, sem função (você define depois). Setores novos são
              criados e rotinas repetidas não são duplicadas.
            </p>
          </>
        }
      />
    </div>
  );
}
