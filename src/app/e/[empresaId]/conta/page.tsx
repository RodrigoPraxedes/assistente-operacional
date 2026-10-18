import { getContexto } from "@/lib/contexto";
import { Aviso, Botao, Campo, Cartao, Input, Titulo } from "@/components/ui";
import { trocarMinhaSenha } from "./actions";

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
