"use client";

import { useActionState, useState } from "react";
import { enviarChecklist } from "@/lib/checklist-envio";
import { RESPOSTAS_SIM_NAO, type ModoExecutor, type TipoResposta } from "@/lib/types";
import { Aviso, Campo, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";
import { trocarPorReduzidas } from "@/lib/foto";

// Sim, Não, Em processo (começou e não terminou) e N/A, cada um com sua cor
const COR_ESCOLHIDA: Record<string, string> = {
  sim: "border-green-500 bg-green-50 text-green-700",
  nao: "border-red-500 bg-red-50 text-red-700",
  em_processo: "border-blue-500 bg-blue-50 text-blue-700",
  na: "border-slate-400 bg-slate-100 text-slate-700",
};

// Cor da resposta escolhida: vermelho só quando é a resposta que o item conta como problema
function corEscolhida(valor: string, problemaQuando: string | undefined) {
  if (valor === "sim" || valor === "nao") {
    if (valor === (problemaQuando ?? "nao")) return COR_ESCOLHIDA.nao;
    return valor === "sim" ? COR_ESCOLHIDA.sim : COR_ESCOLHIDA.na;
  }
  return COR_ESCOLHIDA[valor];
}

export interface ItemPreencher {
  id: string;
  texto: string;
  tipo_resposta: TipoResposta;
  obrigatorio: boolean;
  permite_foto: boolean;
  foto_obrigatoria?: boolean;
  foto_obrigatoria_se_nao: boolean;
  permite_na?: boolean;
  problema_quando?: "nao" | "sim" | "nunca";
}

interface Props {
  canal: "app" | "qr";
  empresaId: string;
  modeloId: string;
  unidadeId?: string;
  token?: string;
  modoExecutor?: ModoExecutor;
  colaboradores?: { id: string; nome: string }[];
  executor?: string;
  itens: ItemPreencher[];
  voltar: { href: string; rotulo: string };
}

export function FormPreencher({ canal, empresaId, modeloId, unidadeId, token, modoExecutor, colaboradores, executor, itens, voltar }: Props) {
  const [estado, acao] = useActionState(enviarChecklist, undefined);
  const [respostas, setRespostas] = useState<Record<string, string>>({});

  if (estado && "ok" in estado) {
    return (
      <div className="space-y-4 text-center">
        <Aviso tipo="sucesso">Check-list salvo!</Aviso>
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-700">{estado.resumo}</pre>
        {estado.automatico ? (
          <p className="text-sm text-slate-600">
            O resultado já foi enviado pelo WhatsApp do Atalaia.{" "}
            <a href={estado.whatsapp} target="_blank" rel="noopener" className="text-blue-600">
              Enviar também pelo meu WhatsApp
            </a>
          </p>
        ) : (
          <a
            href={estado.whatsapp}
            target="_blank"
            rel="noopener"
            className="inline-flex w-full items-center justify-center rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-700"
          >
            Enviar resumo no WhatsApp
          </a>
        )}
        <a href={voltar.href} className="block text-sm text-blue-600">
          {voltar.rotulo}
        </a>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="canal" value={canal} />
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="modelo_id" value={modeloId} />
      <input type="hidden" name="unidade_id" value={unidadeId ?? ""} />
      <input type="hidden" name="token" value={token ?? ""} />
      <input type="hidden" name="modo_executor" value={modoExecutor ?? "usuarios"} />
      <input
        type="hidden"
        name="itens"
        value={JSON.stringify(itens.map((i) => ({ id: i.id, texto: i.texto, tipo_resposta: i.tipo_resposta })))}
      />

      {canal === "qr" && modoExecutor === "aberto" ? (
        <div className="rounded-xl border border-slate-200 bg-superficie p-4">
          <Campo rotulo="Seu nome">
            <Input name="executor_nome" required maxLength={80} autoComplete="name" placeholder="Nome e sobrenome" />
          </Campo>
        </div>
      ) : canal === "qr" ? (
        <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-superficie p-4">
          <div className="col-span-2">
            <Campo rotulo="Seu nome">
              <Select name="membro_id" required defaultValue="">
                <option value="" disabled>
                  Escolha...
                </option>
                {colaboradores?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          <Campo rotulo="PIN">
            <Input name="pin" type="password" inputMode="numeric" pattern="\d{4}" maxLength={4} required autoComplete="off" />
          </Campo>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          Executor: <span className="font-medium">{executor}</span>
        </p>
      )}

      <ol className="space-y-3">
        {itens.map((item, n) => {
          const resposta = respostas[item.id];
          const fotoObrigatoria = !!item.foto_obrigatoria || (item.foto_obrigatoria_se_nao && resposta === "nao");
          return (
            <li key={item.id} className="space-y-3 rounded-xl border border-slate-200 bg-superficie p-4">
              <p className="font-medium">
                {n + 1}. {item.texto}
                {item.obrigatorio && <span className="text-red-500"> *</span>}
              </p>

              {item.tipo_resposta === "sim_nao" && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {RESPOSTAS_SIM_NAO.filter((r) => r.valor !== "na" || item.permite_na !== false).map((r) => (
                    <label
                      key={r.valor}
                      className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-sm ${
                        resposta === r.valor ? corEscolhida(r.valor, item.problema_quando) : "border-slate-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`resposta_${item.id}`}
                        value={r.valor}
                        required={item.obrigatorio}
                        className="sr-only"
                        onChange={() => setRespostas((x) => ({ ...x, [item.id]: r.valor }))}
                      />
                      {r.rotulo}
                    </label>
                  ))}
                </div>
              )}
              {item.tipo_resposta === "numero" && (
                <Input name={`numero_${item.id}`} inputMode="decimal" required={item.obrigatorio} placeholder="Valor" />
              )}
              {item.tipo_resposta === "texto" && <Textarea name={`texto_${item.id}`} rows={2} required={item.obrigatorio} />}

              <Input name={`obs_${item.id}`} placeholder="Observação (opcional)" />

              {item.permite_foto && <CampoFoto nome={`foto_${item.id}`} obrigatoria={fotoObrigatoria} />}
            </li>
          );
        })}
      </ol>

      <Campo rotulo="Observação geral">
        <Textarea name="observacao" rows={2} />
      </Campo>

      {estado && "erro" in estado && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar className="w-full py-3" pendente="Salvando...">
        Salvar e enviar
      </BotaoEnviar>
    </form>
  );
}

// Fotos mais antigas que isso são recusadas (vieram da galeria, não da câmera agora)
const FOTO_MAX_MINUTOS = 10;

// Abre direto a câmera traseira e recusa foto antiga. O navegador não deixa
// bloquear a galeria em todo celular, então a data do arquivo é conferida.
function CampoFoto({ nome, obrigatoria }: { nome: string; obrigatoria: boolean }) {
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  async function escolher(input: HTMLInputElement) {
    const arquivo = input.files?.[0];
    setErro("");
    setOk(false);
    if (!arquivo) return;
    if (Date.now() - arquivo.lastModified > FOTO_MAX_MINUTOS * 60_000) {
      input.value = "";
      setErro("Essa foto não é de agora. Tire a foto na hora, pela câmera.");
      return;
    }
    await trocarPorReduzidas(input);
    setOk(true);
  }

  return (
    <label className="block text-sm">
      <span className={obrigatoria ? "font-medium text-red-700" : "text-slate-600"}>
        {obrigatoria ? "Foto obrigatória (tire agora pela câmera)" : "Foto (opcional, tire agora pela câmera)"}
      </span>
      <input
        type="file"
        name={nome}
        accept="image/*"
        capture="environment"
        required={obrigatoria}
        className="mt-1 block w-full text-sm"
        onChange={(e) => escolher(e.currentTarget)}
      />
      {erro && <span className="mt-1 block text-red-700">{erro}</span>}
      {ok && <span className="mt-1 block text-green-700">Foto registrada ✓</span>}
    </label>
  );
}
