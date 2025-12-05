import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { Contrato } from '../../types';

export const contratoService = {
  getAll: async (): Promise<Contrato[]> => {
    return await db.contratos.orderBy('dataCriacao').reverse().toArray();
  },
  
  getById: async (id: string): Promise<Contrato | undefined> => {
    return await db.contratos.get(id);
  },
  
  getByCliente: async (clienteId: string): Promise<Contrato[]> => {
    return await db.contratos.where('clienteId').equals(clienteId).toArray();
  },
  
  getByProjeto: async (projetoId: string): Promise<Contrato[]> => {
    return await db.contratos.where('projetoId').equals(projetoId).toArray();
  },
  
  create: async (contrato: Omit<Contrato, 'id' | 'numero' | 'versao' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    
    // Gerar número do contrato
    const ultimoContrato = await db.contratos.orderBy('dataCriacao').reverse().first();
    const numero = ultimoContrato 
      ? `CTR-${String(parseInt(ultimoContrato.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'CTR-000001';
    
    const newContrato: Contrato = {
      ...contrato,
      id: generateId(),
      numero,
      versao: 'V01',
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.contratos.add(newContrato);
    return newContrato.id;
  },
  
  criarNovaVersao: async (id: string): Promise<string> => {
    const contrato = await db.contratos.get(id);
    if (!contrato) throw new Error('Contrato não encontrado');
    
    const numeroVersao = parseInt(contrato.versao.replace('V', '')) + 1;
    const novaVersao = `V${String(numeroVersao).padStart(2, '0')}`;
    
    // Criar novo contrato como versão
    const newContrato: Contrato = {
      ...contrato,
      id: generateId(),
      versao: novaVersao,
      status: 'minuta',
      dataCriacao: new Date().toISOString(),
      dataAtualizacao: new Date().toISOString(),
    };
    
    await db.contratos.add(newContrato);
    return newContrato.id;
  },
  
  update: async (id: string, updates: Partial<Contrato>): Promise<void> => {
    await db.contratos.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    await db.contratos.delete(id);
  },
};

