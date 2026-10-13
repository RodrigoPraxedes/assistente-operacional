"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ativoEm: prefixo que marca o link como ativo (padrão: o próprio href)
export function NavLink({ href, ativoEm, children }: { href: string; ativoEm?: string; children: React.ReactNode }) {
  const ativo = usePathname().startsWith(ativoEm ?? href);
  return (
    <Link
      href={href}
      className={`whitespace-nowrap rounded-lg px-3 py-1.5 ${ativo ? "bg-blue-50 font-medium text-blue-700" : "text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </Link>
  );
}
