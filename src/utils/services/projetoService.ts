import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { Projeto, FaseProjeto } from '../../types';

export const projetoService = {
  getAll: async (): Promise<Projeto[]> => {
    return await db.projetos.orderBy('dataCriacao').reverse().toArray();
  },
  
  getById: async (id: string): Promise<Projeto | undefined> => {
    return await db.projetos.get(id);
  },
  
  getByClienteId: async (clienteId: string): Promise<Projeto[]> => {
    return await db.projetos.where('clienteId').equals(clienteId).toArray();
  },
  
  create: async (projeto: Omit<Projeto, 'id' | 'numero' | 'dataCriacao' | 'dataAtualizacao' | 'fases'>): Promise<string> => {
    const now = new Date().toISOString();
    
    // Gerar número do projeto
    const ultimoProjeto = await db.projetos.orderBy('dataCriacao').reverse().first();
    const numero = ultimoProjeto 
      ? `PRJ-${String(parseInt(ultimoProjeto.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'PRJ-000001';
    
    // Criar fases padrão para projetos turnkey
    const fases: FaseProjeto[] = projeto.tipo === 'turnkey' 
      ? [
          { id: generateId(), numero: 1, nome: 'Fase 1 - Engenharia Básica', status: 'nao_iniciada', responsaveis: [], entregaveis: [], progresso: 0 },
          { id: generateId(), numero: 2, nome: 'Fase 2 - Engenharia de Detalhamento', status: 'nao_iniciada', responsaveis: [], entregaveis: [], progresso: 0 },
          { id: generateId(), numero: 3, nome: 'Fase 3 - Fabricação', status: 'nao_iniciada', responsaveis: [], entregaveis: [], progresso: 0 },
          { id: generateId(), numero: 4, nome: 'Fase 4 - Montagem e Comissionamento', status: 'nao_iniciada', responsaveis: [], entregaveis: [], progresso: 0 },
        ]
      : [];
    
    const newProjeto: Projeto = {
      ...projeto,
      id: generateId(),
      numero,
      fases,
      progressoFisico: 0,
      progressoDocumental: 0,
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.projetos.add(newProjeto);
    
    // Salvar fases
    for (const fase of fases) {
      await db.fasesProjeto.add({ 
        ...fase, 
        id: generateId(),
        projetoId: newProjeto.id 
      });
    }
    
    return newProjeto.id;
  },
  
  update: async (id: string, updates: Partial<Projeto>): Promise<void> => {
    await db.projetos.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  updateFase: async (projetoId: string, faseId: string, updates: Partial<FaseProjeto>): Promise<void> => {
    await db.fasesProjeto.update(faseId, updates);
    
    // Recalcular progresso do projeto
    const projeto = await db.projetos.get(projetoId);
    if (projeto) {
      const fases = await db.fasesProjeto.where('projetoId').equals(projetoId).toArray();
      const progressoFisico = fases.length > 0 
        ? fases.reduce((sum, f) => sum + f.progresso, 0) / fases.length 
        : 0;
      
      await db.projetos.update(projetoId, { progressoFisico });
    }
  },
  
  delete: async (id: string): Promise<void> => {
    // Deletar fases
    await db.fasesProjeto.where('projetoId').equals(id).delete();
    await db.projetos.delete(id);
  },
};

