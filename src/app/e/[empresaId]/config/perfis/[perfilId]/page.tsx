import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { ESCOPOS, type Escopo, type Permissao } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Titulo } from "@/components/ui";
import { excluirPerfil, salvarPerfil } from "../../actions";

export default async function EditarPerfil({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; perfilId: string }>;
  searchParams: Promise<{ erro?: string; salvo?: string }>;
}) {
  const { empresaId, perfilId } = await params;
  const { erro, salvo } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "config.perfis");
  const novo = perfilId === "novo";

  const [{ data: perfil }, { data: catalogo }, { data: marcadas }] = await Promise.all([
    novo
      ? Promise.resolve({ data: null })
      : supabase.from("perfis").select("*").eq("id", perfilId).eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("permissoes").select("*").order("ordem"),
    novo ? Promise.resolve({ data: [] }) : supabase.from("perfil_permissoes").select("permissao, escopo").eq("perfil_id", perfilId),
  ]);
  if (!novo && !perfil) notFound();

  const atual = new Map((marcadas ?? []).map((m) => [m.permissao, m.escopo as Escopo]));
  const porModulo = new Map<string, Permissao[]>();
  for (const p of (catalogo ?? []) as Permissao[]) {
    porModulo.set(p.modulo, [...(porModulo.get(p.modulo) ?? []), p]);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/e/${empresaId}/config/perfis`} className="text-sm text-slate-500">
        ← Perfis
      </Link>
      <Titulo>{novo ? "Novo perfil" : perfil!.nome}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {salvo && <Aviso tipo="sucesso">Salvo.</Aviso>}

      <form action={salvarPerfil.bind(null, empresaId)} className="space-y-4">
        {perfil && <input type="hidden" name="id" value={perfil.id} />}
        <Cartao className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Nome">
            <Input name="nome" defaultValue={perfil?.nome} required />
          </Campo>
          <Campo rotulo="Descrição">
            <Input name="descricao" defaultValue={perfil?.descricao ?? ""} />
          </Campo>
        </Cartao>

        {[...porModulo].map(([modulo, perms]) => (
          <Cartao key={modulo}>
            <h2 className="mb-2 font-medium">{modulo}</h2>
            <ul className="space-y-2">
              {perms.map((p) => (
                <li key={p.chave} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="permissoes" value={p.chave} defaultChecked={atual.has(p.chave)} />
                    {p.descricao}
                  </label>
                  {p.usa_escopo && (
                    <select
                      name={`escopo_${p.chave}`}
                      defaultValue={atual.get(p.chave) ?? "proprias"}
                      className="rounded border border-slate-200 bg-superficie px-2 py-1 text-xs"
                    >
                      {(Object.keys(ESCOPOS) as Escopo[]).map((e) => (
                        <option key={e} value={e}>
                          {ESCOPOS[e]}
                        </option>
                      ))}
                    </select>
                  )}
                </li>
              ))}
            </ul>
          </Cartao>
        ))}

        <div className="flex justify-between">
          <Botao>Salvar perfil</Botao>
          {perfil && (
            <Botao variante="perigo" formAction={excluirPerfil.bind(null, empresaId, perfil.id)} formNoValidate>
              Excluir perfil
            </Botao>
          )}
        </div>
      </form>
    </div>
  );
}
