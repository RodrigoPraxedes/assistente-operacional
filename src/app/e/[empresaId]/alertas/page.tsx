import { redirect } from "next/navigation";

// Alertas agora ficam em Ações (ações com avisos antes do vencimento)
export default async function PaginaAlertas({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { empresaId } = await params;
  const { salvo } = await searchParams;
  redirect(`/e/${empresaId}/acoes${salvo ? "?salvo=1" : ""}`);
}
