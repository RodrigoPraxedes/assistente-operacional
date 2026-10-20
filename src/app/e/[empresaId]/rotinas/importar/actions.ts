"use server";

import { revalidatePath } from "next/cache";
import { getContexto } from "@/lib/contexto";
import { lerPlanilha, normalizar, texto } from "@/lib/planilha";
import type { EstadoImportacao, EstadoLeitura } from "@/components/importacao/tipos";

interface RotinaImport {
  horario: string;
  setor: string | null;
  nome: string;
}

// Lê a planilha de respostas do levantamento (Google Forms): uma linha por pessoa, com o setor e,
// em colunas "8:00h > atividade chave 1", o que se faz em cada horário. Cada atividade vira uma rotina.
export async function lerRotinas(empresaId: string, _: EstadoLeitura, form: FormData): Promise<EstadoLeitura> {
  const { pode } = await getContexto(empresaId);
  if (!pode("rotinas.editar")) return { erro: "Você não tem permissão para cadastrar rotinas." };
  const arquivo = form.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha a planilha (.xlsx)." };
  if (arquivo.size > 4 * 1024 * 1024) return { erro: "A planilha passa de 4 MB." };

  let abas: Awaited<ReturnType<typeof lerPlanilha>>;
  try {
    abas = await lerPlanilha(arquivo);
  } catch {
    return { erro: "Não consegui ler o arquivo. Salve como Excel (.xlsx) e tente de novo." };
  }
  const aba = [...abas.values()][0];
  if (!aba) return { erro: "A planilha está vazia." };

  const avisos: string[] = [];
  const unicas = new Map<string, RotinaImport>();
  let colunasHorario = 0;
  for (const l of aba.linhas) {
    const setor = texto(l["qual setor"])?.slice(0, 100) ?? null;
    if (!setor) avisos.push(`Linha ${l._linha}: sem setor, as atividades entram sem setor.`);
    for (const [coluna, valor] of Object.entries(l)) {
      const m = coluna.match(/^(\d{1,2}) (\d{2})h? atividade chave \d+$/);
      if (!m) continue;
      colunasHorario++;
      const nome = texto(valor)?.replace(/\s+/g, " ");
      if (!nome) continue;
      const horario = `${m[1].padStart(2, "0")}:${m[2]}`;
      const chave = `${horario}|${normalizar(setor)}|${normalizar(nome)}`;
      if (!unicas.has(chave)) unicas.set(chave, { horario, setor, nome: nome.slice(0, 200) });
    }
  }
  if (!colunasHorario) return { erro: 'Não achei colunas como "8:00h > atividade chave 1". Use a planilha de respostas do levantamento.' };

  const lista = [...unicas.values()].sort((a, b) => a.horario.localeCompare(b.horario));
  if (!lista.length) return { erro: "Nenhuma atividade preenchida na planilha." };
  const setores = [...new Set(lista.map((r) => r.setor ?? "(sem setor)"))];
  return {
    previa: {
      resumo: [
        `${lista.length} atividade(s) viram rotinas, todos os dias, sem função`,
        `Setores: ${setores.join(", ")} (os que ainda não existem são criados)`,
        "Rotina que já existe no mesmo horário, setor e nome não é duplicada",
      ],
      avisos,
      cabecalho: ["Hora", "Atividade", "Setor"],
      linhas: lista.slice(0, 15).map((r) => [r.horario, r.nome, r.setor ?? ""]),
      dados: JSON.stringify(lista),
    },
  };
}

export async function importarRotinas(empresaId: string, _: EstadoImportacao, form: FormData): Promise<EstadoImportacao> {
  const { supabase, pode } = await getContexto(empresaId);
  if (!pode("rotinas.editar")) return { erro: "Você não tem permissão para cadastrar rotinas." };
  let lista: RotinaImport[];
  try {
    lista = JSON.parse(String(form.get("dados") ?? "[]"));
  } catch {
    return { erro: "Leia a planilha de novo." };
  }
  if (!Array.isArray(lista) || lista.length > 2000) return { erro: "Importe no máximo 2000 atividades por vez." };

  const [{ data: setores }, { data: existentes }] = await Promise.all([
    supabase.from("setores").select("id, nome").eq("empresa_id", empresaId),
    supabase.from("rotinas").select("nome, horario, setor_ids").eq("empresa_id", empresaId),
  ]);
  const idSetor = new Map((setores ?? []).map((s) => [normalizar(s.nome), s.id as string]));

  const faltam = [...new Set(lista.map((r) => r.setor).filter((s): s is string => !!s))].filter((s) => !idSetor.has(normalizar(s)));
  if (faltam.length) {
    if (!pode("config.setores")) return { erro: `Faltam os setores ${faltam.join(", ")} e você não pode criá-los. Peça a um gestor.` };
    const { data: novos, error } = await supabase
      .from("setores")
      .insert(faltam.map((nome) => ({ empresa_id: empresaId, nome })))
      .select("id, nome");
    if (error) return { erro: error.message };
    for (const s of novos ?? []) idSetor.set(normalizar(s.nome), s.id as string);
  }

  const chave = (horario: string, setorId: string | null, nome: string) => `${horario.slice(0, 5)}|${setorId ?? ""}|${normalizar(nome)}`;
  const jaTem = new Set(
    (existentes ?? []).flatMap((r) => (r.setor_ids?.length ? r.setor_ids : [null]).map((s: string | null) => chave(r.horario, s, r.nome))),
  );
  const novas = lista
    .map((r) => ({ empresa_id: empresaId, nome: r.nome, horario: r.horario, setor_id: r.setor ? (idSetor.get(normalizar(r.setor)) ?? null) : null }))
    .filter((r) => /^\d{2}:\d{2}$/.test(r.horario) && r.nome && !jaTem.has(chave(r.horario, r.setor_id, r.nome)));

  if (novas.length) {
    const { error } = await supabase.from("rotinas").insert(novas.map(({ setor_id, ...r }) => ({ ...r, setor_ids: setor_id ? [setor_id] : [] })));
    if (error) return { erro: error.message };
  }
  revalidatePath(`/e/${empresaId}/rotinas`);
  return { ok: `Importação concluída: ${novas.length} rotina(s) nova(s) e ${lista.length - novas.length} já existia(m).` };
}
