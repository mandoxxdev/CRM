import type { Cliente, Contato, Oportunidade, Atividade } from '../types';

const STORAGE_KEYS = {
  clientes: 'crm_clientes',
  contatos: 'crm_contatos',
  oportunidades: 'crm_oportunidades',
  atividades: 'crm_atividades',
} as const;

export const storage = {
  clientes: {
    getAll: (): Cliente[] => {
      const data = localStorage.getItem(STORAGE_KEYS.clientes);
      return data ? JSON.parse(data) : [];
    },
    save: (clientes: Cliente[]): void => {
      localStorage.setItem(STORAGE_KEYS.clientes, JSON.stringify(clientes));
    },
    add: (cliente: Cliente): void => {
      const clientes = storage.clientes.getAll();
      clientes.push(cliente);
      storage.clientes.save(clientes);
    },
    update: (id: string, updates: Partial<Cliente>): void => {
      const clientes = storage.clientes.getAll();
      const index = clientes.findIndex(c => c.id === id);
      if (index !== -1) {
        clientes[index] = { ...clientes[index], ...updates, dataAtualizacao: new Date().toISOString() };
        storage.clientes.save(clientes);
      }
    },
    delete: (id: string): void => {
      const clientes = storage.clientes.getAll();
      storage.clientes.save(clientes.filter(c => c.id !== id));
    },
    getById: (id: string): Cliente | undefined => {
      return storage.clientes.getAll().find(c => c.id === id);
    },
  },
  contatos: {
    getAll: (): Contato[] => {
      const data = localStorage.getItem(STORAGE_KEYS.contatos);
      return data ? JSON.parse(data) : [];
    },
    save: (contatos: Contato[]): void => {
      localStorage.setItem(STORAGE_KEYS.contatos, JSON.stringify(contatos));
    },
    add: (contato: Contato): void => {
      const contatos = storage.contatos.getAll();
      contatos.push(contato);
      storage.contatos.save(contatos);
    },
    update: (id: string, updates: Partial<Contato>): void => {
      const contatos = storage.contatos.getAll();
      const index = contatos.findIndex(c => c.id === id);
      if (index !== -1) {
        contatos[index] = { ...contatos[index], ...updates };
        storage.contatos.save(contatos);
      }
    },
    delete: (id: string): void => {
      const contatos = storage.contatos.getAll();
      storage.contatos.save(contatos.filter(c => c.id !== id));
    },
    getByClienteId: (clienteId: string): Contato[] => {
      return storage.contatos.getAll().filter(c => c.clienteId === clienteId);
    },
  },
  oportunidades: {
    getAll: (): Oportunidade[] => {
      const data = localStorage.getItem(STORAGE_KEYS.oportunidades);
      return data ? JSON.parse(data) : [];
    },
    save: (oportunidades: Oportunidade[]): void => {
      localStorage.setItem(STORAGE_KEYS.oportunidades, JSON.stringify(oportunidades));
    },
    add: (oportunidade: Oportunidade): void => {
      const oportunidades = storage.oportunidades.getAll();
      oportunidades.push(oportunidade);
      storage.oportunidades.save(oportunidades);
    },
    update: (id: string, updates: Partial<Oportunidade>): void => {
      const oportunidades = storage.oportunidades.getAll();
      const index = oportunidades.findIndex(o => o.id === id);
      if (index !== -1) {
        oportunidades[index] = { ...oportunidades[index], ...updates, dataAtualizacao: new Date().toISOString() };
        storage.oportunidades.save(oportunidades);
      }
    },
    delete: (id: string): void => {
      const oportunidades = storage.oportunidades.getAll();
      storage.oportunidades.save(oportunidades.filter(o => o.id !== id));
    },
    getByClienteId: (clienteId: string): Oportunidade[] => {
      return storage.oportunidades.getAll().filter(o => o.clienteId === clienteId);
    },
  },
  atividades: {
    getAll: (): Atividade[] => {
      const data = localStorage.getItem(STORAGE_KEYS.atividades);
      return data ? JSON.parse(data) : [];
    },
    save: (atividades: Atividade[]): void => {
      localStorage.setItem(STORAGE_KEYS.atividades, JSON.stringify(atividades));
    },
    add: (atividade: Atividade): void => {
      const atividades = storage.atividades.getAll();
      atividades.push(atividade);
      storage.atividades.save(atividades);
    },
    update: (id: string, updates: Partial<Atividade>): void => {
      const atividades = storage.atividades.getAll();
      const index = atividades.findIndex(a => a.id === id);
      if (index !== -1) {
        atividades[index] = { ...atividades[index], ...updates };
        storage.atividades.save(atividades);
      }
    },
    delete: (id: string): void => {
      const atividades = storage.atividades.getAll();
      storage.atividades.save(atividades.filter(a => a.id !== id));
    },
    getByClienteId: (clienteId: string): Atividade[] => {
      return storage.atividades.getAll().filter(a => a.clienteId === clienteId);
    },
    getPendentes: (): Atividade[] => {
      return storage.atividades.getAll().filter(a => !a.concluida);
    },
  },
};


