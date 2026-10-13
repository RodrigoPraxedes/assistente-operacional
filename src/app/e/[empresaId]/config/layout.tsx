import { getContexto } from "@/lib/contexto";
import { NavLink } from "../nav-link";

export default async function LayoutConfig({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const { pode } = await getContexto(empresaId);
  const base = `/e/${empresaId}/config`;
  return (
    <div className="space-y-4">
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 text-sm">
        <NavLink href={`${base}/geral`}>Geral</NavLink>
        {pode("config.membros") && <NavLink href={`${base}/membros`}>Colaboradores</NavLink>}
        {pode("config.perfis") && <NavLink href={`${base}/perfis`}>Perfis de acesso</NavLink>}
      </nav>
      {children}
    </div>
  );
}
