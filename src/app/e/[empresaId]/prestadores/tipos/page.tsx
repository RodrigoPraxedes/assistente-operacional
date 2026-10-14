import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import type { TipoServico } from "@/lib/types";
import { Aviso, Botao, Cartao, Input, Select, Titulo } from "@/components/ui";
import { salvarTipoServico } from "../actions";

export default async function TiposServico({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "prestadores.gerenciar");

  const [{ data: tipos }, { data: usos }] = await Promise.all([
    supabase
      .from("tipos_servico")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("ativo", { ascending: false })
      .order("nome")
      .returns<TipoServico[]>(),
    supabase.from("fornecedor_tipos").select("tipo_id").eq("empresa_id", empresaId),
  ]);
  const qtd = new Map<string, number>();
  for (const u of usos ?? []) qtd.set(u.tipo_id, (qtd.get(u.tipo_id) ?? 0) + 1);
  const salvar = salvarTipoServico.bind(null, empresaId);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link href={`/e/${empresaId}/prestadores`} className="text-sm text-slate-500">
        ← Prestadores
      </Link>
      <Titulo>Tipos de serviço</Titulo>
      {erro && <Aviso>{erro}</Aviso>}

      <Cartao className="space-y-3">
        <p className="text-sm text-slate-500">
          Os serviços que aparecem para marcar no cadastro do prestador. Um serviço fora de uso some da lista, mas continua
          nos prestadores que já o tinham.
        </p>
        <ul className="space-y-2">
          {(tipos ?? []).map((t) => (
            <li key={t.id}>
              <form action={salvar} className={`flex flex-wrap items-center gap-2 text-sm ${t.ativo ? "" : "opacity-60"}`}>
                <input type="hidden" name="id" value={t.id} />
                <Input name="nome" defaultValue={t.nome} required aria-label="Nome do serviço" className="w-44 flex-1" />
                <span className="w-24 text-xs text-slate-500">{qtd.get(t.id) ?? 0} prestador(es)</span>
                <Select name="ativo" defaultValue={String(t.ativo)} className="w-32" aria-label="Situação">
                  <option value="true">Em uso</option>
                  <option value="false">Fora de uso</option>
                </Select>
                <Botao variante="secundario">Salvar</Botao>
              </form>
            </li>
          ))}
        </ul>
        <form action={salvar} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Input name="nome" placeholder="Novo serviço (ex.: Vidraceiro)" required aria-label="Novo serviço" className="w-44 flex-1" />
          <Botao variante="secundario">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}
