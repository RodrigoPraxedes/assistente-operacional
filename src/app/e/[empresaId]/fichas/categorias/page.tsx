import { exigirPermissao } from "@/lib/contexto";
import { Aviso, Botao, Cartao, Input, Select, Titulo } from "@/components/ui";
import { salvarCategoria } from "../actions";

export default async function CategoriasFichas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "fichas.gerenciar");
  const [{ data: categorias }, { data: usos }] = await Promise.all([
    supabase.from("ficha_categorias").select("id, nome, ativo").eq("empresa_id", empresaId).order("ativo", { ascending: false }).order("nome"),
    supabase.from("fichas").select("categoria_id").eq("empresa_id", empresaId),
  ]);
  const qtd = new Map<string, number>();
  for (const u of usos ?? []) if (u.categoria_id) qtd.set(u.categoria_id, (qtd.get(u.categoria_id) ?? 0) + 1);
  const salvar = salvarCategoria.bind(null, empresaId);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/fichas`, rotulo: "Fichas" }}>Categorias de fichas</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao className="p-4">
        <form action={salvar} className="flex gap-2">
          <Input name="nome" required placeholder="Nova categoria (ex.: Equipamentos)" aria-label="Nome da nova categoria" />
          <Botao type="submit">Criar</Botao>
        </form>
      </Cartao>
      <div className="space-y-2">
        {(categorias ?? []).map((c) => (
          <Cartao key={c.id} className="p-3">
            <form action={salvar} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={c.id} />
              <Input name="nome" required defaultValue={c.nome} aria-label="Nome" className="min-w-0 flex-1" />
              <Select name="ativo" defaultValue={String(c.ativo)} className="w-auto" aria-label="Situação">
                <option value="true">Em uso</option>
                <option value="false">Fora de uso</option>
              </Select>
              <span className="text-xs text-slate-500">{qtd.get(c.id) ?? 0} ficha(s)</span>
              <Botao type="submit" variante="secundario">
                Salvar
              </Botao>
            </form>
          </Cartao>
        ))}
      </div>
    </div>
  );
}
