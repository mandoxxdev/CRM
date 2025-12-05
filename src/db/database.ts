import Dexie, { Table } from 'dexie';
import type {
  Cliente, Contato, Lead, Oportunidade, Proposta, Contrato,
  Projeto, FaseProjeto, DocumentoTecnico, Equipamento,
  OrdemFabricacao, EstruturaAnaliticaEquipamento, RegistroHora,
  ParcelaFinanceira, Chamado, SLA, Atividade, Produto, Usuario, Reuniao
} from '../types';

// Tipo temporário para compatibilidade
interface Venda {
  id: string;
  numero: string;
  clienteId: string;
  itens: any[];
  subtotal: number;
  desconto?: number;
  total: number;
  formaPagamento: string;
  status: string;
  observacoes?: string;
  dataVenda: string;
  dataCriacao: string;
  dataAtualizacao: string;
}

export class CRMDatabase extends Dexie {
  // Base
  clientes!: Table<Cliente, string>;
  contatos!: Table<Contato, string>;
  leads!: Table<Lead, string>;
  
  // Comercial
  oportunidades!: Table<Oportunidade, string>;
  propostas!: Table<Proposta, string>;
  
  // Contratos
  contratos!: Table<Contrato, string>;
  
  // Projetos
  projetos!: Table<Projeto, string>;
  fasesProjeto!: Table<FaseProjeto, string>;
  
  // Documentos
  documentosTecnicos!: Table<DocumentoTecnico, string>;
  
  // Equipamentos
  equipamentos!: Table<Equipamento, string>;
  
  // Produção
  ordensFabricacao!: Table<OrdemFabricacao, string>;
  estruturasAnaliticas!: Table<EstruturaAnaliticaEquipamento, string>;
  registrosHora!: Table<RegistroHora, string>;
  
  // Financeiro
  parcelasFinanceiras!: Table<ParcelaFinanceira, string>;
  
  // Pós-venda
  chamados!: Table<Chamado, string>;
  slas!: Table<SLA, string>;
  
  // Outros
  atividades!: Table<Atividade, string>;
  produtos!: Table<Produto, string>;
  usuarios!: Table<Usuario, string>;
  vendas!: Table<Venda, string>; // Temporário para compatibilidade
  reunioes!: Table<Reuniao, string>;

  constructor() {
    super('CRMGMPDatabase');
    
    this.version(2).stores({
      // Base
      clientes: 'id, nome, cnpj, segmento, pais, dataCriacao',
      contatos: 'id, clienteId, nome, email, dataCriacao',
      leads: 'id, status, origem, dataCriacao',
      
      // Comercial
      oportunidades: 'id, clienteId, etapa, valor, dataCriacao',
      propostas: 'id, oportunidadeId, numero, versao, status, dataCriacao',
      
      // Contratos
      contratos: 'id, numero, clienteId, projetoId, tipo, status, dataCriacao',
      
      // Projetos
      projetos: 'id, numero, clienteId, tipo, status, dataCriacao',
      fasesProjeto: 'id, projetoId, numero, status',
      
      // Documentos
      documentosTecnicos: 'id, projetoId, faseId, numero, tipo, disciplina, revisao, status, dataCriacao',
      
      // Equipamentos
      equipamentos: 'id, clienteId, projetoId, numeroSerie, modelo, tipo, status, dataCriacao',
      
      // Produção
      ordensFabricacao: 'id, numero, equipamentoId, projetoId, status, dataCriacao',
      estruturasAnaliticas: 'id, modeloEquipamento, dataCriacao',
      registrosHora: 'id, ordemFabricacaoId, etapaId, colaboradorId, data, dataCriacao',
      
      // Financeiro
      parcelasFinanceiras: 'id, projetoId, contratoId, numero, tipo, status, dataVencimento, dataCriacao',
      
      // Pós-venda
      chamados: 'id, numero, clienteId, equipamentoId, tipo, status, prioridade, dataAbertura, dataCriacao',
      slas: 'id, clienteId, contratoId, tipo, dataCriacao',
      
      // Outros
      atividades: 'id, clienteId, oportunidadeId, projetoId, tipo, data, concluida, dataCriacao',
      produtos: 'id, codigo, tipo, ativo, dataCriacao',
      usuarios: 'id, email, perfil, ativo, dataCriacao',
      vendas: 'id, numero, clienteId, status, dataVenda, total, dataCriacao',
      reunioes: 'id, titulo, dataInicio, dataFim, tipo, status, clienteId, dataCriacao',
    });
  }
}

export const db = new CRMDatabase();

// Inicializar banco de dados
export const initDatabase = async () => {
  try {
    await db.open();
    console.log('Banco de dados inicializado com sucesso');
  } catch (error) {
    console.error('Erro ao inicializar banco de dados:', error);
  }
};
