"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cadastrar } from "../actions";
import { Aviso, Campo, Input } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

export default function PaginaCadastrar() {
  const [estado, acao] = useActionState(cadastrar, undefined);
  if (estado?.mensagem) {
    return <Aviso tipo="sucesso">{estado.mensagem}</Aviso>;
  }
  return (
    <form action={acao} className="space-y-4 rounded-xl border border-slate-200 bg-superficie p-6 shadow-sm">
      <Campo rotulo="Seu nome">
        <Input name="nome" autoComplete="name" required />
      </Campo>
      <Campo rotulo="E-mail" dica="Se você foi cadastrado por uma empresa, use o mesmo e-mail para entrar já vinculado a ela.">
        <Input name="email" type="email" autoComplete="email" required />
      </Campo>
      <Campo rotulo="Senha">
        <Input name="senha" type="password" autoComplete="new-password" minLength={8} required />
      </Campo>
      {estado?.erro && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar className="w-full" pendente="Criando conta...">
        Criar conta
      </BotaoEnviar>
      <p className="text-center text-sm text-slate-600">
        Já tem conta?{" "}
        <Link href="/entrar" className="font-medium text-blue-600">
          Entrar
        </Link>
      </p>
    </form>
  );
}
