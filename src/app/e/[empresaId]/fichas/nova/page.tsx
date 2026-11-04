import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import { Aviso, Cartao, Titulo } from "@/components/ui";
import { salvarFicha } from "../actions";
import type { Bloco } from "../blocos";
import { FormFicha } from "../form-ficha";
import { FormFichaMontada } from "../form-ficha-montada";

export default async function NovaFicha({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string; tipo?: string; de?: string; salvo?: string }>;
}) {
  const { empresaId } = await params;
  const { erro, tipo, de, salvo } = await searchParams;
  const montada = tipo === "montada";
  const { supabase } = await exigirPermissao(empresaId, "fichas.gerenciar");
  const { data: categorias } = await supabase
    .from("ficha_categorias")
    .select("id, nome")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("nome");
  // Duplicar: parte de outra ficha montada (título "Cópia de ...", mesma foto)
  const { data: origem } = de
    ? await supabase
        .from("fichas")
        .select("titulo, descricao, categoria_id, blocos, foto_path")
        .eq("id", de)
        .eq("empresa_id", empresaId)
        .eq("tipo", "montada")
        .maybeSingle<{ titulo: string; descricao: string | null; categoria_id: string | null; blocos: Bloco[]; foto_path: string | null }>()
    : { data: null };
  const modelo = origem ? { ...origem, titulo: `Cópia de ${origem.titulo}` } : undefined;
  const fotoUrl = origem?.foto_path
    ? (await supabase.storage.from("fichas").createSignedUrl(origem.foto_path, 3600)).data?.signedUrl ?? null
    : null;
  const base = `/e/${empresaId}/fichas/nova`;
  const aba = (ativa: boolean) =>
    `flex-1 rounded-md px-3 py-2 text-center text-sm font-medium transition-colors ${
      ativa ? "bg-superficie text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
    }`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/fichas`, rotulo: "Fichas" }}>Nova ficha</Titulo>
      <nav aria-label="Tipo de ficha" className="flex gap-1 rounded-lg bg-slate-100 p-1">
        <Link href={base} className={aba(!montada)} aria-current={!montada ? "page" : undefined}>
          Enviar PDF
        </Link>
        <Link href={`${base}?tipo=montada`} className={aba(montada)} aria-current={montada ? "page" : undefined}>
          Montar no Atalaia
        </Link>
      </nav>
      {erro && <Aviso>{erro}</Aviso>}
      {origem && (
        <Aviso tipo={salvo ? "sucesso" : "info"}>
          {salvo ? "Ficha salva. " : ""}Esta ficha nova começou como cópia de “{origem.titulo}”. Ajuste o que mudar e salve.
        </Aviso>
      )}
      <Cartao className="p-4">
        {montada ? (
          <FormFichaMontada
            key={de ?? "nova"}
            empresaId={empresaId}
            acao={salvarFicha.bind(null, empresaId)}
            categorias={categorias ?? []}
            modelo={modelo}
            fotoUrl={fotoUrl}
          />
        ) : (
          <FormFicha empresaId={empresaId} acao={salvarFicha.bind(null, empresaId)} categorias={categorias ?? []} />
        )}
      </Cartao>
    </div>
  );
}
