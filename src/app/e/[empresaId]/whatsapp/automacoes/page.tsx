import { notFound } from "next/navigation";
import { getContexto } from "@/lib/contexto";
import { soDigitos } from "@/lib/formato";
import { Aviso, Campo, Cartao, Input } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { autorizarEquipe, salvarAutomacoes } from "../actions";

export default async function Automacoes({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { empresaId } = await params;
  const { erro, ok } = await searchParams;
  const { supabase, pode } = await getContexto(empresaId);
  if (!pode("whatsapp.gerenciar")) notFound();

  const desde = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const [{ data: config }, { data: conexoes }, { data: contatos }, { data: membros }, { count: enviadas }] = await Promise.all([
    supabase
      .from("whatsapp_automacoes")
      .select("aviso_tarefa, resumo_dia, aviso_conclusao, checklist_auto, boas_vindas, lembrete_checklist, resumo_hora, limite_diario, link_tarefa, link_conclusao, link_checklist, link_lembrete, link_resumo, contato_duvidas")
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase.from("whatsapp_conexoes").select("status, envio_pausado").eq("empresa_id", empresaId),
    supabase.from("whatsapp_contatos").select("membro_id").eq("empresa_id", empresaId).eq("ativo", true),
    supabase.from("membros").select("id, telefone").eq("empresa_id", empresaId).eq("ativo", true),
    supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .not("chave", "is", null)
      .is("confirmado_por", null)
      .neq("situacao", "rascunho")
      .gte("created_at", desde),
  ]);

  const ligados = new Set((contatos ?? []).map((c) => c.membro_id).filter(Boolean));
  const equipe = membros ?? [];
  const comWhatsApp = equipe.filter((m) => ligados.has(m.id)).length;
  const semCadastro = equipe.filter((m) => !ligados.has(m.id) && soDigitos(m.telefone).length < 10).length;
  const limite = config?.limite_diario ?? 150;
  const pronta = (conexoes ?? []).some((c) => c.status === "conectado" && !c.envio_pausado);

  return (
    <div className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      {!pronta && (
        <Aviso tipo="info">Nenhuma conexão está conectada e liberada. As mensagens automáticas ficam na fila até liberar o envio na aba Conexão.</Aviso>
      )}

      <form action={salvarAutomacoes.bind(null, empresaId)}>
        <Cartao className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Automações</h2>
            <p className="text-sm text-slate-500">
              Estas mensagens saem sozinhas, sem confirmar na aba Avisos. Deixe o link só onde a pessoa precisa abrir o app: link em
              toda mensagem aumenta o risco de o WhatsApp tratar o número como robô.
            </p>
          </div>

          <label className="flex items-start gap-3">
            <input type="checkbox" name="aviso_tarefa" defaultChecked={config?.aviso_tarefa ?? false} className="mt-1 h-4 w-4" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Tarefa atribuída</span>
              <span className="block text-slate-500">
                Quem recebe uma tarefa ganha uma mensagem com o prazo. Rotina de check-list e de ação recorrente vai só no
                resumo do dia. Tarefas privadas não geram aviso.
              </span>
            </span>
          </label>
          <IncluirLink nome="link_tarefa" ligado={config?.link_tarefa ?? true} />

          <label className="flex items-start gap-3">
            <input type="checkbox" name="aviso_conclusao" defaultChecked={config?.aviso_conclusao ?? false} className="mt-1 h-4 w-4" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Tarefa concluída</span>
              <span className="block text-slate-500">
                Quem criou a tarefa recebe uma mensagem quando ela é concluída, com quem concluiu e o horário. Não avisa quem
                concluiu a própria tarefa nem tarefas privadas.
              </span>
            </span>
          </label>
          <IncluirLink nome="link_conclusao" ligado={config?.link_conclusao ?? false} />

          <label className="flex items-start gap-3">
            <input type="checkbox" name="checklist_auto" defaultChecked={config?.checklist_auto ?? false} className="mt-1 h-4 w-4" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Check-list concluído</span>
              <span className="block text-slate-500">
                Os avisos de check-list cadastrados na aba Destinatários saem sozinhos, com quem enviou e os itens marcados “Não”.
                Desligado, eles continuam virando rascunho para alguém confirmar.
              </span>
            </span>
          </label>
          <IncluirLink nome="link_checklist" ligado={config?.link_checklist ?? false} />

          <label className="flex items-start gap-3">
            <input type="checkbox" name="lembrete_checklist" defaultChecked={config?.lembrete_checklist ?? false} className="mt-1 h-4 w-4" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Lembrete de check-list</span>
              <span className="block text-slate-500">
                Antes do horário do check-list, o responsável recebe um lembrete para puxar a equipe. A antecedência fica no cadastro de cada check-list (padrão 30 min).
              </span>
            </span>
          </label>
          <IncluirLink nome="link_lembrete" ligado={config?.link_lembrete ?? true} />

          <label className="flex items-start gap-3">
            <input type="checkbox" name="boas_vindas" defaultChecked={config?.boas_vindas ?? false} className="mt-1 h-4 w-4" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Boas-vindas</span>
              <span className="block text-slate-500">
                Quem é autorizado como destinatário recebe uma mensagem de apresentação pedindo para salvar o número. Ajuda a pessoa a reconhecer os avisos e protege o número de bloqueio.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3">
            <input type="checkbox" name="resumo_dia" defaultChecked={config?.resumo_dia ?? false} className="mt-1 h-4 w-4" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Resumo do dia</span>
              <span className="block text-slate-500">
                Uma mensagem por pessoa com o turno de hoje, as tarefas que vencem hoje e as atrasadas. Quem não tem nada no dia não
                recebe.
              </span>
            </span>
          </label>
          <IncluirLink nome="link_resumo" ligado={config?.link_resumo ?? false} />

          <label className="flex items-start gap-3">
            <input type="checkbox" name="contato_duvidas" defaultChecked={config?.contato_duvidas ?? true} className="mt-1 h-4 w-4" />
            <span className="text-sm">
              <span className="font-medium text-slate-900">Contato para dúvidas</span>
              <span className="block text-slate-500">
                No fim do aviso vai o nome e o celular de quem atribuiu a tarefa, de quem concluiu, de quem preencheu o check-list
                ou, no lembrete, de quem recebe o resultado. O número fica clicável no WhatsApp, sem link. Usa o celular do cadastro.
              </span>
            </span>
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Horário do resumo">
              <Input type="time" name="resumo_hora" defaultValue={config?.resumo_hora?.slice(0, 5) ?? "07:00"} required />
            </Campo>
            <Campo rotulo="Limite de envios automáticos por dia" dica="Passou do limite, a mensagem vira rascunho na aba Avisos.">
              <Input type="number" name="limite_diario" min={1} max={1000} defaultValue={limite} required />
            </Campo>
          </div>
          <BotaoEnviar>Salvar</BotaoEnviar>
          <p className="text-xs text-slate-500">
            Últimas 24 h: {enviadas ?? 0} de {limite} envios automáticos.
          </p>
        </Cartao>
      </form>

      <Cartao className="space-y-3">
        <div>
          <h2 className="font-semibold text-slate-900">Quem recebe</h2>
          <p className="text-sm text-slate-500">
            Só colaboradores autorizados na aba Destinatários e ligados ao cadastro recebem. {comWhatsApp} de {equipe.length}{" "}
            colaboradores estão prontos
            {semCadastro > 0 && `; ${semCadastro} não têm celular no cadastro`}.
          </p>
        </div>
        <form action={autorizarEquipe.bind(null, empresaId)}>
          <BotaoEnviar>Autorizar a equipe pelo celular do cadastro</BotaoEnviar>
        </form>
      </Cartao>
    </div>
  );
}

function IncluirLink({ nome, ligado }: { nome: string; ligado: boolean }) {
  return (
    <label className="-mt-2 ml-7 flex items-center gap-2 text-sm text-slate-500">
      <input type="checkbox" name={nome} defaultChecked={ligado} className="h-4 w-4" />
      Incluir link do app
    </label>
  );
}
