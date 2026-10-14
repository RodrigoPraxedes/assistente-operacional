"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import type { EstadoImportacao, EstadoLeitura } from "./tipos";

// Importação em dois passos: envia a planilha e vê a prévia; depois confirma.
export function ImportarPlanilha({
  ler,
  importar,
  modeloHref,
  voltarHref,
  instrucoes,
}: {
  ler: (estado: EstadoLeitura, form: FormData) => Promise<EstadoLeitura>;
  importar: (estado: EstadoImportacao, form: FormData) => Promise<EstadoImportacao>;
  modeloHref: string;
  voltarHref: string;
  instrucoes: React.ReactNode;
}) {
  const [leitura, acaoLer] = useActionState(ler, undefined);
  const [resultado, acaoImportar] = useActionState(importar, undefined);

  if (resultado && "ok" in resultado) {
    return (
      <div className="space-y-3">
        <Aviso tipo="sucesso">{resultado.ok}</Aviso>
        <a href={voltarHref} className="text-sm text-blue-600">
          Ver a lista
        </a>
      </div>
    );
  }

  const previa = leitura && "previa" in leitura ? leitura.previa : null;

  return (
    <div className="space-y-4">
      <Cartao className="space-y-3">
        <div className="space-y-2 text-sm text-slate-600">{instrucoes}</div>
        <a href={modeloHref} className="inline-flex items-center gap-1 text-sm font-medium text-blue-600">
          <Download size={16} /> Baixar planilha-modelo
        </a>
        <form action={acaoLer} className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="arquivo"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="block text-sm"
          />
          <BotaoEnviar variante="secundario" pendente="Lendo...">
            Ler planilha
          </BotaoEnviar>
        </form>
        {leitura && "erro" in leitura && <Aviso>{leitura.erro}</Aviso>}
      </Cartao>

      {previa && (
        <Cartao className="space-y-3">
          <h2 className="font-medium">Prévia</h2>
          <ul className="list-disc pl-5 text-sm">
            {previa.resumo.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          {previa.avisos.length > 0 && (
            <details className="rounded-lg border border-slate-200 p-3 text-sm">
              <summary className="cursor-pointer text-slate-700">{previa.avisos.length} aviso(s)</summary>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">
                {previa.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  {previa.cabecalho.map((c) => (
                    <th key={c} className="px-2 py-1 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previa.linhas.map((l, i) => (
                  <tr key={i} className="border-t border-slate-200">
                    {l.map((c, j) => (
                      <td key={j} className="px-2 py-1">
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={acaoImportar} className="space-y-3">
            <input type="hidden" name="dados" value={previa.dados} />
            {resultado && "erro" in resultado && <Aviso>{resultado.erro}</Aviso>}
            <BotaoEnviar pendente="Importando...">Confirmar importação</BotaoEnviar>
          </form>
        </Cartao>
      )}
    </div>
  );
}
