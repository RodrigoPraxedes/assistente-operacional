export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-semibold text-slate-900">Atalaia</p>
          <p className="text-sm text-slate-500">A operação à vista</p>
        </div>
        {children}
      </div>
    </main>
  );
}
