"use client";

import Link from "next/link";
import { useActionState } from "react";
import { entrar } from "../actions";
import { Aviso, Campo, Input } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

export function FormEntrar({ voltar }: { voltar?: string }) {
  const [estado, acao] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="space-y-4 rounded-xl border border-slate-200 bg-superficie p-6 shadow-sm">
      <input type="hidden" name="voltar" value={voltar ?? ""} />
      <Campo rotulo="E-mail">
        <Input name="email" type="email" autoComplete="email" required />
      </Campo>
      <Campo rotulo="Senha">
        <Input name="senha" type="password" autoComplete="current-password" required />
      </Campo>
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar className="w-full" pendente="Entrando...">
        Entrar
      </BotaoEnviar>
      <p className="text-center text-sm text-slate-600">
        Não tem conta?{" "}
        <Link href="/cadastrar" className="font-medium text-blue-600">
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}
