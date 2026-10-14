"use client";

import { useState } from "react";
import { BotaoEnviar } from "@/components/botao-enviar";
import { Campo, Select, Textarea } from "@/components/ui";

interface Props {
  acao: (form: FormData) => void;
  pedidoId: string;
  conexoes: { id: string; rotulo: string }[];
  contatos: { id: string; rotulo: string }[];
  textoInicial: string;
  teste: boolean;
}

// Novo aviso: destinatário, texto e a prévia de como chega no WhatsApp
export function FormAviso({ acao, pedidoId, conexoes, contatos, textoInicial, teste }: Props) {
  const [texto, setTexto] = useState(textoInicial);
  return (
    <form action={acao} className="space-y-3">
      <input type="hidden" name="pedido_id" value={pedidoId} />
      <input type="hidden" name="origem" value={teste ? "teste" : "manual"} />
      {conexoes.length > 1 ? (
        <Campo rotulo="Enviar pelo número de">
          <Select name="conexao_id" required>
            {conexoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </Select>
        </Campo>
      ) : (
        <input type="hidden" name="conexao_id" value={conexoes[0]?.id} />
      )}
      <Campo rotulo="Destinatário">
        <Select name="contato_id" required>
          {contatos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo rotulo="Mensagem" dica={`${texto.length}/2000 · *negrito* funciona como no WhatsApp`}>
        <Textarea name="texto" rows={5} maxLength={2000} required value={texto} onChange={(e) => setTexto(e.target.value)} />
      </Campo>
      {texto.trim() && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-500">Prévia</p>
          <div className="rounded-xl bg-slate-100 p-3">
            <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none bg-green-50 px-3 py-2 text-sm whitespace-pre-wrap text-slate-900 shadow-sm">
              {previa(texto)}
            </div>
          </div>
        </div>
      )}
      <BotaoEnviar pendente="Salvando...">Salvar rascunho</BotaoEnviar>
    </form>
  );
}

// *negrito* do WhatsApp na prévia
function previa(texto: string) {
  return texto.split(/(\*[^*\n]+\*)/g).map((parte, i) =>
    /^\*[^*\n]+\*$/.test(parte) ? <strong key={i}>{parte.slice(1, -1)}</strong> : parte,
  );
}
