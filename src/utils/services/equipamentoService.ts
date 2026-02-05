import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { Equipamento } from '../../types';

export const equipamentoService = {
  getAll: async (): Promise<Equipamento[]> => {
    return await db.equipamentos.orderBy('dataCriacao').reverse().toArray();
  },
  
  getById: async (id: string): Promise<Equipamento | undefined> => {
    return await db.equipamentos.get(id);
  },
  
  getByCliente: async (clienteId: string): Promise<Equipamento[]> => {
    return await db.equipamentos.where('clienteId').equals(clienteId).toArray();
  },
  
  getByProjeto: async (projetoId: string): Promise<Equipamento[]> => {
    return await db.equipamentos.where('projetoId').equals(projetoId).toArray();
  },
  
  getByModelo: async (modelo: string): Promise<Equipamento[]> => {
    return await db.equipamentos.where('modelo').equals(modelo).toArray();
  },
  
  create: async (equipamento: Omit<Equipamento, 'id' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    
    const newEquipamento: Equipamento = {
      ...equipamento,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.equipamentos.add(newEquipamento);
    return newEquipamento.id;
  },
  
  update: async (id: string, updates: Partial<Equipamento>): Promise<void> => {
    await db.equipamentos.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    await db.equipamentos.delete(id);
  },
};

