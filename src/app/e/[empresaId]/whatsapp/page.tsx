import { redirect } from "next/navigation";

export default async function WhatsApp({ params }: { params: Promise<{ empresaId: string }> }) {
  const { empresaId } = await params;
  redirect(`/e/${empresaId}/whatsapp/conexao`);
}
