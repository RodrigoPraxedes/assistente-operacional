// Endereços do login do MCP. Quem emite o token é o próprio Supabase (servidor
// OAuth 2.1 ligado no painel do Supabase); o app só mostra a tela de autorizar
// (/oauth/consent) e diz ao Claude onde fica esse servidor.

export function origem(req: Request) {
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") ?? url.host;
  const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export const enderecoRecurso = (req: Request) => `${origem(req)}/api/mcp`;

export const linkMetadados = (req: Request) => `${origem(req)}/.well-known/oauth-protected-resource/api/mcp`;

export const servidorLogin = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}/auth/v1`;
