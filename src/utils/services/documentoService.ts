import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { DocumentoTecnico, HistoricoRevisao } from '../../types';

export const documentoService = {
  getAll: async (): Promise<DocumentoTecnico[]> => {
    return await db.documentosTecnicos.orderBy('dataCriacao').reverse().toArray();
  },
  
  getById: async (id: string): Promise<DocumentoTecnico | undefined> => {
    return await db.documentosTecnicos.get(id);
  },
  
  getByProjeto: async (projetoId: string): Promise<DocumentoTecnico[]> => {
    return await db.documentosTecnicos.where('projetoId').equals(projetoId).toArray();
  },
  
  getByFase: async (faseId: string): Promise<DocumentoTecnico[]> => {
    return await db.documentosTecnicos.where('faseId').equals(faseId).toArray();
  },
  
  create: async (doc: Omit<DocumentoTecnico, 'id' | 'numero' | 'revisao' | 'historicoRevisoes' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    
    // Gerar número do documento
    const ultimoDoc = await db.documentosTecnicos.orderBy('dataCriacao').reverse().first();
    const numero = ultimoDoc 
      ? `DOC-${String(parseInt(ultimoDoc.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'DOC-000001';
    
    const newDoc: DocumentoTecnico = {
      ...doc,
      id: generateId(),
      numero,
      revisao: 'R00',
      historicoRevisoes: [{
        revisao: 'R00',
        data: now,
        responsavel: doc.responsavel || '',
      }],
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.documentosTecnicos.add(newDoc);
    return newDoc.id;
  },
  
  criarNovaRevisao: async (id: string, responsavel: string, alteracoes?: string, comentarios?: string): Promise<void> => {
    const doc = await db.documentosTecnicos.get(id);
    if (!doc) return;
    
    // Calcular próxima revisão
    const ultimaRevisao = doc.historicoRevisoes[doc.historicoRevisoes.length - 1];
    const numeroRevisao = parseInt(ultimaRevisao.revisao.replace('R', '')) + 1;
    const novaRevisao = `R${String(numeroRevisao).padStart(2, '0')}`;
    
    const historico: HistoricoRevisao = {
      revisao: novaRevisao,
      data: new Date().toISOString(),
      responsavel,
      alteracoes,
      comentarios,
    };
    
    await db.documentosTecnicos.update(id, {
      revisao: novaRevisao,
      historicoRevisoes: [...doc.historicoRevisoes, historico],
      status: 'em_revisao',
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  atualizarStatus: async (id: string, status: DocumentoTecnico['status'], comentariosCliente?: string): Promise<void> => {
    const updates: any = {
      status,
      dataAtualizacao: new Date().toISOString(),
    };
    
    if (status === 'aprovado') {
      updates.dataAprovacao = new Date().toISOString();
    }
    
    if (comentariosCliente) {
      updates.comentariosCliente = comentariosCliente;
    }
    
    await db.documentosTecnicos.update(id, updates);
  },
  
  update: async (id: string, updates: Partial<DocumentoTecnico>): Promise<void> => {
    await db.documentosTecnicos.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    await db.documentosTecnicos.delete(id);
  },
};

