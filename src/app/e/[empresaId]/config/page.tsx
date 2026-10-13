import { redirect } from "next/navigation";

// repassa ?erro= das actions que voltam para /config
export default async function Config({
  params,
  searchParams,
}: {
  params: Promise<{ empresaId: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const { empresaId } = await params;
  const { erro } = await searchParams;
  redirect(`/e/${empresaId}/config/geral${erro ? `?erro=${encodeURIComponent(erro)}` : ""}`);
}
