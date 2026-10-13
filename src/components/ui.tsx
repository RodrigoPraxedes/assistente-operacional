import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

export const estilos = {
  input:
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100",
  botao:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50",
  botaoSecundario:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50",
  botaoPerigo:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50",
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
  return <div className={cx("rounded-xl border border-slate-200 bg-white p-4 shadow-sm", className)}>{children}</div>;
}

export function Titulo({ children, acoes }: { children: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-slate-900">{children}</h1>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

export function Etiqueta({ cor, children }: { cor?: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ backgroundColor: `${cor ?? "#64748b"}22`, color: cor ?? "#475569" }}
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
  return <div className={cx("rounded-lg border px-3 py-2 text-sm", cor)}>{children}</div>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</p>;
}
