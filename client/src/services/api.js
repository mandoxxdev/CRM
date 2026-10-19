import axios from 'axios';
import { formatarErroPermissao } from '../utils/permissaoErro';
import { chaveDoPedido, ehLeitura } from '../utils/chaveDoPedido';

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
  timeout: parseInt(process.env.REACT_APP_API_TIMEOUT_MS || '30000', 10),
});

// Interceptor para adicionar token em todas as requisições (localStorage, sessionStorage ou header global)
api.interceptors.request.use((config) => {
  // Upload de arquivos: não definir Content-Type para o navegador enviar multipart/form-data com boundary
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    if (config.headers && typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type');
    } else if (config.headers) {
      delete config.headers['Content-Type'];
    }
  }
  let token = localStorage.getItem('token') || sessionStorage.getItem('token') ||
    (typeof axios !== 'undefined' && axios.defaults && axios.defaults.headers && axios.defaults.headers.common && axios.defaults.headers.common.Authorization
      ? axios.defaults.headers.common.Authorization.replace(/^Bearer\s+/i, '')
      : null);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['X-Auth-Token'] = token;
  }
  return config;
});

// Cache para evitar múltiplas tentativas simultâneas: chave do pedido (`utils/chaveDoPedido`) -> a promessa da repetição em curso.
const retryCache = new Map();

// Etapa 156 (RN-156.01): quem espera a repeticao de outro recebe a sua copia dos dados (JSON), para nao mexer no objeto da dona.
function copiaDaResposta(response) {
  if (!response || response.data === null || typeof response.data !== 'object') return response;
  const proto = Object.getPrototypeOf(response.data);
  if (!Array.isArray(response.data) && proto !== Object.prototype && proto !== null) return response; // Blob, ArrayBuffer...
  return { ...response, data: JSON.parse(JSON.stringify(response.data)) };
}

