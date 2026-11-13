import { membrosAtribuiveis } from "@/lib/atribuicao";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import Link from "next/link";
import { formatarDataHora, hojeNoFuso } from "@/lib/formato";
import type { Acao } from "@/lib/types";
import { Aviso, Cartao, Etiqueta, Titulo } from "@/components/ui";
import { FormAcao } from "./form-acao";
import { TipoDeAcao } from "../tipo-de-acao";

export default async function EditarAcao({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; acaoId: string }>;
  searchParams: Promise<{ erro?: string; copiar?: string; manutencao?: string }>;
}) {
  const { empresaId, acaoId } = await params;
  const { erro, copiar, manutencao: m } = await searchParams;
  const manutencao = m === "1";
  const { supabase, empresa, membro, pode } = await exigirPermissao(empresaId, "acoes.editar");
  const novo = acaoId === "novo";
  // modelo para "criar nova a partir desta": busca a ação de origem
  const origemId = novo ? copiar : undefined;

  const [{ data: acao }, { data: unidades }, { data: setores }, { data: categorias }, { data: membros }, { data: equipamentos }] = await Promise.all([
    novo && !origemId
      ? Promise.resolve({ data: null })
      : supabase.from("acoes").select("*").eq("id", origemId ?? acaoId).eq("empresa_id", empresaId).maybeSingle(),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("categorias").select("id, nome, manutencao").eq("empresa_id", empresaId).order("nome"),
    supabase.from("membros").select("id, nome, setor_id").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
    supabase.from("equipamentos").select("id, nome, ativo").eq("empresa_id", empresaId).order("nome"),
  ]);
  if ((!novo || origemId) && !acao) notFound();

  // histórico: tarefas concluídas geradas por esta ação (o banco já esconde as privadas de quem não pode ver)
  type Feita = { id: string; titulo: string; ocorrencia_em: string | null; prazo: string | null; concluida_em: string };
  let feitas: Feita[] = [];
  const quemConcluiu = new Map<string, string>();
  if (!novo && acao) {
    const { data: ts } = await supabase
      .from("tarefas")
      .select("id, titulo, ocorrencia_em, prazo, concluida_em")
      .eq("empresa_id", empresaId)
      .eq("origem", "acao")
      .eq("origem_id", acaoId)
      .not("concluida_em", "is", null)
      .order("concluida_em", { ascending: false })
      .limit(15)
      .returns<Feita[]>();
    feitas = ts ?? [];
    if (feitas.length > 0) {
      const { data: concl } = await supabase.from("status").select("id").eq("empresa_id", empresaId).eq("tipo", "concluido");
      const { data: hist } = await supabase
        .from("tarefa_historico")
        .select("tarefa_id, membro_id, created_at")
        .in("tarefa_id", feitas.map((t) => t.id))
        .in("status_para", (concl ?? []).map((c) => c.id))
        .order("created_at", { ascending: false });
      const nomes = new Map((membros ?? []).map((m) => [m.id, m.nome]));
      for (const x of hist ?? []) {
        if (x.membro_id && !quemConcluiu.has(x.tarefa_id)) quemConcluiu.set(x.tarefa_id, nomes.get(x.membro_id) ?? "");
      }
    }
  }
  const fuso = empresa.fuso_horario;

  const h = hojeNoFuso(empresa.fuso_horario);
  const hoje = `${h.y}-${String(h.m).padStart(2, "0")}-${String(h.d).padStart(2, "0")}`;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo voltar={manutencao ? { href: `/e/${empresaId}/acoes?manutencao=1`, rotulo: "Manutenções" } : { href: `/e/${empresaId}/acoes`, rotulo: "Ações" }}>{novo ? "Nova ação" : `Editar: ${acao!.nome}`}</Titulo>
      {novo && !origemId && (
        <TipoDeAcao empresaId={empresaId} atual="acao" podeAcao podeVencimento={pode("alertas.editar")} manutencao={manutencao} />
      )}
      {erro && <Aviso>{erro}</Aviso>}
      {origemId && (
        <p className="text-xs text-slate-500">Nova ação com as configurações de “{acao!.nome}”. Ajuste o nome e o que mudar e salve.</p>
      )}
      {!novo && (
        <p className="text-xs text-slate-500">Mudanças valem para as próximas ocorrências. Nas tarefas já criadas, só os responsáveis acompanham (enquanto estiverem abertas).</p>
      )}
      <FormAcao
        key={`${acaoId}-${origemId ?? ""}`}
        empresaId={empresaId}
        acao={novo ? null : (acao as Acao | null)}
        modelo={origemId ? (acao as Acao) : null}
        hoje={hoje}
        // itens baixados só aparecem se já estiverem ligados a esta ação
        equipamentos={(equipamentos ?? []).filter((e) => e.ativo || e.id === acao?.equipamento_id).map(({ id, nome, ativo }) => ({ id, nome: ativo ? nome : `${nome} (baixado)` }))}
        unidades={unidades ?? []}
        setores={setores ?? []}
        categorias={(categorias ?? []).map(({ id, nome }) => ({ id, nome }))}
        manutencao={manutencao}
        // nova ação aberta de Manutenções já vem na primeira categoria de manutenção
        categoriaPadrao={novo && manutencao ? (categorias ?? []).find((c) => c.manutencao)?.id : undefined}
        membros={await membrosAtribuiveis(supabase, empresaId, membros ?? [], acao?.responsaveis ?? [])}
        podeMudarPrivado={novo || !acao!.criado_por || acao!.criado_por === membro.id}
      />
      {!novo && !origemId && (
        <Cartao className="space-y-3">
          <h2 className="font-medium">Histórico de realizações</h2>
          {feitas.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma tarefa desta ação foi concluída ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-200 text-sm">
              {feitas.map((t, i) => {
                const noPrazo = !t.prazo || new Date(t.concluida_em) <= new Date(t.prazo);
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <Link href={`/e/${empresaId}/tarefas/${t.id}`} className={i === 0 ? "font-medium text-blue-700" : "text-blue-700"}>
                        {i === 0 ? "Última: " : ""}
                        {formatarDataHora(t.concluida_em, fuso)}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {quemConcluiu.get(t.id) ? `Concluída por ${quemConcluiu.get(t.id)}` : "Concluída"}
                        {t.prazo && ` · prazo ${formatarDataHora(t.prazo, fuso)}`}
                      </p>
                    </div>
                    {noPrazo ? <Etiqueta>No prazo</Etiqueta> : <Etiqueta>Atrasada</Etiqueta>}
                  </li>
                );
              })}
            </ul>
          )}
          {feitas.length === 15 && <p className="text-xs text-slate-500">Mostrando as 15 últimas.</p>}
        </Cartao>
      )}
    </div>
  );
}
