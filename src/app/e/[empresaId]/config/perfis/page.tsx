import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import { LinkBotao, Titulo } from "@/components/ui";

export default async function PaginaPerfis({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { supabase } = await exigirPermissao(empresaId, "config.perfis");
  const { data: perfis } = await supabase
    .from("perfis")
    .select("id, nome, descricao, perfil_permissoes(count), membros(count)")
    .eq("empresa_id", empresaId)
    .order("nome")
    .returns<{ id: string; nome: string; descricao: string | null; perfil_permissoes: { count: number }[]; membros: { count: number }[] }[]>();

  return (
    <div>
      <Titulo acoes={<LinkBotao href={`/e/${empresaId}/config/perfis/novo`}>Novo perfil</LinkBotao>}>Perfis de acesso</Titulo>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(perfis ?? []).map((p) => (
          <li key={p.id}>
            <Link
              href={`/e/${empresaId}/config/perfis/${p.id}`}
              className="block rounded-xl border border-slate-200 bg-superficie p-4 shadow-sm hover:border-blue-400"
            >
              <p className="font-medium">{p.nome}</p>
              {p.descricao && <p className="text-sm text-slate-500">{p.descricao}</p>}
              <p className="mt-2 text-xs text-slate-500">
                {p.perfil_permissoes[0]?.count ?? 0} permissões · {p.membros[0]?.count ?? 0} colaboradores
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
