"use client";

// Reduz a foto no navegador antes de enviar (celular tira fotos de vários MB)
export async function reduzirFoto(arquivo: File, lado = 1280, qualidade = 0.75): Promise<File> {
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

// Substitui os arquivos escolhidos num <input type="file"> pelas versões reduzidas
export async function trocarPorReduzidas(input: HTMLInputElement) {
  const arquivos = Array.from(input.files ?? []);
  if (!arquivos.length) return;
  const reduzidas = await Promise.all(arquivos.map((a) => reduzirFoto(a)));
  const dt = new DataTransfer();
  reduzidas.forEach((r) => dt.items.add(r));
  input.files = dt.files;
}
