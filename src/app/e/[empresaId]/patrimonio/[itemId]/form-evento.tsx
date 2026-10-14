"use client";

import { useActionState, useState } from "react";
import { registrarEvento } from "../actions";
import { EVENTOS_PATRIMONIO, SITUACOES_PATRIMONIO, type TipoEventoPatrimonio } from "@/lib/types";
import { Aviso, Campo, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

type Opcao = { id: string; nome: string };

// Registra um acontecimento na trajetória do item. Venda e aposentadoria tiram o
// item de uso; mudança de unidade e de situação atualizam o cadastro.
export function FormEvento({
  empresaId,
  itemId,
  hoje,
  unidades,
  unidadeAtual,
  baixado,
}: {
  empresaId: string;
  itemId: string;
  hoje: string;
  unidades: Opcao[];
  unidadeAtual: string | null;
  baixado: boolean;
}) {
  const [estado, acao] = useActionState(registrarEvento.bind(null, empresaId, itemId), undefined);
  const [tipo, setTipo] = useState<TipoEventoPatrimonio>(baixado ? "situacao" : "manutencao");
  const tipos = (Object.keys(EVENTOS_PATRIMONIO) as TipoEventoPatrimonio[]).filter(
    (t) => !baixado || t === "situacao" || t === "observacao",
  );
  const comValor = tipo === "manutencao" || tipo === "venda";

  return (
    <form action={acao} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="O que aconteceu">
          <Select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoEventoPatrimonio)}>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {EVENTOS_PATRIMONIO[t]}
              </option>
            ))}
          </Select>
        </Campo>
        <Campo rotulo="Data">
          <Input name="data" type="date" defaultValue={hoje} required />
        </Campo>
        {tipo === "transferencia" && (
          <Campo rotulo="Para a unidade">
            <Select name="unidade_id" required defaultValue="">
              <option value="" disabled>
                Escolha...
              </option>
              {unidades
                .filter((u) => u.id !== unidadeAtual)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
            </Select>
          </Campo>
        )}
        {tipo === "situacao" && (
          <Campo rotulo="Nova situação">
            <Select name="situacao" required defaultValue="em_uso">
              {(["em_uso", "em_manutencao", "parado"] as const).map((k) => (
                <option key={k} value={k}>
                  {SITUACOES_PATRIMONIO[k].rotulo}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        {comValor && (
          <Campo rotulo={tipo === "venda" ? "Valor da venda (R$)" : "Custo (R$)"}>
            <Input name="valor" type="number" step="0.01" min="0" />
          </Campo>
        )}
      </div>
      <Campo rotulo="Descrição">
        <Textarea
          name="descricao"
          rows={2}
          required={tipo === "manutencao" || tipo === "observacao"}
          placeholder={
            tipo === "manutencao"
              ? "Ex.: troca do compressor pela Refrigeração Silva"
              : tipo === "venda"
                ? "Para quem foi vendido"
                : tipo === "aposentadoria"
                  ? "Motivo da baixa (ex.: quebrado sem conserto, descartado)"
                  : ""
          }
        />
      </Campo>
      {(tipo === "venda" || tipo === "aposentadoria") && (
        <p className="text-xs text-slate-500">O item sai de uso e deixa de aparecer na abertura de chamados.</p>
      )}
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar variante="secundario">Registrar</BotaoEnviar>
    </form>
  );
}
