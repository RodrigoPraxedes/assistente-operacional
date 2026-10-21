"use client";

import { useActionState, useState } from "react";
import { enviarContagem } from "@/lib/contagem-envio";
import { diaDaSemana, diaSeguinte, formatarQtd, metaDoDia, rotuloItem } from "@/lib/contagens";
import { DIAS_SEMANA } from "@/lib/rotinas";
import { Aviso, Campo, Input, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

export interface ContagemPreencher {
  id: string;
  nome: string;
  turnos: string[];
  usa_meta: boolean;
  rotulo_falta: string;
  pede_vai_fazer?: boolean;
  itens: {
    id: string;
    nome: string;
    unidade_medida: string | null;
    metas: (number | null)[] | null;
    meta_dia_seguinte?: boolean;
  }[];
}

interface Props {
  canal: "app" | "qr";
  contagem: ContagemPreencher;
  unidadeId?: string;
  token?: string;
  executor?: string;
  // "AAAA-MM-DD" de hoje no fuso da empresa
  hoje: string;
  // turno já escolhido (vindo da tarefa do Kanban)
  turnoInicial?: string;
  voltar: { href: string; rotulo: string };
}

const botaoTurno = (ativo: boolean) =>
  `min-h-11 rounded-lg border px-4 text-sm font-medium ${
    ativo ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-superficie text-slate-700"
  }`;

// Preenchimento de uma contagem, no app ou pelo QR Code: uma quantidade por item.
// Com meta, mostra na hora quanto falta para a meta do dia da semana escolhido.
export function FormContagem({ canal, contagem, unidadeId, token, executor, hoje, turnoInicial, voltar }: Props) {
  const [estado, acao] = useActionState(enviarContagem, undefined);
  const [data, setData] = useState(hoje);
  const [turno, setTurno] = useState(
    turnoInicial && contagem.turnos.includes(turnoInicial) ? turnoInicial : contagem.turnos.length === 1 ? contagem.turnos[0] : "",
  );
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [vais, setVais] = useState<Record<string, string>>({});
  const pedeVai = contagem.usa_meta && !!contagem.pede_vai_fazer;
  const [nome, setNome] = useState("");
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(data) ? diaDaSemana(data) : diaDaSemana(hoje);

  const numero = (s: string | undefined) => (s && s.trim() !== "" && !isNaN(Number(s.replace(",", "."))) ? Number(s.replace(",", ".")) : null);
  // dia da semana da meta do item: o de amanhã nos itens preparados com antecedência
  const diaMeta = (item: ContagemPreencher["itens"][number]) => (item.meta_dia_seguinte ? diaSeguinte(dia) : dia);
  const falta = (item: ContagemPreencher["itens"][number]) => {
    const meta = contagem.usa_meta ? metaDoDia(item.metas, diaMeta(item)) : null;
    const q = numero(qtds[item.id]);
    return meta === null || q === null ? null : Math.max(meta - q, 0);
  };
  // quanto vai fazer: o que a pessoa digitou ou, em branco, a sugestão
  const vai = (item: ContagemPreencher["itens"][number]) => (pedeVai ? (numero(vais[item.id]) ?? falta(item)) : falta(item));

  if (estado && "ok" in estado) {
    const [y, m, d] = data.split("-");
    const linhas = contagem.itens
      .filter((i) => numero(qtds[i.id]) !== null)
      .map((i) => {
        const f = vai(i);
        return `• ${rotuloItem(i)}: ${formatarQtd(numero(qtds[i.id]))}${f ? ` · ${contagem.rotulo_falta.toLowerCase()} ${formatarQtd(f)}` : ""}`;
      });
    const resumo = [
      `*${contagem.nome}* — ${d}/${m}/${y}${turno ? ` · ${turno}` : ""}`,
      `Por ${canal === "qr" ? nome : executor}`,
      "",
      ...linhas,
    ].join("\n");
    return (
      <div className="space-y-4 text-center">
        <Aviso tipo="sucesso">Contagem salva!</Aviso>
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-700">{resumo}</pre>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(resumo)}`}
          target="_blank"
          rel="noopener"
          className="inline-flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700"
        >
          Enviar resumo no WhatsApp
        </a>
        <a href={voltar.href} className="block text-sm text-blue-600">
          {voltar.rotulo}
        </a>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="canal" value={canal} />
      <input type="hidden" name="contagem_id" value={contagem.id} />
      <input type="hidden" name="unidade_id" value={unidadeId ?? ""} />
      <input type="hidden" name="token" value={token ?? ""} />
      <input type="hidden" name="turno" value={turno} />
      <input type="hidden" name="itens" value={JSON.stringify(contagem.itens.map((i) => i.id))} />

      <div className="space-y-4 rounded-xl border border-slate-200 bg-superficie p-4">
        {canal === "qr" ? (
          <Campo rotulo="Seu nome">
            <Input
              name="executor_nome"
              required
              maxLength={80}
              autoComplete="name"
              placeholder="Nome e sobrenome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </Campo>
        ) : (
          <p className="text-sm text-slate-600">
            Quem conta: <span className="font-medium">{executor}</span>
          </p>
        )}
        <Campo rotulo="Data da contagem" dica={DIAS_SEMANA[dia - 1].longo}>
          <Input type="date" name="data_ref" required value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
        </Campo>
        {contagem.turnos.length > 0 && (
          <div className="space-y-1">
            <span className="text-sm font-medium text-slate-700">Turno</span>
            <div className="flex flex-wrap gap-2">
              {contagem.turnos.map((t) => (
                <button key={t} type="button" className={botaoTurno(turno === t)} onClick={() => setTurno(t)} aria-pressed={turno === t}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ol className="space-y-2">
        {contagem.itens.map((item) => {
          const meta = contagem.usa_meta ? metaDoDia(item.metas, diaMeta(item)) : null;
          const f = falta(item);
          return (
            <li key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-superficie p-3">
              <label htmlFor={`qtd_${item.id}`} className="min-w-0 flex-1">
                <span className="block font-medium text-slate-900">{item.nome}</span>
                <span className="block text-xs text-slate-500">
                  {item.unidade_medida ?? ""}
                  {meta !== null &&
                    `${item.unidade_medida ? " · " : ""}${
                      item.meta_dia_seguinte ? `meta para amanhã (${DIAS_SEMANA[diaMeta(item) - 1].curto})` : "meta"
                    } ${formatarQtd(meta)}`}
                </span>
                {f !== null && (
                  <span className={`block text-sm font-medium ${f > 0 ? "text-red-700" : "text-green-700"}`}>
                    {f > 0 ? `${pedeVai ? "Sugestão" : contagem.rotulo_falta}: ${formatarQtd(f)}` : "Meta atingida ✓"}
                  </span>
                )}
              </label>
              <div className={pedeVai ? "w-20 shrink-0" : "w-24 shrink-0"}>
                {pedeVai && <span className="block text-center text-xs text-slate-500">Tem</span>}
                <Input
                  id={`qtd_${item.id}`}
                  name={`qtd_${item.id}`}
                  inputMode="decimal"
                  autoComplete="off"
                  pattern="[0-9]+([.,][0-9]+)?"
                  className="text-right text-lg"
                  placeholder="0"
                  value={qtds[item.id] ?? ""}
                  onChange={(e) => setQtds((x) => ({ ...x, [item.id]: e.target.value }))}
                />
              </div>
              {pedeVai && (
                <div className="w-20 shrink-0">
                  <span className="block truncate text-center text-xs text-slate-500">{contagem.rotulo_falta}</span>
                  <Input
                    name={`vai_${item.id}`}
                    inputMode="decimal"
                    autoComplete="off"
                    pattern="[0-9]+([.,][0-9]+)?"
                    aria-label={`${contagem.rotulo_falta}: ${item.nome}`}
                    className="text-right text-lg"
                    placeholder={f !== null ? formatarQtd(f) : "0"}
                    value={vais[item.id] ?? ""}
                    onChange={(e) => setVais((x) => ({ ...x, [item.id]: e.target.value }))}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Campo rotulo="Alguma observação?">
        <Textarea name="observacao" rows={2} maxLength={1000} />
      </Campo>

      {contagem.turnos.length > 0 && !turno && <p className="text-sm text-slate-500">Escolha o turno para salvar.</p>}
      {estado && "erro" in estado && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar className="w-full py-3" pendente="Salvando...">
        Salvar contagem
      </BotaoEnviar>
    </form>
  );
}
