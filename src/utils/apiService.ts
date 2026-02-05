/**
 * Serviço de API para comunicação com o backend
 */

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// Obter token do localStorage
const getToken = (): string | null => {
  const usuario = localStorage.getItem('usuario_autenticado');
  if (usuario) {
    try {
      const userData = JSON.parse(usuario);
      return userData.token || null;
    } catch {
      return null;
    }
  }
  return null;
};

// Função genérica para requisições
const request = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const token = getToken();
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ erro: 'Erro na requisição' }));
    throw new Error(error.erro || `Erro ${response.status}`);
  }

  return response.json();
};

// ============ AUTENTICAÇÃO ============
export const apiAuth = {
  login: async (email: string, senha: string) => {
    return request<{ token: string; usuario: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    });
  },
};

// ============ VENDAS ============
export const apiVendas = {
  getAll: async (filtros?: { todos?: boolean; meus?: boolean; usuarioId?: string }) => {
    const params = new URLSearchParams();
    if (filtros?.todos) params.append('todos', 'true');
    if (filtros?.meus) params.append('meus', 'true');
    if (filtros?.usuarioId) params.append('usuarioId', filtros.usuarioId);
    
    const query = params.toString();
    return request<any[]>(`/vendas${query ? `?${query}` : ''}`);
  },

  getById: async (id: string) => {
    return request<any>(`/vendas/${id}`);
  },

  create: async (venda: any) => {
    return request<any>('/vendas', {
      method: 'POST',
      body: JSON.stringify(venda),
    });
  },

  update: async (id: string, updates: any) => {
    return request<any>(`/vendas/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return request<void>(`/vendas/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============ CLIENTES ============
export const apiClientes = {
  getAll: async (todos?: boolean) => {
    const query = todos ? '?todos=true' : '';
    return request<any[]>(`/clientes${query}`);
  },

  getById: async (id: string) => {
    return request<any>(`/clientes/${id}`);
  },

  create: async (cliente: any) => {
    return request<any>('/clientes', {
      method: 'POST',
      body: JSON.stringify(cliente),
    });
  },

  update: async (id: string, updates: any) => {
    return request<any>(`/clientes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return request<void>(`/clientes/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============ PRODUTOS ============
export const apiProdutos = {
  getAll: async (ativo?: boolean) => {
    const query = ativo ? '?ativo=true' : '';
    return request<any[]>(`/produtos${query}`);
  },

  getById: async (id: string) => {
    return request<any>(`/produtos/${id}`);
  },

  create: async (produto: any) => {
    return request<any>('/produtos', {
      method: 'POST',
      body: JSON.stringify(produto),
    });
  },

  update: async (id: string, updates: any) => {
    return request<any>(`/produtos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  delete: async (id: string) => {
    return request<void>(`/produtos/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============ OPORTUNIDADES ============
export const apiOportunidades = {
  getAll: async (filtros?: { todos?: boolean; clienteId?: string }) => {
    const params = new URLSearchParams();
    if (filtros?.todos) params.append('todos', 'true');
    if (filtros?.clienteId) params.append('clienteId', filtros.clienteId);
    
    const query = params.toString();
    return request<any[]>(`/oportunidades${query ? `?${query}` : ''}`);
  },

  create: async (oportunidade: any) => {
    return request<any>('/oportunidades', {
      method: 'POST',
      body: JSON.stringify(oportunidade),
    });
  },
};

// ============ ATIVIDADES ============
export const apiAtividades = {
  getAll: async (filtros?: { pendentes?: boolean; clienteId?: string }) => {
    const params = new URLSearchParams();
    if (filtros?.pendentes) params.append('pendentes', 'true');
    if (filtros?.clienteId) params.append('clienteId', filtros.clienteId);
    
    const query = params.toString();
    return request<any[]>(`/atividades${query ? `?${query}` : ''}`);
  },

  create: async (atividade: any) => {
    return request<any>('/atividades', {
      method: 'POST',
      body: JSON.stringify(atividade),
    });
  },
};

