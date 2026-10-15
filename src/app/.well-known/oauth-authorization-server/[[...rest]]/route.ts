// Para clientes MCP antigos, que procuram o servidor de login no próprio
// endereço do app: repassa os metadados publicados pelo Supabase.
export async function GET() {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const r = await fetch(`${base}/.well-known/oauth-authorization-server/auth/v1`, { next: { revalidate: 3600 } });
  if (!r.ok) return new Response(null, { status: 404 });
  return Response.json(await r.json(), { headers: { "access-control-allow-origin": "*" } });
}
