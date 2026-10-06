/**
 * Proxy de CEP (Etapa 34, RN-34.04) — GET /api/cep/:cep → ViaCEP.
 *
 * Existe pelo mesmo motivo do proxy de CNPJ (`/api/cnpj/:cnpj`, index.js): o browser não
 * chama a ViaCEP direto (CORS, e a chave de quem consulta fica no servidor). Só a ViaCEP
 * precisa de normalização: `localidade` → cidade, `uf` → estado. Resposta congelada no
 * design (seção 4): `{cep, logradouro, bairro, cidade, estado}`.
 *
 * Montável — `registrar(app, authenticateToken, { fetchImpl, timeoutMs })` — para o teste
 * injetar o `fetch` (fronteira HTTP) e um timeout curto. Produção usa o `fetch` global e 8s,
 * os mesmos do proxy de CNPJ.
 *
 * Erros (literais do contrato): 400 'CEP deve ter 8 dígitos', 404 'CEP não encontrado',
 * 502 'Serviço de CEP indisponível' (rejeição, HTTP não-ok ou timeout).
 */

const TIMEOUT_PADRAO_MS = 8000;

function comTimeout(promessa, ms) {
  let timer;
  const estouro = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timeout')), ms);
  });
  return Promise.race([promessa, estouro]).finally(() => clearTimeout(timer));
}

module.exports = function registrar(app, authenticateToken, opcoes = {}) {
  const fetchImpl = opcoes.fetchImpl || ((...args) => fetch(...args));
  const timeoutMs = opcoes.timeoutMs || TIMEOUT_PADRAO_MS;

  app.get('/api/cep/:cep', authenticateToken, async (req, res) => {
    const digitos = String(req.params.cep || '').replace(/\D/g, '');
    if (digitos.length !== 8) {
      return res.status(400).json({ error: 'CEP deve ter 8 dígitos' });
    }

    let dados;
    try {
      const resposta = await comTimeout(
        fetchImpl(`https://viacep.com.br/ws/${digitos}/json/`, {
          method: 'GET',
          headers: { Accept: 'application/json', 'User-Agent': 'CRM-GMP/1.0' },
        }),
        timeoutMs
      );
      if (!resposta || !resposta.ok) throw new Error(`HTTP ${resposta && resposta.status}`);
      dados = await resposta.json();
    } catch (err) {
      console.log('ViaCEP indisponível:', err.message);
      return res.status(502).json({ error: 'Serviço de CEP indisponível' });
    }

    // A ViaCEP responde `{"erro": "true"}` (string) para CEP inexistente; aceita-se também o
    // booleano para não depender de um detalhe que ela pode mudar.
    if (!dados || dados.erro === true || dados.erro === 'true') {
      return res.status(404).json({ error: 'CEP não encontrado' });
    }

    res.json({
      cep: dados.cep || `${digitos.slice(0, 5)}-${digitos.slice(5)}`,
      logradouro: dados.logradouro || '',
      bairro: dados.bairro || '',
      cidade: dados.localidade || '',
      estado: dados.uf || '',
    });
  });
};
