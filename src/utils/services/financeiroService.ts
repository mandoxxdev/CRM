import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { ParcelaFinanceira } from '../../types';

export const financeiroService = {
  getAll: async (): Promise<ParcelaFinanceira[]> => {
    return await db.parcelasFinanceiras.orderBy('dataVencimento').toArray();
  },
  
  getById: async (id: string): Promise<ParcelaFinanceira | undefined> => {
    return await db.parcelasFinanceiras.get(id);
  },
  
  getByProjeto: async (projetoId: string): Promise<ParcelaFinanceira[]> => {
    return await db.parcelasFinanceiras.where('projetoId').equals(projetoId).toArray();
  },
  
  getVencidas: async (): Promise<ParcelaFinanceira[]> => {
    const hoje = new Date().toISOString().split('T')[0];
    return await db.parcelasFinanceiras
      .where('status').anyOf(['planejada', 'vencida'])
      .and(p => p.dataVencimento < hoje)
      .toArray();
  },
  
  create: async (parcela: Omit<ParcelaFinanceira, 'id' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    
    const newParcela: ParcelaFinanceira = {
      ...parcela,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.parcelasFinanceiras.add(newParcela);
    return newParcela.id;
  },
  
  criarParcelasPorMarcos: async (projetoId: string, marcos: { tipo: ParcelaFinanceira['tipo'], descricao: string, valor: number, dataVencimento: string, moeda: 'BRL' | 'USD' | 'EUR' }[]): Promise<string[]> => {
    const ids: string[] = [];
    let numero = 1;
    
    for (const marco of marcos) {
      const id = await financeiroService.create({
        projetoId,
        numero: numero++,
        tipo: marco.tipo,
        descricao: marco.descricao,
        valor: marco.valor,
        moeda: marco.moeda,
        dataVencimento: marco.dataVencimento,
        status: 'planejada',
      });
      ids.push(id);
    }
    
    return ids;
  },
  
  atualizarStatus: async (id: string, status: ParcelaFinanceira['status'], numeroNF?: string, dataFaturamento?: string, dataRecebimento?: string): Promise<void> => {
    const updates: any = {
      status,
      dataAtualizacao: new Date().toISOString(),
    };
    
    if (numeroNF) updates.numeroNF = numeroNF;
    if (dataFaturamento) updates.dataFaturamento = dataFaturamento;
    if (dataRecebimento) updates.dataRecebimento = dataRecebimento;
    
    await db.parcelasFinanceiras.update(id, updates);
  },
  
  update: async (id: string, updates: Partial<ParcelaFinanceira>): Promise<void> => {
    await db.parcelasFinanceiras.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
  },
  
  delete: async (id: string): Promise<void> => {
    await db.parcelasFinanceiras.delete(id);
  },
  
  getEstatisticas: async () => {
    const parcelas = await db.parcelasFinanceiras.toArray();
    const vencidas = parcelas.filter(p => {
      const hoje = new Date().toISOString().split('T')[0];
      return p.status === 'planejada' && p.dataVencimento < hoje;
    });
    
    const recebidas = parcelas.filter(p => p.status === 'recebida');
    const faturadas = parcelas.filter(p => p.status === 'faturada');
    
    return {
      totalParcelas: parcelas.length,
      parcelasVencidas: vencidas.length,
      valorVencido: vencidas.reduce((sum, p) => sum + p.valor, 0),
      valorRecebido: recebidas.reduce((sum, p) => sum + p.valor, 0),
      valorFaturado: faturadas.reduce((sum, p) => sum + p.valor, 0),
    };
  },
};

