export type TipoStatus = "aberto" | "em_andamento" | "adiado" | "concluido" | "cancelado";
export type Escopo = "proprias" | "setor" | "unidade" | "empresa";
export type Origem = "avulsa" | "checklist" | "acao" | "chamado" | "alerta" | "plano";

export type SituacaoEmpresa = "pendente" | "ativa" | "suspensa";

export interface Empresa {
  id: string;
  nome: string;
  fuso_horario: string;
  situacao: SituacaoEmpresa;
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
  // Admin Master que entrou na empresa: tem acesso total, como o dono
  admin_master: boolean;
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
  // privado: só quem criou e o responsável veem
  privado: boolean;
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
  abre_chamado_se_nao: boolean;
  prioridade_chamado: Prioridade;
  ativo: boolean;
}

export const ORIGENS: Record<Origem, string> = {
  avulsa: "Avulsa",
  checklist: "Check-list",
  acao: "Ação recorrente",
  chamado: "Chamado",
  alerta: "Alerta",
  plano: "Plano (PMLP)",
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

export interface Acao {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  setor_id: string | null;
  categoria_id: string | null;
  responsavel_id: string | null;
  nome: string;
  descricao: string | null;
  data_inicial: string;
  data_final: string | null;
  horario: string;
  prazo_horas: number;
  recorrencia: string | null;
  ativo: boolean;
  privado: boolean;
  criado_por: string | null;
  created_at: string;
}

export interface Alerta {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  setor_id: string | null;
  categoria_id: string | null;
  responsavel_id: string | null;
  nome: string;
  descricao: string | null;
  data_evento: string;
  recorrencia: string | null;
  horario: string;
  ativo: boolean;
  privado: boolean;
  criado_por: string | null;
  created_at: string;
}

export interface AlertaAviso {
  id: string;
  empresa_id: string;
  alerta_id: string;
  dias_antes: number;
  titulo: string;
  responsavel_id: string | null;
}

export type Prioridade = "baixa" | "media" | "alta" | "urgente";

export const PRIORIDADES: Record<Prioridade, { rotulo: string; cor: string }> = {
  urgente: { rotulo: "Urgente", cor: "#dc2626" },
  alta: { rotulo: "Alta", cor: "#ea580c" },
  media: { rotulo: "Média", cor: "#2563eb" },
  baixa: { rotulo: "Baixa", cor: "#64748b" },
};

export interface Chamado {
  tarefa_id: string;
  empresa_id: string;
  numero: number;
  prioridade: Prioridade;
  equipamento_id: string | null;
  local: string | null;
  fornecedor_id: string | null;
  custo: number | null;
  aberto_por_nome: string | null;
  execucao_id: string | null;
  created_at: string;
}

export interface Equipamento {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  setor_id: string | null;
  nome: string;
  codigo: string | null;
  marca: string | null;
  modelo: string | null;
  observacao: string | null;
  ativo: boolean;
  tipo: TipoPatrimonio;
  situacao: SituacaoPatrimonio;
  data_compra: string | null;
  valor_compra: number | null;
  comprado_de: string | null;
  nota_fiscal: string | null;
  garantia_ate: string | null;
  foto_path: string | null;
}

export type TipoPatrimonio = "equipamento" | "movel" | "outro";
export const TIPOS_PATRIMONIO: Record<TipoPatrimonio, string> = {
  equipamento: "Equipamento",
  movel: "Móvel",
  outro: "Outro",
};

export type SituacaoPatrimonio = "em_uso" | "em_manutencao" | "parado" | "vendido" | "aposentado";
export const SITUACOES_PATRIMONIO: Record<SituacaoPatrimonio, { rotulo: string; cor: string }> = {
  em_uso: { rotulo: "Em uso", cor: "#16a34a" },
  em_manutencao: { rotulo: "Em manutenção", cor: "#d97706" },
  parado: { rotulo: "Parado", cor: "#64748b" },
  vendido: { rotulo: "Vendido", cor: "#2563eb" },
  aposentado: { rotulo: "Aposentado", cor: "#475569" },
};

export type TipoEventoPatrimonio = "manutencao" | "transferencia" | "situacao" | "venda" | "aposentadoria" | "observacao";
export const EVENTOS_PATRIMONIO: Record<TipoEventoPatrimonio, string> = {
  manutencao: "Manutenção",
  transferencia: "Mudança de unidade",
  situacao: "Mudança de situação",
  venda: "Venda",
  aposentadoria: "Aposentadoria (baixa)",
  observacao: "Anotação",
};

export interface EventoPatrimonio {
  id: string;
  empresa_id: string;
  equipamento_id: string;
  tipo: TipoEventoPatrimonio;
  data: string;
  valor: number | null;
  descricao: string | null;
  situacao_nova: SituacaoPatrimonio | null;
  unidade_origem_id: string | null;
  unidade_destino_id: string | null;
  membro_id: string | null;
  membro_nome: string | null;
  created_at: string;
}

export interface Fornecedor {
  id: string;
  empresa_id: string;
  nome: string;
  especialidade: string | null;
  telefone: string | null;
  telefone2: string | null;
  email: string | null;
  ativo: boolean;
}

// tipo de serviço de um prestador (pedreiro, eletricista...)
export interface TipoServico {
  id: string;
  empresa_id: string;
  nome: string;
  ativo: boolean;
}

export type TipoEscala = "turno" | "folga" | "ferias" | "falta";

// o que não é turno aparece na grade com estes nomes e cores
export const AUSENCIAS: Record<Exclude<TipoEscala, "turno">, { rotulo: string; sigla: string; cor: string }> = {
  folga: { rotulo: "Folga", sigla: "F", cor: "#64748b" },
  ferias: { rotulo: "Férias", sigla: "FÉ", cor: "#16a34a" },
  falta: { rotulo: "Falta", sigla: "X", cor: "#dc2626" },
};

export interface Turno {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  nome: string;
  inicio: string;
  fim: string;
  cor: string;
  ativo: boolean;
}

export interface Escala {
  id: string;
  empresa_id: string;
  unidade_id: string;
  setor_id: string | null;
  membro_id: string;
  data: string;
  tipo: TipoEscala;
  turno_id: string | null;
  observacao: string | null;
}

export type StatusTroca = "pendente" | "aprovada" | "recusada" | "cancelada";

export const STATUS_TROCA: Record<StatusTroca, { rotulo: string; cor: string }> = {
  pendente: { rotulo: "Aguardando", cor: "#d97706" },
  aprovada: { rotulo: "Aprovada", cor: "#16a34a" },
  recusada: { rotulo: "Recusada", cor: "#dc2626" },
  cancelada: { rotulo: "Cancelada", cor: "#64748b" },
};

export interface EscalaTroca {
  id: string;
  empresa_id: string;
  escala_id: string;
  solicitante_id: string;
  substituto_id: string;
  motivo: string | null;
  status: StatusTroca;
  pedido_por: string | null;
  decidido_por: string | null;
  decidido_em: string | null;
  created_at: string;
}

export type Horizonte = "medio" | "longo";

export const HORIZONTES: Record<Horizonte, { rotulo: string; dica: string }> = {
  medio: { rotulo: "Médio prazo", dica: "3 a 6 meses" },
  longo: { rotulo: "Longo prazo", dica: "6 a 12 meses" },
};

export type SituacaoPlano = "planejamento" | "em_andamento" | "pausado" | "concluido" | "cancelado";

export const SITUACOES_PLANO: Record<SituacaoPlano, { rotulo: string; cor: string }> = {
  planejamento: { rotulo: "Em planejamento", cor: "#64748b" },
  em_andamento: { rotulo: "Em andamento", cor: "#2563eb" },
  pausado: { rotulo: "Pausado", cor: "#d97706" },
  concluido: { rotulo: "Concluído", cor: "#16a34a" },
  cancelado: { rotulo: "Cancelado", cor: "#dc2626" },
};

export interface Plano {
  id: string;
  empresa_id: string;
  unidade_id: string | null;
  setor_id: string | null;
  categoria_id: string | null;
  nome: string;
  objetivo: string | null;
  horizonte: Horizonte;
  inicio: string | null;
  fim_previsto: string | null;
  responsavel_id: string | null;
  situacao: SituacaoPlano;
  criado_por: string | null;
  created_at: string;
}

export interface PlanoEtapa {
  tarefa_id: string;
  empresa_id: string;
  plano_id: string;
  ordem: number;
  inicio_previsto: string | null;
}
