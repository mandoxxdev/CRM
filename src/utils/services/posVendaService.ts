import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { Chamado, SLA, AcaoChamado, PecaSubstituida } from '../../types';

export const posVendaService = {
  // ============ CHAMADOS ============
  getAllChamados: async (): Promise<Chamado[]> => {
    return await db.chamados.orderBy('dataAbertura').reverse().toArray();
  },
  
  getChamadoById: async (id: string): Promise<Chamado | undefined> => {
    return await db.chamados.get(id);
  },
  
  getChamadosByCliente: async (clienteId: string): Promise<Chamado[]> => {
    return await db.chamados.where('clienteId').equals(clienteId).toArray();
  },
  
  getChamadosByEquipamento: async (equipamentoId: string): Promise<Chamado[]> => {
    return await db.chamados.where('equipamentoId').equals(equipamentoId).toArray();
  },
  
  createChamado: async (chamado: Omit<Chamado, 'id' | 'numero' | 'dataCriacao' | 'dataAtualizacao' | 'acoes' | 'pecasSubstituidas'>): Promise<string> => {
    const now = new Date().toISOString();
    
    // Gerar número do chamado
    const ultimoChamado = await db.chamados.orderBy('dataCriacao').reverse().first();
    const numero = ultimoChamado 
      ? `CHM-${String(parseInt(ultimoChamado.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'CHM-000001';
    
    const newChamado: Chamado = {
      ...chamado,
      id: generateId(),
      numero,
      acoes: [],
      pecasSubstituidas: [],
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.chamados.add(newChamado);
    return newChamado.id;
  },
  
  adicionarAcao: async (chamadoId: string, acao: Omit<AcaoChamado, 'id'>): Promise<void> => {
    const chamado = await db.chamados.get(chamadoId);
    if (!chamado) return;
    
    const newAcao: AcaoChamado = {
      ...acao,
      id: generateId(),
    };
    
    await db.chamados.update(chamadoId, {
      acoes: [...chamado.acoes, newAcao],
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  adicionarPeca: async (chamadoId: string, peca: Omit<PecaSubstituida, 'id'>): Promise<void> => {
    const chamado = await db.chamados.get(chamadoId);
    if (!chamado) return;
    
    const newPeca: PecaSubstituida = {
      ...peca,
      id: generateId(),
    };
    
    await db.chamados.update(chamadoId, {
      pecasSubstituidas: [...chamado.pecasSubstituidas, newPeca],
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  updateChamado: async (id: string, updates: Partial<Chamado>): Promise<void> => {
    await db.chamados.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  // ============ SLAs ============
  getAllSLAs: async (): Promise<SLA[]> => {
    return await db.slas.orderBy('dataCriacao').reverse().toArray();
  },
  
  getSLAByCliente: async (clienteId: string): Promise<SLA | undefined> => {
    return await db.slas.where('clienteId').equals(clienteId).first();
  },
  
  createSLA: async (sla: Omit<SLA, 'id' | 'dataCriacao'>): Promise<string> => {
    const newSLA: SLA = {
      ...sla,
      id: generateId(),
      dataCriacao: new Date().toISOString(),
    };
    
    await db.slas.add(newSLA);
    return newSLA.id;
  },
};

