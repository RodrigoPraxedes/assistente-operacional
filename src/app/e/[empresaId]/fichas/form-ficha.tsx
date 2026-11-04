"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Aviso, Botao, Campo, Input, Select, Textarea } from "@/components/ui";

const LIMITE = 10 * 1024 * 1024;

interface Props {
  empresaId: string;
  acao: (form: FormData) => Promise<void>;
  categorias: { id: string; nome: string }[];
  ficha?: { id: string; titulo: string; descricao: string | null; categoria_id: string | null; nome_arquivo: string | null };
}

// O PDF vai direto do navegador para o Storage (a Server Action aceita só 4 MB); depois a ficha é registrada.
export function FormFicha({ empresaId, acao, categorias, ficha }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = new FormData(e.currentTarget);
    const arquivo = form.get("pdf");
    const temArquivo = arquivo instanceof File && arquivo.size > 0;
    form.delete("pdf");
    if (!ficha && !temArquivo) return setErro("Escolha o arquivo PDF.");
    if (temArquivo) {
      const pdf = arquivo as File;
      if (pdf.type !== "application/pdf" && !pdf.name.toLowerCase().endsWith(".pdf")) return setErro("O arquivo precisa ser um PDF.");
      if (pdf.size > LIMITE) return setErro("O PDF passa de 10 MB. Reduza o arquivo e tente de novo.");
      setEnviando(true);
      const path = `${empresaId}/${crypto.randomUUID()}.pdf`;
      const { error } = await createClient()
        .storage.from("fichas")
        .upload(path, pdf, { contentType: "application/pdf" });
      if (error) {
        setEnviando(false);
        return setErro(`Não foi possível enviar o PDF: ${error.message}`);
      }
      form.set("arquivo_path", path);
      form.set("nome_arquivo", pdf.name);
      form.set("tamanho_bytes", String(pdf.size));
    }
    setEnviando(true);
    await acao(form); // redireciona ao terminar
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      <input type="hidden" name="tipo" value="pdf" />
      {ficha && <input type="hidden" name="id" value={ficha.id} />}
      <CamposComuns categorias={categorias} ficha={ficha} />
      <Campo
        rotulo={ficha ? "Trocar o PDF (opcional)" : "Arquivo PDF"}
        dica={ficha ? `Atual: ${ficha.nome_arquivo ?? "—"}. Até 10 MB.` : "Até 10 MB."}
      >
        <Input type="file" name="pdf" accept="application/pdf,.pdf" />
      </Campo>
      <Botao type="submit" disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar ficha"}
      </Botao>
    </form>
  );
}

// Título, categoria e descrição: iguais na ficha em PDF e na montada
export function CamposComuns({
  categorias,
  ficha,
}: {
  categorias: { id: string; nome: string }[];
  ficha?: { titulo: string; descricao: string | null; categoria_id: string | null };
}) {
  return (
    <>
      <Campo rotulo="Título">
        <Input name="titulo" required defaultValue={ficha?.titulo} placeholder="Ex.: Fritadeira elétrica — limpeza" />
      </Campo>
      <Campo rotulo="Categoria">
        <Select name="categoria_id" defaultValue={ficha?.categoria_id ?? ""}>
          <option value="">Sem categoria</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </Campo>
      <Campo rotulo="Ou crie uma categoria nova" dica="Se preencher, ela é criada e usada nesta ficha.">
        <Input name="nova_categoria" placeholder="Ex.: Alimentos" />
      </Campo>
      <Campo rotulo="Descrição (opcional)" dica="Aparece na lista e ajuda a busca.">
        <Textarea name="descricao" rows={3} defaultValue={ficha?.descricao ?? ""} />
      </Campo>
    </>
  );
}
