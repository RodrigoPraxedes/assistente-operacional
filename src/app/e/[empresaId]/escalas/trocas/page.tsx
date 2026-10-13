import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { hojeIso, horarioTurno, rotuloDia, somarDias } from "@/lib/escala";
import { formatarDataHora } from "@/lib/formato";
import { linkWhatsApp } from "@/lib/whatsapp";
import { STATUS_TROCA, type Escala, type EscalaTroca, type Turno } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Etiqueta, Input, Select, Titulo, Vazio, estilos } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { pedirTroca, responderTroca } from "../actions";

const AVISOS: Record<string, string> = {
  pedido: "Pedido enviado. Quem monta a escala vai aprovar ou recusar.",
  aprovar: "Troca aprovada. A escala já foi atualizada.",
  recusar: "Troca recusada.",
  cancelar: "Pedido cancelado.",
};

export default async function Trocas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ aviso?: string; erro?: string }>;
}) {
  const { empresaId } = await params;
  const { aviso, erro } = await searchParams;
  const { supabase, empresa, membro: eu, pode } = await getContexto(empresaId);
  const hoje = hojeIso(empresa.fuso_horario);

  const [{ data: trocas }, { data: meusDias }, { data: membros }, { data: turnos }] = await Promise.all([
    supabase
      .from("escala_trocas")
      .select("*")
      .eq("empresa_id", empresaId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("escalas")
      .select("*")
      .eq("membro_id", eu.id)
      .eq("tipo", "turno")
      .gte("data", hoje)
      .lte("data", somarDias(hoje, 45))
      .order("data"),
    supabase.from("membros").select("id, nome, telefone, ativo").eq("empresa_id", empresaId).order("nome"),
    supabase.from("turnos").select("*").eq("empresa_id", empresaId),
  ]);

  const lista = (trocas ?? []) as EscalaTroca[];
  // dias da escala citados nos pedidos (podem ser de outras pessoas)
  const { data: diasTrocas } = lista.length
    ? await supabase
        .from("escalas")
        .select("*")
        .in(
          "id",
          lista.map((t) => t.escala_id),
        )
    : { data: [] };

  const pessoa = new Map((membros ?? []).map((m) => [m.id, m]));
  const turno = new Map(((turnos ?? []) as Turno[]).map((t) => [t.id, t]));
  const dia = new Map(((diasTrocas ?? []) as Escala[]).map((e) => [e.id, e]));
  const descreverDia = (e: Escala | undefined) => {
    if (!e) return "Dia removido da escala";
    const t = e.turno_id ? turno.get(e.turno_id) : null;
    return `${rotuloDia(e.data)}${t ? ` · ${t.nome} (${horarioTurno(t)})` : ""}`;
  };

  const comPedido = new Set(lista.filter((t) => t.status === "pendente").map((t) => t.escala_id));
  const disponiveis = ((meusDias ?? []) as Escala[]).filter((e) => !comPedido.has(e.id));
  const pendentes = lista.filter((t) => t.status === "pendente");
  const historico = lista.filter((t) => t.status !== "pendente").slice(0, 20);
  const podeAprovar = pode("escalas.editar");
  const responder = (id: string, acao: "aprovar" | "recusar" | "cancelar") =>
    responderTroca.bind(null, empresaId, id, acao);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href={`/e/${empresaId}/escalas`} className="text-sm text-slate-500">
        ← Escalas
      </Link>
      <Titulo>Trocas de turno</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {aviso && AVISOS[aviso] && <Aviso tipo="sucesso">{AVISOS[aviso]}</Aviso>}

      <Cartao className="space-y-3">
        <h2 className="font-medium">Pedir troca</h2>
        <p className="text-sm text-slate-500">
          Combine com o colega e peça aqui. Se ele já tiver algo marcado no mesmo dia (outro turno ou folga), vocês
          trocam; se não, ele assume o seu turno.
        </p>
        {disponiveis.length === 0 ? (
          <p className="text-sm text-slate-500">Você não tem turnos marcados nos próximos dias.</p>
        ) : (
          <form action={pedirTroca.bind(null, empresaId)} className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Meu dia">
              <Select name="escala_id" required>
                {disponiveis.map((e) => (
                  <option key={e.id} value={e.id}>
                    {descreverDia(e)}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Quem vai assumir">
              <Select name="substituto_id" required defaultValue="">
                <option value="" disabled>
                  Escolha o colega
                </option>
                {(membros ?? [])
                  .filter((m) => m.ativo && m.id !== eu.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
              </Select>
            </Campo>
            <div className="sm:col-span-2">
              <Campo rotulo="Motivo (opcional)">
                <Input name="motivo" placeholder="Ex.: consulta médica" />
              </Campo>
            </div>
            <div className="sm:col-span-2">
              <BotaoEnviar pendente="Enviando...">Pedir troca</BotaoEnviar>
            </div>
          </form>
        )}
      </Cartao>

      <section className="space-y-2">
        <h2 className="font-medium">Aguardando resposta</h2>
        {pendentes.length === 0 ? (
          <Vazio>Nenhum pedido de troca aguardando.</Vazio>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-superficie">
            {pendentes.map((t) => {
              const sol = pessoa.get(t.solicitante_id);
              const sub = pessoa.get(t.substituto_id);
              const meu = eu.id === t.solicitante_id || eu.id === t.pedido_por;
              const texto = `Oi, ${sub?.nome.split(" ")[0]}! Pedi no app para você assumir meu turno de ${descreverDia(dia.get(t.escala_id))}. Tudo bem?`;
              return (
                <li key={t.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      <span className="font-medium">{sol?.nome}</span> passa para{" "}
                      <span className="font-medium">{sub?.nome}</span>
                    </p>
                    <Etiqueta cor={STATUS_TROCA.pendente.cor}>{STATUS_TROCA.pendente.rotulo}</Etiqueta>
                  </div>
                  <p className="text-slate-600">{descreverDia(dia.get(t.escala_id))}</p>
                  {t.motivo && <p className="text-xs text-slate-500">Motivo: {t.motivo}</p>}
                  <div className="flex flex-wrap gap-2">
                    {podeAprovar && (
                      <>
                        <form action={responder(t.id, "aprovar")}>
                          <Botao>Aprovar</Botao>
                        </form>
                        <form action={responder(t.id, "recusar")}>
                          <Botao variante="secundario">Recusar</Botao>
                        </form>
                      </>
                    )}
                    {meu && (
                      <>
                        {sub && (
                          <a
                            href={linkWhatsApp(texto, sub.telefone)}
                            target="_blank"
                            rel="noreferrer"
                            className={estilos.botaoSecundario}
                          >
                            Avisar {sub.nome.split(" ")[0]} no WhatsApp
                          </a>
                        )}
                        <form action={responder(t.id, "cancelar")}>
                          <BotaoConfirmar mensagem="Cancelar este pedido de troca?" className={estilos.botaoPerigo}>
                            Cancelar pedido
                          </BotaoConfirmar>
                        </form>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {historico.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Últimas respondidas</h2>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-superficie">
            {historico.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <p>
                    {pessoa.get(t.solicitante_id)?.nome} → {pessoa.get(t.substituto_id)?.nome}
                  </p>
                  <p className="text-xs text-slate-500">
                    {descreverDia(dia.get(t.escala_id))}
                    {t.decidido_em &&
                      ` · ${formatarDataHora(t.decidido_em, empresa.fuso_horario)} por ${pessoa.get(t.decidido_por ?? "")?.nome ?? "—"}`}
                  </p>
                </div>
                <Etiqueta cor={STATUS_TROCA[t.status].cor}>{STATUS_TROCA[t.status].rotulo}</Etiqueta>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
