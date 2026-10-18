import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ehAdminMaster } from "@/lib/contexto";
import { formatarData } from "@/lib/formato";
import type { SituacaoEmpresa } from "@/lib/types";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { Aviso, Botao, Campo, Cartao, Etiqueta, Input, LinkBotao, Select, Titulo, Vazio, estilos } from "@/components/ui";
import {
  cadastrarUsuario,
  definirLimite,
  definirSituacao,
  entrarEmpresa,
  excluirEmpresaPendente,
  promoverAdmin,
  removerAdmin,
  sairEmpresa,
  trocarSenha,
} from "./actions";

interface EmpresaAdmin {
  id: string;
  nome: string;
  situacao: SituacaoEmpresa;
  motivo_suspensao: string | null;
  situacao_em: string;
  limite_unidades: number;
  unidades_ativas: number;
  membros_ativos: number;
  dono_nome: string | null;
  dono_email: string | null;
  sou_membro: boolean;
  created_at: string;
}

interface AdminMaster {
  usuario_id: string;
  nome: string;
  email: string | null;
}

const SITUACOES: Record<SituacaoEmpresa, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "Aguardando aprovação", cor: "#d97706" },
  ativa: { rotulo: "Ativa", cor: "#16a34a" },
  suspensa: { rotulo: "Suspensa", cor: "#dc2626" },
};

