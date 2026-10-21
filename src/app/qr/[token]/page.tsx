import { notFound } from "next/navigation";
import { carregarCentral } from "@/lib/qr";
import { CentralLista } from "./central-lista";

export const dynamic = "force-dynamic";

function hora(iso: string, fuso: string) {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));
}

export default async function CentralQr({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const central = await carregarCentral(token);
  if (!central) notFound();

  return (
    <>
      <div className="pt-4 text-center">
        <p className="text-sm text-slate-500">{central.empresa.nome}</p>
        <h1 className="text-2xl font-semibold">{central.unidade.nome}</h1>
        <p className="text-sm text-slate-500">{(central.contagens ?? []).length ? "Escolha o que vai preencher" : "Escolha o check-list para preencher"}</p>
      </div>
      <CentralLista
        chamado={{
          id: "chamado",
          nome: "Solicitar manutenção",
          descricao: "Algo quebrado ou com problema? Abra um chamado.",
          href: `/qr/${token}/chamado`,
        }}
        checklists={central.modelos.map((m) => ({
          id: m.id,
          nome: m.nome,
          descricao: m.descricao,
          href: `/qr/${token}/${m.id}`,
          detalhe: m.horario_preferencial,
          feitoHoje: m.feito_hoje_em ? hora(m.feito_hoje_em, central.empresa.fuso_horario) : null,
        }))}
        contagens={(central.contagens ?? []).map((c) => ({
          id: c.id,
          nome: c.nome,
          descricao: c.descricao,
          href: `/qr/${token}/contagem/${c.id}`,
          feitoHoje: c.feito_hoje_em ? hora(c.feito_hoje_em, central.empresa.fuso_horario) : null,
        }))}
      />
      {central.colaboradores.length === 0 && central.modelos.some((m) => m.modo_executor === "usuarios") && (
        <p className="text-center text-xs text-slate-500">
          Nenhum colaborador com PIN nesta unidade. Peça ao gestor para cadastrar o seu PIN.
        </p>
      )}
    </>
  );
}
