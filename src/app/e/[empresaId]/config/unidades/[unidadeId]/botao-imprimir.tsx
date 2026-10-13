"use client";

import { Botao } from "@/components/ui";

export function BotaoImprimir() {
  return <Botao onClick={() => window.print()}>Imprimir</Botao>;
}
