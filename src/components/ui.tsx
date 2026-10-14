import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const estilos = {
  // alvos de toque de 44 px no celular, 40 px no computador
  input:
    "min-h-11 w-full rounded-lg border border-slate-200 bg-superficie px-3 py-2 text-base text-slate-900 transition-colors duration-150 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-3 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-500 sm:min-h-10 sm:text-sm",
  botao:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-[0_2px_5px_#086ace26] transition-colors duration-150 hover:bg-blue-700 disabled:opacity-50 sm:min-h-10",
  botaoSecundario:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-superficie px-4 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-100 disabled:opacity-50 sm:min-h-10",
  botaoPerigo:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 bg-superficie px-3 py-1.5 text-sm font-medium text-red-700 transition-colors duration-150 hover:bg-red-50 sm:min-h-10",
};

export function Botao({ variante = "primario", className, ...props }: ComponentProps<"button"> & { variante?: "primario" | "secundario" | "perigo" }) {
  const base = variante === "primario" ? estilos.botao : variante === "perigo" ? estilos.botaoPerigo : estilos.botaoSecundario;
  return <button className={cx(base, className)} {...props} />;
}

export function LinkBotao({ variante = "primario", className, ...props }: ComponentProps<typeof Link> & { variante?: "primario" | "secundario" }) {
  return <Link className={cx(variante === "primario" ? estilos.botao : estilos.botaoSecundario, className)} {...props} />;
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(estilos.input, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(estilos.input, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(estilos.input, className)} {...props} />;
}

export function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
      {dica && <span className="block text-xs text-slate-500">{dica}</span>}
    </label>
  );
}

export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-xl border border-slate-200 bg-superficie p-5 shadow-sm", className)}>{children}</div>;
}

// voltar: seta ao lado do título que leva à tela anterior
export function Titulo({
  children,
  acoes,
  voltar,
}: {
  children: ReactNode;
  acoes?: ReactNode;
  voltar?: { href: string; rotulo: string };
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        {voltar && (
          <Link
            href={voltar.href}
            aria-label={`Voltar para ${voltar.rotulo}`}
            title={`Voltar para ${voltar.rotulo}`}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-blue-600 transition-colors duration-150 hover:bg-slate-100 print:hidden sm:h-10 sm:w-10"
          >
            <ChevronLeft className="h-6 w-6" aria-hidden />
          </Link>
        )}
        <h1 className="text-2xl font-semibold text-slate-900">{children}</h1>
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Etiqueta({ cor, children }: { cor?: string; children: ReactNode }) {
  // texto misturado com a cor do texto do tema: escurece no claro e clareia no escuro
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={
        cor
          ? { backgroundColor: `${cor}22`, color: `color-mix(in srgb, ${cor} 70%, var(--color-slate-900))` }
          : { backgroundColor: "var(--color-slate-100)", color: "var(--color-slate-600)" }
      }
    >
      {children}
    </span>
  );
}

export function Aviso({ tipo = "erro", children }: { tipo?: "erro" | "sucesso" | "info"; children: ReactNode }) {
  const cor =
    tipo === "erro"
      ? "border-red-200 bg-red-50 text-red-800"
      : tipo === "sucesso"
        ? "border-green-200 bg-green-50 text-green-800"
        : "border-blue-200 bg-blue-50 text-blue-800";
  return <div role={tipo === "erro" ? "alert" : "status"} className={cx("rounded-lg border px-3 py-2 text-sm", cor)}>{children}</div>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</p>;
}
