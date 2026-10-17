"use client";

import { Aviso, Botao, Titulo } from "@/components/ui";

// Se algo inesperado quebrar a tela, a pessoa vê um aviso e pode tentar de novo
export default function ErroAgenda({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="space-y-4">
      <Titulo>Agenda</Titulo>
      <Aviso>Não consegui abrir a agenda agora.</Aviso>
      <Botao onClick={reset}>Tentar de novo</Botao>
    </div>
  );
}
