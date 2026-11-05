"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Move, Plus } from "lucide-react";
import type { Recorte } from "@/lib/foto";

const S = 256; // lado do quadro na tela, em px

// Enquadramento manual: arraste a foto dentro do quadrado e use o zoom; devolve o recorte em frações da foto.
export function EnquadrarFoto({ src, onChange }: { src: string; onChange: (r: Recorte) => void }) {
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const arrasto = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const escala = nat ? (S / Math.min(nat.w, nat.h)) * zoom : 1;
  const dw = nat ? nat.w * escala : S;
  const dh = nat ? nat.h * escala : S;
  const limitar = (p: { x: number; y: number }, w = dw, h = dh) => ({
    x: Math.min(0, Math.max(S - w, p.x)),
    y: Math.min(0, Math.max(S - h, p.y)),
  });

  useEffect(() => {
    if (!nat) return;
    onChange({ x: -pos.x / escala / nat.w, y: -pos.y / escala / nat.h, lado: 1 / zoom });
  }, [nat, pos, zoom, escala, onChange]);

  function carregou(img: HTMLImageElement) {
    const n = { w: img.naturalWidth, h: img.naturalHeight };
    const e = S / Math.min(n.w, n.h);
    setNat(n);
    setZoom(1);
    setPos({ x: (S - n.w * e) / 2, y: (S - n.h * e) / 2 });
  }

  function mudarZoom(novo: number) {
    if (!nat) return;
    const z = Math.min(3, Math.max(1, novo));
    const e2 = (S / Math.min(nat.w, nat.h)) * z;
    const f = e2 / escala;
    // mantém o centro do quadro no mesmo ponto da foto
    const p = { x: S / 2 - (S / 2 - pos.x) * f, y: S / 2 - (S / 2 - pos.y) * f };
    setZoom(z);
    setPos(limitar(p, nat.w * e2, nat.h * e2));
  }

  const botao =
    "flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-superficie text-slate-700 hover:bg-slate-100 disabled:opacity-40";

  return (
    <div className="space-y-2">
      <div
        className="relative cursor-grab touch-none overflow-hidden rounded-lg border border-slate-200 bg-slate-100 select-none active:cursor-grabbing"
        style={{ width: S, height: S }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          arrasto.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
        }}
        onPointerMove={(e) => {
          const a = arrasto.current;
          if (a) setPos(limitar({ x: a.x + e.clientX - a.px, y: a.y + e.clientY - a.py }));
        }}
        onPointerUp={() => (arrasto.current = null)}
        onPointerCancel={() => (arrasto.current = null)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Foto para enquadrar"
          draggable={false}
          onLoad={(e) => carregou(e.currentTarget)}
          className="pointer-events-none absolute max-w-none"
          style={{ width: dw, height: dh, left: pos.x, top: pos.y }}
        />
        <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-md bg-slate-900/60 px-2 py-1 text-xs text-white">
          <Move className="h-3 w-3" aria-hidden /> Arraste para enquadrar
        </span>
      </div>
      <div className="flex items-center gap-2" style={{ width: S }}>
        <button type="button" className={botao} onClick={() => mudarZoom(zoom - 0.25)} disabled={zoom <= 1} aria-label="Diminuir zoom">
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => mudarZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="flex-1 accent-blue-600"
        />
        <button type="button" className={botao} onClick={() => mudarZoom(zoom + 0.25)} disabled={zoom >= 3} aria-label="Aumentar zoom">
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
