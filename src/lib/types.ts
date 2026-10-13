export type TipoStatus = "aberto" | "em_andamento" | "adiado" | "concluido" | "cancelado";
export type Escopo = "proprias" | "setor" | "unidade" | "empresa";
export type Origem = "avulsa" | "checklist" | "acao" | "chamado" | "alerta";

export interface Empresa {
  id: string;
  nome: string;
  fuso_horario: string;
}

export interface Unidade {
  id: string;
  empresa_id: string;
  nome: string;
  endereco: string | null;
  qr_token: string;
  ativo: boolean;
}

export interface Setor {
  id: string;
  empresa_id: string;
  nome: string;
  ativo: boolean;
}

export interface Categoria {
  id: string;
  empresa_id: string;
  nome: string;
  cor: string;
}

export interface Status {
  id: string;
  empresa_id: string;
  nome: string;
  tipo: TipoStatus;
  cor: string;
  ordem: number;
  modulo: Origem | null;
  ativo: boolean;
}

export interface Perfil {
  id: string;
  empresa_id: string;
  nome: string;
  descricao: string | null;
}

export interface Permissao {
  chave: string;
  modulo: string;
  descricao: string;
  usa_escopo: boolean;
  ordem: number;
}

export interface Membro {
  id: string;
  empresa_id: string;
  usuario_id: string | null;
  nome: string;
  cargo: string | null;
  telefone: string | null;
  email: string | null;
  perfil_id: string | null;
  setor_id: string | null;
  todas_unidades: boolean;
  dono: boolean;
  ativo: boolean;
}

export interface Tarefa {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  setor_id: string | null;
  categoria_id: string | null;
  titulo: string;
  descricao: string | null;
  origem: Origem;
  origem_id: string | null;
  ocorrencia_em: string | null;
  status_id: string;
  status_anterior_id: string | null;
  responsavel_id: string | null;
  criado_por: string | null;
  prazo: string | null;
  concluida_em: string | null;
  created_at: string;
}

export type TipoResposta = "sim_nao" | "numero" | "texto";

export interface ChecklistModelo {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  setor_id: string | null;
  categoria_id: string | null;
  responsavel_id: string | null;
  nome: string;
  descricao: string | null;
  horario_preferencial: string;
  tolerancia_minutos: number;
  recorrencia: string;
  publico_qr: boolean;
  whatsapp_destino: string | null;
  versao: number;
  ativo: boolean;
  created_at: string;
}

export interface ChecklistItem {
  id: string;
  modelo_id: string;
  empresa_id: string;
  ordem: number;
  texto: string;
  tipo_resposta: TipoResposta;
  obrigatorio: boolean;
  permite_foto: boolean;
  foto_obrigatoria_se_nao: boolean;
  ativo: boolean;
}

export const ORIGENS: Record<Origem, string> = {
  avulsa: "Avulsa",
  checklist: "Check-list",
  acao: "Ação recorrente",
  chamado: "Chamado",
  alerta: "Alerta",
};

export const TIPOS_STATUS: Record<TipoStatus, string> = {
  aberto: "Aberto",
  em_andamento: "Em andamento",
  adiado: "Adiado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

export const ESCOPOS: Record<Escopo, string> = {
  proprias: "Só as minhas",
  setor: "Do meu setor",
  unidade: "Da minha unidade",
  empresa: "Da empresa toda",
};

export const RESPOSTAS_SIM_NAO = [
  { valor: "sim", rotulo: "Sim" },
  { valor: "nao", rotulo: "Não" },
  { valor: "em_processo", rotulo: "Em processo" },
  { valor: "na", rotulo: "N/A" },
] as const;
