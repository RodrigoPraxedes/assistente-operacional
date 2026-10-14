import { Campo, Select } from "@/components/ui";

// Público (padrão) ou privado: privado só aparece para quem criou e para o
// responsável. Só quem criou pode trocar; para os outros o campo fica travado
// e não é enviado (a action não mexe no valor).
export function CampoVisibilidade({ privado = false, podeMudar }: { privado?: boolean; podeMudar: boolean }) {
  return (
    <Campo
      rotulo="Visibilidade"
      dica={podeMudar ? "Privado: só você e o responsável veem" : "Só quem criou pode mudar"}
    >
      <Select name="privado" defaultValue={String(privado)} disabled={!podeMudar}>
        <option value="false">Público</option>
        <option value="true">Privado</option>
      </Select>
    </Campo>
  );
}
