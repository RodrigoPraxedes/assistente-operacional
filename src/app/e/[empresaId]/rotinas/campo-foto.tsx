"use client";

import { useState } from "react";
import { trocarPorReduzidas } from "@/lib/foto";

export function CampoFotoRotina({ atual }: { atual?: string | null }) {
  const [remover, setRemover] = useState(false);
  return (
    <div className="space-y-2 text-sm">
      <span className="font-medium text-slate-700">Foto (opcional)</span>
      <p className="text-xs text-slate-500">Mostra como a atividade deve ficar ou ser feita. Aparece na lista de rotinas.</p>
      {atual && !remover && (
        <a href={atual} target="_blank" rel="noreferrer" className="block w-fit">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={atual} alt="Foto da rotina" className="h-32 w-32 rounded-lg border border-slate-200 object-cover" />
        </a>
      )}
      <input
        type="file"
        name="foto"
        accept="image/*"
        className="block w-full text-sm"
        onChange={(e) => trocarPorReduzidas(e.currentTarget)}
      />
      {atual && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="remover_foto" checked={remover} onChange={(e) => setRemover(e.target.checked)} />
          Remover a foto atual
        </label>
      )}
    </div>
  );
}
