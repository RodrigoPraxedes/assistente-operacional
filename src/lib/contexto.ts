import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Empresa, Escopo, Membro } from "@/lib/types";

// Carrega quem é o usuário dentro da empresa da URL e o que ele pode fazer.
// As regras de verdade estão no banco (RLS); isto aqui só decide o que mostrar.
export const getContexto = cache(async (empresaId: string) => {
  const supabase = await createClient();
  // getClaims confere o login no próprio servidor (chave pública do Supabase),
  // sem ida e volta ao serviço de login a cada página
  const { data: sessao } = await supabase.auth.getClaims();
  const user = sessao?.claims ? { id: sessao.claims.sub, email: sessao.claims.email ?? null } : null;
  if (!user) redirect("/entrar");

  // tudo numa leva só: empresa, membro (já com as permissões do perfil) e a
  // lista completa de permissões (para dono/admin), em vez de uma consulta
  // depois da outra
  const [{ data: empresa }, { data: membroComPerfil }, { data: todas }] = await Promise.all([
    supabase.from("empresas").select("id, nome, fuso_horario, situacao").eq("id", empresaId).maybeSingle(),
    supabase
      .from("membros")
      .select("*, perfis(perfil_permissoes(permissao, escopo))")
      .eq("empresa_id", empresaId)
      .eq("usuario_id", user.id)
      .eq("ativo", true)
      .maybeSingle(),
    supabase.from("permissoes").select("chave"),
  ]);
  if (!empresa || !membroComPerfil) {
    // empresa suspensa ou aguardando aprovação: volta para a lista, que explica
    const { data: minhas } = await supabase.rpc("minhas_empresas");
    if ((minhas as { id: string }[] | null)?.some((e) => e.id === empresaId)) redirect("/app");
    // link de WhatsApp aberto numa conta que não participa da empresa: explica em vez de 404
    redirect("/app?sem_acesso=1");
  }

  const { perfis, ...membro } = membroComPerfil as Membro & {
    perfis: { perfil_permissoes: { permissao: string; escopo: string }[] } | null;
  };
  const permissoes = new Map<string, Escopo>();
  if (membro.dono || membro.admin_master) {
    todas?.forEach((p) => permissoes.set(p.chave, "empresa"));
  } else if (membro.perfil_id) {
    perfis?.perfil_permissoes.forEach((p) => permissoes.set(p.permissao, p.escopo as Escopo));
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

// Admin Master: dono da plataforma, acima das empresas
export const ehAdminMaster = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.rpc("eh_admin_master");
  return data === true;
});
