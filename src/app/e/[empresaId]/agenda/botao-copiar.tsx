"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Botao } from "@/components/ui";

export function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Botao
      type="button"
      variante="secundario"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }}
    >
      {copiado ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
      {copiado ? "Copiado" : "Copiar link"}
    </Botao>
  );
}
