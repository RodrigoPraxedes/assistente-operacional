import Link from "next/link";
import { getContexto } from "@/lib/contexto";
import { ORIGENS, PRIORIDADES, TIPOS_STATUS, type Categoria, type Setor, type Status, type TipoStatus, type Unidade } from "@/lib/types";
import { Aviso, Botao, Cartao, Etiqueta, Input, Select } from "@/components/ui";
import {
  alternarSetor,
  alternarStatus,
  excluirCategoria,
  moverStatus,
  salvarCategoria,
  salvarEmpresa,
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

  const [{ data: unidades }, { data: setores }, { data: categorias }, { data: status }] = await Promise.all([
    supabase.from("unidades").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("setores").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("categorias").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("status").select("*").eq("empresa_id", empresaId).order("ordem"),
  ]);
  const { data: sla } = await supabase.from("empresas").select("sla_chamados").eq("id", empresaId).single();
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

        <h3 className="pt-2 text-sm font-medium text-slate-700">Unidades</h3>
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
        {pode("config.empresa") && (
          <form action={salvarUnidade.bind(null, e)} className="flex gap-2">
            <Input name="nome" placeholder="Nova unidade (ex.: Bangu)" required />
            <Botao variante="secundario">Adicionar</Botao>
          </form>
        )}
      </Cartao>

      <Cartao className="space-y-3">
        <h2 className="font-medium">Status do Kanban</h2>
        <p className="text-xs text-slate-500">
          O nome e a cor são livres. O tipo diz ao sistema o que o status significa (aberto, encerrado...) para calcular
          atrasos e relatórios. O módulo limita onde o status aparece (ex.: &quot;Aguardando peça&quot; só em Chamados). Adiar sempre pede uma nova data e permite retornar ao status anterior.
        </p>
        <ul className="space-y-2">
          {(status as Status[] | null)?.map((s, i, lista) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <form action={salvarStatus.bind(null, e)} className="flex flex-1 flex-wrap items-center gap-2">
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
                <div className="flex gap-1">
                  <form action={moverStatus.bind(null, e, s.id, -1)}>
                    <button disabled={i === 0} className="px-1 text-slate-500 disabled:opacity-30" title="Subir">↑</button>
                  </form>
                  <form action={moverStatus.bind(null, e, s.id, 1)}>
                    <button disabled={i === lista.length - 1} className="px-1 text-slate-500 disabled:opacity-30" title="Descer">↓</button>
                  </form>
                  <form action={alternarStatus.bind(null, e, s.id, !s.ativo)}>
                    <button className="px-1 text-xs text-slate-500">{s.ativo ? "Desativar" : "Ativar"}</button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
        {pode("config.status") && (
          <form action={salvarStatus.bind(null, e)} className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
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
        )}
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
        <p className="text-xs text-slate-500">Setores valem para todas as unidades (ex.: Cozinha, Salão, Estoque).</p>
        <div className="flex flex-wrap gap-2">
          {(setores as Setor[] | null)?.map((s) => (
            <form key={s.id} action={alternarSetor.bind(null, e, s.id, !s.ativo)}>
              <button
                disabled={!pode("config.setores")}
                title={s.ativo ? "Clique para desativar" : "Clique para ativar"}
                className={`rounded-full border px-3 py-1 text-sm ${s.ativo ? "border-slate-300" : "border-dashed text-slate-400"}`}
              >
                {s.nome}
              </button>
            </form>
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
        <h2 className="font-medium">Categorias</h2>
        <p className="text-xs text-slate-500">Funcionam como etiquetas para filtrar (ex.: Delivery, Manutenção, Financeiro).</p>
        <div className="flex flex-wrap gap-2">
          {(categorias as Categoria[] | null)?.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <Etiqueta cor={c.cor}>{c.nome}</Etiqueta>
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
