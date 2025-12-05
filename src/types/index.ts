// ============ ENTIDADES BASE ============
export interface Cliente {
  id: string;
  nome: string;
  empresa?: string; // Nome fantasia ou empresa
  razaoSocial?: string;
  cnpj?: string;
  segmento?: 'Tintas' | 'Resinas' | 'Agro' | 'Cosméticos' | 'Farmacêutico' | 'Alimentício' | 'Outros';
  email: string;
  telefone: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  pais: string;
  cep?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Contato {
  id: string;
  clienteId: string;
  nome: string;
  cargo?: string;
  departamento?: string;
  email: string;
  telefone: string;
  whatsapp?: string;
  observacoes?: string;
  dataCriacao: string;
}

export interface Lead {
  id: string;
  origem: string;
  nome: string;
  empresa?: string;
  email: string;
  telefone: string;
  segmento?: string;
  status: 'novo' | 'qualificado' | 'convertido' | 'perdido';
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

// ============ COMERCIAL ============
export interface Oportunidade {
  id: string;
  clienteId: string;
  leadId?: string;
  titulo: string;
  valor: number;
  moeda: 'BRL' | 'USD' | 'EUR';
  probabilidade: number;
  etapa: 'prospeccao' | 'qualificacao' | 'proposta' | 'negociacao' | 'fechada' | 'perdida';
  dataFechamentoEsperada?: string;
  descricao?: string;
  responsavelComercial?: string;
  pais?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Proposta {
  id: string;
  oportunidadeId: string;
  numero: string;
  versao: string; // V01, V02, etc.
  idioma: 'pt-BR' | 'es-PE' | 'es-CL' | 'es-CO' | 'en';
  status: 'rascunho' | 'enviada' | 'aberta' | 'aprovada' | 'rejeitada' | 'vencida';
  dataEnvio?: string;
  dataAbertura?: string;
  dataValidade?: string;
  valorTotal: number;
  moeda: 'BRL' | 'USD' | 'EUR';
  itens: ItemProposta[];
  anexosTecnicos: string[]; // IDs de documentos
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ItemProposta {
  id: string;
  tipoEquipamento: 'TQS' | 'MPY' | 'ADT' | 'Plataforma' | 'UDD' | 'Outros';
  modelo?: string;
  quantidade: number;
  descricao: string;
  precoUnitario: number;
  desconto?: number;
  total: number;
}

// ============ CONTRATOS ============
export interface Contrato {
  id: string;
  numero: string;
  projetoId?: string;
  clienteId: string;
  tipo: 'venda' | 'prestacao_servico' | 'nda' | 'aditivo';
  versao: string;
  status: 'minuta' | 'em_analise' | 'assinado' | 'vigente' | 'encerrado' | 'cancelado';
  dataAssinatura?: string;
  dataInicio?: string;
  dataFim?: string;
  valorTotal: number;
  moeda: 'BRL' | 'USD' | 'EUR';
  penalidades?: string;
  garantias?: string;
  anexosTecnicos: string[];
  clausulasEspeciais?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

// ============ PROJETOS TURNKEY ============
export interface Projeto {
  id: string;
  numero: string;
  nome: string;
  clienteId: string;
  contratoId?: string;
  oportunidadeId?: string;
  tipo: 'turnkey' | 'equipamento' | 'engenharia' | 'manutencao';
  status: 'planejamento' | 'em_andamento' | 'pausado' | 'concluido' | 'cancelado';
  dataInicio?: string;
  dataFimPrevista?: string;
  dataFimReal?: string;
  progressoFisico: number; // 0-100
  progressoDocumental: number; // 0-100
  responsavelGeral?: string;
  fases: FaseProjeto[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface FaseProjeto {
  id: string;
  numero: number; // 1, 2, 3, 4
  nome: string;
  descricao?: string;
  status: 'nao_iniciada' | 'em_andamento' | 'concluida' | 'atrasada';
  dataInicioPrevista?: string;
  dataFimPrevista?: string;
  dataInicioReal?: string;
  dataFimReal?: string;
  responsaveis: string[]; // IDs de usuários
  entregaveis: string[]; // IDs de documentos
  progresso: number; // 0-100
  observacoes?: string;
}

// ============ DOCUMENTOS TÉCNICOS ============
export interface DocumentoTecnico {
  id: string;
  projetoId?: string;
  faseId?: string;
  numero: string;
  titulo: string;
  tipo: 'Layout' | 'P&ID' | 'Memorial_Descritivo' | 'Memorial_Calculo' | 'Diagrama_Eletrico' | 'Isometrico' | 'Lista_Materiais' | 'Outros';
  disciplina: 'Processo' | 'Mecanica' | 'Eletrica' | 'Automacao' | 'Estrutural' | 'Utilidades';
  revisao: string; // R00, R01, R02, etc.
  status: 'em_elaboracao' | 'em_revisao' | 'enviado' | 'aprovado' | 'revisao_solicitada' | 'cancelado';
  responsavel?: string;
  dataEnvio?: string;
  dataAprovacao?: string;
  comentariosCliente?: string;
  arquivoSharePoint?: string;
  arquivoLocal?: string;
  historicoRevisoes: HistoricoRevisao[];
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface HistoricoRevisao {
  revisao: string;
  data: string;
  responsavel: string;
  alteracoes?: string;
  comentarios?: string;
}

// ============ EQUIPAMENTOS ============
export interface Equipamento {
  id: string;
  clienteId: string;
  projetoId?: string;
  numeroSerie: string;
  modelo: string; // TQS-170, MPY-600, etc.
  tipo: 'TQS' | 'MPY' | 'ADT' | 'Plataforma' | 'UDD' | 'Dispersor' | 'Moinho' | 'Outros';
  capacidade?: string;
  potencia?: string;
  anoFabricacao?: number;
  anoInstalacao?: number;
  localInstalacao?: string;
  status: 'em_fabricacao' | 'pronto' | 'instalado' | 'em_manutencao' | 'desativado';
  documentacao: string[]; // IDs de documentos
  ordemFabricacaoId?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

// ============ CONTROLE DE HORAS DE FABRICAÇÃO ============
export interface OrdemFabricacao {
  id: string;
  numero: string;
  equipamentoId: string;
  projetoId: string;
  modeloEquipamento: string;
  dataInicioPrevista: string;
  dataFimPrevista: string;
  dataInicioReal?: string;
  dataFimReal?: string;
  status: 'planejada' | 'em_andamento' | 'pausada' | 'concluida' | 'cancelada';
  recursosRequeridos: RecursoFabricacao[];
  estruturaAnaliticaId?: string;
  horasPrevistas: number;
  horasReais: number;
  custoPrevisto: number;
  custoReal: number;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface RecursoFabricacao {
  setor: 'corte' | 'calandra' | 'solda' | 'usinagem' | 'montagem' | 'pintura' | 'eletrica' | 'testes';
  horasPrevistas: number;
  horasReais: number;
  custoHora: number;
}

export interface EstruturaAnaliticaEquipamento {
  id: string;
  modeloEquipamento: string; // TQS-170, MPY-600, etc.
  nome: string;
  etapas: EtapaFabricacao[];
  horasTotaisPrevistas: number;
  custoTotalPrevisto: number;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface EtapaFabricacao {
  id: string;
  sequencia: number;
  nome: string;
  descricao?: string;
  setor: 'corte' | 'calandra' | 'solda' | 'usinagem' | 'montagem' | 'pintura' | 'eletrica' | 'testes';
  tempoPadrao: number; // horas
  tempoReal?: number;
  custoHoraSetor: number;
  materiaisCriticos?: string[];
  dependencias?: string[]; // IDs de outras etapas
}

export interface RegistroHora {
  id: string;
  ordemFabricacaoId: string;
  etapaId: string;
  colaboradorId: string;
  colaboradorNome: string;
  setor: string;
  data: string;
  horas: number;
  motivoAtraso?: string;
  observacoes?: string;
  dataCriacao: string;
}

// ============ FINANCEIRO ============
export interface ParcelaFinanceira {
  id: string;
  projetoId: string;
  contratoId?: string;
  numero: number;
  descricao: string; // Entrada, Fase 1, Fase 2, FAT, Embarque, Entrega Final
  tipo: 'entrada' | 'fase' | 'fat' | 'embarque' | 'entrega' | 'outros';
  valor: number;
  moeda: 'BRL' | 'USD' | 'EUR';
  dataVencimento: string;
  dataFaturamento?: string;
  dataRecebimento?: string;
  status: 'planejada' | 'vencida' | 'faturada' | 'recebida' | 'cancelada';
  numeroNF?: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

// ============ PÓS-VENDA / ASSISTÊNCIA TÉCNICA ============
export interface Chamado {
  id: string;
  numero: string;
  clienteId: string;
  equipamentoId?: string;
  projetoId?: string;
  tipo: 'interno' | 'externo';
  prioridade: 'baixa' | 'media' | 'alta' | 'critica';
  status: 'aberto' | 'em_atendimento' | 'aguardando_peca' | 'resolvido' | 'cancelado';
  titulo: string;
  descricao: string;
  tipoFalha?: string;
  dataAbertura: string;
  dataFechamento?: string;
  slaId?: string;
  responsavel?: string;
  acoes: AcaoChamado[];
  pecasSubstituidas: PecaSubstituida[];
  relatoriosTecnicos: string[]; // IDs de documentos
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface AcaoChamado {
  id: string;
  data: string;
  responsavel: string;
  descricao: string;
  horasGastas?: number;
}

export interface PecaSubstituida {
  id: string;
  codigo: string;
  descricao: string;
  quantidade: number;
  valor?: number;
}

export interface SLA {
  id: string;
  clienteId?: string;
  contratoId?: string;
  tipo: 'preventiva' | 'corretiva' | 'emergencial';
  tempoResposta: number; // horas
  tempoResolucao: number; // horas
  observacoes?: string;
  dataCriacao: string;
}

// ============ ATIVIDADES ============
export interface Atividade {
  id: string;
  clienteId?: string;
  oportunidadeId?: string;
  projetoId?: string;
  tipo: 'ligacao' | 'email' | 'whatsapp' | 'reuniao' | 'tarefa' | 'nota' | 'visita';
  titulo: string;
  descricao?: string;
  data: string;
  hora?: string;
  concluida: boolean;
  responsavel?: string;
  dataCriacao: string;
}

// ============ CALENDÁRIO E REUNIÕES ============
export interface Reuniao {
  id: string;
  titulo: string;
  descricao?: string;
  dataInicio: string;
  dataFim: string;
  tipo: 'presencial' | 'online' | 'hibrida';
  local?: string;
  linkTeams?: string;
  linkOutros?: string;
  participantes: ParticipanteReuniao[];
  clienteId?: string;
  oportunidadeId?: string;
  projetoId?: string;
  lembrete?: number; // minutos antes
  status: 'agendada' | 'em_andamento' | 'concluida' | 'cancelada';
  anotacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface ParticipanteReuniao {
  id: string;
  nome: string;
  email: string;
  tipo: 'interno' | 'cliente' | 'fornecedor' | 'outros';
  confirmado: boolean;
  presente?: boolean;
}

// ============ PRODUTOS (EQUIPAMENTOS CATÁLOGO) ============
export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'TQS' | 'MPY' | 'ADT' | 'Plataforma' | 'UDD' | 'Dispersor' | 'Moinho' | 'Outros';
  descricao?: string;
  categoria?: string;
  precoBase: number;
  preco?: number; // Alias para precoBase
  custoPadrao?: number;
  custo?: number; // Alias para custoPadrao
  estoque?: number;
  unidade?: 'UN' | 'KG' | 'M' | 'L' | 'CX' | 'PC';
  estruturaAnaliticaId?: string; // EAE padrão
  especificacoes?: Record<string, any>;
  ativo: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

// ============ USUÁRIOS E PERMISSÕES ============
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  senhaHash: string; // Hash da senha
  perfil: 'Diretoria' | 'Comercial' | 'Eng_Processo' | 'Eng_Mecanica' | 'Eng_Eletrica' | 'Automacao' | 'PCP_Producao' | 'Financeiro' | 'Juridico' | 'Compliance' | 'Assistencia_Tecnica' | 'Cliente';
  ativo: boolean;
  dataCriacao: string;
  dataAtualizacao: string;
}

export interface Permissao {
  modulo: string;
  acao: 'ler' | 'criar' | 'editar' | 'excluir' | 'aprovar';
  perfil: string[];
}

// ============ VENDAS ============
export interface ItemVenda {
  produtoId: string;
  produtoNome?: string;
  quantidade: number;
  preco: number;
  desconto?: number;
  subtotal: number;
}

export interface Venda {
  id: string;
  numero: string;
  clienteId: string;
  clienteNome?: string;
  itens: ItemVenda[];
  subtotal: number;
  desconto?: number;
  total: number;
  moeda?: 'BRL' | 'USD' | 'EUR';
  formaPagamento?: 'dinheiro' | 'cartao' | 'pix' | 'boleto' | 'transferencia';
  status: 'pendente' | 'paga' | 'cancelada';
  dataVenda: string;
  observacoes?: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

// ============ DASHBOARDS ============
export interface DashboardStats {
  // Comercial
  totalClientes: number;
  totalOportunidades: number;
  valorTotalOportunidades: number;
  propostasAbertas: number;
  taxaConversao: number;
  
  // Projetos
  projetosAtivos: number;
  projetosAtrasados: number;
  documentosPendentes: number;
  
  // Financeiro
  parcelasVencidas: number;
  valorVencido: number;
  previsaoCaixa: number;
  
  // Produção
  ordensFabricacaoAtivas: number;
  horasPrevistasVsReais: number;
  produtividadeMedia: number;
  
  // Pós-venda
  chamadosAbertos: number;
  chamadosCriticos: number;
  slaCumprido: number;
  
  // Campos adicionais usados no Dashboard
  receitaTotal?: number;
  totalVendas?: number;
  totalProdutos?: number;
  ticketMedio?: number;
  atividadesPendentes?: number;
}
