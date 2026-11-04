"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { reduzirFoto } from "@/lib/foto";
import { Aviso, Botao, Input } from "@/components/ui";
import { blocoVazio, type Bloco } from "./blocos";
import { EditorBlocos } from "./editor-blocos";
import { CamposComuns } from "./form-ficha";

interface Props {
  empresaId: string;
  acao: (form: FormData) => Promise<void>;
  categorias: { id: string; nome: string }[];
  ficha?: { id: string; titulo: string; descricao: string | null; categoria_id: string | null; blocos: Bloco[] };
  fotoUrl?: string | null;
}

// Ficha montada no Atalaia: foto reduzida no navegador (vai direto ao Storage) + blocos.
export function FormFichaMontada({ empresaId, acao, categorias, ficha, fotoUrl }: Props) {
  const [blocos, setBlocos] = useState<Bloco[]>(
    ficha?.blocos.length ? ficha.blocos : [blocoVazio("lista"), blocoVazio("passos")],
  );
  const [previa, setPrevia] = useState<string | null>(fotoUrl ?? null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = new FormData(e.currentTarget);
    const arquivo = form.get("foto");
    form.delete("foto");
    form.set("blocos", JSON.stringify(blocos));
    setEnviando(true);
    if (arquivo instanceof File && arquivo.size > 0) {
      if (!arquivo.type.startsWith("image/")) {
        setEnviando(false);
        return setErro("Escolha uma imagem (JPG, PNG ou foto do celular).");
      }
      const foto = await reduzirFoto(arquivo, 1600, 0.75);
      const ext = foto.type === "image/jpeg" ? "jpg" : (foto.type.split("/")[1] ?? "jpg");
      const path = `${empresaId}/fotos/${crypto.randomUUID()}.${ext}`;
      const { error } = await createClient().storage.from("fichas").upload(path, foto, { contentType: foto.type });
      if (error) {
        setEnviando(false);
        return setErro(`Não foi possível enviar a foto: ${error.message}`);
      }
      form.set("foto_path", path);
    }
    await acao(form); // redireciona ao terminar
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      <input type="hidden" name="tipo" value="montada" />
      {ficha && <input type="hidden" name="id" value={ficha.id} />}
      <CamposComuns categorias={categorias} ficha={ficha} />

      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">Foto (opcional)</p>
        <div className="space-y-2">
          {previa && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa} alt="" className="max-h-56 rounded-lg border border-slate-200 object-contain" />
          )}
          <Input
            type="file"
            name="foto"
            aria-label="Foto da ficha"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPrevia(f ? URL.createObjectURL(f) : (fotoUrl ?? null));
            }}
          />
          {ficha && fotoUrl && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="remover_foto" className="h-4 w-4" /> Remover a foto atual
            </label>
          )}
        </div>
        <p className="text-xs text-slate-500">É reduzida antes de enviar para não pesar.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Conteúdo da ficha</p>
        <EditorBlocos blocos={blocos} onChange={setBlocos} />
      </div>

      <Botao type="submit" disabled={enviando}>
        {enviando ? "Salvando..." : "Salvar ficha"}
      </Botao>
    </form>
  );
}
