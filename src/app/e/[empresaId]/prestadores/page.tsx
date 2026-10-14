import Link from "next/link";
import { Phone } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { formatarTelefone } from "@/lib/formato";
import { linkWhatsApp } from "@/lib/whatsapp";
import type { Fornecedor, TipoServico } from "@/lib/types";
import { Aviso, Cartao, Etiqueta, Input, LinkBotao, Select, Titulo, Vazio } from "@/components/ui";

type Prestador = Fornecedor & { fornecedor_tipos: { tipo_id: string }[] };

export default async function Prestadores({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ tipo?: string; busca?: string; salvo?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, pode } = await getContexto(empresaId);
  const gerencia = pode("prestadores.gerenciar");

  const [{ data: prestadores }, { data: tipos }, { data: atendimentos }] = await Promise.all([
    supabase
      .from("fornecedores")
      .select("*, fornecedor_tipos(tipo_id)")
      .eq("empresa_id", empresaId)
      .order("ativo", { ascending: false })
      .order("nome")
      .returns<Prestador[]>(),
    supabase.from("tipos_servico").select("*").eq("empresa_id", empresaId).order("nome").returns<TipoServico[]>(),
    supabase.from("chamados").select("fornecedor_id").eq("empresa_id", empresaId).not("fornecedor_id", "is", null),
  ]);

  const nomeTipo = new Map((tipos ?? []).map((t) => [t.id, t.nome]));
  const qtd = new Map<string, number>();
  for (const c of atendimentos ?? []) qtd.set(c.fornecedor_id!, (qtd.get(c.fornecedor_id!) ?? 0) + 1);

  const busca = (filtros.busca ?? "").trim().toLocaleLowerCase("pt-BR");
  const lista = (prestadores ?? []).filter(
    (p) =>
      (gerencia || p.ativo) &&
      (!filtros.tipo || p.fornecedor_tipos.some((t) => t.tipo_id === filtros.tipo)) &&
      (!busca || p.nome.toLocaleLowerCase("pt-BR").includes(busca)),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo
        voltar={{ href: `/e/${empresaId}/chamados`, rotulo: "Manutenções" }}
        acoes={
          gerencia && (
            <>
              <LinkBotao variante="secundario" href={`/e/${empresaId}/prestadores/tipos`}>
                Tipos de serviço
              </LinkBotao>
              <LinkBotao variante="secundario" href={`/e/${empresaId}/prestadores/importar`}>
                Importar planilha
              </LinkBotao>
              <LinkBotao href={`/e/${empresaId}/prestadores/novo`}>Novo prestador</LinkBotao>
            </>
          )
        }
      >
        Prestadores de serviço
      </Titulo>
      {filtros.salvo && <Aviso tipo="sucesso">Prestador salvo.</Aviso>}

      <form className="flex flex-wrap items-end gap-2">
        <Input name="busca" defaultValue={filtros.busca ?? ""} placeholder="Buscar pelo nome" className="w-48 flex-1" />
        <Select name="tipo" defaultValue={filtros.tipo ?? ""} className="w-auto" aria-label="Tipo de serviço">
          <option value="">Todos os serviços</option>
          {(tipos ?? [])
            .filter((t) => t.ativo || t.id === filtros.tipo)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
        </Select>
        <button className="min-h-11 rounded-lg border border-slate-300 bg-superficie px-3 py-2 text-sm sm:min-h-10">Filtrar</button>
        {(filtros.tipo || filtros.busca) && (
          <Link href={`/e/${empresaId}/prestadores`} className="px-2 py-2 text-sm text-slate-500">
            Limpar
          </Link>
        )}
      </form>

      {lista.length === 0 ? (
        <Vazio>
          {prestadores?.length
            ? "Nenhum prestador com esse filtro."
            : gerencia
              ? "Nenhum prestador cadastrado. Use Novo prestador para cadastrar o primeiro."
              : "Nenhum prestador cadastrado ainda."}
        </Vazio>
      ) : (
        <ul className="space-y-3">
          {lista.map((p) => (
            <li key={p.id}>
              <Cartao className={`space-y-2 ${p.ativo ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {p.nome}
                      {!p.ativo && <span className="ml-2 text-xs font-normal text-slate-500">Inativo</span>}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.fornecedor_tipos
                        .map((t) => nomeTipo.get(t.tipo_id))
                        .filter((n): n is string => !!n)
                        .sort((a, b) => a.localeCompare(b, "pt-BR"))
                        .map((n) => (
                          <Etiqueta key={n}>{n}</Etiqueta>
                        ))}
                    </div>
                  </div>
                  {gerencia && (
                    <Link href={`/e/${empresaId}/prestadores/${p.id}`} className="text-sm text-blue-600">
                      Editar
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  {[p.telefone, p.telefone2].filter(Boolean).map((tel) => (
                    <a key={tel} href={`tel:${tel}`} className="inline-flex items-center gap-1 text-slate-700">
                      <Phone className="h-3.5 w-3.5 text-slate-500" aria-hidden />
                      {formatarTelefone(tel)}
                    </a>
                  ))}
                  {p.telefone && (
                    <a
                      href={linkWhatsApp(`Olá, ${p.nome}!`, p.telefone)}
                      target="_blank"
                      rel="noopener"
                      className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      WhatsApp
                    </a>
                  )}
                  {(qtd.get(p.id) ?? 0) > 0 &&
                    (gerencia ? (
                      <Link href={`/e/${empresaId}/prestadores/${p.id}#chamados`} className="text-xs text-blue-600">
                        {qtd.get(p.id)} chamado(s) atendido(s)
                      </Link>
                    ) : (
                      <span className="text-xs text-slate-500">{qtd.get(p.id)} chamado(s) atendido(s)</span>
                    ))}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