export default async function PainelAdmin({ searchParams }: { searchParams: Promise<{ erro?: string; ok?: string }> }) {
  const { erro, ok } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");
  if (!(await ehAdminMaster())) notFound();

  const [{ data: e }, { data: a }] = await Promise.all([supabase.rpc("admin_empresas"), supabase.rpc("admin_listar")]);
  const empresas = (e ?? []) as EmpresaAdmin[];
  const admins = (a ?? []) as AdminMaster[];
  const pendentes = empresas.filter((x) => x.situacao === "pendente").length;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4 py-8 sm:px-8">
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Suas empresas
      </Link>
      <Titulo>Admin Master</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {ok && <Aviso tipo="sucesso">{ok}</Aviso>}
      {pendentes > 0 && (
        <Aviso tipo="info">
          {pendentes === 1 ? "1 empresa aguarda" : `${pendentes} empresas aguardam`} aprovação.
        </Aviso>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Empresas ({empresas.length})</h2>
        {empresas.length === 0 && <Vazio>Nenhuma empresa cadastrada.</Vazio>}
        {empresas.map((x) => (
          <Cartao key={x.id} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{x.nome}</p>
                <p className="text-sm text-slate-500">
                  {x.dono_nome ?? "Sem dono"}
                  {x.dono_email ? ` · ${x.dono_email}` : ""}
                </p>
                <p className="text-xs text-slate-500">
                  Cadastrada em {formatarData(x.created_at)} · {x.membros_ativos} colaborador(es)
                </p>
              </div>
              <Etiqueta cor={SITUACOES[x.situacao].cor}>{SITUACOES[x.situacao].rotulo}</Etiqueta>
            </div>

            {x.situacao === "suspensa" && (
              <p className="text-sm text-red-700">
                Suspensa em {formatarData(x.situacao_em)}
                {x.motivo_suspensao ? `: ${x.motivo_suspensao}` : ""}
              </p>
            )}

            <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
              <form action={definirLimite.bind(null, x.id)} className="flex items-end gap-2">
                <label className="space-y-1">
                  <span className="block text-xs text-slate-500">Unidades: {x.unidades_ativas} em uso, limite</span>
                  <Input type="number" name="limite" min={Math.max(1, x.unidades_ativas)} defaultValue={x.limite_unidades} className="w-24" />
                </label>
                <Botao variante="secundario">Salvar limite</Botao>
              </form>

              <div className="flex flex-wrap gap-2">
                {x.sou_membro ? (
                  <>
                    <LinkBotao variante="secundario" href={`/e/${x.id}/painel`}>
                      Abrir
                    </LinkBotao>
                    <form action={sairEmpresa.bind(null, x.id)}>
                      <Botao variante="secundario" title="Deixa de aparecer como membro desta empresa">
                        Sair
                      </Botao>
                    </form>
                  </>
                ) : (
                  <form action={entrarEmpresa.bind(null, x.id)}>
                    <Botao variante="secundario" title="Entra como membro com acesso total">
                      Entrar
                    </Botao>
                  </form>
                )}
                {x.situacao === "pendente" && (
                  <>
                    <form action={excluirEmpresaPendente.bind(null, x.id)}>
                      <BotaoConfirmar
                        mensagem={`Rejeitar e excluir a empresa ${x.nome}?\n\nA empresa, as unidades e tudo o que foi cadastrado nela são apagados e não dá para desfazer. O login de quem cadastrou continua existindo.`}
                        className={estilos.botaoPerigo}
                      >
                        Rejeitar e excluir
                      </BotaoConfirmar>
                    </form>
                    <form action={definirSituacao.bind(null, x.id, "ativa")}>
                      <Botao>Aprovar</Botao>
                    </form>
                  </>
                )}
                {x.situacao === "suspensa" && (
                  <form action={definirSituacao.bind(null, x.id, "ativa")}>
                    <Botao>Reativar</Botao>
                  </form>
                )}
              </div>
            </div>

            {x.situacao === "ativa" && (
              <form action={definirSituacao.bind(null, x.id, "suspensa")} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <Input name="motivo" placeholder="Motivo da suspensão (opcional, aparece para a empresa)" className="min-w-48 flex-1" />
                <BotaoConfirmar
                  mensagem={`Suspender ${x.nome}? Os colaboradores perdem o acesso até você reativar.`}
                  className={estilos.botaoPerigo}
                >
                  Suspender
                </BotaoConfirmar>
              </form>
            )}
          </Cartao>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Usuários</h2>
        <Cartao>
          <h3 className="mb-1 font-medium">Cadastrar usuário</h3>
          <p className="mb-4 text-sm text-slate-500">
            A conta já nasce com o e-mail confirmado e vinculada à empresa: é só passar o e-mail e a senha para a pessoa entrar. Se o e-mail
            já tiver login, ele é confirmado, recebe esta senha e é vinculado.
          </p>
          <form action={cadastrarUsuario} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo="Nome">
                <Input name="nome" required autoComplete="off" />
              </Campo>
              <Campo rotulo="E-mail">
                <Input type="email" name="email" required autoComplete="off" />
              </Campo>
              <Campo rotulo="Senha" dica="Pelo menos 8 caracteres">
                <Input type="password" name="senha" required minLength={8} autoComplete="new-password" />
              </Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Empresa">
                <Select name="empresa" required defaultValue="">
                  <option value="" disabled>
                    Escolha...
                  </option>
                  <option value="nova">Empresa nova (a pessoa é a dona)</option>
                  {empresas.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nome}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo rotulo="Acesso na empresa existente" dica="Ajuste o perfil depois em Configurações › Colaboradores">
                <Select name="acesso" defaultValue="colaborador">
                  <option value="colaborador">Colaborador</option>
                  <option value="completo">Acesso completo (Gestor)</option>
                </Select>
              </Campo>
              <Campo rotulo="Nome da empresa nova" dica="Só para empresa nova; ela já nasce ativa">
                <Input name="nova_empresa" autoComplete="off" />
              </Campo>
              <Campo rotulo="Primeira unidade" dica="Só para empresa nova; em branco vira Matriz">
                <Input name="unidade" autoComplete="off" />
              </Campo>
            </div>
            <Botao>Cadastrar</Botao>
          </form>
        </Cartao>

        <Cartao>
          <h3 className="mb-1 font-medium">Trocar senha</h3>
          <p className="mb-4 text-sm text-slate-500">Define uma senha nova para qualquer login e confirma o e-mail, se ainda não estava confirmado.</p>
          <form action={trocarSenha} className="flex flex-wrap items-end gap-2">
            <Input type="email" name="email" placeholder="E-mail do login" required autoComplete="off" className="min-w-48 flex-1" />
            <Input
              type="password"
              name="senha"
              placeholder="Senha nova (8+ caracteres)"
              required
              minLength={8}
              autoComplete="new-password"
              className="min-w-48 flex-1"
            />
            <Botao variante="secundario">Trocar senha</Botao>
          </form>
        </Cartao>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Administradores</h2>
        <Cartao className="space-y-3">
          <ul className="divide-y divide-slate-100 text-sm">
            {admins.map((x) => (
              <li key={x.usuario_id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{x.nome}</span>
                  <span className="block truncate text-slate-500">{x.email}</span>
                </span>
                {x.usuario_id === user.id ? (
                  <span className="text-xs text-slate-500">Você</span>
                ) : (
                  <form action={removerAdmin.bind(null, x.usuario_id)}>
                    <BotaoConfirmar mensagem={`Remover ${x.nome} dos administradores?`} className={estilos.botaoPerigo}>
                      Remover
                    </BotaoConfirmar>
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={promoverAdmin} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <Input type="email" name="email" placeholder="E-mail de quem já tem login no app" required className="min-w-48 flex-1" />
            <Botao variante="secundario">Promover a Admin Master</Botao>
          </form>
          <p className="text-xs text-slate-500">Admin Master vê todas as empresas, aprova, suspende e define o limite de unidades.</p>
        </Cartao>
      </section>
    </main>
  );
}
