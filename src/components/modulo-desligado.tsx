import Link from "next/link";
import { MODULOS_OPCIONAIS, type ModuloOpcional } from "@/lib/modulos";
import { Cartao, Titulo } from "@/components/ui";

export function ModuloDesligado({ empresaId, modulo, podeLigar }: { empresaId: string; modulo: ModuloOpcional; podeLigar: boolean }) {
  const m = MODULOS_OPCIONAIS.find((x) => x.chave === modulo)!;
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Titulo>{m.rotulo}</Titulo>
      <Cartao className="space-y-2 text-sm text-slate-600">
        <p>Este módulo está desligado nesta empresa. Os dados cadastrados continuam guardados.</p>
        {podeLigar ? (
          <p>
            Para usar de novo, ligue em{" "}
            <Link href={`/e/${empresaId}/config/geral#modulos`} className="font-medium text-blue-700">
              Configurações › Geral › Módulos
            </Link>
            .
          </p>
        ) : (
          <p>Se precisar dele, fale com o gestor.</p>
        )}
      </Cartao>
    </div>
  );
}
