// Tipos de aviso que podem virar notificação no navegador (os mesmos do WhatsApp).
// A chave é a origem da mensagem em whatsapp_mensagens.
export const PUSH_TIPOS: { origem: string; rotulo: string }[] = [
  { origem: "tarefa", rotulo: "Tarefa atribuída e \"Para seu conhecimento\"" },
  { origem: "conclusao", rotulo: "Tarefa concluída" },
  { origem: "lembrete", rotulo: "Lembretes de check-list, contagem e ação" },
  { origem: "checklist", rotulo: "Check-list concluído" },
  { origem: "contagem", rotulo: "Contagem concluída" },
  { origem: "resumo", rotulo: "Resumo do dia" },
  { origem: "prazo", rotulo: "Prazo venceu e a tarefa segue aberta" },
];
