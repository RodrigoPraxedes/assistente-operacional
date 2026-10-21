import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { ORIGENS, PRIORIDADES, TIPOS_STATUS, type Categoria, type Funcao, type Setor, type Status, type TipoStatus, type Unidade } from "@/lib/types";
import { BotaoConfirmar } from "@/components/botao-confirmar";
import { SeletorPainel } from "@/components/seletor-painel";
import { Aviso, Botao, Cartao, Etiqueta, Input, Select } from "@/components/ui";
import {
  alternarFuncao,
  alternarSetor,
  alternarStatus,
  editarCategoria,
  excluirCategoria,
  excluirFuncao,
  excluirSetor,
  moverStatus,
  salvarCategoria,
  salvarEmpresa,
  salvarFuncao,
  salvarSetor,
  salvarSla,
  salvarStatus,
  salvarUnidade,
} from "../actions";

export default async function ConfigGeral({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  const { supabase, empresa, pode } = await getContexto(empresaId);

  const [{ data: unidades }, { data: setores }, { data: funcoes }, { data: categorias }, { data: status }] = await Promise.all([
    supabase.from("unidades").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("setores").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("funcoes").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("categorias").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("status").select("*").eq("empresa_id", empresaId).order("ordem"),
  ]);
  const { data: sla } = await supabase.from("empresas").select("sla_chamados, limite_unidades").eq("id", empresaId).single();
  const unidadesAtivas = (unidades as Unidade[] | null)?.filter((u) => u.ativo).length ?? 0;
  const limiteUnidades: number = sla?.limite_unidades ?? 1;
  const prazos = (sla?.sla_chamados ?? {}) as Record<string, number>;
  const seletorModulo = (valor: string | null, desabilitado: boolean) => (
    <Select name="modulo" defaultValue={valor ?? ""} className="w-32" disabled={desabilitado} title="Em qual módulo aparece">
      <option value="">Todos</option>
      {Object.entries(ORIGENS).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </Select>
  );

  const e = empresaId;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {erro && (
        <div className="lg:col-span-2">
          <Aviso>{erro}</Aviso>
        </div>
      )}

      <Cartao className="space-y-3">
        <h2 className="font-medium">Empresa</h2>
        <form action={salvarEmpresa.bind(null, e)} className="flex flex-wrap gap-2">
          <Input name="nome" defaultValue={empresa.nome} required className="min-w-48 flex-1" disabled={!pode("config.empresa")} />
          <Select name="fuso_horario" defaultValue={empresa.fuso_horario} className="w-auto" disabled={!pode("config.empresa")}>
            {["America/Sao_Paulo", "America/Manaus", "America/Cuiaba", "America/Belem", "America/Fortaleza", "America/Recife", "America/Noronha", "America/Rio_Branco"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
          {pode("config.empresa") && <Botao>Salvar</Botao>}
        </form>

        <div className="flex items-baseline justify-between pt-2">
          <h3 className="text-sm font-medium text-slate-700">Unidades</h3>
          <span className="text-xs text-slate-500">
            {unidadesAtivas} de {limiteUnidades} do seu plano
          </span>
        </div>
        <ul className="divide-y divide-slate-100 text-sm">
          {(unidades as Unidade[] | null)?.map((u) => (
            <li key={u.id} className="flex items-center justify-between py-2">
              <span className={u.ativo ? "" : "text-slate-400 line-through"}>{u.nome}</span>
              <Link href={`/e/${e}/config/unidades/${u.id}`} className="text-blue-600">
                QR Code e detalhes
              </Link>
            </li>
          ))}
        </ul>
        {pode("config.empresa") && unidadesAtivas >= limiteUnidades && (
          <p className="text-xs text-slate-500">Para cadastrar mais unidades, fale com o administrador do sistema.</p>
        )}
        {pode("config.empresa") && unidadesAtivas < limiteUnidades && (
          <form action={salvarUnidade.bind(null, e)} className="flex gap-2">
            <Input name="nome" placeholder="Nova unidade (ex.: Bangu)" required />
            <Botao variante="secundario">Adicionar</Botao>
          </form>
        )}
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Status do Kanban</h2>
        <p className="text-xs text-slate-500">
          Escolha o status na caixa para editar, ou "+ Novo status" para criar. O nome e a cor são livres. O tipo diz ao sistema o que o status significa (aberto, encerrado...) para calcular
          atrasos e relatórios. O módulo limita onde o status aparece (ex.: &quot;Aguardando peça&quot; só em Chamados). Adiar sempre pede uma nova data e permite retornar ao status anterior.
        </p>
        <SeletorPainel
          rotulo="Status"
          itens={[
            ...((status as Status[] | null) ?? []).map((s, i, lista) => ({
            id: s.id,
            rotulo: `${i + 1}. ${s.nome}${s.ativo ? "" : " (inativo)"}`,
            painel: (
              <div className="space-y-3 text-sm">
                <form action={salvarStatus.bind(null, e)} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input type="color" name="cor" defaultValue={s.cor} className="h-8 w-8 rounded" disabled={!pode("config.status")} />
                  <Input name="nome" defaultValue={s.nome} className="w-36 flex-1" disabled={!pode("config.status")} />
                  <Select name="tipo" defaultValue={s.tipo} className="w-36" disabled={!pode("config.status")}>
                    {(Object.keys(TIPOS_STATUS) as TipoStatus[]).map((t) => (
                      <option key={t} value={t}>
                        {TIPOS_STATUS[t]}
                      </option>
                    ))}
                  </Select>
                  {seletorModulo(s.modulo, !pode("config.status"))}
                  {pode("config.status") && <Botao variante="secundario" className="px-2 py-1">Salvar</Botao>}
                </form>
                {pode("config.status") && (
                  <div className="flex gap-3">
                    <form action={moverStatus.bind(null, e, s.id, -1)}>
                      <button disabled={i === 0} className="text-slate-500 disabled:opacity-30">↑ Subir</button>
                    </form>
                    <form action={moverStatus.bind(null, e, s.id, 1)}>
                      <button disabled={i === lista.length - 1} className="text-slate-500 disabled:opacity-30">↓ Descer</button>
                    </form>
                    <form action={alternarStatus.bind(null, e, s.id, !s.ativo)}>
                      <button className="text-slate-500">{s.ativo ? "Desativar" : "Ativar"}</button>
                    </form>
                  </div>
                )}
              </div>
            ),
          })),
            ...(pode("config.status")
              ? [
                  {
                    id: "novo",
                    rotulo: "+ Novo status",
                    painel: (
                      <form action={salvarStatus.bind(null, e)} className="flex flex-wrap gap-2">
              <input type="color" name="cor" defaultValue="#0891b2" className="h-9 w-9 rounded" />
              <Input name="nome" placeholder="Novo status (ex.: Aguardando peça)" required className="flex-1" />
              <Select name="tipo" defaultValue="em_andamento" className="w-36">
                {(Object.keys(TIPOS_STATUS) as TipoStatus[]).map((t) => (
                  <option key={t} value={t}>
                    {TIPOS_STATUS[t]}
                  </option>
                ))}
              </Select>
              {seletorModulo(null, false)}
              <Botao variante="secundario">Adicionar</Botao>
                      </form>
                    ),
                  },
                ]
              : []),
          ]}
        />
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Prazos dos chamados</h2>
        <p className="text-xs text-slate-500">Horas para atender um chamado, conforme a prioridade. Vale para os chamados abertos daqui em diante.</p>
        <form action={salvarSla.bind(null, e)} className="flex flex-wrap items-end gap-3">
          {Object.entries(PRIORIDADES).map(([k, v]) => (
            <label key={k} className="space-y-1 text-sm">
              <span className="block font-medium" style={{ color: v.cor }}>
                {v.rotulo}
              </span>
              <Input type="number" min={1} name={k} defaultValue={prazos[k] ?? ""} className="w-24" disabled={!pode("config.empresa")} />
            </label>
          ))}
          {pode("config.empresa") && <Botao variante="secundario">Salvar</Botao>}
        </form>
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Setores</h2>
        <p className="text-xs text-slate-500">Setores valem para todas as unidades (ex.: Cozinha, Salão, Estoque). Clique no nome para ativar ou desativar.</p>
        <div className="flex flex-wrap gap-2">
          {(setores as Setor[] | null)?.map((s) => (
            <span key={s.id} className="flex items-center gap-1">
              <form action={alternarSetor.bind(null, e, s.id, !s.ativo)}>
                <button
                  disabled={!pode("config.setores")}
                  title={s.ativo ? "Clique para desativar" : "Clique para ativar"}
                  className={`rounded-full border px-3 py-1 text-sm ${s.ativo ? "border-slate-300" : "border-dashed text-slate-400"}`}
                >
                  {s.nome}
                </button>
              </form>
              {pode("config.setores") && (
                <form action={excluirSetor.bind(null, e, s.id)}>
                  <BotaoConfirmar
                    mensagem={`Excluir o setor "${s.nome}"? Tarefas, colaboradores e check-lists dele ficam sem setor.`}
                    className="text-xs text-slate-400 hover:text-red-600"
                    title="Excluir"
                  >
                    ×
                  </BotaoConfirmar>
                </form>
              )}
            </span>
          ))}
        </div>
        {pode("config.setores") && (
          <form action={salvarSetor.bind(null, e)} className="flex gap-2">
            <Input name="nome" placeholder="Novo setor" required />
            <Botao variante="secundario">Adicionar</Botao>
          </form>
        )}
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Funções</h2>
        <p className="text-xs text-slate-500">
          Quem responde por cada atividade, sem citar a pessoa (ex.: Caixa, Cozinheiro, Líder de salão). Valem nas Rotinas e
          podem ser ligadas a cada colaborador. Clique no nome para ativar ou desativar.
        </p>
        <div className="flex flex-wrap gap-2">
          {(funcoes as Funcao[] | null)?.map((f) => (
            <span key={f.id} className="flex items-center gap-1">
              <form action={alternarFuncao.bind(null, e, f.id, !f.ativo)}>
                <button
                  disabled={!pode("config.funcoes")}
                  title={f.ativo ? "Clique para desativar" : "Clique para ativar"}
                  className={`rounded-full border px-3 py-1 text-sm ${f.ativo ? "border-slate-300" : "border-dashed text-slate-400"}`}
                >
                  {f.nome}
                </button>
              </form>
              {pode("config.funcoes") && (
                <form action={excluirFuncao.bind(null, e, f.id)}>
                  <BotaoConfirmar
                    mensagem={`Excluir a função "${f.nome}"? Colaboradores e rotinas dela ficam sem função.`}
                    className="text-xs text-slate-400 hover:text-red-600"
                    title="Excluir"
                  >
                    ×
                  </BotaoConfirmar>
                </form>
              )}
            </span>
          ))}
        </div>
        {pode("config.funcoes") && (
          <form action={salvarFuncao.bind(null, e)} className="flex gap-2">
            <Input name="nome" placeholder="Nova função" required />
            <Botao variante="secundario">Adicionar</Botao>
          </form>
        )}
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Categorias</h2>
        <p className="text-xs text-slate-500">Funcionam como etiquetas para filtrar (ex.: Delivery, Manutenção, Financeiro). Toque numa categoria para mudar o nome ou a cor sem perder o que já está ligado a ela.</p>
        <div className="flex flex-wrap gap-2">
          {(categorias as Categoria[] | null)?.map((c) => (
            <span key={c.id} className="flex items-start gap-1">
              {pode("config.setores") ? (
                <details className="group">
                  <summary className="cursor-pointer list-none" title="Editar">
                    <Etiqueta cor={c.cor}>{c.nome}</Etiqueta>
                  </summary>
                  <form action={editarCategoria.bind(null, e, c.id)} className="mt-2 flex gap-2">
                    <input type="color" name="cor" defaultValue={c.cor} className="h-9 w-9 rounded" />
                    <Input name="nome" defaultValue={c.nome} required />
                    <Botao variante="secundario">Salvar</Botao>
                  </form>
                </details>
              ) : (
                <Etiqueta cor={c.cor}>{c.nome}</Etiqueta>
              )}
              {pode("config.setores") && (
                <form action={excluirCategoria.bind(null, e, c.id)}>
                  <button className="text-xs text-slate-400 hover:text-red-600" title="Excluir">×</button>
                </form>
              )}
            </span>
          ))}
        </div>
        {pode("config.setores") && (
          <form action={salvarCategoria.bind(null, e)} className="flex gap-2">
            <input type="color" name="cor" defaultValue="#64748b" className="h-9 w-9 rounded" />
            <Input name="nome" placeholder="Nova categoria" required />
            <Botao variante="secundario">Adicionar</Botao>
          </form>
        )}
      </Cartao>
    </div>
  );
}
