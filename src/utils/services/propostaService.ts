import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { Proposta } from '../../types';

export const propostaService = {
  getAll: async (): Promise<Proposta[]> => {
    return await db.propostas.orderBy('dataCriacao').reverse().toArray();
  },
  
  getById: async (id: string): Promise<Proposta | undefined> => {
    return await db.propostas.get(id);
  },
  
  getByOportunidade: async (oportunidadeId: string): Promise<Proposta[]> => {
    return await db.propostas.where('oportunidadeId').equals(oportunidadeId).toArray();
  },
  
  create: async (proposta: Omit<Proposta, 'id' | 'numero' | 'versao' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    
    // Gerar número da proposta
    const ultimaProposta = await db.propostas.orderBy('dataCriacao').reverse().first();
    const numero = ultimaProposta 
      ? `PROP-${String(parseInt(ultimaProposta.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'PROP-000001';
    
    const newProposta: Proposta = {
      ...proposta,
      id: generateId(),
      numero,
      versao: 'V01',
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.propostas.add(newProposta);
    return newProposta.id;
  },
  
  criarNovaVersao: async (id: string): Promise<string> => {
    const proposta = await db.propostas.get(id);
    if (!proposta) throw new Error('Proposta não encontrada');
    
    const numeroVersao = parseInt(proposta.versao.replace('V', '')) + 1;
    const novaVersao = `V${String(numeroVersao).padStart(2, '0')}`;
    
    // Criar nova proposta como versão
    const newProposta: Proposta = {
      ...proposta,
      id: generateId(),
      versao: novaVersao,
      status: 'rascunho',
      dataCriacao: new Date().toISOString(),
      dataAtualizacao: new Date().toISOString(),
    };
    
    await db.propostas.add(newProposta);
    return newProposta.id;
  },
  
  atualizarStatus: async (id: string, status: Proposta['status'], dataAbertura?: string): Promise<void> => {
    const updates: any = {
      status,
      dataAtualizacao: new Date().toISOString(),
    };
    
    if (status === 'enviada') {
      updates.dataEnvio = new Date().toISOString();
    }
    
    if (status === 'aberta' && dataAbertura) {
      updates.dataAbertura = dataAbertura;
    }
    
    await db.propostas.update(id, updates);
  },
  
  update: async (id: string, updates: Partial<Proposta>): Promise<void> => {
    await db.propostas.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    await db.propostas.delete(id);
  },
};

