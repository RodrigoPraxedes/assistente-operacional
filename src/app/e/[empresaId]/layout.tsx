import { cookies } from "next/headers";
import { ehAdminMaster, getContexto } from "@/lib/contexto";
import { Aviso } from "@/components/ui";
import { MenuLateral } from "./menu-lateral";

export default async function LayoutEmpresa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const [{ empresa, membro, pode }, admin] = await Promise.all([getContexto(empresaId), ehAdminMaster()]);
  const veConfig = ["config.empresa", "config.setores", "config.membros", "config.perfis", "config.status"].some(pode);
  const jar = await cookies();
  const tema = jar.get("tema")?.value;

  return (
    <div className="min-h-dvh min-[900px]:grid min-[900px]:grid-cols-[auto_minmax(0,1fr)]">
      <MenuLateral
        base={`/e/${empresaId}`}
        empresa={empresa.nome}
        membro={{ nome: membro.nome, cargo: membro.cargo }}
        veConfig={veConfig}
        veAdmin={admin}
        veWhatsApp={pode("whatsapp.gerenciar") || pode("whatsapp.avisos")}
        tema={tema === "claro" || tema === "escuro" ? tema : "auto"}
        recolhido={jar.get("menu")?.value === "recolhido"}
      />
      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 sm:px-8 sm:py-8">
        {empresa.situacao !== "ativa" && (
          <div className="mb-4">
            <Aviso tipo="info">
              Esta empresa está {empresa.situacao === "suspensa" ? "suspensa" : "aguardando aprovação"}. Só o Admin Master
              consegue abrir; os colaboradores estão sem acesso.
            </Aviso>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
