import Link from "next/link";
import { Download, ExternalLink, FileText, NotebookText } from "lucide-react";
import { getContexto } from "@/lib/contexto";
import { formatarData } from "@/lib/formato";
import { Aviso, Cartao, Etiqueta, Input, LinkBotao, Select, Titulo, Vazio, Botao } from "@/components/ui";
import { textoDosBlocos, type Bloco } from "./blocos";

interface Ficha {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria_id: string | null;
  tipo: "pdf" | "montada";
  arquivo_path: string | null;
  nome_arquivo: string | null;
  blocos: Bloco[];
  tamanho_bytes: number | null;
  updated_at: string;
}

const tamanho = (b: number | null) => (b ? (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`) : "");
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

export default async function Fichas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ categoria?: string; busca?: string; salvo?: string; excluida?: string }>;
}) {
  const { empresaId } = await params;
  const filtros = await searchParams;
  const { supabase, pode, empresa } = await getContexto(empresaId);
  const gerencia = pode("fichas.gerenciar");

  const [{ data: fichas }, { data: categorias }] = await Promise.all([
    supabase.from("fichas").select("*").eq("empresa_id", empresaId).order("titulo").returns<Ficha[]>(),
    supabase.from("ficha_categorias").select("id, nome, ativo").eq("empresa_id", empresaId).order("nome"),
  ]);
  const nomeCat = new Map((categorias ?? []).map((c) => [c.id, c.nome]));

  const busca = norm((filtros.busca ?? "").trim());
  const lista = (fichas ?? []).filter(
    (f) =>
      (!filtros.categoria || (filtros.categoria === "sem" ? !f.categoria_id : f.categoria_id === filtros.categoria)) &&
      (!busca || norm(`${f.titulo} ${f.descricao ?? ""} ${nomeCat.get(f.categoria_id ?? "") ?? ""} ${textoDosBlocos(f.blocos ?? [])}`).includes(busca)),
  );

  // links assinados (1 h) para abrir e para baixar os PDFs
  const caminhos = lista.flatMap((f) => (f.tipo === "pdf" && f.arquivo_path ? [f.arquivo_path] : []));
  const [{ data: abrir }, { data: baixar }] = caminhos.length
    ? await Promise.all([
        supabase.storage.from("fichas").createSignedUrls(caminhos, 3600),
        supabase.storage.from("fichas").createSignedUrls(caminhos, 3600, { download: true }),
      ])
    : [{ data: [] }, { data: [] }];
  const urlAbrir = new Map((abrir ?? []).map((u) => [u.path, u.signedUrl]));
  const urlBaixar = new Map((baixar ?? []).map((u) => [u.path, u.signedUrl]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Titulo
        acoes={
          gerencia && (
            <>
              <LinkBotao variante="secundario" href={`/e/${empresaId}/fichas/categorias`}>
                Categorias
              </LinkBotao>
              <LinkBotao href={`/e/${empresaId}/fichas/nova`}>Nova ficha</LinkBotao>
            </>
          )
        }
      >
        Fichas
      </Titulo>
      {filtros.salvo && <Aviso tipo="sucesso">Ficha salva.</Aviso>}
      {filtros.excluida && <Aviso tipo="sucesso">Ficha apagada.</Aviso>}

      <form className="flex flex-wrap items-end gap-2">
        <Input name="busca" defaultValue={filtros.busca ?? ""} placeholder="Buscar fichas" className="w-48 flex-1" />
        <Select name="categoria" defaultValue={filtros.categoria ?? ""} className="w-auto" aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {(categorias ?? [])
            .filter((c) => c.ativo || c.id === filtros.categoria)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          <option value="sem">Sem categoria</option>
        </Select>
        <Botao type="submit" variante="secundario">
          Filtrar
        </Botao>
      </form>

      {lista.length === 0 ? (
        <Vazio>{fichas?.length ? "Nenhuma ficha com esse filtro." : "Nenhuma ficha ainda. Toque em Nova ficha para enviar um PDF ou montar uma ficha aqui."}</Vazio>
      ) : (
        <ul className="space-y-2">
          {lista.map((f) => (
            <li key={f.id}>
              <Cartao className="flex flex-wrap items-center gap-3 p-3">
                {f.tipo === "montada" ? (
                  <NotebookText className="h-6 w-6 shrink-0 text-blue-600" aria-label="Ficha montada no Atalaia" />
                ) : (
                  <FileText className="h-6 w-6 shrink-0 text-blue-600" aria-label="PDF" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{f.titulo}</p>
                  {f.descricao && <p className="line-clamp-2 text-sm text-slate-600">{f.descricao}</p>}
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {f.categoria_id && <Etiqueta>{nomeCat.get(f.categoria_id) ?? "—"}</Etiqueta>}
                    <span>
                      {[tamanho(f.tamanho_bytes), `atualizada em ${formatarData(f.updated_at, empresa.fuso_horario)}`].filter(Boolean).join(" · ")}
                    </span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {f.tipo === "montada" && (
                    <Link
                      href={`/e/${empresaId}/fichas/${f.id}/ver`}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                    </Link>
                  )}
                  {f.arquivo_path && urlAbrir.get(f.arquivo_path) && (
                    <a
                      href={urlAbrir.get(f.arquivo_path) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" aria-hidden /> Abrir
                    </a>
                  )}
                  {f.arquivo_path && urlBaixar.get(f.arquivo_path) && (
                    <a
                      href={urlBaixar.get(f.arquivo_path) ?? undefined}
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-blue-600 hover:bg-slate-100"
                    >
                      <Download className="h-4 w-4" aria-hidden /> Baixar
                    </a>
                  )}
                  {gerencia && (
                    <LinkBotao variante="secundario" href={`/e/${empresaId}/fichas/${f.id}`}>
                      Editar
                    </LinkBotao>
                  )}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
