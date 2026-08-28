/**
 * Diff de configuração do almoxarifado (Etapa 19, C1).
 *
 * POR QUE ESTA FUNCAO EXISTE. `PUT /configuracoes` manda as 18 chaves da tela a CADA clique em
 * Salvar, mudadas ou nao (o front monta o payload com `CAMPOS.forEach`). Auditar por chave daria
 * 18 linhas por save, quase todas "de X para X" — ruido que enterra o sinal. A RN-04 exige UMA
 * linha por PUT, contendo SO o que mudou; PUT sem mudanca efetiva nao gera linha nenhuma.
 *
 * DOMINIO DE ITERACAO: `Object.keys(novos)`, NUNCA a uniao. Na rota `PUT /configuracoes` o
 * `anteriores` vem de um SELECT SEM WHERE — a tabela INTEIRA, ~45 chaves — e o payload tem 18.
 * Iterar a uniao reportaria ~27 chaves "removidas" em TODO save: exatamente o ruido que a RN-04
 * existe para matar. Chave presente em `anteriores` e ausente em `novos` e IGNORADA de proposito
 * (as tres rotas chamadoras so escrevem o que recebem — nenhuma delas apaga chave).
 *
 * COMPARACAO por `String()` nos DOIS lados, que ja chegam na forma PERSISTIDA. A coluna
 * `configuracoes_almoxarifado.valor` e TEXT: comparar contra o valor cru do body faria `30`
 * (numero) parecer diferente de `'30'` (coluna) em todo save. O unico produtor de valores
 * TIPADOS e a rota de liberacao por valor, e para ela `String()` sozinho seria ERRADO
 * (`String([])` === `''` contra `'[]'` na coluna; `String(false)` === `'false'` contra `'0'`)
 * — por isso aquela rota normaliza ANTES de chamar aqui, em vez de esta funcao adivinhar tipo.
 *
 * O QUE A NORMALIZACAO **NAO** RESOLVE (correcao de comentario errado, achado A5 da revisao
 * adversarial): reordenar a mesma lista de aprovadores CONTINUA virando linha de log —
 * `JSON.stringify([2,1])` !== `JSON.stringify([1,2])` dos dois lados. O comportamento e honesto
 * (a coluna mudou mesmo), mas a versao anterior deste cabecalho listava a reordenacao entre os
 * problemas que a normalizacao resolvia, e nao resolve.
 */

// Mascaramento SEMPRE ligado, nao um 3o argumento opcional (achado A8 da revisao do plano):
// `alertas_smtp_pass` e chave SEMEADA, entao passa na guarda de chaves conhecidas da rota
// generica `PUT /configuracoes` e pode ser gravada por ela tambem. Mascaramento opt-in
// deixaria a RN-05 com um buraco que o teste — que exercita a rota de alertas — nao pegaria.
const CHAVES_SECRETAS = ['alertas_smtp_pass', 'alertas_whatsapp_api_key'];

// Chaves cujo VALOR pode carregar credencial embutida sem ser um segredo inteiro (achado A1 da
// lente de exposicao, reproduzido): a URL do webhook de WhatsApp costuma levar o token na query
// string — a propria semente do banco descreve `alertas_whatsapp_api_key` como token "opcional",
// ou seja, o desenho ja preve a montagem em que o token vive DENTRO da URL e a chave separada
// fica vazia. Mascarar a chave inteira mataria a utilidade do log (para QUAL webhook apontava?);
// mascarar so a query string mantem o host e mata a credencial. Isto importa porque a coluna
// guarda so o valor ATUAL — rotacionou, o token velho some — enquanto o log e PERMANENTE.
const CHAVES_URL_COM_CREDENCIAL = ['alertas_whatsapp_webhook_url'];

const MASCARA = '(alterado)';
const MASCARA_QUERY = '(credenciais omitidas)';

// Mantem esquema://host/caminho e troca a query string inteira pela mascara. Valor que nao
// parseia como URL vira mascara cheia — nao adivinhar e mais seguro que vazar.
function mascararUrl(valor) {
  if (valor === undefined || valor === null || valor === '') return valor;
  try {
    const u = new URL(String(valor));
    return u.search ? `${u.origin}${u.pathname}?${MASCARA_QUERY}` : `${u.origin}${u.pathname}`;
  } catch (e) {
    return MASCARA;
  }
}

function calcularDiff(anteriores, novos) {
  const antes = anteriores || {};
  const depois = novos || {};
  const diffAnteriores = {};
  const diffNovos = {};

  for (const chave of Object.keys(depois)) {
    const novo = depois[chave];
    const bruto = Object.prototype.hasOwnProperty.call(antes, chave) ? antes[chave] : undefined;
    const existia = bruto !== undefined && bruto !== null;

    if (existia) {
      if (String(bruto) === String(novo)) continue;
    } else if (novo === undefined || novo === null) {
      // Ausente antes e ausente agora nao e mudanca — evitar um par null/null no log.
      continue;
    }

    if (CHAVES_SECRETAS.includes(chave)) {
      // Nunca o valor, nem o anterior: quem le o log precisa saber QUE a senha mudou e QUEM
      // mudou; o valor em si num log de auditoria seria pior que a ausencia de log (RN-05).
      diffAnteriores[chave] = existia ? MASCARA : null;
      diffNovos[chave] = MASCARA;
    } else if (CHAVES_URL_COM_CREDENCIAL.includes(chave)) {
      diffAnteriores[chave] = existia ? mascararUrl(bruto) : null;
      diffNovos[chave] = mascararUrl(novo);
    } else {
      diffAnteriores[chave] = existia ? bruto : null;
      diffNovos[chave] = novo;
    }
  }

  return { anteriores: diffAnteriores, novos: diffNovos };
}

module.exports = { calcularDiff, CHAVES_SECRETAS, CHAVES_URL_COM_CREDENCIAL, MASCARA, MASCARA_QUERY, mascararUrl };
