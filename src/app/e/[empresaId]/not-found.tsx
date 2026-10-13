import Link from "next/link";

export default function NaoEncontrado() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-medium">Página não encontrada ou sem permissão</p>
      <Link href="/app" className="mt-2 inline-block text-sm text-blue-600">
        Voltar para o início
      </Link>
    </div>
  );
}
