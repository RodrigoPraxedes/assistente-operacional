import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { NavLink } from "./nav-link";

export default async function LayoutEmpresa({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const { empresa, membro, pode } = await getContexto(empresaId);
  const base = `/e/${empresaId}`;
  const veConfig = ["config.empresa", "config.setores", "config.membros", "config.perfis", "config.status"].some(pode);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
          <Link href="/app?nova=1" className="truncate font-semibold text-slate-900" title="Trocar de empresa">
            {empresa.nome}
          </Link>
          <nav className="flex flex-1 gap-1 overflow-x-auto text-sm">
            <NavLink href={`${base}/tarefas`}>Tarefas</NavLink>
            <NavLink href={`${base}/checklists`}>Check-lists</NavLink>
            <NavLink href={`${base}/acoes`}>Ações</NavLink>
            <NavLink href={`${base}/chamados`}>Chamados</NavLink>
            <NavLink href={`${base}/alertas`}>Alertas</NavLink>
            {veConfig && <NavLink href={`${base}/config/geral`} ativoEm={`${base}/config`}>Configurações</NavLink>}
          </nav>
          <div className="hidden text-right text-xs text-slate-500 sm:block">
            <p className="font-medium text-slate-700">{membro.nome}</p>
            <p>{membro.cargo}</p>
          </div>
          <form action="/sair" method="post">
            <button className="text-sm text-slate-500 hover:text-slate-800">Sair</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">{children}</main>
    </div>
  );
}
