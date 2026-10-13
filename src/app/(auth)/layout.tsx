export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-2xl font-semibold text-slate-900">Assistente Operacional</p>
          <p className="text-sm text-slate-500">Check-lists, tarefas e acompanhamento da operação</p>
        </div>
        {children}
      </div>
    </main>
  );
}
