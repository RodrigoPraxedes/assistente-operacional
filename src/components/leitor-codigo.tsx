"use client";

import { useEffect, useRef, useState } from "react";
import { ScanBarcode, X } from "lucide-react";

const FORMATOS_NATIVOS = ["code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "itf", "upc_a", "upc_e", "qr_code"];

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

    const lido = (codigo: string) => {
      if (parar) return;
      parar = true;
      setAberto(false);
      onLido(codigo.trim());
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        const faixa = stream.getVideoTracks()[0];
        // foco contínuo, onde o aparelho aceita
        await faixa.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        const v = video.current!;
        v.srcObject = stream;
        await v.play();

        const nativo = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = nativo ? new nativo({ formats: FORMATOS_NATIVOS }) : null;
        const Z = await import("@zxing/library");
        const hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [
          Z.BarcodeFormat.CODE_128,
          Z.BarcodeFormat.CODE_39,
          Z.BarcodeFormat.CODE_93,
          Z.BarcodeFormat.CODABAR,
          Z.BarcodeFormat.EAN_13,
          Z.BarcodeFormat.EAN_8,
          Z.BarcodeFormat.ITF,
          Z.BarcodeFormat.UPC_A,
          Z.BarcodeFormat.QR_CODE,
        ]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        const leitor = new Z.MultiFormatReader();
        leitor.setHints(hints);
        const tela = document.createElement("canvas");
        let n = 0;

        const ciclo = async () => {
          if (parar) return;
          try {
            if (v.videoWidth) {
              if (detector) {
                const achados = await detector.detect(v);
                if (achados[0]?.rawValue) return lido(achados[0].rawValue);
              }
              // recorta a faixa central (onde fica a moldura) e amplia: o código da plaquinha é pequeno no quadro
              const cw = Math.round(v.videoWidth * 0.7);
              const ch = Math.round(v.videoHeight * 0.3);
              const larg = Math.min(cw, 1000);
              tela.width = larg;
              tela.height = Math.round((ch * larg) / cw);
              const ctx = tela.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, (v.videoWidth - cw) / 2, (v.videoHeight - ch) / 2, cw, ch, 0, 0, tela.width, tela.height);
              const fonte = new Z.HTMLCanvasElementLuminanceSource(tela);
              const binarizador = n++ % 2 ? new Z.GlobalHistogramBinarizer(fonte) : new Z.HybridBinarizer(fonte);
              try {
                return lido(leitor.decode(new Z.BinaryBitmap(binarizador)).getText());
              } catch {}
            }
          } catch {}
          setTimeout(ciclo, 120);
        };
        ciclo();
      } catch {
        setErro("Não consegui abrir a câmera. Libere o acesso à câmera no navegador ou digite o código.");
      }
    })();

    return () => {
      parar = true;
      stream?.getTracks().forEach((t) => t.stop());
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
            <div className="relative w-full">
              <video ref={video} playsInline muted className="max-h-[70vh] w-full rounded-xl bg-black object-cover" />
              <div className="pointer-events-none absolute left-[15%] top-[35%] h-[30%] w-[70%] rounded-lg border-2 border-green-500" />
            </div>
            <p className="text-center text-sm text-white">
              {erro || "Deixe o código de barras dentro da moldura verde, bem de perto e sem reflexo, até ele ficar nítido."}
            </p>
            <form
              className="flex w-full gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const c = String(new FormData(e.currentTarget).get("codigo") ?? "").trim();
                if (c) {
                  setAberto(false);
                  onLido(c);
                }
              }}
            >
              <input name="codigo" inputMode="numeric" placeholder="Ou digite o código" className="min-h-11 flex-1 rounded-lg bg-white px-3 text-base text-slate-900" />
              <button className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white">OK</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
