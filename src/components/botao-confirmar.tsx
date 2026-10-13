"use client";

import type { ComponentProps } from "react";

// Botão de envio de formulário que pede confirmação antes (ex.: excluir)
export function BotaoConfirmar({ mensagem, ...props }: ComponentProps<"button"> & { mensagem: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!confirm(mensagem)) e.preventDefault();
      }}
    />
  );
}
