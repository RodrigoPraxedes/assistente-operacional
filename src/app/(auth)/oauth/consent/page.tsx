import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Aviso, Botao } from "@/components/ui";
import { decidir } from "./actions";

// Tela de autorizar: aparece quando alguém liga o Atalaia no Claude (MCP).
// O Supabase manda para cá com ?authorization_id=...; a pessoa já entrou no
// app (o middleware leva ao login e volta para cá).
export default async function PaginaAutorizar({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: id } = await searchParams;
  if (!id) return <Aviso>Link de autorização incompleto. Tente conectar de novo pelo Claude.</Aviso>;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(id);
  if (error || !data) return <Aviso>Este pedido de acesso expirou ou não é válido. Tente conectar de novo pelo Claude.</Aviso>;
  // já autorizado antes: volta direto para o aplicativo que pediu
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const app = data.client.name || "Um aplicativo";
  return (
    <form action={decidir} className="space-y-4 rounded-xl border border-slate-200 bg-superficie p-6 shadow-sm">
      <input type="hidden" name="authorization_id" value={data.authorization_id} />
      <h1 className="text-lg font-semibold text-slate-900">Conectar ao Atalaia</h1>
      <p className="text-sm text-slate-600">
        <strong className="text-slate-900">{app}</strong> quer consultar o Atalaia em seu nome, como{" "}
        <strong className="text-slate-900">{data.user.email}</strong>.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
        <li>Só consulta: tarefas, check-lists, manutenções, escalas, alertas, projetos, equipe, prestadores e patrimônio.</li>
        <li>Vê apenas o que você já vê no app, com as mesmas permissões e itens privados.</li>
        <li>Não cria, altera nem apaga nada.</li>
      </ul>
      <p className="text-xs text-slate-500">Para desligar depois, remova o conector no Claude.</p>
      <div className="flex gap-2">
        <Botao type="submit" name="decisao" value="negar" variante="secundario" className="flex-1">
          Negar
        </Botao>
        <Botao type="submit" name="decisao" value="permitir" className="flex-1">
          Permitir
        </Botao>
      </div>
    </form>
  );
}
