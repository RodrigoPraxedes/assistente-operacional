"use client";

import { useState } from "react";
import { trocarPorReduzidas } from "@/lib/foto";

// Fotos mais antigas que isso são recusadas (vieram da galeria, não da câmera agora)
const FOTO_MAX_MINUTOS = 10;

// Abre direto a câmera traseira e recusa foto antiga. O navegador não deixa
// bloquear a galeria em todo celular, então a data do arquivo é conferida.
export function CampoFotoCamera({ nome, rotulo }: { nome: string; rotulo: string }) {
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  async function escolher(input: HTMLInputElement) {
    const arquivo = input.files?.[0];
    setErro("");
    setOk(false);
    if (!arquivo) return;
    if (Date.now() - arquivo.lastModified > FOTO_MAX_MINUTOS * 60_000) {
      input.value = "";
      setErro("Essa foto não é de agora. Tire a foto na hora, pela câmera.");
      return;
    }
    await trocarPorReduzidas(input);
    setOk(true);
  }

  return (
    <label className="block text-sm">
      <span className="font-medium text-red-700">{rotulo}</span>
      <input
        type="file"
        name={nome}
        accept="image/*"
        capture="environment"
        required
        className="mt-1 block w-full text-sm"
        onChange={(e) => escolher(e.currentTarget)}
      />
      {erro && <span className="mt-1 block text-red-700">{erro}</span>}
      {ok && <span className="mt-1 block text-green-700">Foto registrada ✓</span>}
    </label>
  );
}
