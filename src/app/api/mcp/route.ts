import { createClient } from "@supabase/supabase-js";
import { FERRAMENTAS, type Ferramenta } from "@/lib/mcp/ferramentas";
import { linkMetadados } from "@/lib/mcp/oauth";

// Servidor MCP do Atalaia (só consultas). O Claude conversa com esta rota por
// JSON-RPC ("Streamable HTTP" sem sessão). Cada chamada traz o token de login
// da própria pessoa (OAuth do Supabase), e as consultas rodam como ela: a regra
// de acesso do banco (RLS) decide o que aparece, igual no app.

export const dynamic = "force-dynamic";

const VERSOES = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

type Pedido = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };

function semLogin(req: Request) {
  return new Response(JSON.stringify({ error: "invalid_token", error_description: "Entre com sua conta do Atalaia." }), {
    status: 401,
    headers: {
      "content-type": "application/json",
      "www-authenticate": `Bearer resource_metadata="${linkMetadados(req)}"`,
    },
  });
}

async function cliente(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await supabase.auth.getClaims(token);
  const sub = data?.claims?.sub;
  if (!sub) return null;
  return { supabase, usuarioId: sub };
}

const resposta = (id: Pedido["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const erro = (id: Pedido["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

function descrever(f: Ferramenta) {
  return {
    name: f.nome,
    title: f.titulo,
    description: f.descricao,
    inputSchema: f.parametros,
    annotations: { title: f.titulo, readOnlyHint: true, openWorldHint: false },
  };
}

async function atender(p: Pedido, ctx: NonNullable<Awaited<ReturnType<typeof cliente>>>) {
  switch (p.method) {
    case "initialize": {
      const pedida = String(p.params?.protocolVersion ?? "");
      return resposta(p.id, {
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "atalaia", title: "Atalaia", version: "1.0.0" },
        instructions:
          "Consultas da operação no Atalaia (tarefas, check-lists, manutenções, escalas, alertas, projetos, equipe, prestadores e patrimônio). " +
          "Só leitura: nada é alterado. Mostra apenas o que a pessoa logada pode ver no app. " +
          "Se ela participa de mais de uma empresa, informe o parâmetro empresa (nome ou id; veja minhas_empresas). " +
          "Datas e horários já vêm no fuso da empresa. Responda em português do Brasil.",
      });
    }
    case "ping":
      return resposta(p.id, {});
    case "tools/list":
      return resposta(p.id, { tools: FERRAMENTAS.map(descrever) });
    case "tools/call": {
      const nome = String(p.params?.name ?? "");
      const f = FERRAMENTAS.find((x) => x.nome === nome);
      if (!f) return erro(p.id, -32602, `Ferramenta desconhecida: ${nome}`);
      try {
        const dados = await f.executar(ctx, (p.params?.arguments ?? {}) as Record<string, unknown>);
        return resposta(p.id, { content: [{ type: "text", text: JSON.stringify(dados, null, 1) }] });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao consultar.";
        return resposta(p.id, { content: [{ type: "text", text: msg }], isError: true });
      }
    }
    case "resources/list":
      return resposta(p.id, { resources: [] });
    case "prompts/list":
      return resposta(p.id, { prompts: [] });
    default:
      return erro(p.id, -32601, `Método não suportado: ${p.method}`);
  }
}

export async function POST(req: Request) {
  const ctx = await cliente(req);
  if (!ctx) return semLogin(req);

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return Response.json(erro(null, -32700, "JSON inválido"), { status: 400 });
  }

  const lote = Array.isArray(corpo);
  const pedidos = (lote ? corpo : [corpo]) as Pedido[];
  const respostas = [];
  for (const p of pedidos) {
    // notificações (sem id) e respostas do cliente não pedem retorno
    if (!p || typeof p.method !== "string" || p.id === undefined) continue;
    respostas.push(await atender(p, ctx));
  }
  if (respostas.length === 0) return new Response(null, { status: 202 });
  return Response.json(lote ? respostas : respostas[0]);
}

// sem sessão nem avisos do servidor: o canal GET (SSE) não existe aqui
export async function GET(req: Request) {
  if (!(await cliente(req))) return semLogin(req);
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}

export async function DELETE() {
  return new Response(null, { status: 405, headers: { allow: "POST" } });
}
