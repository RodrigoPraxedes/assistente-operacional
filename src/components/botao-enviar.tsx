"use client";

import { useFormStatus } from "react-dom";
import { Botao } from "@/components/ui";
import type { ComponentProps } from "react";

export function BotaoEnviar({ children, pendente = "Salvando...", ...props }: ComponentProps<typeof Botao> & { pendente?: string }) {
  const { pending } = useFormStatus();
  return (
    <Botao type="submit" disabled={pending} {...props}>
      {pending ? pendente : children}
    </Botao>
  );
}
