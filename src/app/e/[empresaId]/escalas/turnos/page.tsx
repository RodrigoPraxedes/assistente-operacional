import { exigirPermissao } from "@/lib/contexto";
import { ordenarTurnos } from "@/lib/escala";
import type { Turno } from "@/lib/types";
import { Aviso, Botao, Cartao, Input, Select, Titulo } from "@/components/ui";
import { salvarTurno } from "../actions";
import { CamposHorario } from "./campos-horario";

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
    supabase.from("turnos").select("*").eq("empresa_id", empresaId).order("nome"),
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
      <Titulo voltar={{ href: `/e/${empresaId}/escalas`, rotulo: "Escalas" }}>Turnos</Titulo>
      {erro && <Aviso>{erro}</Aviso>}

      <Cartao className="space-y-3">
        <p className="text-sm text-slate-500">
          Os horários de trabalho que aparecem na grade. Se o fim for antes do início (ex.: 22:00 às 06:00), o turno
          termina no dia seguinte. Quando o horário varia muito de um colaborador para outro, escolha só o período
          (manhã, tarde ou noite).
        </p>
        <ul className="space-y-2">
          {ordenarTurnos((turnos ?? []) as Turno[]).map((t) => (
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
                <CamposHorario periodo={t.periodo} inicio={t.inicio} fim={t.fim} />
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
          <CamposHorario />
          {seletorUnidade()}
          <Botao variante="secundario">Adicionar</Botao>
        </form>
      </Cartao>
    </div>
  );
}
