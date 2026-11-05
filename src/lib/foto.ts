"use client";

// Reduz a foto no navegador antes de enviar (celular tira fotos de vários MB)
export async function reduzirFoto(arquivo: File, lado = 1024, qualidade = 0.7): Promise<File> {
  if (!arquivo.type.startsWith("image/")) return arquivo;
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualidade));
    return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : arquivo;
  } catch {
    return arquivo;
  }
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

// Substitui os arquivos escolhidos num <input type="file"> pelas versões reduzidas
export async function trocarPorReduzidas(input: HTMLInputElement) {
  const arquivos = Array.from(input.files ?? []);
  if (!arquivos.length) return;
  const reduzidas = await Promise.all(arquivos.map((a) => reduzirFoto(a)));
  const dt = new DataTransfer();
  reduzidas.forEach((r) => dt.items.add(r));
  input.files = dt.files;
}
