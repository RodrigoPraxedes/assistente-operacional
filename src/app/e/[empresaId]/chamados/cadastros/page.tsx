import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import type { Fornecedor } from "@/lib/types";
import { Aviso, Botao, Cartao, Input, Select, Titulo } from "@/components/ui";
import { salvarFornecedor } from "../actions";

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

  const { data: fornecedores } = await supabase.from("fornecedores").select("*").eq("empresa_id", empresaId).order("nome");
  const salvarF = salvarFornecedor.bind(null, empresaId);

  return (
    <div className="space-y-4">
      <Link href={`/e/${empresaId}/chamados`} className="text-sm text-slate-500">
        ← Chamados
      </Link>
      <Titulo>Fornecedores</Titulo>
      {erro && <Aviso>{erro}</Aviso>}

      <Aviso tipo="info">
        Equipamentos e móveis agora ficam em{" "}
        <Link href={`/e/${empresaId}/patrimonio`} className="font-medium underline">
          Patrimônio
        </Link>
        , com a trajetória de cada item.
      </Aviso>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Fornecedores</h2>
        <ul className="space-y-2">
          {((fornecedores ?? []) as Fornecedor[]).map((f) => (
            <li key={f.id}>
              <form action={salvarF} className={`flex flex-wrap items-center gap-2 text-sm ${f.ativo ? "" : "opacity-60"}`}>
                <input type="hidden" name="id" value={f.id} />
                <Input name="nome" defaultValue={f.nome} required className="w-44 flex-1" />
                <Input name="especialidade" defaultValue={f.especialidade ?? ""} placeholder="Especialidade" className="w-36" />
                <Input name="telefone" defaultValue={f.telefone ?? ""} placeholder="WhatsApp" className="w-36" inputMode="tel" />
                <Select name="ativo" defaultValue={String(f.ativo)} className="w-24">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </Select>
                <Botao variante="secundario" className="px-2 py-1">
                  Salvar
                </Botao>
              </form>
            </li>
          ))}
        </ul>
        <form action={salvarF} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <Input name="nome" placeholder="Novo fornecedor" required className="w-44 flex-1" />
          <Input name="especialidade" placeholder="Ex.: refrigeração" className="w-36" />
          <Input name="telefone" placeholder="WhatsApp com DDD" className="w-36" inputMode="tel" />
          <Botao variante="secundario">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}
