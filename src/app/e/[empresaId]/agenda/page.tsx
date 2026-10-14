import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { linkWhatsApp, urlDoSite } from "@/lib/whatsapp";
import { Aviso, Botao, Cartao, Input, Titulo, estilos } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { BotaoCopiar } from "./botao-copiar";
import { gerarLinkAgenda, revogarLinkAgenda } from "./actions";

interface LinkAgenda {
  membro_id: string;
  token: string;
  acessado_em: string | null;
}

// Endereços do link: https (copiar/colar), webcal (iPhone, Outlook) e o atalho
// que abre o Google Agenda já perguntando se quer adicionar
function enderecos(token: string) {
  const https = urlDoSite(`/agenda/${token}.ics`);
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return { https, webcal, google: `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}` };
}

export default async function PaginaAgenda({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase, empresa, membro, pode } = await getContexto(empresaId);
  const veEquipe = pode("config.membros");

  const [{ data: links }, { data: equipe }] = await Promise.all([
    supabase.from("agenda_links").select("membro_id, token, acessado_em").eq("empresa_id", empresaId).returns<LinkAgenda[]>(),
    veEquipe
      ? supabase.from("membros").select("id, nome, cargo, telefone").eq("empresa_id", empresaId).eq("ativo", true).order("nome")
      : Promise.resolve({ data: [] }),
  ]);
  const linkDe = new Map((links ?? []).map((l) => [l.membro_id, l]));
  const meu = linkDe.get(membro.id);
  const semSite = !process.env.NEXT_PUBLIC_SITE_URL;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo>Google Agenda</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {semSite && <Aviso tipo="info">Configure NEXT_PUBLIC_SITE_URL para o link apontar para o endereço completo do app.</Aviso>}

      <Cartao className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Minha agenda</h2>
          <p className="text-sm text-slate-600">
            Suas tarefas, check-lists, ações, alertas e turnos da escala aparecem no Google Agenda (ou na agenda do
            iPhone). Você adiciona uma vez e ela se atualiza sozinha.
          </p>
        </div>

        {meu ? (
          <LinkPessoal link={meu} empresaId={empresaId} membroId={membro.id} fuso={empresa.fuso_horario} />
        ) : (
          <form action={gerarLinkAgenda.bind(null, empresaId, membro.id)}>
            <Botao>Criar meu link de agenda</Botao>
          </form>
        )}
      </Cartao>

      <Cartao className="space-y-2 text-sm text-slate-700">
        <h2 className="text-base font-semibold text-slate-900">Como adicionar</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            No <strong>computador</strong>, toque em <strong>Adicionar ao Google Agenda</strong> e confirme em
            &quot;Adicionar&quot;. Se não abrir, entre no Google Agenda, clique no <strong>+</strong> ao lado de
            &quot;Outras agendas&quot;, escolha <strong>Do URL</strong> e cole o link.
          </li>
          <li>Pronto: a agenda aparece também no app do Google Agenda do celular, na mesma conta Google.</li>
          <li>
            No <strong>iPhone</strong>, toque em <strong>iPhone / Outlook</strong> e confirme &quot;Assinar&quot;.
          </li>
        </ol>
        <p className="text-slate-500">
          O Google busca as novidades sozinho, de tempos em tempos: uma tarefa nova pode levar algumas horas para
          aparecer lá. O app continua sendo o lugar de concluir as tarefas.
        </p>
        <p className="text-slate-500">
          Quem tiver o link vê a agenda. Se ele foi parar com outra pessoa, use <strong>Trocar link</strong>: o antigo
          para de funcionar.
        </p>
      </Cartao>

      {veEquipe && (
        <Cartao className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Links da equipe</h2>
            <p className="text-sm text-slate-600">
              Para quem não entra no app: crie o link e mande pelo WhatsApp com as instruções.
            </p>
          </div>
          <ul className="divide-y divide-slate-200">
            {(equipe ?? []).map((m) => {
              const l = linkDe.get(m.id);
              const e = l ? enderecos(l.token) : null;
              const texto = e
                ? `Olá, ${m.nome}! Este é o link da sua agenda de trabalho (${empresa.nome}). ` +
                  `Abra no computador, na sua conta Google, e clique em "Adicionar": ${e.google}\n\n` +
                  `Suas tarefas e turnos vão aparecer no Google Agenda do celular. No iPhone, use: ${e.webcal}\n\n` +
                  `Não repasse este link.`
                : "";
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{m.nome}</p>
                    <p className="text-xs text-slate-500">
                      {!l
                        ? "Sem link"
                        : l.acessado_em
                          ? `Agenda conectada · lida em ${formatarDataHora(l.acessado_em, empresa.fuso_horario)}`
                          : "Link criado · ainda não adicionado"}
                    </p>
                  </div>
                  {l ? (
                    <div className="flex flex-wrap gap-2">
                      <a href={linkWhatsApp(texto, m.telefone)} target="_blank" rel="noreferrer" className={estilos.botaoSecundario}>
                        Enviar no WhatsApp
                      </a>
                      <form action={revogarLinkAgenda.bind(null, empresaId, m.id)}>
                        <BotaoConfirmar
                          mensagem={`Desligar o link de agenda de ${m.nome}? A agenda deixa de atualizar.`}
                          className={estilos.botaoPerigo}
                        >
                          Desligar
                        </BotaoConfirmar>
                      </form>
                    </div>
                  ) : (
                    <form action={gerarLinkAgenda.bind(null, empresaId, m.id)}>
                      <Botao variante="secundario">Criar link</Botao>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Cartao>
      )}
    </div>
  );
}

function LinkPessoal({ link, empresaId, membroId, fuso }: { link: LinkAgenda; empresaId: string; membroId: string; fuso: string }) {
  const e = enderecos(link.token);
  return (
    <div className="space-y-3">
      <Input readOnly value={e.https} aria-label="Link da minha agenda" className="font-mono text-xs sm:text-xs" />
      <div className="flex flex-wrap gap-2">
        <a href={e.google} target="_blank" rel="noreferrer" className={estilos.botao}>
          Adicionar ao Google Agenda
        </a>
        <a href={e.webcal} className={estilos.botaoSecundario}>
          iPhone / Outlook
        </a>
        <BotaoCopiar texto={e.https} />
      </div>
      <p className="text-xs text-slate-500">
        {link.acessado_em
          ? `Agenda conectada: lida pela última vez em ${formatarDataHora(link.acessado_em, fuso)}.`
          : "Ainda não foi adicionado em nenhuma agenda."}
      </p>
      <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
        <form action={gerarLinkAgenda.bind(null, empresaId, membroId)}>
          <BotaoConfirmar
            mensagem="Trocar o link? O link antigo para de funcionar e você precisa adicionar o novo na agenda."
            className={estilos.botaoSecundario}
          >
            Trocar link
          </BotaoConfirmar>
        </form>
        <form action={revogarLinkAgenda.bind(null, empresaId, membroId)}>
          <BotaoConfirmar mensagem="Desligar o link? Sua agenda para de receber atualizações." className={estilos.botaoPerigo}>
            Desligar
          </BotaoConfirmar>
        </form>
      </div>
    </div>
  );
}
