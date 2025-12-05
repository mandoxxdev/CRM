// Re-exportar serviços modulares
export { projetoService } from './services/projetoService';
export { producaoService } from './services/producaoService';
export { documentoService } from './services/documentoService';
export { contratoService } from './services/contratoService';
export { propostaService } from './services/propostaService';
export { equipamentoService } from './services/equipamentoService';
export { posVendaService } from './services/posVendaService';
export { financeiroService } from './services/financeiroService';
export { calendarioService } from './services/calendarioService';
export { usuarioService } from './services/usuarioService';

// Manter compatibilidade com código antigo
import { db } from '../db/database';
import { generateId } from './helpers';
import type { Cliente, Contato, Oportunidade, Atividade, Produto, Venda } from '../types';

// Serviços antigos (manter para compatibilidade)
export const clienteService = {
  getAll: async (): Promise<Cliente[]> => {
    return await db.clientes.orderBy('dataCriacao').reverse().toArray();
  },
  getById: async (id: string): Promise<Cliente | undefined> => {
    return await db.clientes.get(id);
  },
  create: async (cliente: Omit<Cliente, 'id' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    const newCliente: Cliente = {
      ...cliente,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    await db.clientes.add(newCliente);
    return newCliente.id;
  },
  update: async (id: string, updates: Partial<Cliente>): Promise<void> => {
    await db.clientes.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  delete: async (id: string): Promise<void> => {
    await db.clientes.delete(id);
  },
};

export const contatoService = {
  getAll: async (): Promise<Contato[]> => {
    return await db.contatos.orderBy('dataCriacao').reverse().toArray();
  },
  getByClienteId: async (clienteId: string): Promise<Contato[]> => {
    return await db.contatos.where('clienteId').equals(clienteId).toArray();
  },
  create: async (contato: Omit<Contato, 'id' | 'dataCriacao'>): Promise<string> => {
    const newContato: Contato = {
      ...contato,
      id: generateId(),
      dataCriacao: new Date().toISOString(),
    };
    await db.contatos.add(newContato);
    return newContato.id;
  },
  update: async (id: string, updates: Partial<Contato>): Promise<void> => {
    await db.contatos.update(id, updates);
  },
  delete: async (id: string): Promise<void> => {
    await db.contatos.delete(id);
  },
};

export const oportunidadeService = {
  getAll: async (): Promise<Oportunidade[]> => {
    return await db.oportunidades.orderBy('dataCriacao').reverse().toArray();
  },
  getByClienteId: async (clienteId: string): Promise<Oportunidade[]> => {
    return await db.oportunidades.where('clienteId').equals(clienteId).toArray();
  },
  create: async (oportunidade: Omit<Oportunidade, 'id' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    const newOportunidade: Oportunidade = {
      ...oportunidade,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    await db.oportunidades.add(newOportunidade);
    return newOportunidade.id;
  },
  update: async (id: string, updates: Partial<Oportunidade>): Promise<void> => {
    await db.oportunidades.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  delete: async (id: string): Promise<void> => {
    await db.oportunidades.delete(id);
  },
};

export const atividadeService = {
  getAll: async (): Promise<Atividade[]> => {
    return await db.atividades.orderBy('data').reverse().toArray();
  },
  getByClienteId: async (clienteId: string): Promise<Atividade[]> => {
    return await db.atividades.where('clienteId').equals(clienteId).toArray();
  },
  getPendentes: async (): Promise<Atividade[]> => {
    return await db.atividades.where('concluida').equals(false).toArray();
  },
  create: async (atividade: Omit<Atividade, 'id' | 'dataCriacao'>): Promise<string> => {
    const newAtividade: Atividade = {
      ...atividade,
      id: generateId(),
      dataCriacao: new Date().toISOString(),
    };
    await db.atividades.add(newAtividade);
    return newAtividade.id;
  },
  update: async (id: string, updates: Partial<Atividade>): Promise<void> => {
    await db.atividades.update(id, updates);
  },
  delete: async (id: string): Promise<void> => {
    await db.atividades.delete(id);
  },
};

// Serviços de produtos e vendas (manter compatibilidade)
import type { Produto as ProdutoType } from '../types';

export const produtoService = {
  getAll: async (): Promise<ProdutoType[]> => {
    return await db.produtos.orderBy('dataCriacao').reverse().toArray();
  },
  getAtivos: async (): Promise<ProdutoType[]> => {
    return await db.produtos.where('ativo').equals(true).toArray();
  },
  getById: async (id: string): Promise<ProdutoType | undefined> => {
    return await db.produtos.get(id);
  },
  getByCodigo: async (codigo: string): Promise<ProdutoType | undefined> => {
    return await db.produtos.where('codigo').equals(codigo).first();
  },
  create: async (produto: Omit<ProdutoType, 'id' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    const newProduto: ProdutoType = {
      ...produto,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    await db.produtos.add(newProduto);
    return newProduto.id;
  },
  update: async (id: string, updates: Partial<ProdutoType>): Promise<void> => {
    await db.produtos.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  delete: async (id: string): Promise<void> => {
    await db.produtos.delete(id);
  },
};

// Venda service (simplificado - manter compatibilidade)
export const vendaService = {
  getAll: async (): Promise<Venda[]> => {
    return await db.vendas.orderBy('dataVenda').reverse().toArray();
  },
  getById: async (id: string): Promise<Venda | undefined> => {
    return await db.vendas.get(id);
  },
  create: async (venda: Omit<Venda, 'id' | 'numero' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    const ultimaVenda = await db.vendas.orderBy('dataCriacao').reverse().first();
    const numero = ultimaVenda 
      ? `VND-${String(parseInt(ultimaVenda.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'VND-000001';
    const newVenda: Venda = {
      ...venda,
      id: generateId(),
      numero,
      dataCriacao: now,
      dataAtualizacao: now,
    };
    await db.vendas.add(newVenda);
    return newVenda.id;
  },
  getEstatisticas: async () => {
    const vendas = await db.vendas.toArray();
    const vendasPagas = vendas.filter(v => v.status === 'paga');
    const receitaTotal = vendasPagas.reduce((sum, v) => sum + v.total, 0);
    const ticketMedio = vendasPagas.length > 0 ? receitaTotal / vendasPagas.length : 0;
    return {
      totalVendas: vendas.length,
      vendasPagas: vendasPagas.length,
      receitaTotal,
      ticketMedio,
    };
  },
};
