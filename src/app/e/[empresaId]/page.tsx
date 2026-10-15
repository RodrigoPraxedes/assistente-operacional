import { redirect } from "next/navigation";

export default async function InicioEmpresa({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  redirect(`/e/${empresaId}/painel`);
}
