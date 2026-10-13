import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Empresa, Escopo, Membro } from "@/lib/types";

// Carrega quem é o usuário dentro da empresa da URL e o que ele pode fazer.
// As regras de verdade estão no banco (RLS); isto aqui só decide o que mostrar.
export const getContexto = cache(async (empresaId: string) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/entrar");

  const [{ data: empresa }, { data: membro }] = await Promise.all([
    supabase.from("empresas").select("id, nome, fuso_horario").eq("id", empresaId).maybeSingle(),
    supabase
      .from("membros")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("usuario_id", user.id)
      .eq("ativo", true)
      .maybeSingle(),
  ]);
  if (!empresa || !membro) notFound();

  const permissoes = new Map<string, Escopo>();
  if (membro.dono) {
    const { data } = await supabase.from("permissoes").select("chave");
    data?.forEach((p) => permissoes.set(p.chave, "empresa"));
  } else if (membro.perfil_id) {
    const { data } = await supabase
      .from("perfil_permissoes")
      .select("permissao, escopo")
      .eq("perfil_id", membro.perfil_id);
    data?.forEach((p) => permissoes.set(p.permissao, p.escopo as Escopo));
  }

  return {
    supabase,
    user,
    empresa: empresa as Empresa,
    membro: membro as Membro,
    pode: (chave: string) => permissoes.has(chave),
    escopo: (chave: string) => permissoes.get(chave) ?? null,
  };
});

export async function exigirPermissao(empresaId: string, chave: string) {
  const ctx = await getContexto(empresaId);
  if (!ctx.pode(chave)) notFound();
  return ctx;
}
