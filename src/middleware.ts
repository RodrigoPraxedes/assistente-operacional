import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  // central pública (QR): sem sessão, e o tema segue sempre o aparelho, mesmo
  // que o navegador guarde o tema escolhido no app logado
  if (request.nextUrl.pathname.startsWith("/qr/")) {
    const headers = new Headers(request.headers);
    headers.set("x-tema-sistema", "1");
    return NextResponse.next({ request: { headers } });
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    // tudo menos arquivos estáticos, o feed da agenda, o cron, o webhook do
    // WhatsApp e o MCP (que entra com token próprio, sem cookie)
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|agenda/|api/cron|api/whatsapp/webhook|api/mcp|\\.well-known/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
