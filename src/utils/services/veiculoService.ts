import { db } from '../../db/database';
import { generateId } from '../helpers';
import type {
  Veiculo,
  VistoriaVeiculo,
  ItemManutencaoVeiculo,
  RegistroManutencaoVeiculo,
} from '../../types';

type NovoVeiculo = Omit<Veiculo, 'id' | 'dataCriacao' | 'dataAtualizacao'>;
type NovaVistoria = Omit<VistoriaVeiculo, 'id' | 'dataCriacao' | 'dataAtualizacao'>;
type NovoItem = Omit<ItemManutencaoVeiculo, 'id' | 'dataCriacao' | 'dataAtualizacao'>;
type NovoRegistro = Omit<RegistroManutencaoVeiculo, 'id' | 'dataCriacao' | 'dataAtualizacao' | 'duracaoHoras'>;

export const veiculoService = {
  getAll: async (): Promise<Veiculo[]> => {
    return db.veiculos.orderBy('dataCriacao').reverse().toArray();
  },

  getById: async (id: string): Promise<Veiculo | undefined> => {
    return db.veiculos.get(id);
  },

  create: async (veiculo: NovoVeiculo): Promise<string> => {
    const now = new Date().toISOString();
    const novo: Veiculo = {
      ...veiculo,
      placa: veiculo.placa.toUpperCase(),
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    await db.veiculos.add(novo);
    return novo.id;
  },

  update: async (id: string, updates: Partial<Veiculo>): Promise<void> => {
    await db.veiculos.update(id, {
      ...updates,
      placa: updates.placa ? updates.placa.toUpperCase() : undefined,
      dataAtualizacao: new Date().toISOString(),
    });
  },

  delete: async (id: string): Promise<void> => {
    await db.transaction('rw', db.veiculos, db.vistoriasVeiculo, async () => {
      await db.vistoriasVeiculo.where('veiculoId').equals(id).delete();
      await db.veiculos.delete(id);
    });
  },

  getByPlaca: async (placa: string): Promise<Veiculo | undefined> => {
    return db.veiculos.where('placa').equals(placa.toUpperCase()).first();
  },
};

export const vistoriaVeiculoService = {
  getAll: async (): Promise<VistoriaVeiculo[]> => {
    return db.vistoriasVeiculo.orderBy('dataCriacao').reverse().toArray();
  },

  getByVeiculoId: async (veiculoId: string): Promise<VistoriaVeiculo[]> => {
    return db.vistoriasVeiculo.where('veiculoId').equals(veiculoId).reverse().sortBy('dataCriacao');
  },

  create: async (vistoria: NovaVistoria): Promise<string> => {
    const now = new Date().toISOString();
    const novaVistoria: VistoriaVeiculo = {
      ...vistoria,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };

    await db.transaction('rw', db.vistoriasVeiculo, db.veiculos, async () => {
      await db.vistoriasVeiculo.add(novaVistoria);
      await db.veiculos.update(vistoria.veiculoId, {
        status: vistoria.status === 'aberta' ? 'em_uso' : 'disponivel',
        kmAtual: vistoria.kmRetorno ?? vistoria.kmSaida,
        dataAtualizacao: now,
      });
    });

    return novaVistoria.id;
  },

  update: async (id: string, updates: Partial<VistoriaVeiculo>): Promise<void> => {
    const atual = await db.vistoriasVeiculo.get(id);
    if (!atual) return;

    const merged = {
      ...atual,
      ...updates,
      dataAtualizacao: new Date().toISOString(),
    };

    await db.transaction('rw', db.vistoriasVeiculo, db.veiculos, async () => {
      await db.vistoriasVeiculo.update(id, merged);
      await db.veiculos.update(atual.veiculoId, {
        status: merged.status === 'aberta' ? 'em_uso' : 'disponivel',
        kmAtual: merged.kmRetorno ?? merged.kmSaida,
        dataAtualizacao: new Date().toISOString(),
      });
    });
  },

  delete: async (id: string): Promise<void> => {
    await db.vistoriasVeiculo.delete(id);
  },
};

export const itemManutencaoVeiculoService = {
  getAll: async (): Promise<ItemManutencaoVeiculo[]> => {
    return db.itensManutencaoVeiculo.orderBy('nome').toArray();
  },

  create: async (item: NovoItem): Promise<string> => {
    const now = new Date().toISOString();
    const novo: ItemManutencaoVeiculo = {
      ...item,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };
    await db.itensManutencaoVeiculo.add(novo);
    return novo.id;
  },
};

export const registroManutencaoVeiculoService = {
  getAll: async (): Promise<RegistroManutencaoVeiculo[]> => {
    return db.registrosManutencaoVeiculo.orderBy('dataCriacao').reverse().toArray();
  },

  create: async (registro: NovoRegistro): Promise<string> => {
    const now = new Date().toISOString();
    const inicio = new Date(registro.inicioEm).getTime();
    const fim = new Date(registro.fimEm).getTime();
    const duracaoHoras = Math.max(0, (fim - inicio) / (1000 * 60 * 60));

    const novo: RegistroManutencaoVeiculo = {
      ...registro,
      duracaoHoras,
      id: generateId(),
      dataCriacao: now,
      dataAtualizacao: now,
    };

    await db.registrosManutencaoVeiculo.add(novo);
    return novo.id;
  },
};
