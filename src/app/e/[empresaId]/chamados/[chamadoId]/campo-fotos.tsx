"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { trocarPorReduzidas } from "@/lib/foto";
import { adicionarFotos } from "../actions";

// Duas entradas (câmera e galeria) e envio na hora, com aviso de que foi salvo
export function CampoFotos({ empresaId, tarefaId }: { empresaId: string; tarefaId: string }) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [preparando, setPreparando] = useState(false);
  const [enviando, iniciar] = useTransition();
  const [msg, setMsg] = useState("");

  async function escolher(input: HTMLInputElement) {
    if (!input.files?.length) return;
    setMsg("");
    setPreparando(true);
    await trocarPorReduzidas(input);
    const form = new FormData();
    Array.from(input.files).forEach((f) => form.append("fotos", f));
    input.value = "";
    setPreparando(false);
    iniciar(async () => {
      await adicionarFotos(empresaId, tarefaId, form);
      setMsg("Foto salva ✓");
      router.refresh();
    });
  }

  const ocupado = preparando || enviando;
  const botao =
    "rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={ocupado} onClick={() => camera.current?.click()} className={botao}>
          📷 Tirar foto
        </button>
        <button type="button" disabled={ocupado} onClick={() => galeria.current?.click()} className={botao}>
          Escolher da galeria
        </button>
      </div>
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => escolher(e.currentTarget)}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => escolher(e.currentTarget)}
      />
      {ocupado && <p className="text-sm text-slate-500">Enviando...</p>}
      {msg && !ocupado && <p className="text-sm text-green-700">{msg}</p>}
    </div>
  );
}
