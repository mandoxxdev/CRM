import { db } from '../../db/database';
import { generateId } from '../helpers';
import type { OrdemFabricacao, EstruturaAnaliticaEquipamento, RegistroHora, EtapaFabricacao } from '../../types';

export const producaoService = {
  // ============ ORDENS DE FABRICAÇÃO ============
  getAllOFs: async (): Promise<OrdemFabricacao[]> => {
    return await db.ordensFabricacao.orderBy('dataCriacao').reverse().toArray();
  },
  
  getOFById: async (id: string): Promise<OrdemFabricacao | undefined> => {
    return await db.ordensFabricacao.get(id);
  },
  
  getOFsByProjeto: async (projetoId: string): Promise<OrdemFabricacao[]> => {
    return await db.ordensFabricacao.where('projetoId').equals(projetoId).toArray();
  },
  
  createOF: async (of: Omit<OrdemFabricacao, 'id' | 'numero' | 'dataCriacao' | 'dataAtualizacao' | 'horasReais' | 'custoReal'>): Promise<string> => {
    const now = new Date().toISOString();
    
    // Gerar número da OF
    const ultimaOF = await db.ordensFabricacao.orderBy('dataCriacao').reverse().first();
    const numero = ultimaOF 
      ? `OF-${String(parseInt(ultimaOF.numero.split('-')[1]) + 1).padStart(6, '0')}`
      : 'OF-000001';
    
    // Calcular horas previstas e custo previsto
    let horasPrevistas = 0;
    let custoPrevisto = 0;
    
    if (of.estruturaAnaliticaId) {
      const eae = await db.estruturasAnaliticas.get(of.estruturaAnaliticaId);
      if (eae) {
        horasPrevistas = eae.horasTotaisPrevistas;
        custoPrevisto = eae.custoTotalPrevisto;
      }
    } else {
      horasPrevistas = of.recursosRequeridos.reduce((sum, r) => sum + r.horasPrevistas, 0);
      custoPrevisto = of.recursosRequeridos.reduce((sum, r) => sum + (r.horasPrevistas * r.custoHora), 0);
    }
    
    const newOF: OrdemFabricacao = {
      ...of,
      id: generateId(),
      numero,
      horasPrevistas,
      horasReais: 0,
      custoPrevisto,
      custoReal: 0,
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.ordensFabricacao.add(newOF);
    return newOF.id;
  },
  
  updateOF: async (id: string, updates: Partial<OrdemFabricacao>): Promise<void> => {
    await db.ordensFabricacao.update(id, {
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    });
    
    // Recalcular horas e custos reais
    const of = await db.ordensFabricacao.get(id);
    if (of) {
      const registros = await db.registrosHora.where('ordemFabricacaoId').equals(id).toArray();
      const horasReais = registros.reduce((sum, r) => sum + r.horas, 0);
      
      // Calcular custo real baseado nos registros
      let custoReal = 0;
      for (const registro of registros) {
        const etapa = await getEtapaFromRegistro(registro.etapaId);
        if (etapa) {
          custoReal += registro.horas * etapa.custoHoraSetor;
        }
      }
      
      await db.ordensFabricacao.update(id, { horasReais, custoReal });
    }
  },
  
  // ============ ESTRUTURAS ANALÍTICAS ============
  getAllEAEs: async (): Promise<EstruturaAnaliticaEquipamento[]> => {
    return await db.estruturasAnaliticas.orderBy('dataCriacao').reverse().toArray();
  },
  
  getEAEById: async (id: string): Promise<EstruturaAnaliticaEquipamento | undefined> => {
    return await db.estruturasAnaliticas.get(id);
  },
  
  getEAEByModelo: async (modelo: string): Promise<EstruturaAnaliticaEquipamento | undefined> => {
    return await db.estruturasAnaliticas.where('modeloEquipamento').equals(modelo).first();
  },
  
  createEAE: async (eae: Omit<EstruturaAnaliticaEquipamento, 'id' | 'horasTotaisPrevistas' | 'custoTotalPrevisto' | 'dataCriacao' | 'dataAtualizacao'>): Promise<string> => {
    const now = new Date().toISOString();
    
    // Calcular totais
    const horasTotaisPrevistas = eae.etapas.reduce((sum, e) => sum + e.tempoPadrao, 0);
    const custoTotalPrevisto = eae.etapas.reduce((sum, e) => sum + (e.tempoPadrao * e.custoHoraSetor), 0);
    
    const newEAE: EstruturaAnaliticaEquipamento = {
      ...eae,
      id: generateId(),
      horasTotaisPrevistas,
      custoTotalPrevisto,
      dataCriacao: now,
      dataAtualizacao: now,
    };
    
    await db.estruturasAnaliticas.add(newEAE);
    return newEAE.id;
  },
  
  // ============ REGISTROS DE HORA ============
  getAllRegistros: async (): Promise<RegistroHora[]> => {
    return await db.registrosHora.orderBy('data').reverse().toArray();
  },
  
  getRegistrosByOF: async (ofId: string): Promise<RegistroHora[]> => {
    return await db.registrosHora.where('ordemFabricacaoId').equals(ofId).toArray();
  },
  
  createRegistro: async (registro: Omit<RegistroHora, 'id' | 'dataCriacao'>): Promise<string> => {
    const newRegistro: RegistroHora = {
      ...registro,
      id: generateId(),
      dataCriacao: new Date().toISOString(),
    };
    
    await db.registrosHora.add(newRegistro);
    
    // Atualizar OF
    await producaoService.updateOF(registro.ordemFabricacaoId, {});
    
    return newRegistro.id;
  },
  
  // ============ ESTATÍSTICAS ============
  getEstatisticas: async () => {
    const ofs = await db.ordensFabricacao.toArray();
    await db.registrosHora.toArray(); // Para estatísticas futuras
    
    const horasPrevistasTotal = ofs.reduce((sum, of) => sum + of.horasPrevistas, 0);
    const horasReaisTotal = ofs.reduce((sum, of) => sum + of.horasReais, 0);
    const custoPrevistoTotal = ofs.reduce((sum, of) => sum + of.custoPrevisto, 0);
    const custoRealTotal = ofs.reduce((sum, of) => sum + of.custoReal, 0);
    
    return {
      totalOFs: ofs.length,
      ofsAtivas: ofs.filter(of => of.status === 'em_andamento').length,
      horasPrevistasTotal,
      horasReaisTotal,
      diferencaHoras: horasReaisTotal - horasPrevistasTotal,
      custoPrevistoTotal,
      custoRealTotal,
      diferencaCusto: custoRealTotal - custoPrevistoTotal,
      produtividade: horasPrevistasTotal > 0 ? (horasPrevistasTotal / horasReaisTotal) * 100 : 0,
    };
  },
};

// Helper para buscar etapa
async function getEtapaFromRegistro(etapaId: string): Promise<EtapaFabricacao | null> {
  // Buscar em todas as EAEs
  const eaes = await db.estruturasAnaliticas.toArray();
  for (const eae of eaes) {
    const etapa = eae.etapas.find(e => e.id === etapaId);
    if (etapa) return etapa;
  }
  return null;
}

