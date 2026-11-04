import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { Aviso, Botao, Cartao, LinkBotao, Titulo } from "@/components/ui";
import { excluirFicha, salvarFicha } from "../actions";
import type { Bloco } from "../blocos";
import { FormFicha } from "../form-ficha";
import { FormFichaMontada } from "../form-ficha-montada";

export default async function EditarFicha({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; fichaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, fichaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "fichas.gerenciar");
  const [{ data: ficha }, { data: categorias }] = await Promise.all([
    supabase
      .from("fichas")
      .select("id, tipo, titulo, descricao, categoria_id, nome_arquivo, foto_path, blocos")
      .eq("id", fichaId)
      .eq("empresa_id", empresaId)
      .maybeSingle<{
        id: string;
        tipo: string;
        titulo: string;
        descricao: string | null;
        categoria_id: string | null;
        nome_arquivo: string | null;
        foto_path: string | null;
        blocos: Bloco[];
      }>(),
    supabase.from("ficha_categorias").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  if (!ficha) notFound();
  const montada = ficha.tipo === "montada";
  const fotoUrl = ficha.foto_path
    ? (await supabase.storage.from("fichas").createSignedUrl(ficha.foto_path, 3600)).data?.signedUrl ?? null
    : null;
  const acao = salvarFicha.bind(null, empresaId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo
        voltar={{ href: `/e/${empresaId}/fichas`, rotulo: "Fichas" }}
        acoes={
          montada && (
            <LinkBotao variante="secundario" href={`/e/${empresaId}/fichas/${fichaId}/ver`}>
              Ver ficha
            </LinkBotao>
          )
        }
      >
        Editar ficha
      </Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao className="p-4">
        {montada ? (
          <FormFichaMontada empresaId={empresaId} acao={acao} categorias={categorias ?? []} ficha={ficha} fotoUrl={fotoUrl} />
        ) : (
          <FormFicha empresaId={empresaId} acao={acao} categorias={categorias ?? []} ficha={ficha} />
        )}
      </Cartao>
      <form action={excluirFicha.bind(null, empresaId, fichaId)}>
        <Botao type="submit" variante="perigo">
          Apagar ficha
        </Botao>
      </form>
    </div>
  );
}
