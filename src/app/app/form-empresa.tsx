"use client";

import { useActionState } from "react";
import { criarEmpresa } from "./actions";
import { Aviso, Campo, Input } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

export function FormEmpresa() {
  const [estado, acao] = useActionState(criarEmpresa, undefined);
  return (
    <form action={acao} className="space-y-3">
      <Campo rotulo="Nome da empresa">
        <Input name="nome" placeholder="Ex.: Mercado Souza" required />
      </Campo>
      <Campo rotulo="Primeira unidade" dica="Se for uma empresa só, deixe Matriz. Dá para adicionar outras depois.">
        <Input name="unidade" placeholder="Matriz" />
      </Campo>
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar pendente="Criando...">Criar empresa</BotaoEnviar>
    </form>
  );
}
