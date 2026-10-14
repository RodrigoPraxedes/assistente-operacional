import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import type { Equipamento } from "@/lib/types";
import { Aviso, Botao, Cartao, Input, Select, Titulo } from "@/components/ui";
import { salvarEquipamento } from "../actions";

export default async function Cadastros({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "chamados.gerenciar");

  const [{ data: equipamentos }, { data: unidades }, { data: contagem }] = await Promise.all([
    supabase.from("equipamentos").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("chamados").select("equipamento_id").eq("empresa_id", empresaId).not("equipamento_id", "is", null),
  ]);
  const qtd = new Map<string, number>();
  for (const c of contagem ?? []) qtd.set(c.equipamento_id!, (qtd.get(c.equipamento_id!) ?? 0) + 1);
  const salvarE = salvarEquipamento.bind(null, empresaId);

  const seletorUnidade = (valor?: string | null) => (
    <Select name="unidade_id" defaultValue={valor ?? ""} className="w-36">
      <option value="">Sem unidade</option>
      {(unidades ?? []).map((u) => (
        <option key={u.id} value={u.id}>
          {u.nome}
        </option>
      ))}
    </Select>
  );

  return (
    <div className="space-y-4">
      <Link href={`/e/${empresaId}/chamados`} className="text-sm text-slate-500">
        ← Chamados
      </Link>
      <Titulo>Equipamentos</Titulo>
      {erro && <Aviso>{erro}</Aviso>}

      <Cartao className="space-y-3">
        <h2 className="font-medium">Equipamentos</h2>
        <p className="text-xs text-slate-500">
          Com o equipamento no chamado, dá para ver todo o histórico de manutenção dele. Os prestadores de serviço ficam
          em{" "}
          <Link href={`/e/${empresaId}/prestadores`} className="text-blue-600">
            Prestadores
          </Link>
          .
        </p>
        <ul className="space-y-2">
          {((equipamentos ?? []) as Equipamento[]).map((e) => (
            <li key={e.id}>
              <form action={salvarE} className={`flex flex-wrap items-center gap-2 text-sm ${e.ativo ? "" : "opacity-60"}`}>
                <input type="hidden" name="id" value={e.id} />
                <Input name="nome" defaultValue={e.nome} required className="w-44 flex-1" />
                <Input name="codigo" defaultValue={e.codigo ?? ""} placeholder="Patrimônio/série" className="w-32" />
                <Input name="marca" defaultValue={e.marca ?? ""} placeholder="Marca" className="w-28" />
                {seletorUnidade(e.unidade_id)}
                <Select name="ativo" defaultValue={String(e.ativo)} className="w-24">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </Select>
                <Botao variante="secundario" className="px-2 py-1">
                  Salvar
                </Botao>
                <Link href={`/e/${empresaId}/chamados?equipamento=${e.id}`} className="text-xs text-blue-600">
                  {qtd.get(e.id) ?? 0} chamado(s)
                </Link>
              </form>
            </li>
          ))}
        </ul>
        <form action={salvarE} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Input name="nome" placeholder="Novo equipamento (ex.: Freezer 1)" required className="w-44 flex-1" />
          <Input name="codigo" placeholder="Patrimônio/série" className="w-32" />
          <Input name="marca" placeholder="Marca" className="w-28" />
          {seletorUnidade()}
          <Botao variante="secundario">Adicionar</Botao>
        </form>
      </Cartao>

    </div>
  );
}
