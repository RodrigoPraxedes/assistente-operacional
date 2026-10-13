"use client";

import { trocarPorReduzidas } from "@/lib/foto";

export function CampoFotos() {
  return (
    <input
      type="file"
      name="fotos"
      accept="image/*"
      multiple
      required
      className="text-sm"
      onChange={(e) => trocarPorReduzidas(e.currentTarget)}
    />
  );
}
