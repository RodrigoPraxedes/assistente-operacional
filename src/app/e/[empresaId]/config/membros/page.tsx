import Link from "next/link";
import { exigirPermissao } from "@/lib/contexto";
import type { Membro } from "@/lib/types";
import { Etiqueta, LinkBotao, Titulo } from "@/components/ui";

export default async function PaginaMembros({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  const { supabase } = await exigirPermissao(empresaId, "config.membros");

  const [{ data: membros }, { data: perfis }, { data: setores }, { data: comPin }] = await Promise.all([
    supabase.from("membros").select("*").eq("empresa_id", empresaId).order("nome"),
    supabase.from("perfis").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId),
    supabase.rpc("membros_com_pin", { p_empresa: empresaId }),
  ]);
  const perfil = new Map((perfis ?? []).map((p) => [p.id, p.nome]));
  const setor = new Map((setores ?? []).map((s) => [s.id, s.nome]));
  const pins = new Set<string>((comPin as string[] | null) ?? []);

  return (
    <div>
      <Titulo acoes={<LinkBotao href={`/e/${empresaId}/config/membros/novo`}>Novo colaborador</LinkBotao>}>
        Colaboradores
      </Titulo>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-superficie">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Nome</th>
              <th className="px-3 py-2">Cargo</th>
              <th className="px-3 py-2">Perfil</th>
              <th className="px-3 py-2">Setor</th>
              <th className="px-3 py-2">Acesso</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(membros as Membro[] | null)?.map((m) => (
              <tr key={m.id} className={m.ativo ? "" : "text-slate-400"}>
                <td className="px-3 py-2">
                  <Link href={`/e/${empresaId}/config/membros/${m.id}`} className="font-medium text-blue-700">
                    {m.nome}
                  </Link>
                  {m.dono && <span className="ml-2 text-xs text-slate-500">(dono)</span>}
                </td>
                <td className="px-3 py-2">{m.cargo}</td>
                <td className="px-3 py-2">{m.perfil_id ? perfil.get(m.perfil_id) : "—"}</td>
                <td className="px-3 py-2">{m.setor_id ? setor.get(m.setor_id) : "—"}</td>
                <td className="space-x-1 px-3 py-2">
                  {m.usuario_id ? (
                    <Etiqueta cor="#16a34a">App</Etiqueta>
                  ) : m.email ? (
                    <Etiqueta cor="#d97706">Convite pendente</Etiqueta>
                  ) : null}
                  {pins.has(m.id) && <Etiqueta cor="#2563eb">PIN</Etiqueta>}
                  {!m.ativo && <Etiqueta>Inativo</Etiqueta>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Quem tem e-mail cadastrado entra no app criando a conta com esse mesmo e-mail. Quem só usa o QR Code da unidade
        precisa de um PIN de 4 dígitos.
      </p>
    </div>
  );
}
