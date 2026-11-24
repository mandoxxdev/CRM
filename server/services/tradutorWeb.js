/**
 * Tradutor da proposta bilíngue que roda NO SERVIDOR — funciona em qualquer navegador (specs/proposta-bilingue/README.md, RN-BI.05).
 *
 * Pedido de 24/11/2026: "erro na tradução, deve funcionar em qualquer navegador". O tradutor do Chrome (Translator API) só existe no
 * Chrome 138+ de desktop e pede um clique na 1ª vez; no Edge, Firefox, Chrome antigo ou celular a tradução não rodava.
 *
 * Usa o endereço público e GRATUITO do Google Tradutor (`translate_a/t?client=gtx`, sem chave e sem conta — o mesmo das extensões de
 * navegador), em lote: vários textos por pedido. Quem chama manda o texto JÁ PROTEGIDO (marcadores {{…}} e termos do glossário viram
 * fichas ⟦n⟧ no cliente, em traducaoChrome.js) — testado em 24/11/2026: as fichas voltam intactas em inglês e espanhol.
 *
 * Descartado: modelo local (OPUS-MT/NLLB) no servidor — ~1 GB de memória e não roda no Alpine da produção (spike de 24/11/2026);
 * serviço pago — fora do "sem gastar nada". Consequência aceita (reversível: `TRADUTOR_WEB_URL` aponta para outro serviço com o
 * mesmo formato, ex. um proxy próprio): o texto das cláusulas sai do servidor para o Google. Os dados do cliente não vão — a chave da
 * memória é o texto ANTES da troca dos marcadores {{cliente.nome}}.
 */
const URL_PADRAO = 'https://translate.googleapis.com/translate_a/t';
const MAX_CARACTERES_POR_PEDIDO = 4500; // um texto maior que isso vai sozinho (cabe até 5.000, o limite da memória)
const MAX_TEXTOS_POR_PEDIDO = 40;

class ErroTradutorWeb extends Error {}

/** Agrupa os índices em pedidos de até MAX_TEXTOS e MAX_CARACTERES (somados). */
function agruparEmPedidos(textos) {
  const grupos = [];
  let atual = []; let tamanho = 0;
  textos.forEach((t, i) => {
    const n = String(t).length;
    if (atual.length && (atual.length >= MAX_TEXTOS_POR_PEDIDO || tamanho + n > MAX_CARACTERES_POR_PEDIDO)) {
      grupos.push(atual); atual = []; tamanho = 0;
    }
    atual.push(i); tamanho += n;
  });
  if (atual.length) grupos.push(atual);
  return grupos;
}

/** A resposta é um array: de textos (com `sl` fixo) ou de [texto, língua] (com sl=auto). Um texto só pode vir como string solta. */
function lerResposta(corpo, esperados) {
  let dados = corpo;
  if (typeof dados === 'string') dados = [dados];
  if (!Array.isArray(dados) || dados.length !== esperados) throw new ErroTradutorWeb('resposta fora do formato');
  return dados.map((d) => (Array.isArray(d) ? d[0] : d)).map((d) => (typeof d === 'string' ? d : null));
}

/** O tradutor às vezes devolve a 1ª letra minúscula ("Prazo de entrega" -> "tiempo de entrega"): mantém a caixa do original. */
function manterInicialMaiuscula(original, traduzido) {
  if (typeof traduzido !== 'string' || !traduzido) return traduzido;
  const a = String(original).trimStart()[0];
  const b = traduzido.trimStart()[0];
  if (a && b && a !== a.toLowerCase() && b === b.toLowerCase() && b !== b.toUpperCase()) {
    const i = traduzido.indexOf(b);
    return traduzido.slice(0, i) + b.toUpperCase() + traduzido.slice(i + 1);
  }
  return traduzido;
}

/**
 * Traduz `textos` (português) para `idioma` ('en' | 'es'). Devolve um array do mesmo tamanho, com null onde não veio tradução.
 * Falha de rede, tempo esgotado ou resposta fora do formato = ErroTradutorWeb (a rota responde 502; os textos seguem pendentes).
 */
async function traduzirLote(textos, idioma, { fetchImpl = globalThis.fetch, url = process.env.TRADUTOR_WEB_URL || URL_PADRAO, tetoMs = 20000 } = {}) {
  const saida = new Array(textos.length).fill(null);
  for (const grupo of agruparEmPedidos(textos)) {
    const corpo = new URLSearchParams();
    grupo.forEach((i) => corpo.append('q', textos[i]));
    const endereco = `${url}?client=gtx&sl=pt&tl=${encodeURIComponent(idioma)}&format=text`;
    let resposta;
    try {
      // eslint-disable-next-line no-await-in-loop
      const r = await fetchImpl(endereco, { method: 'POST', body: corpo, signal: AbortSignal.timeout(tetoMs) });
      if (!r.ok) throw new ErroTradutorWeb(`HTTP ${r.status}`);
      // eslint-disable-next-line no-await-in-loop
      resposta = lerResposta(await r.json(), grupo.length);
    } catch (e) {
      throw e instanceof ErroTradutorWeb ? e : new ErroTradutorWeb(e && e.message ? e.message : 'falha de rede');
    }
    grupo.forEach((i, k) => { saida[i] = manterInicialMaiuscula(textos[i], resposta[k]); });
  }
  return saida;
}

module.exports = { traduzirLote, agruparEmPedidos, manterInicialMaiuscula, ErroTradutorWeb, MAX_TEXTOS_POR_PEDIDO, MAX_CARACTERES_POR_PEDIDO };
