import axios from 'axios';

// Função para detectar automaticamente a URL da API
function getApiBaseURL() {
  // Se tiver variável de ambiente, usar ela (para produção)
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // Em produção: URL absoluta do mesmo host para evitar 404 com proxies (Coolify, etc.)
  if (process.env.NODE_ENV === 'production') {
    const origin = typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : '';
    return origin ? `${origin}/api` : '/api';
  }
  
  // Detectar se está sendo acessado por IP ou localhost (desenvolvimento)
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  
  // Se estiver acessando por IP (não é localhost), usar o mesmo IP para a API
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '') {
    // Usar o mesmo hostname (IP) e porta 5000 para a API
    const apiUrl = `${protocol}//${hostname}:5000/api`;
    console.log('🔗 Detectado acesso por IP. API URL:', apiUrl);
    return apiUrl;
  }
  
  // Se for localhost, tentar usar proxy do webpack primeiro
  // O proxy do package.json redireciona /api/* para http://localhost:5000/api/*
  // Mas se falhar, usar localhost:5000 diretamente
  const apiUrl = '/api';
  console.log('🔗 Usando proxy do webpack. API URL:', apiUrl);
  return apiUrl;
}

const api = axios.create({
  baseURL: getApiBaseURL(),
});

// Interceptor para adicionar token em todas as requisições (localStorage, sessionStorage ou header global)
api.interceptors.request.use((config) => {
  let token = localStorage.getItem('token') || sessionStorage.getItem('token') ||
    (typeof axios !== 'undefined' && axios.defaults && axios.defaults.headers && axios.defaults.headers.common && axios.defaults.headers.common.Authorization
      ? axios.defaults.headers.common.Authorization.replace(/^Bearer\s+/i, '')
      : null);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['X-Auth-Token'] = token;
  }
  return config;
});

// Cache para evitar múltiplas tentativas simultâneas
const retryCache = new Map();

// Interceptor para tratar erros de resposta
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Erro de rede (servidor não está rodando ou não acessível)
    if (!error.response) {
      console.error('Erro de rede:', error.message);
      if (error.code === 'ECONNREFUSED' || error.message.includes('Network Error') || error.message.includes('Failed to fetch')) {
        const apiUrl = getApiBaseURL();
        const healthUrl = apiUrl.replace('/api', '') + '/health';
        const errorMsg = `Erro de conexão: O servidor não está rodando ou não está acessível.\n\n` +
          `URL tentada: ${apiUrl}\n\n` +
          `Verifique:\n` +
          `1. Se o servidor está rodando na porta 5000\n` +
          `2. Execute: npm run dev (no diretório server/)\n` +
          `3. Se estiver acessando de outro PC, verifique:\n` +
          `   - O IP do servidor está correto?\n` +
          `   - O firewall permite conexões na porta 5000?\n` +
          `   - Ambos os PCs estão na mesma rede?\n` +
          `4. Teste acessar: ${healthUrl} no navegador\n` +
          `   Se funcionar no navegador, o problema é no frontend\n` +
          `   Se não funcionar, o problema é no servidor/firewall\n\n` +
          `5. No servidor, verifique se está rodando: npm run dev (na pasta server/)\n\n` +
          `Se o problema persistir, verifique os logs do servidor.`;
        alert(errorMsg);
      }
      return Promise.reject(error);
    }

    // Erro 503 - Banco de dados não está pronto
    if (error.response?.status === 503) {
      const retryAfter = error.response.data?.retryAfter || 3;
      const requestKey = `${error.config.method}-${error.config.url}`;
      
      // Evitar múltiplas tentativas simultâneas para a mesma requisição
      if (retryCache.has(requestKey)) {
        console.log('⏳ Aguardando banco de dados ficar pronto...');
        return Promise.reject(error);
      }
      
      retryCache.set(requestKey, true);
      
      console.log(`⏳ Banco de dados ainda não está pronto. Tentando novamente em ${retryAfter} segundos...`);
      
      // Aguardar e tentar novamente
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      
      retryCache.delete(requestKey);
      
      // Tentar novamente (máximo 3 tentativas)
      const retryCount = error.config.__retryCount || 0;
      if (retryCount < 3) {
        error.config.__retryCount = retryCount + 1;
        console.log(`🔄 Tentativa ${retryCount + 1} de 3...`);
        return api.request(error.config);
      } else {
        console.error('❌ Banco de dados não ficou pronto após 3 tentativas');
        return Promise.reject(new Error('Banco de dados não está disponível. Tente recarregar a página.'));
      }
    }

    if (error.response?.status === 401 || error.response?.status === 403) {
      // Token inválido ou expirado
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

