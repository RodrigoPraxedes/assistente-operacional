"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";

const CHAVE = "atalaia-instalar-adiado";
const DIAS_ADIADO = 7;

interface EventoInstalacao extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function adiado() {
  try {
    const ate = Number(localStorage.getItem(CHAVE) ?? 0);
    return Date.now() < ate;
  } catch {
    return false;
  }
}

export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalacao | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

    const instalado =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (instalado || adiado()) return;

    const ehIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    if (ehIos) setIos(true);

    const aoOferecer = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacao);
    };
    const aoInstalar = () => {
      setEvento(null);
      setIos(false);
    };
    window.addEventListener("beforeinstallprompt", aoOferecer);
    window.addEventListener("appinstalled", aoInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", aoOferecer);
      window.removeEventListener("appinstalled", aoInstalar);
    };
  }, []);

  function agoraNao() {
    try {
      localStorage.setItem(CHAVE, String(Date.now() + DIAS_ADIADO * 86400000));
    } catch {}
    setEvento(null);
    setIos(false);
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    setEvento(null);
  }

  if (!evento && !ios) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar o Atalaia"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-superficie p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" width={44} height={44} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Deseja instalar o app?</p>
          {evento ? (
            <p className="mt-0.5 text-sm text-slate-600">
              Instale o Atalaia para abrir direto da tela inicial, com o logo, sem a barra do navegador.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-600">
              Toque em <Share className="inline h-4 w-4 align-text-bottom" aria-label="Compartilhar" /> e depois em{" "}
              <strong>Adicionar à Tela de Início</strong>.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            {evento && (
              <button
                type="button"
                onClick={instalar}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" /> Instalar
              </button>
            )}
            <button
              type="button"
              onClick={agoraNao}
              className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              {evento ? "Agora não" : "Entendi"}
            </button>
          </div>
        </div>
        <button type="button" onClick={agoraNao} aria-label="Fechar" className="text-slate-400 hover:text-slate-600">
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
