import { FlaskConical, MessageCircle, QrCode } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { formatarDataHora } from "@/lib/formato";
import { provedorDe } from "@/lib/whatsapp-api";
import { PROVEDORES, STATUS_CONEXAO } from "@/lib/whatsapp-api/rotulos";
import type { Provedor, StatusConexao } from "@/lib/whatsapp-api/tipos";
import { Aviso, Botao, Cartao, Etiqueta, Select } from "@/components/ui";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { estilos } from "@/components/ui";
import { PainelQr } from "./painel-qr";
import { atualizarStatus, criarConexao, desconectar, pausarEnvios } from "../actions";

interface Conexao {
  id: string;
  unidade_id: string | null;
  provedor: Provedor;
  status: StatusConexao;
  numero_mascarado: string | null;
  ultimo_contato_em: string | null;
  ultimo_erro: string | null;
  envio_pausado: boolean;
  webhook_configurado_em: string | null;
  unidades: { nome: string } | null;
}

export default async function ConexaoWhatsApp({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { empresaId } = await params;
  const { erro, ok } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const gerencia = pode("whatsapp.gerenciar");

  const [{ data: conexoes }, { data: unidades }] = await Promise.all([
    supabase
      .from("whatsapp_conexoes")
      .select("id, unidade_id, provedor, status, numero_mascarado, ultimo_contato_em, ultimo_erro, envio_pausado, webhook_configurado_em, unidades(nome)")
      .eq("empresa_id", empresaId)
      .order("created_at")
      .returns<Conexao[]>(),
    supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
  ]);
  const ocupados = new Set((conexoes ?? []).map((c) => c.unidade_id ?? ""));
  const locaisLivres = [{ id: "", nome: "Empresa toda" }, ...(unidades ?? [])].filter((u) => !ocupados.has(u.id));

  return (
    <div className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}

      {(conexoes ?? []).map((c) => {
        const prov = provedorDe(c.provedor);
        const pendente = !prov.configurado();
        const st = STATUS_CONEXAO[c.status];
        return (
          <Cartao key={c.id} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">{c.unidades?.nome ?? "Empresa toda"}</p>
                <p className="text-xs text-slate-500">
                  {PROVEDORES[c.provedor].rotulo} · {PROVEDORES[c.provedor].detalhe}
                </p>
              </div>
              {pendente ? <Etiqueta cor="#d97706">Configuração pendente</Etiqueta> : <Etiqueta cor={st.cor}>{st.rotulo}</Etiqueta>}
            </div>

            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Linha rotulo="Número">{c.numero_mascarado ?? "—"}</Linha>
              <Linha rotulo="Última atualização">
                {c.ultimo_contato_em ? formatarDataHora(c.ultimo_contato_em, empresa.fuso_horario) : "—"}
              </Linha>
              <Linha rotulo="Envios">{c.envio_pausado ? "Pausados" : "Liberados"}</Linha>
              {c.provedor === "evolution" && (
                <Linha rotulo="Eventos (webhook)">
                  {c.webhook_configurado_em ? `Configurado em ${formatarDataHora(c.webhook_configurado_em, empresa.fuso_horario)}` : "Ainda não"}
                </Linha>
              )}
            </dl>

            {pendente && c.provedor === "evolution" && (
              <Aviso tipo="info">
                Faltam as variáveis da Evolution no servidor (EVOLUTION_API_URL, EVOLUTION_API_KEY e
                WHATSAPP_WEBHOOK_SECRET). Enquanto isso, nada é enviado.
              </Aviso>
            )}
            {c.ultimo_erro && <Aviso>{c.ultimo_erro}</Aviso>}
            {c.provedor === "simulacao" && (
              <p className="text-xs text-slate-500">
                Ensaio: nenhuma mensagem sai do app. Destinatário com final 0000 simula falta de resposta; final 9999
                simula recusa.
              </p>
            )}

            {gerencia && (
              <div className="space-y-3 border-t border-slate-200 pt-4">
                {c.provedor === "evolution" && !pendente && c.status !== "conectado" && (
                  <PainelQr empresaId={empresaId} conexaoId={c.id} rotulo={c.status === "desconectado" ? "Conectar" : "Reconectar"} />
                )}
                <div className="flex flex-wrap gap-2">
                  <form action={atualizarStatus.bind(null, empresaId, c.id)}>
                    <Botao variante="secundario">Atualizar status</Botao>
                  </form>
                  {c.provedor === "simulacao" && c.status !== "conectado" && (
                    <PainelQr empresaId={empresaId} conexaoId={c.id} rotulo="Conectar ensaio" />
                  )}
                  <form action={pausarEnvios.bind(null, empresaId, c.id, !c.envio_pausado)}>
                    <Botao variante="secundario">{c.envio_pausado ? "Liberar envios" : "Pausar envios"}</Botao>
                  </form>
                  {c.status === "conectado" && c.provedor === "evolution" && (
                    <form action={desconectar.bind(null, empresaId, c.id)}>
                      <BotaoConfirmar
                        mensagem="Desconectar este número? O histórico de avisos continua salvo."
                        className={estilos.botaoPerigo}
                      >
                        Desconectar
                      </BotaoConfirmar>
                    </form>
                  )}
                </div>
              </div>
            )}
          </Cartao>
        );
      })}

      {gerencia && locaisLivres.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">
            {conexoes?.length ? "Conectar outro número" : "Como você quer conectar o WhatsApp?"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Opcao
              icone={<QrCode className="h-5 w-5" aria-hidden />}
              titulo="API alternativa (Evolution)"
              itens={["WhatsApp Web, conectado pelo QR Code", "Sem custo por mensagem", "Não é a API oficial: sem disparo em massa"]}
            >
              <FormConexao empresaId={empresaId} provedor="evolution" locais={locaisLivres} rotulo="Conectar via API" />
            </Opcao>
            <Opcao
              icone={<MessageCircle className="h-5 w-5" aria-hidden />}
              titulo="API oficial da Meta"
              itens={["Modelos de mensagem aprovados pela Meta", "Cobrança por conversa, pela Meta", "Número verificado da empresa"]}
            >
              <Botao variante="secundario" disabled className="w-full">
                Em breve
              </Botao>
            </Opcao>
            <Opcao
              icone={<FlaskConical className="h-5 w-5" aria-hidden />}
              titulo="Ensaio (simulação)"
              itens={["Testa o fluxo inteiro com dados fictícios", "Nenhuma mensagem sai do app"]}
            >
              <FormConexao empresaId={empresaId} provedor="simulacao" locais={locaisLivres} rotulo="Criar ensaio" />
            </Opcao>
          </div>
        </section>
      )}

      {!gerencia && !conexoes?.length && (
        <p className="text-sm text-slate-500">O WhatsApp ainda não foi conectado. Fale com o responsável.</p>
      )}
    </div>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="text-right text-slate-900 sm:text-left">{children}</dd>
    </div>
  );
}

function Opcao({ icone, titulo, itens, children }: { icone: React.ReactNode; titulo: string; itens: string[]; children: React.ReactNode }) {
  return (
    <Cartao className="flex flex-col gap-3">
      <div className="flex items-center gap-2 font-medium text-slate-900">
        <span className="text-blue-600">{icone}</span>
        {titulo}
      </div>
      <ul className="flex-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
        {itens.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      {children}
    </Cartao>
  );
}

function FormConexao({
  empresaId,
  provedor,
  locais,
  rotulo,
}: {
  empresaId: string;
  provedor: Provedor;
  locais: { id: string; nome: string }[];
  rotulo: string;
}) {
  return (
    <form action={criarConexao.bind(null, empresaId)} className="space-y-2">
      <input type="hidden" name="provedor" value={provedor} />
      {locais.length > 1 ? (
        <Select name="unidade_id" aria-label="Onde este número será usado" defaultValue={locais[0].id}>
          {locais.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nome}
            </option>
          ))}
        </Select>
      ) : (
        <input type="hidden" name="unidade_id" value={locais[0]?.id ?? ""} />
      )}
      <Botao variante={provedor === "evolution" ? "primario" : "secundario"} className="w-full">
        {rotulo}
      </Botao>
    </form>
  );
}
