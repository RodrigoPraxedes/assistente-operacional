// Campo "Visibilidade" dos formulários: undefined quando não veio (campo
// travado para quem não criou), aí a action não mexe no valor.
export function lerPrivado(form: FormData) {
  return form.has("privado") ? form.get("privado") === "true" : undefined;
}
