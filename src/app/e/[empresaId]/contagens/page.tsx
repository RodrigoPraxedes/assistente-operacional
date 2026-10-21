import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { dataDeHoje } from "@/lib/contagens";
import { descreverRecorrencia } from "@/lib/recorrencias-prontas";
import type { Contagem } from "@/lib/types";
import { Aviso, Cartao, Etiqueta, LinkBotao, Titulo, Vazio } from "@/components/ui";

function hora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}

export default async function PaginaContagens({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ salvo?: string; excluido?: string }>;
}) {
  const { empresaId } = await params;
  const { salvo, excluido } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const podeEditar = pode("contagens.editar");
  const veResultados = pode("contagens.resultados") || podeEditar;
  const hoje = dataDeHoje(empresa.fuso_horario);

  const [{ data: contagens, error }, { data: itens }, { data: unidades }, { data: feitas }] = await Promise.all([
    supabase.from("contagens").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("contagem_itens").select("contagem_id").eq("empresa_id", empresaId).eq("ativo", true),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase
      .from("contagem_registros")
      .select("contagem_id, turno, enviado_em")
      .eq("empresa_id", empresaId)
      .eq("data_ref", hoje)
      .order("enviado_em"),
  ]);
  const qtdItens = new Map<string, number>();
  for (const i of itens ?? []) qtdItens.set(i.contagem_id, (qtdItens.get(i.contagem_id) ?? 0) + 1);
  const nomeUnidade = new Map((unidades ?? []).map((u) => [u.id as string, u.nome as string]));
  const base = `/e/${empresaId}/contagens`;
  const lista = ((contagens ?? []) as Contagem[]).filter((c) => c.ativo || podeEditar);

  return (
    <div className="space-y-6">
      <Titulo
        acoes={
          <>
            {veResultados && lista.length > 1 && (
              <LinkBotao variante="secundario" href={`${base}/comparar`}>
                Comparar
              </LinkBotao>
            )}
            {podeEditar && <LinkBotao href={`${base}/novo`}>Nova contagem</LinkBotao>}
          </>
        }
      >
        Contagens
      </Titulo>
      <p className="-mt-4 text-sm text-slate-500">
        Registro de quantidades por turno: contagem de produtos, produção do dia, retiradas, embalados. Com meta, o app mostra
        quanto falta em cada item.
      </p>
      {salvo && <Aviso tipo="sucesso">Contagem salva.</Aviso>}
      {excluido && <Aviso tipo="sucesso">Contagem excluída.</Aviso>}
      {error && <Aviso>Não foi possível carregar as contagens: {error.message}</Aviso>}

      {lista.length === 0 ? (
        <Vazio>
          {podeEditar
            ? "Nenhuma contagem ainda. Toque em Nova contagem para começar."
            : "Nenhuma contagem cadastrada."}
        </Vazio>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {lista.map((c) => {
            const alvo = c.unidade_id ? (unidades ?? []).filter((u) => u.id === c.unidade_id) : (unidades ?? []);
            const hojeFeitas = (feitas ?? []).filter((f) => f.contagem_id === c.id);
            return (
              <li key={c.id}>
                <Cartao className={`h-full space-y-2 ${c.ativo ? "" : "opacity-60"}`}>
                  <p className="font-medium">{c.nome}</p>
                  {c.descricao && <p className="text-sm text-slate-500">{c.descricao}</p>}
                  <p className="text-xs text-slate-500">
                    {qtdItens.get(c.id) ?? 0} {qtdItens.get(c.id) === 1 ? "item" : "itens"}
                    {c.turnos.length > 0 && ` · ${c.turnos.join(", ")}`} ·{" "}
                    {c.unidade_id ? nomeUnidade.get(c.unidade_id) : "Todas as unidades"}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {c.publico_qr && <Etiqueta cor="#2563eb">QR Code</Etiqueta>}
                    {c.usa_meta && <Etiqueta cor="#16a34a">Meta: {c.rotulo_falta}</Etiqueta>}
                    {c.agendada && (
                      <Etiqueta cor="#7c3aed">
                        {descreverRecorrencia(c.recorrencia)} · {c.horarios.map((h) => h.slice(0, 5)).join(" e ")}
                      </Etiqueta>
                    )}
                    {!c.ativo && <Etiqueta>Inativa</Etiqueta>}
                  </div>
                  {hojeFeitas.length > 0 && (
                    <p className="flex items-center gap-1 text-xs font-medium text-green-600">
                      <CheckCircle2 size={14} />
                      Feito hoje:{" "}
                      {hojeFeitas.map((f) => `${f.turno ? `${f.turno} ` : ""}${hora(f.enviado_em, empresa.fuso_horario)}`).join(", ")}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {c.ativo &&
                      alvo.map((u) => (
                        <Link
                          key={u.id}
                          href={`${base}/${c.id}/preencher?unidade=${u.id}`}
                          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white"
                        >
                          Contar{alvo.length > 1 ? ` · ${u.nome}` : ""}
                        </Link>
                      ))}
                    {veResultados && (
                      <Link href={`${base}/${c.id}/resultados`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                        Resultados
                      </Link>
                    )}
                    {podeEditar && (
                      <Link href={`${base}/${c.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                        Editar
                      </Link>
                    )}
                  </div>
                </Cartao>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
