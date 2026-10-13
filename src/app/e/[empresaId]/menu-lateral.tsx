"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  ArrowLeftRight,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Repeat,
  Settings,
  SquareKanban,
  Sun,
  Wrench,
  X,
} from "lucide-react";

type Tema = "claro" | "escuro" | "auto";

interface Props {
  base: string;
  empresa: string;
  membro: { nome: string; cargo: string | null };
  veConfig: boolean;
  tema: Tema;
}

interface Item {
  href: string;
  rotulo: string;
  icone: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  ativoEm?: string;
}

// Menu à esquerda em todas as telas. Abaixo de 900 px vira gaveta aberta pelo botão Menu.
export function MenuLateral({ base, empresa, membro, veConfig, tema: temaInicial }: Props) {
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  const gaveta = useRef<HTMLElement>(null);

  const itens: Item[] = [
    { href: `${base}/tarefas`, rotulo: "Tarefas", icone: SquareKanban },
    { href: `${base}/checklists`, rotulo: "Check-lists", icone: ListChecks },
    { href: `${base}/acoes`, rotulo: "Ações", icone: Repeat },
    { href: `${base}/chamados`, rotulo: "Chamados", icone: Wrench },
    { href: `${base}/alertas`, rotulo: "Alertas", icone: CalendarClock },
    { href: `${base}/escalas`, rotulo: "Escalas", icone: CalendarDays },
    ...(veConfig ? [{ href: `${base}/config/geral`, rotulo: "Configurações", icone: Settings, ativoEm: `${base}/config` }] : []),
  ];
  const atual = itens.find((i) => pathname.startsWith(i.ativoEm ?? i.href));

  // fecha a gaveta ao navegar
  useEffect(() => setAberto(false), [pathname]);

  // gaveta aberta: Escape fecha, foco entra no menu e volta ao botão ao fechar
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    gaveta.current?.querySelector<HTMLElement>("a, button")?.focus();
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", tecla);
    const botao = botaoMenu.current;
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener("keydown", tecla);
      botao?.focus();
    };
  }, [aberto]);

  const conteudo = (
    <>
      <div className="flex items-center gap-3 px-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-blue-50 text-blue-600">
          <ClipboardCheck className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{empresa}</p>
          <p className="truncate text-xs text-slate-500">Assistente Operacional</p>
        </div>
      </div>
      <Link
        href="/app?nova=1"
        className="mx-3 mt-3 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      >
        <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
        Trocar de empresa
      </Link>

      <nav aria-label="Principal" className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-2">
        {itens.map((i) => {
          const ativo = i === atual;
          const Icone = i.icone;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={ativo ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors duration-150 min-[900px]:min-h-9 ${
                ativo ? "bg-blue-50 font-medium text-blue-700" : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icone className={`h-[18px] w-[18px] ${ativo ? "text-blue-600" : "text-slate-500"}`} aria-hidden />
              {i.rotulo}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-slate-200 px-3 pt-3">
        <SeletorTema inicial={temaInicial} />
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
            {iniciais(membro.nome)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{membro.nome}</p>
            {membro.cargo && <p className="truncate text-xs text-slate-500">{membro.cargo}</p>}
          </div>
          <form action="/sair" method="post">
            <button
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              title="Sair"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </form>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* computador: coluna fixa de 226 px */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-slate-200 bg-sidebar py-6 backdrop-blur-[18px] print:hidden min-[900px]:flex">
        {conteudo}
      </aside>

      {/* celular e tablet: barra compacta + gaveta à esquerda */}
      <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-slate-200 bg-sidebar px-2 py-1.5 backdrop-blur-[18px] print:hidden min-[900px]:hidden">
        <button
          ref={botaoMenu}
          onClick={() => setAberto(true)}
          aria-label="Abrir menu"
          aria-expanded={aberto}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <p className="min-w-0 truncate text-sm font-semibold text-slate-900">{atual?.rotulo ?? empresa}</p>
        <span className="ml-auto truncate pr-2 text-xs text-slate-500">{empresa}</span>
      </header>

      {aberto && (
        <div className="fixed inset-0 z-40 min-[900px]:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setAberto(false)} aria-hidden />
          <aside
            ref={gaveta}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="entrar-gaveta absolute inset-y-0 left-0 flex w-[min(85vw,280px)] flex-col bg-superficie py-5 shadow-xl"
          >
            <button
              onClick={() => setAberto(false)}
              aria-label="Fechar menu"
              className="absolute top-3 right-3 flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {conteudo}
          </aside>
        </div>
      )}
    </>
  );
}

function iniciais(nome: string) {
  const p = nome.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

// Claro / Escuro / Automático (segue o sistema). Fica salvo num cookie.
function SeletorTema({ inicial }: { inicial: Tema }) {
  const [tema, setTema] = useState<Tema>(inicial);
  const opcoes = [
    { valor: "claro" as const, rotulo: "Claro", icone: Sun },
    { valor: "escuro" as const, rotulo: "Escuro", icone: Moon },
    { valor: "auto" as const, rotulo: "Automático", icone: Monitor },
  ];

  function escolher(t: Tema) {
    setTema(t);
    document.cookie = `tema=${t}; path=/; max-age=31536000; samesite=lax`;
    if (t === "auto") delete document.documentElement.dataset.tema;
    else document.documentElement.dataset.tema = t;
  }

  return (
    <div role="group" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-[10px] bg-slate-100 p-1">
      {opcoes.map((o) => {
        const Icone = o.icone;
        return (
          <button
            key={o.valor}
            type="button"
            aria-pressed={tema === o.valor}
            title={o.rotulo}
            onClick={() => escolher(o.valor)}
            className={`flex h-8 items-center justify-center rounded-lg text-slate-500 transition-colors duration-150 ${
              tema === o.valor ? "bg-superficie text-slate-900 shadow-sm" : "hover:text-slate-800"
            }`}
          >
            <Icone className="h-4 w-4" aria-hidden />
            <span className="sr-only">{o.rotulo}</span>
          </button>
        );
      })}
    </div>
  );
}
