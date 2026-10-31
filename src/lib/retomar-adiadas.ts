import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Relógio: no dia da nova data a tarefa adiada volta ao status anterior (RPC
// retomar_tarefas_adiadas) e os responsáveis são avisados por WhatsApp e push,
// respeitando as chaves "aviso de prazo" (WhatsApp) e "push_prazo" (push).
export async function retomarTarefasAdiadas() {
  const admin = createAdminClient();
  const { data: retomadas } = await admin.rpc("retomar_tarefas_adiadas");
  const lista = (retomadas ?? []) as { id: string; empresa_id: string; titulo: string; prazo: string; origem: string }[];
  if (!lista.length) return 0;

  const { data: tarefas } = await admin
    .from("tarefas")
    .select("id, unidade_id, responsaveis, privado, unidades(nome)")
    .in("id", lista.map((t) => t.id))
    .returns<{ id: string; unidade_id: string | null; responsaveis: string[]; privado: boolean; unidades: { nome: string } | null }[]>();
  const dados = new Map((tarefas ?? []).map((t) => [t.id, t]));

  const empresas = [...new Set(lista.map((t) => t.empresa_id))];
  const [{ data: wpp }, { data: push }] = await Promise.all([
    admin.from("whatsapp_automacoes").select("empresa_id").eq("aviso_prazo", true).in("empresa_id", empresas),
    admin.from("empresas").select("id").eq("push_prazo", true).in("id", empresas),
  ]);
  const comWpp = new Set((wpp ?? []).map((w) => w.empresa_id));
  const comPush = new Set((push ?? []).map((e) => e.id));

  for (const t of lista) {
    const d = dados.get(t.id);
    if (!d || d.privado || t.origem === "checklist" || t.origem === "contagem") continue;
    const destino = t.origem === "chamado" ? "chamados" : "tarefas";
    for (const membroId of d.responsaveis) {
      const chave = `retomada:${t.id}:${new Date(t.prazo).getTime()}:${membroId}`;
      if (comWpp.has(t.empresa_id)) {
        await admin.rpc("whatsapp_enfileirar_automatica", {
          p_empresa: t.empresa_id,
          p_unidade: d.unidade_id,
          p_membro: membroId,
          p_texto: [
            "*Chegou o dia da tarefa adiada* 📌",
            "",
            `*${t.titulo}*${d.unidades?.nome ? ` · ${d.unidades.nome}` : ""}`,
            "",
            "Ela voltou sozinha ao status em que estava. Siga com ela e, ao terminar, sinalize no app como Concluído.",
            "{link}",
          ].join("\n"),
          p_origem: "prazo",
          p_origem_id: t.id,
          p_chave: chave,
        });
      }
      if (comPush.has(t.empresa_id)) {
        const { data: aparelhos } = await admin.from("push_inscricoes").select("id").eq("membro_id", membroId).limit(1);
        if (aparelhos?.length) {
          await admin.from("push_fila").upsert(
            {
              empresa_id: t.empresa_id,
              membro_id: membroId,
              tipo: "prazo",
              titulo: "Tarefa adiada retomada",
              corpo: t.titulo,
              url: `/e/${t.empresa_id}/${destino}/${t.id}`,
              chave,
            },
            { onConflict: "chave", ignoreDuplicates: true },
          );
        }
      }
    }
  }
  return lista.length;
}
