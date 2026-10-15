// Logotipo do Atalaia: o nome em minúsculas com o pingo do "i" em azul,
// como a bolinha de notificação de um app. Escala com o tamanho da fonte.
export function Marca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-semibold tracking-tight lowercase ${className}`} aria-label="Atalaia">
      <span aria-hidden>atala</span>
      <span aria-hidden className="relative">
        ı
        <span className="absolute left-1/2 top-[0.1em] h-[0.24em] w-[0.24em] -translate-x-1/2 rounded-full bg-blue-600" />
      </span>
      <span aria-hidden>a</span>
    </span>
  );
}
