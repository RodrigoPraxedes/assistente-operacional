"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Lock } from "lucide-react";
import { Campo, Select } from "@/components/ui";

// Público (padrão) ou privado: privado só aparece para quem criou e para o
// responsável. Só quem criou pode trocar; para os outros o campo fica travado
// e não é enviado (a action não mexe no valor).
// Com `perguntar` (itens novos), ao enviar o formulário abre uma janela pedindo
// a escolha, para ninguém criar algo restrito como público sem perceber.
export function CampoVisibilidade({
  privado = false,
  podeMudar,
  perguntar = false,
  quemVe,
}: {
  privado?: boolean;
  podeMudar: boolean;
  perguntar?: boolean;
  // quem vê o item privado, quando não é "você e os responsáveis" (ex.: projetos)
  quemVe?: string;
}) {
  const [valor, setValor] = useState(String(privado));
  const [janela, setJanela] = useState(false);
  const confirmado = useRef(!perguntar || !podeMudar);
  const campo = useRef<HTMLSelectElement>(null);
  const primeiroBotao = useRef<HTMLButtonElement>(null);

  // segura o envio (antes da action do React) até a pessoa escolher
  useEffect(() => {
    const form = campo.current?.form;
    if (!form || confirmado.current) return;
    const segurar = (e: SubmitEvent) => {
      if (confirmado.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setJanela(true);
    };
    form.addEventListener("submit", segurar);
    return () => form.removeEventListener("submit", segurar);
  }, []);

  useEffect(() => {
    if (!janela) return;
    primeiroBotao.current?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setJanela(false);
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [janela]);

  function escolher(v: "true" | "false") {
    setValor(v);
    confirmado.current = true;
    setJanela(false);
    // espera o select receber o valor novo antes de reenviar
    requestAnimationFrame(() => campo.current?.form?.requestSubmit());
  }

  const opcoes = [
    { v: "false" as const, titulo: "Pública", texto: "Toda a equipe com acesso pode ver.", Icone: Globe },
    { v: "true" as const, titulo: "Privada", texto: `Só ${quemVe ?? "você e os responsáveis"} veem.`, Icone: Lock },
  ];

  return (
    <>
      <Campo
        rotulo="Visibilidade"
        dica={podeMudar ? `Privado: só ${quemVe ?? "você e o responsável"} veem` : "Só quem criou pode mudar"}
      >
        <Select ref={campo} name="privado" value={valor} onChange={(e) => setValor(e.target.value)} disabled={!podeMudar}>
          <option value="false">Público</option>
          <option value="true">Privado</option>
        </Select>
      </Campo>

      {janela && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setJanela(false)} aria-hidden />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-visibilidade"
            className="relative w-full max-w-sm rounded-[19px] bg-superficie p-5 shadow-xl"
          >
            <h2 id="titulo-visibilidade" className="text-lg font-semibold text-slate-900">
              Quem pode ver?
            </h2>
            <p className="mt-1 text-sm text-slate-500">Confirme antes de criar.</p>
            <div className="mt-4 space-y-2">
              {opcoes.map(({ v, titulo, texto, Icone }, i) => (
                <button
                  key={v}
                  ref={i === 0 ? primeiroBotao : undefined}
                  type="button"
                  onClick={() => escolher(v)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-slate-100 ${
                    valor === v ? "border-blue-600" : "border-slate-200"
                  }`}
                >
                  <Icone className={`mt-0.5 h-5 w-5 shrink-0 ${v === "true" ? "text-red-600" : "text-blue-600"}`} aria-hidden />
                  <span>
                    <span className="block text-sm font-medium text-slate-900">{titulo}</span>
                    <span className="block text-sm text-slate-500">{texto}</span>
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setJanela(false)}
              className="mt-3 w-full rounded-lg py-2 text-sm text-slate-500 hover:bg-slate-100"
            >
              Voltar ao formulário
            </button>
          </div>
        </div>
      )}
    </>
  );
}
