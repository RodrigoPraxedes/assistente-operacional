import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Titulo } from "@/components/ui";
import { SECOES } from "./conteudo";

// Guia: manual do usuário com uma página por seção do menu
export default async function PaginaGuia({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo>Guia</Titulo>
      <p className="text-sm text-slate-600">
        O passo a passo de cada parte do Atalaia: para que serve e como usar. Algumas telas só aparecem para quem tem
        permissão; se não encontrar algo no seu menu, fale com o gestor.
      </p>

      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-superficie shadow-sm">
        {SECOES.map((s) => {
          const Icone = s.icone;
          return (
            <li key={s.slug}>
              <Link
                href={`/e/${empresaId}/guia/${s.slug}`}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-slate-100"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Icone className="h-[18px] w-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{s.titulo}</span>
                  <span className="block text-sm text-slate-500">{s.resumo}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
