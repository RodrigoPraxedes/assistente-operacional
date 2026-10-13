import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import type { Turno } from "@/lib/types";
import { Aviso, Botao, Cartao, Input, Select, Titulo } from "@/components/ui";
import { salvarTurno } from "../actions";

export default async function Turnos({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "escalas.editar");

  const [{ data: turnos }, { data: unidades }] = await Promise.all([
    supabase.from("turnos").select("*").eq("empresa_id", empresaId).order("inicio"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  const salvar = salvarTurno.bind(null, empresaId);
  const variasUnidades = (unidades?.length ?? 0) > 1;

  const seletorUnidade = (valor?: string | null) =>
    variasUnidades ? (
      <Select name="unidade_id" defaultValue={valor ?? ""} className="w-40" aria-label="Unidade">
        <option value="">Todas as unidades</option>
        {unidades!.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nome}
          </option>
        ))}
      </Select>
    ) : (
      <input type="hidden" name="unidade_id" value={valor ?? ""} />
    );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/e/${empresaId}/escalas`} className="text-sm text-slate-500">
        ← Escalas
      </Link>
      <Titulo>Turnos</Titulo>
      {erro && <Aviso>{erro}</Aviso>}

      <Cartao className="space-y-3">
        <p className="text-sm text-slate-500">
          Os horários de trabalho que aparecem na grade. Se o fim for antes do início (ex.: 22:00 às 06:00), o turno
          termina no dia seguinte.
        </p>
        <ul className="space-y-2">
          {((turnos ?? []) as Turno[]).map((t) => (
            <li key={t.id}>
              <form action={salvar} className={`flex flex-wrap items-center gap-2 text-sm ${t.ativo ? "" : "opacity-60"}`}>
                <input type="hidden" name="id" value={t.id} />
                <input
                  type="color"
                  name="cor"
                  defaultValue={t.cor}
                  aria-label="Cor"
                  className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-superficie p-1"
                />
                <Input name="nome" defaultValue={t.nome} required aria-label="Nome" className="w-36 flex-1" />
                <Input type="time" name="inicio" defaultValue={t.inicio.slice(0, 5)} required aria-label="Início" className="w-28" />
                <span className="text-slate-400">às</span>
                <Input type="time" name="fim" defaultValue={t.fim.slice(0, 5)} required aria-label="Fim" className="w-28" />
                {seletorUnidade(t.unidade_id)}
                <Select name="ativo" defaultValue={String(t.ativo)} className="w-28" aria-label="Situação">
                  <option value="true">Em uso</option>
                  <option value="false">Fora de uso</option>
                </Select>
                <Botao variante="secundario">Salvar</Botao>
              </form>
            </li>
          ))}
        </ul>
        <form action={salvar} className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
          <input
            type="color"
            name="cor"
            defaultValue="#2563eb"
            aria-label="Cor"
            className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-superficie p-1"
          />
          <Input name="nome" placeholder="Novo turno (ex.: Abertura)" required aria-label="Nome" className="w-36 flex-1" />
          <Input type="time" name="inicio" defaultValue="06:00" required aria-label="Início" className="w-28" />
          <span className="text-slate-400">às</span>
          <Input type="time" name="fim" defaultValue="14:00" required aria-label="Fim" className="w-28" />
          {seletorUnidade()}
          <Botao variante="secundario">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}
