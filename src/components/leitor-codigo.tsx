"use client";

import { useEffect, useRef, useState } from "react";
import { ScanBarcode, X } from "lucide-react";

type Detector = { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> };

// Lê código de barras pela câmera. Usa o leitor nativo (Chrome/Android) e, onde ele não existe (iPhone), a biblioteca ZXing.
export function LeitorCodigo({ onLido }: { onLido: (codigo: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState("");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!aberto) return;
    let parar = false;
    let stream: MediaStream | null = null;
    let zxing: { reset: () => void } | null = null;

    const lido = (codigo: string) => {
      if (parar) return;
      parar = true;
      setAberto(false);
      onLido(codigo.trim());
    };

    (async () => {
      try {
        const nativo = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        if (nativo) {
          const detector = new nativo({ formats: ["code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "itf", "upc_a", "upc_e", "qr_code"] });
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          const v = video.current!;
          v.srcObject = stream;
          await v.play();
          const ciclo = async () => {
            if (parar) return;
            try {
              const achados = await detector.detect(v);
              if (achados[0]?.rawValue) return lido(achados[0].rawValue);
            } catch {}
            setTimeout(ciclo, 200);
          };
          ciclo();
        } else {
          const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import("@zxing/library");
          const hints = new Map();
          hints.set(DecodeHintType.POSSIBLE_FORMATS, [
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.CODABAR,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.ITF,
            BarcodeFormat.UPC_A,
            BarcodeFormat.QR_CODE,
          ]);
          hints.set(DecodeHintType.TRY_HARDER, true);
          const leitor = new BrowserMultiFormatReader(hints);
          zxing = leitor;
          if (parar) return leitor.reset();
          await leitor.decodeFromConstraints({ video: { facingMode: "environment" } }, video.current!, (r) => {
            if (r) lido(r.getText());
          });
        }
      } catch {
        setErro("Não consegui abrir a câmera. Libere o acesso à câmera no navegador ou digite o código.");
      }
    })();

    return () => {
      parar = true;
      stream?.getTracks().forEach((t) => t.stop());
      zxing?.reset();
    };
  }, [aberto, onLido]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setErro("");
          setAberto(true);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-blue-600 hover:bg-slate-100 sm:min-h-9"
      >
        <ScanBarcode size={16} /> Ler código de barras
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4">
          <button type="button" onClick={() => setAberto(false)} aria-label="Fechar" className="ml-auto rounded-full bg-white/20 p-2 text-white">
            <X size={20} />
          </button>
          <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3">
            <video ref={video} playsInline muted className="max-h-[70vh] w-full rounded-xl bg-black object-cover" />
            <p className="text-center text-sm text-white">{erro || "Aponte a câmera para o código de barras da plaquinha."}</p>
          </div>
        </div>
      )}
    </>
  );
}
