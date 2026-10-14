import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { Titulo } from "@/components/ui";
import { NavLink } from "../nav-link";

export default async function LayoutWhatsApp({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ empresaId: string }>;
}) {
  const { empresaId } = await params;
  const { pode } = await getContexto(empresaId);
  const gerencia = pode("whatsapp.gerenciar");
  if (!gerencia && !pode("whatsapp.avisos")) notFound();
  const base = `/e/${empresaId}/whatsapp`;
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo>WhatsApp</Titulo>
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-2 text-sm">
        <NavLink href={`${base}/conexao`}>Conexão</NavLink>
        <NavLink href={`${base}/avisos`}>Avisos</NavLink>
        {gerencia && <NavLink href={`${base}/eventos`}>Eventos</NavLink>}
        {gerencia && <NavLink href={`${base}/destinatarios`}>Destinatários</NavLink>}
        {gerencia && <NavLink href={`${base}/automacoes`}>Automações</NavLink>}
      </nav>
      {children}
    </div>
  );
}
