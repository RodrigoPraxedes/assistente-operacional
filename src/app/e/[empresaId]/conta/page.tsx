import { getContexto } from "@/lib/contexto";
import { Aviso, Botao, Campo, Cartao, Input, Titulo } from "@/components/ui";
import { trocarMinhaSenha } from "./actions";
import { Notificacoes } from "./notificacoes";

export default async function MinhaConta({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string; salvo?: string }>;
}) {
  const { empresaId } = await params;
  const { erro, salvo } = await searchParams;
  const { user, membro } = await getContexto(empresaId);
  const chavePush = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Titulo>Minha conta</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {salvo && <Aviso tipo="sucesso">Senha trocada.</Aviso>}

      <Cartao>
        <p className="font-medium text-slate-900">{membro.nome}</p>
        <p className="text-sm text-slate-500">{user.email}</p>
      </Cartao>

      <Cartao>
        <h2 className="mb-1 font-medium">Notificações neste aparelho</h2>
        <p className="mb-3 text-xs text-slate-500">
          Receba avisos do Atalaia direto no celular ou no computador, além do WhatsApp. Ligue em cada aparelho que você usa.
        </p>
        {chavePush ? (
          <Notificacoes empresaId={empresaId} chavePublica={chavePush} />
        ) : (
          <p className="text-sm text-slate-600">As notificações ainda não foram habilitadas pelo administrador do sistema.</p>
        )}
      </Cartao>

      <Cartao>
        <h2 className="mb-3 font-medium">Trocar senha</h2>
        <form action={trocarMinhaSenha.bind(null, empresaId)} className="space-y-3">
          <Campo rotulo="Senha atual">
            <Input type="password" name="atual" required autoComplete="current-password" />
          </Campo>
          <Campo rotulo="Senha nova" dica="Pelo menos 8 caracteres">
            <Input type="password" name="nova" required minLength={8} autoComplete="new-password" />
          </Campo>
          <Campo rotulo="Repita a senha nova">
            <Input type="password" name="confirmar" required minLength={8} autoComplete="new-password" />
          </Campo>
          <Botao>Trocar senha</Botao>
        </form>
      </Cartao>
    </div>
  );
}
