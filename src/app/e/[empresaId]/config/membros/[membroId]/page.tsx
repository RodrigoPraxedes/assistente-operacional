import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/contexto";
import type { Membro } from "@/lib/types";
import { Aviso, Botao, Campo, Cartao, Input, Select, Titulo } from "@/components/ui";
import { criarAcessoMembro, salvarMembro, trocarSenhaMembro } from "../../actions";

export default async function EditarMembro({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string; membroId: string }>;
  searchParams: Promise<{ erro?: string; salvo?: string }>;
}) {
  const { empresaId, membroId } = await params;
  const { erro, salvo } = await searchParams;
  const { supabase, user } = await exigirPermissao(empresaId, "config.membros");
  const novo = membroId === "novo";

  const [{ data: membro }, { data: perfis }, { data: setores }, { data: funcoes }, { data: unidades }, { data: vinculos }, { data: comPin }] =
    await Promise.all([
      novo
        ? Promise.resolve({ data: null })
        : supabase.from("membros").select("*").eq("id", membroId).eq("empresa_id", empresaId).maybeSingle<Membro>(),
      supabase.from("perfis").select("id, nome").eq("empresa_id", empresaId).order("nome"),
      supabase.from("setores").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("funcoes").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      supabase.from("unidades").select("id, nome").eq("empresa_id", empresaId).eq("ativo", true).order("nome"),
      novo ? Promise.resolve({ data: [] }) : supabase.from("membro_unidades").select("unidade_id").eq("membro_id", membroId),
      supabase.rpc("membros_com_pin", { p_empresa: empresaId }),
    ]);
  if (!novo && !membro) notFound();
  const { data: senhaLiberada } =
    membro && (membro as Membro).usuario_id
      ? await supabase.rpc("acesso_membro_senha_liberada", { p_membro: membroId })
      : { data: null };

  const minhas = new Set((vinculos ?? []).map((v) => v.unidade_id));
  const temPin = ((comPin as string[] | null) ?? []).includes(membroId);
  const m = membro as Membro | null;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Titulo voltar={{ href: `/e/${empresaId}/config/membros`, rotulo: "Colaboradores" }}>{novo ? "Novo colaborador" : m!.nome}</Titulo>
      {erro && <Aviso>{erro}</Aviso>}
      {salvo && (
        <Aviso tipo="sucesso">
          {salvo === "acesso"
            ? "Acesso criado. Passe o e-mail e a senha para a pessoa entrar no app."
            : salvo === "senha"
              ? "Senha trocada. Passe a senha nova para a pessoa."
              : "Salvo."}
        </Aviso>
      )}

      <Cartao>
        <form action={salvarMembro.bind(null, empresaId)} className="space-y-4">
          {m && <input type="hidden" name="id" value={m.id} />}
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome">
              <Input name="nome" defaultValue={m?.nome} required />
            </Campo>
            <Campo rotulo="Cargo">
              <Input name="cargo" defaultValue={m?.cargo ?? ""} placeholder="Ex.: Cozinheiro" />
            </Campo>
            <Campo rotulo="WhatsApp" dica="Com DDD. Usado nos links de aviso.">
              <Input name="telefone" defaultValue={m?.telefone ?? ""} inputMode="tel" />
            </Campo>
            <Campo rotulo="E-mail" dica={m?.usuario_id ? "Já entrou no app." : "Opcional. Com e-mail a pessoa pode entrar no app."}>
              <Input name="email" type="email" defaultValue={m?.email ?? ""} disabled={!!m?.usuario_id} />
            </Campo>
            <Campo rotulo="Perfil de acesso">
              <Select name="perfil_id" defaultValue={m?.perfil_id ?? ""} disabled={m?.dono}>
                <option value="">Sem perfil</option>
                {(perfis ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Setor">
              <Select name="setor_id" defaultValue={m?.setor_id ?? ""}>
                <option value="">—</option>
                {(setores ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo rotulo="Função" dica="Opcional. Quem responde pelas rotinas desta função.">
              <Select name="funcao_id" defaultValue={m?.funcao_id ?? ""}>
                <option value="">—</option>
                {(funcoes ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          {m?.dono && <input type="hidden" name="perfil_id" value={m.perfil_id ?? ""} />}
          {m?.usuario_id && <input type="hidden" name="email" value={m.email ?? ""} />}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-700">Unidades</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="todas_unidades" defaultChecked={m?.todas_unidades ?? (unidades?.length === 1)} />
              Todas as unidades
            </label>
            <div className="flex flex-wrap gap-3 pl-1">
              {(unidades ?? []).map((u) => (
                <label key={u.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="unidades" value={u.id} defaultChecked={minhas.has(u.id)} /> {u.nome}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo={temPin ? "Trocar PIN" : "PIN para o QR Code"} dica={temPin ? "Já tem PIN. Deixe vazio para manter." : "4 dígitos. Necessário para preencher pelo QR."}>
              <Input name="pin" inputMode="numeric" pattern="\d{4}" maxLength={4} autoComplete="off" />
            </Campo>
            {m && !m.dono && (
              <Campo rotulo="Situação">
                <Select name="ativo" defaultValue={String(m.ativo)}>
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </Select>
              </Campo>
            )}
          </div>

          <Botao>Salvar</Botao>
        </form>
      </Cartao>

      {m?.usuario_id && (
        <Cartao>
          <h2 className="mb-1 font-medium">Senha</h2>
          {m.usuario_id === user.id ? (
            <p className="text-sm text-slate-500">Para trocar a sua senha, toque no seu nome no fim do menu (Minha conta).</p>
          ) : senhaLiberada ? (
            <>
              <p className="mb-3 text-sm text-slate-500">Este login foi criado aqui. Defina uma senha nova e passe para a pessoa.</p>
              <form action={trocarSenhaMembro.bind(null, empresaId, m.id)} className="flex flex-wrap items-end gap-2">
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
            </>
          ) : (
            <p className="text-sm text-slate-500">
              A pessoa troca a própria senha em Minha conta (tocando no nome dela no fim do menu). Se ela esqueceu, fale com o administrador
              do sistema.
            </p>
          )}
        </Cartao>
      )}

      {m && m.email && !m.usuario_id && (
        <Cartao>
          <h2 className="mb-1 font-medium">Acesso ao app</h2>
          <p className="mb-3 text-sm text-slate-500">
            Cria o login com o e-mail {m.email} e a senha que você definir, sem precisar confirmar e-mail. Depois é só passar o e-mail e a
            senha para a pessoa.
          </p>
          <form action={criarAcessoMembro.bind(null, empresaId, m.id)} className="flex flex-wrap items-end gap-2">
            <Input
              type="password"
              name="senha"
              placeholder="Senha (8+ caracteres)"
              required
              minLength={8}
              autoComplete="new-password"
              className="min-w-48 flex-1"
            />
            <Botao variante="secundario">Criar acesso</Botao>
          </form>
        </Cartao>
      )}
    </div>
  );
}
