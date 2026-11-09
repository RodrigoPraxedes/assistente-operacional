"use client";

// Foto grande demais para enviar sem reduzir (limite do envio é 4 MB)
const LIMITE_SEM_REDUZIR = 3 * 1024 * 1024;

type Imagem = { fonte: CanvasImageSource; largura: number; altura: number; liberar: () => void };

// Abre a imagem gastando pouca memória: o navegador já decodifica reduzida
// (foto de câmera de 50 MP inteira estoura a memória de celular simples).
async function abrirImagem(arquivo: File, lado: number): Promise<Imagem> {
  try {
    const b = await createImageBitmap(arquivo, { resizeWidth: lado, resizeQuality: "medium" });
    return { fonte: b, largura: b.width, altura: b.height, liberar: () => b.close() };
  } catch {
    // navegador sem esse recurso: tenta pelo elemento <img>
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight, liberar: () => URL.revokeObjectURL(url) };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

function liberarCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0;
  canvas.height = 0;
}

// Reduz a foto no navegador antes de enviar (celular tira fotos de vários MB).
// Se não der para reduzir e o arquivo for grande, devolve erro em vez de enviar o original.
export async function reduzirFoto(arquivo: File, lado = 1024, qualidade = 0.7): Promise<File> {
  if (!arquivo.type.startsWith("image/")) return arquivo;
  try {
    const img = await abrirImagem(arquivo, lado);
    const escala = Math.min(1, lado / Math.max(img.largura, img.altura));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.largura * escala));
    canvas.height = Math.max(1, Math.round(img.altura * escala));
    canvas.getContext("2d")!.drawImage(img.fonte, 0, 0, canvas.width, canvas.height);
    img.liberar();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualidade));
    liberarCanvas(canvas);
    if (blob) return new File([blob], "foto.jpg", { type: "image/jpeg" });
  } catch {
    // cai no teste de tamanho abaixo
  }
  if (arquivo.size > LIMITE_SEM_REDUZIR) throw new Error("foto-grande");
  return arquivo;
}

// Recorte escolhido à mão, em frações da foto: x e y = canto superior esquerdo
// (fração da largura e da altura), lado = fração do menor lado da foto
export interface Recorte {
  x: number;
  y: number;
  lado: number;
}

// Enquadramento quadrado (1:1): corta o centro da foto (ou o recorte escolhido) e reduz para lado x lado em JPEG
export async function fotoQuadrada(arquivo: File, recorte?: Recorte | null, lado = 1080, qualidade = 0.72): Promise<File> {
  if (!arquivo.type.startsWith("image/")) return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const menor = Math.min(bitmap.width, bitmap.height);
    const corte = recorte ? Math.min(menor, Math.max(1, recorte.lado * menor)) : menor;
    const limitar = (v: number, max: number) => Math.min(Math.max(0, v), max);
    const sx = recorte ? limitar(recorte.x * bitmap.width, bitmap.width - corte) : (bitmap.width - corte) / 2;
    const sy = recorte ? limitar(recorte.y * bitmap.height, bitmap.height - corte) : (bitmap.height - corte) / 2;
    const saida = Math.min(lado, corte);
    const canvas = document.createElement("canvas");
    canvas.width = saida;
    canvas.height = saida;
    canvas.getContext("2d")!.drawImage(bitmap, sx, sy, corte, corte, 0, 0, saida, saida);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualidade));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : arquivo;
  } catch {
    return arquivo;
  }
}

// Substitui os arquivos escolhidos num <input type="file"> pelas versões reduzidas,
// uma de cada vez (várias ao mesmo tempo esgotam a memória do celular).
// Devolve null se deu certo, ou a mensagem de erro (e limpa o campo).
export async function trocarPorReduzidas(input: HTMLInputElement, avisar = true): Promise<string | null> {
  const arquivos = Array.from(input.files ?? []);
  if (!arquivos.length) return null;
  try {
    const dt = new DataTransfer();
    for (const a of arquivos) dt.items.add(await reduzirFoto(a));
    input.files = dt.files;
    return null;
  } catch {
    input.value = "";
    const msg = "Não consegui preparar essa foto (celular sem memória livre). Feche outros apps e tire a foto de novo.";
    if (avisar) window.alert(msg);
    return msg;
  }
}
