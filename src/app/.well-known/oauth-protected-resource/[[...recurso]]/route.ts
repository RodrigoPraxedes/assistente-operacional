import { enderecoRecurso, servidorLogin } from "@/lib/mcp/oauth";

// Metadados do recurso protegido (RFC 9728): diz ao Claude que o /api/mcp
// aceita o login emitido pelo Supabase do Atalaia.
export function GET(req: Request) {
  return Response.json(
    {
      resource: enderecoRecurso(req),
      authorization_servers: [servidorLogin()],
      bearer_methods_supported: ["header"],
      resource_name: "Atalaia",
    },
    { headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" } },
  );
}
