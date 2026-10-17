import { formatarDataHora, soDigitos } from "@/lib/formato";

// Link wa.me: abre o WhatsApp com a mensagem pronta (a pessoa aperta enviar).
// Sem telefone, o WhatsApp pergunta para quem enviar.
export function linkWhatsApp(texto: string, telefone?: string | null) {
  let numero = soDigitos(telefone);
  // número brasileiro sem DDI (DDD + 8/9 dígitos)
  if (numero.length === 10 || numero.length === 11) numero = `55${numero}`;
  const base = numero ? `https://wa.me/${numero}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}

export function urlDoSite(caminho: string) {
  let base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  // na Vercel, variável vazia ou esquecida com "localhost" usa o endereço de produção
  const producao = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (producao && (!base || /localhost|127\.0\.0\.1/.test(base))) base = `https://${producao}`;
  return `${base}${caminho}`;
}

// Mensagem sobre uma tarefa: título, prazo, situação, descrição e o link para abrir no app
export function mensagemTarefa(
  t: { id: string; titulo: string; prazo: string | null; descricao: string | null; origem: string },
  { empresaId, fuso, responsavel, status, equipamento }: { empresaId: string; fuso: string; responsavel?: string | null; status?: string | null; equipamento?: string | null },
) {
  const caminho = t.origem === "chamado" ? `/e/${empresaId}/chamados/${t.id}` : `/e/${empresaId}/tarefas/${t.id}`;
  return [
    responsavel ? `Olá, ${responsavel.trim().split(/\s+/)[0]}!` : null,
    `*Tarefa:* ${t.titulo}`,
    equipamento ? `*Equipamento:* ${equipamento}` : null,
    t.prazo ? `*Prazo:* ${formatarDataHora(t.prazo, fuso)}` : null,
    status ? `*Status:* ${status}` : null,
    t.descricao,
    urlDoSite(caminho),
  ]
    .filter(Boolean)
    .join("\n");
}
