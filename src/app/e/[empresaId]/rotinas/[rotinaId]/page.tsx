import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import { DIAS_SEMANA } from "@/lib/rotinas";
import type { Rotina } from "@/lib/types";
import { SeletorSetores } from "@/components/seletor-setores";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Aviso, Botao, Campo, Cartao, Input, Select, Textarea, Titulo } from "@/components/ui";
import { excluirRotina, salvarRotina } from "../actions";

export default async function EditarRotina({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; rotinaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, rotinaId } = await params;
  const { erro } = await searchParams;
  const { supabase } = await exigirPermissao(empresaId, "rotinas.editar");
  const novo = rotinaId === "novo";

  const [{ data: rotina }, { data: setores }, { data: funcoes }, { data: unidades }] = await Promise.all([
    novo
      ? Promise.resolve({ data: null })
      : supabase.from("rotinas").select("*").eq("id", rotinaId).eq("empresa_id", empresaId).maybeSingle<Rotina>(),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("funcoes").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  if (!novo && !rotina) notFound();
  const r = rotina as Rotina | null;
  const dias = new Set(r?.dias ?? DIAS_SEMANA.map((d) => d.n));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/rotinas`, rotulo: "Rotinas" }}>{novo ? "Nova rotina" : r!.nome}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      <Cartao>
        <form action={salvarRotina.bind(null, empresaId)} className="space-y-4">
          {r && <input type="hidden" name="id" value={r.id} />}
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Campo rotulo="Atividade">
              <Input name="nome" defaultValue={r?.nome} required placeholder="Ex.: Abrir o caixa" />
            </Campo>
            <Campo rotulo="Horário">
              <Input name="horario" type="time" defaultValue={r?.horario.slice(0, 5)} required />
            </Campo>
          </div>

          <Campo rotulo="Instrução e passo a passo" dica="Um passo por linha; aparecem numerados.">
            <Textarea
              name="descricao"
              rows={7}
              defaultValue={r?.descricao ?? ""}
              placeholder={"Ligar a chapa e a fritadeira\nConferir o estoque do dia\nAbastecer as bancadas"}
            />
          </Campo>

          <SeletorSetores name="setor_ids" setores={setores ?? []} inicial={r?.setor_ids ?? []} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Função" dica="Quem responde pela atividade (cadastre em Configurações › Geral).">
              <Select name="funcao_id" defaultValue={r?.funcao_id ?? ""}>
                <option value="">—</option>
                {(funcoes ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            {(unidades ?? []).length > 1 && (
              <Campo rotulo="Unidade">
                <Select name="unidade_id" defaultValue={r?.unidade_id ?? ""}>
                  <option value="">Todas as unidades</option>
                  {(unidades ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
            )}
            {r && (
              <Campo rotulo="Situação">
                <Select name="ativo" defaultValue={String(r.ativo)}>
                  <option value="true">Ativa</option>
                  <option value="false">Inativa</option>
                </Select>
              </Campo>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Dias da semana</legend>
            <div className="flex flex-wrap gap-3">
              {DIAS_SEMANA.map((d) => (
                <label key={d.n} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="dias" value={d.n} defaultChecked={dias.has(d.n)} /> {d.curto}
                </label>
              ))}
            </div>
          </fieldset>

          <Botao>Salvar</Botao>
        </form>
      </Cartao>

      {r && (
        <form action={excluirRotina.bind(null, empresaId, r.id)}>
          <BotaoConfirmar mensagem={`Excluir a rotina "${r.nome}"?`} className="text-sm text-red-600">
            Excluir rotina
          </BotaoConfirmar>
        </form>
      )}
    </div>
  );
}
