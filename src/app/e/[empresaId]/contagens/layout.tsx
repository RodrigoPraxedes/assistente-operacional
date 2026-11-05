import { ModuloDesligado } from "@/components/modulo-desligado";
import { getContexto } from "@/lib/contexto";

// módulo opcional: desligado em Configurações › Geral › Módulos, a tela explica em vez de abrir
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { ligado, pode } = await getContexto(empresaId);
  if (!ligado("contagens")) return <ModuloDesligado empresaId={empresaId} modulo="contagens" podeLigar={pode("config.empresa")} />;
  return children;
}
