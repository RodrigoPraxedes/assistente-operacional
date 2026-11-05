"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fotoQuadrada, type Recorte } from "@/lib/foto";
import { EnquadrarFoto } from "./enquadrar-foto";
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
  // "Duplicar": preenche uma ficha nova com o conteúdo de outra (a foto é copiada ao salvar)
  modelo?: { titulo: string; descricao: string | null; categoria_id: string | null; blocos: Bloco[]; foto_path: string | null };
}

// Ficha montada no Atalaia: foto reduzida no navegador (vai direto ao Storage) + blocos.
export function FormFichaMontada({ empresaId, acao, categorias, ficha, fotoUrl, modelo }: Props) {
  const base = ficha ?? modelo;
  const [blocos, setBlocos] = useState<Bloco[]>(
    base?.blocos.length ? base.blocos : [blocoVazio("lista"), blocoVazio("passos")],
  );
  const [fotoNova, setFotoNova] = useState(false);
  const [previa, setPrevia] = useState<string | null>(fotoUrl ?? null);
  const recorte = useRef<Recorte | null>(null);
  const guardarRecorte = useCallback((r: Recorte) => (recorte.current = r), []);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro(null);
    const form = new FormData(e.currentTarget);
    const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (botao?.name) form.set(botao.name, botao.value);
    const arquivo = form.get("foto");
    form.delete("foto");
    form.set("blocos", JSON.stringify(blocos));
    setEnviando(true);
    if (arquivo instanceof File && arquivo.size > 0) {
      if (!arquivo.type.startsWith("image/")) {
        setEnviando(false);
        return setErro("Escolha uma imagem (JPG, PNG ou foto do celular).");
      }
      const foto = await fotoQuadrada(arquivo, recorte.current);
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
      {modelo?.foto_path && !fotoNova && <input type="hidden" name="foto_origem" value={modelo.foto_path} />}
      <CamposComuns categorias={categorias} ficha={base} />

      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">Foto (opcional)</p>
        <div className="space-y-2">
          {previa && fotoNova && <EnquadrarFoto key={previa} src={previa} onChange={guardarRecorte} />}
          {previa && !fotoNova && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previa} alt="Foto atual da ficha" className="aspect-square w-48 rounded-lg border border-slate-200 object-cover" />
          )}
          <Input
            type="file"
            name="foto"
            aria-label="Foto da ficha"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFotoNova(!!f);
              recorte.current = null;
              setPrevia(f ? URL.createObjectURL(f) : (fotoUrl ?? null));
            }}
          />
          {fotoUrl && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="remover_foto" className="h-4 w-4" /> Remover a foto atual
            </label>
          )}
        </div>
        <p className="text-xs text-slate-500">A foto fica quadrada e é comprimida antes de enviar. Ao escolher uma foto, arraste-a dentro do quadro e use o zoom para enquadrar: o que aparece no quadro é o que fica salvo.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-700">Conteúdo da ficha</p>
        <EditorBlocos blocos={blocos} onChange={setBlocos} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Botao type="submit" disabled={enviando}>
          {enviando ? "Salvando..." : "Salvar ficha"}
        </Botao>
        <Botao type="submit" name="depois" value="duplicar" variante="secundario" disabled={enviando}>
          Salvar e duplicar
        </Botao>
      </div>
      <p className="text-xs text-slate-500">Salvar e duplicar guarda esta ficha e abre uma nova já preenchida com ela, para aproveitar procedimentos parecidos.</p>
    </form>
  );
}
