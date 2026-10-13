import { cookies } from "next/headers";
import { getContexto } from "@/lib/contexto";
import { MenuLateral } from "./menu-lateral";

export default async function LayoutEmpresa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const { empresa, membro, pode } = await getContexto(empresaId);
  const veConfig = ["config.empresa", "config.setores", "config.membros", "config.perfis", "config.status"].some(pode);
  const tema = (await cookies()).get("tema")?.value;

  return (
    <div className="min-h-dvh min-[900px]:grid min-[900px]:grid-cols-[226px_minmax(0,1fr)]">
      <MenuLateral
        base={`/e/${empresaId}`}
        empresa={empresa.nome}
        membro={{ nome: membro.nome, cargo: membro.cargo }}
        veConfig={veConfig}
        tema={tema === "claro" || tema === "escuro" ? tema : "auto"}
      />
      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
