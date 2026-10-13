import { FormEntrar } from "./form";

export default async function PaginaEntrar({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  return <FormEntrar voltar={voltar} />;
}
