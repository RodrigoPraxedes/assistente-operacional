// Prévia que a leitura da planilha devolve para a tela confirmar
export type EstadoLeitura =
  | { erro: string }
  | { previa: { resumo: string[]; avisos: string[]; cabecalho: string[]; linhas: string[][]; dados: string } }
  | undefined;

export type EstadoImportacao = { erro: string } | { ok: string } | undefined;
