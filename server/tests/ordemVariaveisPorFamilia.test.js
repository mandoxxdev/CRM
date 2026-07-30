/**
 * ORDEM das variaveis por familia.
 *
 * Pedido (30/07/2026): "tenho que ter um campo que eu defino as ordens que apareceram POR
 * FAMILIA e isso ficara salvo para os proximos cadastros".
 *
 * Descoberta ao investigar: o mecanismo JA existia. O gerador itera o array salvo em
 * variaveis_proposta_por_familia[familia] na ordem em que ele esta
 * (propostaPremiumV2 -> variaveisList.map). O que faltava era a TELA deixar definir essa
 * ordem: ate agora ela so acrescentava no fim a cada clique, e por isso a ordem do
 * documento era "a sequencia em que o usuario clicou".
 *
 * Este teste protege as duas pontas:
 *   1. a semantica do reordenador da tela (subir/descer/topo/fim, com limites);
 *   2. que a ordem sobrevive ao caminho inteiro ate o documento, INCLUSIVE na forma que
 *      vem do banco (string JSON) e depois da mesclagem entre linhas de template.
 *
 * Executar: node tests/ordemVariaveisPorFamilia.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

// ---------------------------------------------------------------------------
// 1) Reordenador da tela (mesma expressao de ConfigTemplateProposta.moverVariavel)
// ---------------------------------------------------------------------------
function mover(lista, de, para) {
  const atual = lista.slice();
  if (de < 0 || de >= atual.length) return atual;
  const destino = Math.max(0, Math.min(atual.length - 1, para));
  if (destino === de) return atual;
  const [item] = atual.splice(de, 1);
  atual.splice(destino, 0, item);
  return atual;
}

console.log('\n[reordenador] setas, posicao digitada e limites');
const L = ['a', 'b', 'c', 'd'];
t('descer um passo', () => assert.deepStrictEqual(mover(L, 0, 1), ['b', 'a', 'c', 'd']));
t('subir um passo', () => assert.deepStrictEqual(mover(L, 2, 1), ['a', 'c', 'b', 'd']));
t('do fim para o topo (digitar 1)', () => assert.deepStrictEqual(mover(L, 3, 0), ['d', 'a', 'b', 'c']));
t('do topo para o fim', () => assert.deepStrictEqual(mover(L, 0, 3), ['b', 'c', 'd', 'a']));
t('mesma posicao nao muda nada', () => assert.deepStrictEqual(mover(L, 2, 2), L));

// Limites: a caixa de posicao aceita digitacao livre, entao numero fora da faixa tem de
// ser aparado em vez de furar o array (item sumindo ou virando undefined).
t('posicao 0 ou negativa vira o topo', () => assert.deepStrictEqual(mover(L, 2, -5), ['c', 'a', 'b', 'd']));
t('posicao alem do fim vira o fim', () => assert.deepStrictEqual(mover(L, 0, 99), ['b', 'c', 'd', 'a']));
t('indice de origem invalido nao altera a lista', () => assert.deepStrictEqual(mover(L, 9, 0), L));
t('nenhum item se perde no caminho', () => {
  [[0, 3], [3, 0], [1, 2], [2, -1], [0, 99]].forEach(([de, para]) => {
    const r = mover(L, de, para);
    assert.strictEqual(r.length, L.length, `tamanho mudou em ${de}->${para}`);
    assert.deepStrictEqual(r.slice().sort(), L.slice().sort(), `item perdido em ${de}->${para}`);
    assert(r.every((x) => x !== undefined), `undefined no array em ${de}->${para}`);
  });
});

// ---------------------------------------------------------------------------
// 2) A ordem chega ao documento
// ---------------------------------------------------------------------------
const LABELS = {
  vazao: { nome: 'VAZAO ESTIMADA' },
  motor: { nome: 'MOTOR CENTRAL' },
  potencia: { nome: 'POTENCIA TOTAL' },
};
const ESPERADOS = { vazao: 'VAZAO ESTIMADA', motor: 'MOTOR CENTRAL', potencia: 'POTENCIA TOTAL' };

// porFamilia entra como objeto OU como string JSON (a forma que vem do banco).
function ordemNoDocumento(porFamilia) {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: '076-01-MH-2026', titulo: 'T', razao_social: 'X' },
    [{
      produto_nome: 'MOINHO', descricao: 'MOINHO', quantidade: 1, unidade: 'UN',
      valor_unitario: 1, valor_total: 1, familia_produto: 'MOINHO DE LABORATORIO (MLY)',
      especificacoes_tecnicas: JSON.stringify({ vazao: '2L ate 25L l/h', motor: '2.2 kW', potencia: '2.2 kW' }),
    }],
    { total: 1, dataEmissao: '30/07/2026' },
    { variaveis_proposta_por_familia: porFamilia, variaveis_proposta_labels: LABELS },
    null, false, true
  );
  // O rotulo sai em caixa de frase (semCapsLock), por isso a comparacao ignora caixa.
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').toUpperCase();
  return Object.entries(ESPERADOS)
    .map(([chave, rotulo]) => ({ chave, i: texto.indexOf(rotulo) }))
    .filter((x) => x.i >= 0)
    .sort((x, y) => x.i - y.i)
    .map((x) => x.chave);
}

const FAM = 'MOINHO DE LABORATORIO (MLY)';

console.log('\n[documento] a ordem do array e a ordem impressa');
[
  ['vazao', 'motor', 'potencia'],
  ['potencia', 'vazao', 'motor'],
  ['motor', 'potencia', 'vazao'],
].forEach((ordem) => {
  t(`array ${JSON.stringify(ordem)} imprime nessa ordem`,
    () => assert.deepStrictEqual(ordemNoDocumento({ [FAM]: ordem }), ordem));
});

console.log('\n[banco] a ordem sobrevive a ida e volta como string JSON');
// O campo e TEXT no SQLite: a tela salva JSON.stringify e o servidor faz JSON.parse.
const ordemBanco = ['potencia', 'vazao', 'motor'];
t('string JSON preserva a ordem exatamente',
  () => assert.deepStrictEqual(ordemNoDocumento(JSON.stringify({ [FAM]: ordemBanco })), ordemBanco));

console.log('\n[mesclagem] a mescla entre linhas de template nao reordena por dentro');
// Copia fiel do merge de resolverTemplateConfig (server/index.js): mais antigo -> mais
// novo, atribuindo o array INTEIRO por familia. Nada dentro do array e mexido.
function mesclar(linhas) {
  const mapa = {};
  linhas.slice().reverse().forEach((r) => {
    let obj = null;
    const bruto = r && r.variaveis_proposta_por_familia;
    if (typeof bruto === 'string') { try { obj = JSON.parse(bruto); } catch (_) { obj = null; } }
    else if (bruto && typeof bruto === 'object') obj = bruto;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
    Object.entries(obj).forEach(([fam, val]) => {
      if (Array.isArray(val) ? val.length > 0 : Boolean(val)) mapa[fam] = val;
    });
  });
  return mapa;
}
const antiga = { id: 1, variaveis_proposta_por_familia: JSON.stringify({ [FAM]: ['vazao', 'motor', 'potencia'] }) };
const nova = { id: 2, variaveis_proposta_por_familia: JSON.stringify({ [FAM]: ['potencia', 'motor', 'vazao'] }) };
const mesclado = mesclar([nova, antiga]); // lista vem ordenada por id DESC
t('vence a linha mais recente, com a ordem dela intacta',
  () => assert.deepStrictEqual(mesclado[FAM], ['potencia', 'motor', 'vazao']));
t('e essa ordem chega ao documento',
  () => assert.deepStrictEqual(ordemNoDocumento(mesclado), ['potencia', 'motor', 'vazao']));

console.log('\n[isolamento] cada familia tem a sua ordem');
const OUTRA = 'MASSEIRA HELICOIDAL ATM [MHY]';
const duas = { [FAM]: ['motor', 'vazao', 'potencia'], [OUTRA]: ['potencia', 'motor', 'vazao'] };
t('a ordem aplicada e a da familia do item, nao a da outra',
  () => assert.deepStrictEqual(ordemNoDocumento(duas), ['motor', 'vazao', 'potencia']));

// ---------------------------------------------------------------------------
// 3) Busca dentro do painel de ordem
// ---------------------------------------------------------------------------
// A armadilha: se as setas / caixa numerica operassem sobre a posicao na lista FILTRADA, o
// item iria para o lugar errado assim que houvesse busca ativa — e de forma silenciosa,
// porque a tela mostraria o movimento "certo" dentro do recorte. Por isso cada linha
// carrega o indice REAL na ordem.
function linhasFiltradas(ordem, nomes, termo) {
  const tl = (termo || '').trim().toLowerCase();
  return ordem
    .map((chave, i) => ({ chave, i, nome: nomes[chave] || '' }))
    .filter(({ chave, nome }) => !tl || nome.toLowerCase().includes(tl) || String(chave).toLowerCase().includes(tl));
}

console.log('\n[busca na ordem] o indice REAL comanda o reordenamento');
const ORDEM = ['vazao', 'motor', 'potencia', 'material', 'painel'];
const NOMES = {
  vazao: 'VAZAO ESTIMADA', motor: 'MOTOR CENTRAL', potencia: 'POTENCIA TOTAL',
  material: 'MATERIAL EIXOS', painel: 'PAINEL ELETRICO',
};

const achadas = linhasFiltradas(ORDEM, NOMES, 'material');
t('a busca acha a linha certa', () => assert.strictEqual(achadas.length, 1));
t('e carrega o indice REAL (3), nao 0 da lista filtrada',
  () => assert.strictEqual(achadas[0].i, 3));
t('digitar 1 na linha achada leva ao topo da ordem inteira',
  () => assert.deepStrictEqual(mover(ORDEM, achadas[0].i, 0),
    ['material', 'vazao', 'motor', 'potencia', 'painel']));

// A regressao que este teste existe para pegar: usar a posicao do recorte (0) como origem
// moveria a variavel ERRADA — "vazao", que por acaso esta no indice 0 da ordem real.
t('usar a posicao do recorte moveria a variavel errada (regressao)',
  () => assert.notDeepStrictEqual(mover(ORDEM, 0, 0), mover(ORDEM, achadas[0].i, 0)));

t('busca casa pelo nome parcial',
  () => assert.strictEqual(linhasFiltradas(ORDEM, NOMES, 'potenc')[0].chave, 'potencia'));
t('busca casa pela chave quando a variavel nao tem nome (sobra do cadastro)',
  () => assert.strictEqual(linhasFiltradas(['posio_do_bocal_de_sada_2'], {}, 'bocal')[0].chave, 'posio_do_bocal_de_sada_2'));
t('busca sem resultado devolve lista vazia, nao a lista toda',
  () => assert.strictEqual(linhasFiltradas(ORDEM, NOMES, 'zzzz').length, 0));
t('busca vazia devolve a ordem completa',
  () => assert.strictEqual(linhasFiltradas(ORDEM, NOMES, '').length, ORDEM.length));

// ---------------------------------------------------------------------------
// 4) Copiar a ordem de outra familia
// ---------------------------------------------------------------------------
// Pedido: "se tem a variavel produto, tem que ficar na mesma posicao do outro cadastro, e
// se um tem a variavel motor e outro nao, ignorar a variavel que nao existe".
// Copia fiel de calcularOrdemCopiada (ConfigTemplateProposta.js).
function copiarOrdem(chavesOrigem, ordemAtual) {
  const presentes = new Set(ordemAtual);
  // Deduplica a origem: chave repetida lá duplicaria a linha na proposta. Este teste pegou
  // exatamente esse caso na primeira execucao.
  const jaColocadas = new Set();
  const comuns = [];
  (chavesOrigem || []).forEach((c) => {
    if (presentes.has(c) && !jaColocadas.has(c)) { jaColocadas.add(c); comuns.push(c); }
  });
  const restantes = ordemAtual.filter((c) => !jaColocadas.has(c));
  return { nova: comuns.concat(restantes), comuns, restantes };
}

console.log('\n[copiar ordem] em comum seguem a origem; o resto vai para o fim');
const FONTE = ['produto', 'motor', 'potencia', 'painel'];

t('ordens identicas: fica igual a origem',
  () => assert.deepStrictEqual(copiarOrdem(FONTE, ['painel', 'produto', 'motor', 'potencia']).nova, FONTE));

// O caso do pedido: a origem tem "motor", o destino nao. Motor e IGNORADO, e as demais
// mantem a ordem relativa da origem.
const semMotor = copiarOrdem(FONTE, ['potencia', 'painel', 'produto']);
t('variavel que só existe na ORIGEM é ignorada',
  () => assert(!semMotor.nova.includes('motor')));
t('as em comum assumem a ordem da origem',
  () => assert.deepStrictEqual(semMotor.nova, ['produto', 'potencia', 'painel']));

// Inverso: o destino tem uma variavel que a origem nao tem. Ela NAO pode ser descartada —
// continuaria marcada e sairia na proposta, so que fora de ordem.
const comExtra = copiarOrdem(FONTE, ['cuba', 'potencia', 'produto']);
t('variavel que só existe no DESTINO nao e descartada',
  () => assert(comExtra.nova.includes('cuba')));
t('e vai para o fim, depois das em comum',
  () => assert.deepStrictEqual(comExtra.nova, ['produto', 'potencia', 'cuba']));

const duasExtras = copiarOrdem(['produto', 'motor'], ['cuba', 'produto', 'base', 'motor']);
t('varias só do destino mantem entre si a ordem que tinham',
  () => assert.deepStrictEqual(duasExtras.nova, ['produto', 'motor', 'cuba', 'base']));

console.log('\n[copiar ordem] integridade: nada entra, nada sai');
[
  [FONTE, ['potencia', 'painel', 'produto']],
  [FONTE, ['cuba', 'potencia', 'produto']],
  [['produto'], ['cuba', 'base']],
  [[], ['cuba', 'base']],
  [FONTE, []],
].forEach(([origem, destino], idx) => {
  const r = copiarOrdem(origem, destino);
  t(`caso ${idx + 1}: o conjunto de variaveis do destino nao muda`, () => {
    assert.deepStrictEqual(r.nova.slice().sort(), destino.slice().sort(),
      'copiar ordem so pode REORDENAR, nunca marcar/desmarcar');
    assert.strictEqual(new Set(r.nova).size, r.nova.length, 'chave duplicada na ordem');
  });
});

t('sem nada em comum, a ordem atual e preservada inteira',
  () => assert.deepStrictEqual(copiarOrdem(['produto'], ['cuba', 'base']).nova, ['cuba', 'base']));
t('sem nada em comum, comuns fica vazio (a tela avisa e nao aplica)',
  () => assert.strictEqual(copiarOrdem(['produto'], ['cuba', 'base']).comuns.length, 0));
t('origem vazia nao zera a ordem do destino',
  () => assert.deepStrictEqual(copiarOrdem([], ['cuba', 'base']).nova, ['cuba', 'base']));

// Origem com chave repetida (dado torto no banco) nao pode duplicar linha na proposta.
t('chave repetida na origem nao duplica no resultado',
  () => assert.deepStrictEqual(copiarOrdem(['produto', 'produto', 'motor'], ['motor', 'produto']).nova,
    ['produto', 'motor']));

console.log('\n[copiar ordem] a ordem copiada chega ao documento');
const destinoReal = ['potencia', 'vazao', 'motor'];
const fonteReal = ['motor', 'potencia', 'vazao'];
const copiada = copiarOrdem(fonteReal, destinoReal).nova;
t('resultado da copia imprime na ordem da origem',
  () => assert.deepStrictEqual(ordemNoDocumento({ [FAM]: copiada }), ['motor', 'potencia', 'vazao']));

console.log(`\n${ok}/${total} checagens`);
console.log(ok === total ? '0 failed' : `${total - ok} failed`);
process.exit(ok === total ? 0 : 1);
