import { redirect } from "next/navigation";

export default async function Config({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  redirect(`/e/${empresaId}/config/geral`);
}
