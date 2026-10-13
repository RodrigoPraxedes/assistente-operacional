import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Cartao } from "@/components/ui";
import { FormEmpresa } from "./form-empresa";

export default async function EscolherEmpresa({ searchParams }: { searchParams: Promise<{ nova?: string }> }) {
  const { nova } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  // vincula cadastros feitos por empresas com o mesmo e-mail
  await supabase.rpc("vincular_convites");

  const { data: vinculos } = await supabase
    .from("membros")
    .select("cargo, empresas(id, nome)")
    .eq("usuario_id", user.id)
    .eq("ativo", true)
    .returns<{ cargo: string | null; empresas: { id: string; nome: string } | null }[]>();

  const empresas = (vinculos ?? []).filter((v) => v.empresas);
  if (empresas.length === 1 && !nova) redirect(`/e/${empresas[0].empresas!.id}/tarefas`);

  return (
    <main className="mx-auto max-w-lg space-y-6 p-4 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Suas empresas</h1>
        <form action="/sair" method="post">
          <button className="text-sm text-slate-500 hover:text-slate-800">Sair</button>
        </form>
      </div>

      {empresas.length > 0 && (
        <ul className="space-y-2">
          {empresas.map((v) => (
            <li key={v.empresas!.id}>
              <Link
                href={`/e/${v.empresas!.id}/tarefas`}
                className="block rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm hover:border-blue-400"
              >
                <p className="font-medium">{v.empresas!.nome}</p>
                {v.cargo && <p className="text-sm text-slate-500">{v.cargo}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Cartao>
        <h2 className="mb-3 font-medium">{empresas.length ? "Cadastrar outra empresa" : "Cadastre sua empresa"}</h2>
        <FormEmpresa />
      </Cartao>
    </main>
  );
}
