"use client";

import { useActionState, useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { Aviso, Botao } from "@/components/ui";
import { gerarQr, type EstadoQr } from "../actions";

// O WhatsApp troca o QR a cada ~20 s; depois disso a imagem some e é preciso gerar outro
const VALIDADE_S = 40;

// QR Code só na tela de quem gerencia: vem do servidor na hora, não fica salvo em lugar nenhum
export function PainelQr({ empresaId, conexaoId, rotulo }: { empresaId: string; conexaoId: string; rotulo: string }) {
  const [estado, acao, pendente] = useActionState<EstadoQr, FormData>(gerarQr, undefined);
  const [restante, setRestante] = useState(0);
  const geradoEm = estado && "geradoEm" in estado ? estado.geradoEm : 0;

  useEffect(() => {
    if (!geradoEm) return;
    const tique = () => setRestante(Math.max(0, VALIDADE_S - Math.floor((Date.now() - geradoEm) / 1000)));
    tique();
    const id = setInterval(tique, 1000);
    return () => clearInterval(id);
  }, [geradoEm]);

  const mostrando = estado && "geradoEm" in estado && restante > 0;

  return (
    <div className="space-y-3">
      <form action={acao}>
        <input type="hidden" name="empresa_id" value={empresaId} />
        <input type="hidden" name="conexao_id" value={conexaoId} />
        <Botao type="submit" variante={mostrando ? "secundario" : "primario"} disabled={pendente}>
          <QrCode className="h-4 w-4" aria-hidden />
          {pendente ? "Gerando..." : mostrando ? "Gerar novo QR" : rotulo}
        </Botao>
      </form>

      {estado && "erro" in estado && <Aviso>{estado.erro}</Aviso>}
      {estado && "conectado" in estado && <Aviso tipo="sucesso">Conectado.</Aviso>}
      {estado && "geradoEm" in estado && (
        <div className="rounded-xl border border-slate-200 p-4">
          {mostrando ? (
            <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:items-start sm:text-left">
              {estado.qr && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={estado.qr} alt="QR Code para conectar o WhatsApp" width={220} height={220} className="rounded-lg" />
              )}
              <div className="space-y-2 text-sm text-slate-700">
                <p className="font-medium text-slate-900">No celular do número que vai enviar os avisos:</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Abra o WhatsApp &gt; Configurações &gt; Dispositivos conectados.</li>
                  <li>Toque em Conectar um dispositivo e aponte para o QR.</li>
                </ol>
                {estado.codigo && (
                  <p>
                    Ou use o código: <span className="font-mono font-semibold">{estado.codigo}</span>
                  </p>
                )}
                <p className="text-xs text-slate-500">Expira em {restante} s. Depois, atualize o status.</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">O QR expirou. Gere um novo se ainda não conectou.</p>
          )}
          {estado.aviso && <p className="mt-2 text-xs text-slate-500">{estado.aviso}</p>}
        </div>
      )}
    </div>
  );
}
