import api from '../services/api';

/**
 * Resolve a URL de um arquivo de upload do almoxarifado para `<img src>` / `<a href>`.
 *
 * ⚠️ ELE NÃO MONTA MAIS ENDEREÇO A PARTIR DE NOME DE ARQUIVO — e essa é a mudança da Etapa 33.
 *
 * Até aqui, receber `material-123.png` fazia este helper devolver
 * `/api/uploads/almoxarifado/material-123.png`. Aquilo funcionava porque o diretório era servido
 * publicamente; desde a Etapa 33 ele exige **assinatura** (`?exp=&sig=`), e só o servidor a emite.
 * Uma URL remontada aqui não teria assinatura e responderia 404 — imagem quebrada, sem erro,
 * sem log, sem ninguém saber por quê.
 *
 * Por isso o helper agora devolve **`''`** para tudo que não seja uma URL vinda do servidor. Isso
 * troca um defeito silencioso (endereço fabricado que dá 404) por uma ausência explícita, que os
 * testes conseguem ancorar: se algum ponto do client ainda estiver passando um nome cru, o `''`
 * aparece e o cenário reprova, em vez de o defeito viajar até a tela do usuário.
 *
 * **Se você chegou aqui porque uma imagem sumiu:** o problema não é este arquivo. É o endpoint que
 * está devolvendo o nome do arquivo em vez da URL — ele precisa passar por `enrichMaterialRow`
 * (ou `materialPhotoUrl`) no servidor. Foi exatamente isso que aconteceu com
 * `requisicoesMaterial.js`, que devolvia `itens[].foto` cru.
 *
 * O que ele CONTINUA fazendo: preservar a query string intacta, e prefixar a origem quando
 * `REACT_APP_API_URL` aponta para outro host (sem isso a URL resolveria contra a origem do client,
 * não da API).
 */
const PREFIXO_API = '/api/uploads/almoxarifado/';

export function resolveMaterialPhotoUrl(urlDoServidor) {
  if (!urlDoServidor) return '';
  const raw = String(urlDoServidor).trim();
  if (!raw) return '';
  // Blob e data URL vêm do próprio browser (preview de upload antes de enviar) — passam direto.
  if (/^(https?|blob|data):/i.test(raw)) return raw;

  // Só URL que o SERVIDOR minou. Nome cru, caminho legado e qualquer outra coisa viram ''.
  if (!raw.startsWith(PREFIXO_API)) return '';

  const apiBase = api.defaults?.baseURL || '/api';
  if (typeof apiBase === 'string' && apiBase.startsWith('http')) {
    const origin = apiBase.replace(/\/api\/?$/, '');
    return `${origin}${raw}`;
  }

  return raw;
}
