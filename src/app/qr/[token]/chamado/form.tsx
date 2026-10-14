"use client";

import { useActionState } from "react";
import { abrirChamadoQr } from "@/lib/chamado-qr";
import { trocarPorReduzidas } from "@/lib/foto";
import { Aviso, Campo, Input, Select, Textarea } from "@/components/ui";
import { BotaoEnviar } from "@/components/botao-enviar";

type Opcao = { id: string; nome: string };

export function FormChamadoQr({
  token,
  setores,
  equipamentos,
}: {
  token: string;
  setores: Opcao[];
  equipamentos: Opcao[];
}) {
  const [estado, acao] = useActionState(abrirChamadoQr, undefined);

  if (estado && "ok" in estado) {
    return (
      <div className="space-y-4 text-center">
        <Aviso tipo="sucesso">Chamado aberto! A gestão já pode acompanhar.</Aviso>
        <a href={`/qr/${token}/chamado`} className="block text-sm text-blue-600">
          Abrir outro chamado
        </a>
        <a href={`/qr/${token}`} className="block text-sm text-blue-600">
          Voltar à central da unidade
        </a>
      </div>
    );
  }

  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-4 rounded-xl border border-slate-200 bg-superficie p-4">
        <Campo rotulo="Seu nome">
          <Input name="nome" required maxLength={80} autoComplete="name" placeholder="Nome e sobrenome" />
        </Campo>
        <Campo rotulo="O que está com problema?">
          <Input name="titulo" required maxLength={200} placeholder="Ex.: Freezer não está gelando" />
        </Campo>
        <Campo rotulo="Detalhes (opcional)">
          <Textarea name="descricao" rows={3} placeholder="Desde quando, o que já foi tentado..." />
        </Campo>
        {setores.length > 0 && (
          <Campo rotulo="Área">
            <Select name="setor_id" defaultValue="">
              <option value="">—</option>
              {setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        {equipamentos.length > 0 && (
          <Campo rotulo="Equipamento (opcional)">
            <Select name="equipamento_id" defaultValue="">
              <option value="">—</option>
              {equipamentos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </Select>
          </Campo>
        )}
        <Campo rotulo="Local (opcional)">
          <Input name="local" maxLength={120} placeholder="Ex.: cozinha, banheiro dos clientes" />
        </Campo>
        <label className="block text-sm">
          <span className="text-slate-600">Fotos (opcional)</span>
          <input
            type="file"
            name="fotos"
            accept="image/*"
            multiple
            className="mt-1 block w-full text-sm"
            onChange={(e) => trocarPorReduzidas(e.currentTarget)}
          />
        </label>
      </div>
      {estado && "erro" in estado && <Aviso>{estado.erro}</Aviso>}
      <BotaoEnviar className="w-full py-3" pendente="Enviando...">
        Abrir chamado
      </BotaoEnviar>
    </form>
  );
}
