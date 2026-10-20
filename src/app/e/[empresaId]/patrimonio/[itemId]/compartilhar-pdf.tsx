"use client";

import { useState } from "react";

// Gera o PDF do item no servidor e entrega como arquivo: no celular abre o compartilhamento
// nativo (WhatsApp, e-mail...), no computador baixa o arquivo. Sem link público.
export function CompartilharPdf({ empresaId, itemId, nome }: { empresaId: string; itemId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [valores, setValores] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState("");

  async function gerar() {
    setGerando(true);
    setErro("");
    try {
      const res = await fetch(`/e/${empresaId}/patrimonio/${itemId}/pdf?valores=${valores ? 1 : 0}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const arquivo = new File([blob], `${nome.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "equipamento"}.pdf`, {
        type: "application/pdf",
      });
      if (navigator.canShare?.({ files: [arquivo] })) {
        try {
          await navigator.share({ files: [arquivo], title: nome });
        } catch {
          // compartilhamento cancelado: nada a fazer
        }
      } else {
        const url = URL.createObjectURL(arquivo);
        const a = document.createElement("a");
        a.href = url;
        a.download = arquivo.name;
        a.click();
        URL.revokeObjectURL(url);
      }
      setAberto(false);
    } catch {
      setErro("Não foi possível gerar o PDF. Tente de novo.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-superficie px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
      >
        Compartilhar PDF
      </button>
      {aberto && (
        <div className="absolute right-0 z-10 mt-2 w-72 space-y-3 rounded-xl border border-slate-200 bg-superficie p-3 shadow-lg">
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={valores} onChange={(e) => setValores(e.target.checked)} className="mt-0.5" />
            <span>
              Incluir valores financeiros (compra e gastos)
              <span className="block text-xs text-slate-500">O PDF sai do sistema; por padrão, vai sem valores.</span>
            </span>
          </label>
          {erro && <p className="text-xs text-red-600">{erro}</p>}
          <button
            type="button"
            onClick={gerar}
            disabled={gerando}
            className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {gerando ? "Gerando…" : "Gerar e compartilhar"}
          </button>
        </div>
      )}
    </div>
  );
}
