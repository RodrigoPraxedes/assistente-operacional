import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getContexto } from "@/lib/contexto";
import { urlDoSite } from "@/lib/whatsapp";
import type { Unidade } from "@/lib/types";
import { Aviso, Botao, Cartao, Campo, Input, Select, Titulo } from "@/components/ui";
import { gerarNovoQr, salvarUnidade } from "../../actions";
import { BotaoImprimir } from "./botao-imprimir";

export default async function PaginaUnidade({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; unidadeId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId, unidadeId } = await params;
  const { erro } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);
  const { data: unidade } = await supabase.from("unidades").select("*").eq("id", unidadeId).maybeSingle<Unidade>();
  if (!unidade) notFound();

  const link = urlDoSite(`/qr/${unidade.qr_token}`);
  const svg = await QRCode.toString(link, { type: "svg", margin: 1, width: 280 });
  const editar = pode("config.empresa");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/config/geral`, rotulo: "Configurações" }}>{unidade.nome}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}

      <Cartao className="space-y-3 text-center">
        <p className="text-lg font-semibold">
          {empresa.nome} · {unidade.nome}
        </p>
        <p className="text-sm text-slate-600">Aponte a câmera para preencher os check-lists da unidade</p>
        <div className="mx-auto w-fit" dangerouslySetInnerHTML={{ __html: svg }} />
        <p className="break-all text-xs text-slate-500">{link}</p>
        <div className="flex justify-center gap-2 print:hidden">
          <BotaoImprimir />
          {editar && (
            <form action={gerarNovoQr.bind(null, empresaId, unidade.id)}>
              <Botao variante="secundario" title="Use se o QR vazou: o antigo para de funcionar">
                Gerar novo QR
              </Botao>
            </form>
          )}
        </div>
        {!process.env.NEXT_PUBLIC_SITE_URL && (
          <Aviso tipo="info">Configure NEXT_PUBLIC_SITE_URL para o QR apontar para o endereço completo do app.</Aviso>
        )}
      </Cartao>

      {editar && (
        <Cartao className="print:hidden">
          <form action={salvarUnidade.bind(null, empresaId)} className="space-y-3">
            <input type="hidden" name="id" value={unidade.id} />
            <Campo rotulo="Nome">
              <Input name="nome" defaultValue={unidade.nome} required />
            </Campo>
            <Campo rotulo="Endereço">
              <Input name="endereco" defaultValue={unidade.endereco ?? ""} />
            </Campo>
            <Campo rotulo="Situação">
              <Select name="ativo" defaultValue={String(unidade.ativo)}>
                <option value="true">Ativa</option>
                <option value="false">Inativa</option>
              </Select>
            </Campo>
            <Botao>Salvar</Botao>
          </form>
        </Cartao>
      )}
    </div>
  );
}
