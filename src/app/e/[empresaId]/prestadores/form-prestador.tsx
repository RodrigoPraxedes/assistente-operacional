import type { Fornecedor, TipoServico } from "@/lib/types";
import { formatarTelefone } from "@/lib/formato";
import { Botao, Campo, Cartao, Input, LinkBotao, Select } from "@/components/ui";
import { salvarPrestador } from "./actions";

export function FormPrestador({
  empresaId,
  prestador,
  tipos,
  marcados,
}: {
  empresaId: string;
  prestador?: Fornecedor;
  tipos: TipoServico[];
  marcados: string[];
}) {
  const salvar = salvarPrestador.bind(null, empresaId);
  const visiveis = tipos.filter((t) => t.ativo || marcados.includes(t.id));

  return (
    <form action={salvar}>
      <Cartao className="space-y-4">
        {prestador && <input type="hidden" name="id" value={prestador.id} />}
        <Campo rotulo="Nome">
          <Input name="nome" defaultValue={prestador?.nome ?? ""} required placeholder="Ex.: João Eletricista" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Telefone 1" dica="Com DDD. É o que abre no WhatsApp.">
            <Input
              name="telefone"
              defaultValue={formatarTelefone(prestador?.telefone)}
              required
              inputMode="tel"
              placeholder="(21) 99999-9999"
            />
          </Campo>
          <Campo rotulo="Telefone 2 (opcional)">
            <Input name="telefone2" defaultValue={formatarTelefone(prestador?.telefone2)} inputMode="tel" />
          </Campo>
        </div>
        <Campo rotulo="E-mail (opcional)">
          <Input name="email" type="email" defaultValue={prestador?.email ?? ""} />
        </Campo>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Tipos de serviço</legend>
          <div className="grid grid-cols-1 gap-1 min-[420px]:grid-cols-2 sm:grid-cols-3">
            {visiveis.map((t) => (
              <label key={t.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-slate-700 hover:bg-slate-100 sm:min-h-9">
                <input type="checkbox" name="tipos" value={t.id} defaultChecked={marcados.includes(t.id)} className="h-4 w-4" />
                {t.nome}
              </label>
            ))}
          </div>
          <Input name="novo_tipo" placeholder="Outro serviço (ex.: Vidraceiro)" className="sm:w-72" aria-label="Outro serviço" />
          <p className="text-xs text-slate-500">O serviço digitado aqui entra na lista para os próximos cadastros.</p>
        </fieldset>

        {prestador && (
          <Campo rotulo="Situação">
            <Select name="ativo" defaultValue={String(prestador.ativo)} className="sm:w-48">
              <option value="true">Ativo</option>
              <option value="false">Inativo (não aparece nos chamados)</option>
            </Select>
          </Campo>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Botao>Salvar</Botao>
          <LinkBotao variante="secundario" href={`/e/${empresaId}/prestadores`}>
            Cancelar
          </LinkBotao>
        </div>
      </Cartao>
    </form>
  );
}
