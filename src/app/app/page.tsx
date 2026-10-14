import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ehAdminMaster } from "@/lib/contexto";
import { Cartao, Etiqueta } from "@/components/ui";
import type { SituacaoEmpresa } from "@/lib/types";
import { FormEmpresa } from "./form-empresa";

interface MinhaEmpresa {
  id: string;
  nome: string;
  cargo: string | null;
  situacao: SituacaoEmpresa;
  motivo_suspensao: string | null;
}

export default async function EscolherEmpresa({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const { nova } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  // vincula cadastros feitos por empresas com o mesmo e-mail
  await supabase.rpc("vincular_convites");

  const [{ data }, admin] = await Promise.all([supabase.rpc("minhas_empresas"), ehAdminMaster()]);
  const empresas = (data ?? []) as MinhaEmpresa[];
  const liberadas = empresas.filter((e) => e.situacao === "ativa" || admin);
  if (empresas.length === 1 && liberadas.length === 1 && !nova && !admin) redirect(`/e/${liberadas[0].id}/tarefas`);

  return (
    <main className="mx-auto max-w-lg space-y-6 p-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Suas empresas</h1>
        <form action="/sair" method="post">
          <button className="text-sm text-slate-500 hover:text-slate-800">Sair</button>
        </form>
      </div>

      {admin && (
        <Link
          href="/admin"
          className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800 hover:border-blue-400"
        >
          <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden />
          <span>
            <span className="block font-medium">Painel Admin Master</span>
            <span className="text-sm">Todas as empresas, aprovações, suspensões e limite de unidades</span>
          </span>
        </Link>
      )}

      {empresas.length > 0 && (
        <ul className="space-y-2">
          {empresas.map((e) => {
            const conteudo = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{e.nome}</p>
                  {e.situacao === "pendente" && <Etiqueta cor="#d97706">Aguardando aprovação</Etiqueta>}
                  {e.situacao === "suspensa" && <Etiqueta cor="#dc2626">Suspensa</Etiqueta>}
                </div>
                {e.cargo && <p className="text-sm text-slate-500">{e.cargo}</p>}
                {e.situacao === "pendente" && !admin && (
                  <p className="mt-1 text-sm text-slate-500">O cadastro foi recebido e será liberado pelo administrador do sistema.</p>
                )}
                {e.situacao === "suspensa" && !admin && (
                  <p className="mt-1 text-sm text-red-700">
                    O acesso desta empresa está suspenso{e.motivo_suspensao ? `: ${e.motivo_suspensao}` : ""}. Fale com o administrador do sistema.
                  </p>
                )}
              </>
            );
            return (
              <li key={e.id}>
                {e.situacao === "ativa" || admin ? (
                  <Link
                    href={`/e/${e.id}/tarefas`}
                    className="block rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm hover:border-blue-400"
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm">{conteudo}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Cartao>
        <h2 className="mb-1 font-medium">{empresas.length ? "Cadastrar outra empresa" : "Cadastre sua empresa"}</h2>
        {!admin && (
          <p className="mb-3 text-sm text-slate-500">A empresa fica aguardando aprovação do administrador antes de ser liberada.</p>
        )}
        <FormEmpresa />
      </Cartao>
    </main>
  );
}
