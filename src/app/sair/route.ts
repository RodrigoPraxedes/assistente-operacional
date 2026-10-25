import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  // só este navegador: o padrão (global) derrubaria também o conector do Claude (MCP)
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/entrar", request.url), { status: 303 });
}