// Interceptor para tratar erros de resposta
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Erro de rede (servidor fora do ar, ou aparelho ainda sem conexão)
    if (!error.response) {
      const ehFalhaDeRede = error.code === 'ECONNREFUSED'
        || error.message.includes('Network Error')
        || error.message.includes('Failed to fetch');

      if (ehFalhaDeRede) {
        // Diagnóstico completo continua existindo — no CONSOLE, para quem desenvolve.
        const apiUrl = getApiBaseURL();
        console.error(
          `[api] falha de rede ao chamar ${apiUrl}. Verifique se o servidor responde em `
          + `${apiUrl.replace('/api', '')}/health, se a porta 5000 está aberta e se o `
          + `aparelho tem conexão.`,
          error.message,
        );

        /*
         * O QUE MUDOU E POR QUÊ.
         *
         * Aqui havia um `alert()` com instruções de desenvolvedor — "execute npm run dev",
         * "verifique o firewall na porta 5000". Ele aparecia para QUALQUER usuário, e no
         * celular aparecia em toda abertura do aplicativo: o PWA dispara a primeira
         * chamada antes de o aparelho terminar de restabelecer a rede, essa chamada falha,
         * e o alerta bloqueava a tela. Fechar e abrir "resolvia" porque na segunda vez a
         * conexão já estava de pé.
         *
         * Duas correções:
         *  1. Nada de `alert()`. Ele é bloqueante, some sem contexto e fala com o
         *     desenvolvedor, não com quem usa.
         *  2. A PRIMEIRA falha de rede é silenciosa e o pedido é repetido uma vez, depois
         *     de um instante. É exatamente o caso do início a frio, e é o motivo de o
         *     alerta nunca ter significado nada de útil para o usuário.
         *
         * Se a repetição também falhar, aí sim houve queda de verdade — e quem avisa é a
         * tela que fez a chamada, com a mensagem dela, não esta camada.
         */
        const req = error.config || {};
        if (!req.__tentouDeNovo) {
          req.__tentouDeNovo = true;
          await new Promise((r) => setTimeout(r, 1200));
          return api(req);
        }
      }

      return Promise.reject(error);
    }

    // Erro 503 - Banco de dados não está pronto
    if (error.response?.status === 503) {
      const retryAfter = error.response.data?.retryAfter || 3;
      // Etapa 156 (RN-156.01, C369): a chave da leitura leva os filtros (`params`) — dois pedidos ao mesmo endereco com filtros
      // diferentes esperam e repetem cada um. Antes era `metodo-url` para todos, e o irmao com outro filtro era recusado na hora.
      const requestKey = chaveDoPedido(error.config);
      const emEspera = retryCache.get(requestKey);

      if (emEspera) {
        if (ehLeitura(error.config)) {
          // O MESMO pedido de leitura: espera a mesma repeticao (um pedido so ao servidor) e recebe a sua copia dos dados.
          console.log('⏳ Aguardando banco de dados ficar pronto...');
          return emEspera.then(copiaDaResposta);
        }
        // Gravacao (B1001): como antes — o irmao ao mesmo endereco e recusado na hora (nao se arrisca gravar duas vezes).
        console.log('⏳ Aguardando banco de dados ficar pronto...');
        return Promise.reject(error);
      }

      console.log(`⏳ Banco de dados ainda não está pronto. Tentando novamente em ${retryAfter} segundos...`);

      const repeticao = (async () => {
        // Aguardar e tentar novamente
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        // A chave sai ANTES de repetir: o 503 da propria repeticao abre uma espera nova, nunca cai nesta (que esperaria a si mesma).
        if (retryCache.get(requestKey) === repeticao) retryCache.delete(requestKey);

        // Tentar novamente (máximo 3 tentativas)
        const retryCount = error.config.__retryCount || 0;
        if (retryCount < 3) {
          error.config.__retryCount = retryCount + 1;
          console.log(`🔄 Tentativa ${retryCount + 1} de 3...`);
          return api.request(error.config);
        }
        console.error('❌ Banco de dados não ficou pronto após 3 tentativas');
        throw new Error('Banco de dados não está disponível. Tente recarregar a página.');
      })();
      retryCache.set(requestKey, repeticao);
      return repeticao;
    }

    // 401 = não autenticado (token inválido/expirado) -> volta para a tela de login
    if (error.response?.status === 401) {
      // Etapa 131 (RN-09, Fase 2 I2): o 401 do PROPRIO login (senha errada, usuario desativado tentando entrar) nao e sessao que
      // caiu: nao limpa nada nem recarrega — o formulario mostra a frase do servidor. Antes, "Email ou senha inválidos" casava a
      // regua abaixo e a pagina recarregava com "Sessão expirada", apagando a mensagem.
      if (/\/auth\/login\/?$/.test(String(error.config?.url || ''))) {
        return Promise.reject(error);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      // Etapa 131 (B842): o usuario desativado ou removido com o token ainda valido — aviso proprio (nao expirou).
      if (error.response?.data?.code === 'USUARIO_INATIVO') {
        window.location.href = '/login?sessao_encerrada=1';
        return Promise.reject(error);
      }
      const msg = error.response?.data?.error || '';
      const sessaoExpirada = /expirado|inválido|não fornecido/i.test(msg);
      window.location.href = sessaoExpirada ? '/login?sessao_expirada=1' : '/login';
      return Promise.reject(error);
    }
    // 403 com mensagem de token = token expirado (fallback se o servidor enviar 403 nesse caso)
    if (error.response?.status === 403) {
      const msg = (error.response?.data?.error || '').toString();
      if (/token inválido ou expirado/i.test(msg)) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        sessionStorage.removeItem('token');
        window.location.href = '/login?sessao_expirada=1';
        return Promise.reject(error);
      }
      // 403 de PERFIL (almoxarifado/frota/produção mandam { error, acao, perfil }): troca a
      // mensagem genérica por uma que diz o que faltou e com que perfil o usuário entrou.
      // Reescrevemos `data.error` de propósito: as telas já fazem
      // `toast.error(err.response?.data?.error || ...)`, então todas ganham a mensagem boa
      // sem precisar de alteração. Nada no client compara essa string (verificado).
      const detalhado = formatarErroPermissao(error.response?.data);
      if (detalhado) {
        error.response.data.error = detalhado;
      }
      return Promise.reject(error);
    }
    return Promise.reject(error);
  }
);

export default api;

