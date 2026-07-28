/**
 * T2 — os TEXTOS da 5.23 (PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS) são editáveis
 * pelo MESMO mecanismo das demais cláusulas (data-clausula-key / data-clausula-campo),
 * enquanto as TABELAS (preços gerada dos itens, FINAME/BNDES e fiscais) continuam
 * calculadas/fixas — ver I4: a tabela de preços precisa sair íntegra, em ordem e com
 * thead repetido em cada fragmento, o que só o gerador garante.
 *
 * Executar: node tests/proposta523Editavel.test.js
 */
const assert = require('assert');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault, CLAUSULA_523_PRECO, CLAUSULA_523_CONDICAO } = require('../clausulasDefault');

let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + ': ' + e.message); } }

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '27/07/2026' };
// formato REAL do banco: id/titulo/conteudo/ordem, SEM campo `numero` (armadilha 1 do review)
const comoBanco = getClausulasDefault().map((c, i) => ({
  id: 100 + i, proposta_id: 9, ordem: i, ativo: 1, titulo: `${c.numero} ${c.titulo}`, conteudo: c.conteudo,
}));
const comoDefault = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));
const gerar = (custom) => gerarHTMLPropostaPremiumV2(proposta, itens, totais, custom ? { clausulas_custom: custom } : null, null, false, true);

test('clausulasDefault exporta os textos da 5.23 e os inclui na lista padrão, entre 5.22 e 5.24', () => {
  assert(CLAUSULA_523_PRECO && CLAUSULA_523_CONDICAO, 'faltou exportar os textos da 5.23');
  const lista = getClausulasDefault();
  const nums = lista.map(c => c.numero);
  const i22 = nums.indexOf('5.22');
  const i23 = nums.indexOf(CLAUSULA_523_PRECO.numero);
  const i23b = nums.indexOf(CLAUSULA_523_CONDICAO.numero);
  const i24 = nums.indexOf('5.24');
  assert(i22 > -1 && i23 > -1 && i23b > -1 && i24 > -1, `faltou alguma cláusula na lista padrão: ${nums.join(',')}`);
  assert(i22 < i23 && i23 < i23b && i23b < i24, `ordem errada na lista padrão: ${nums.join(',')}`);
  assert(new Set(nums).size === nums.length, 'números duplicados na lista padrão (colidiriam em data-clausula-key="default-N")');
});

for (const [rotulo, custom] of [['banco', comoBanco], ['default', comoDefault]]) {
  test(`[${rotulo}] o título da 5.23 é editável (data-clausula-campo="titulo")`, () => {
    const html = gerar(custom);
    assert(/<h3 data-clausula-campo="titulo">5\.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS<\/h3>/.test(html),
      'o título da 5.23 não está num elemento editável');
  });

  test(`[${rotulo}] o texto de introdução da 5.23 é editável (data-clausula-campo="conteudo")`, () => {
    const html = gerar(custom);
    const sec = html.match(/<section[^>]*data-clausula-slot="23"[\s\S]*?<\/section>/);
    assert(sec, 'não achei a seção de texto da 5.23 marcada com data-clausula-slot="23"');
    assert(/data-clausula-key="/.test(sec[0]), 'a seção da 5.23 não tem data-clausula-key');
    assert(/data-clausula-campo="conteudo"[\s\S]*A CONTRATANTE pagará pelos equipamentos/.test(sec[0]),
      'o texto de introdução não está dentro do container editável');
  });

  test(`[${rotulo}] a CONDIÇÃO DE PAGAMENTO é editável e tem key própria`, () => {
    const html = gerar(custom);
    const secs = html.match(/<section[^>]*data-clausula-slot="23"[^>]*>/g) || [];
    assert(secs.length >= 2, `esperava 2 blocos editáveis na 5.23 (intro e condição), veio ${secs.length}`);
    const keys = secs.map(s => (s.match(/data-clausula-key="([^"]+)"/) || [])[1]);
    assert(new Set(keys).size === keys.length, `keys repetidas na 5.23: ${keys.join(',')}`);
    const bloco = html.slice(html.indexOf('CONDIÇÃO DE PAGAMENTO:') - 400, html.indexOf('Primeira Parcela/Entrada') + 200);
    assert(/data-clausula-campo="conteudo"/.test(bloco), 'a condição de pagamento não está num container editável');
  });

  test(`[${rotulo}] I4: a tabela de preços fica FORA dos containers editáveis e ANTES da condição`, () => {
    const html = gerar(custom);
    const iIntro = html.indexOf('A CONTRATANTE pagará pelos equipamentos');
    const iTabela = html.indexOf('TOTAL DA PROPOSTA');
    const iCondicao = html.indexOf('Primeira Parcela/Entrada');
    assert(iIntro > -1 && iTabela > -1 && iCondicao > -1, 'sumiu alguma parte da 5.23');
    assert(iIntro < iTabela, 'a introdução deve vir antes da tabela');
    assert(iTabela < iCondicao, 'a condição de pagamento deve vir DEPOIS da tabela (I4)');
    // a tabela não pode estar dentro de um bloco editável: o trecho entre o fim do
    // container editável da intro e a tabela não pode conter um data-clausula-campo aberto
    const entre = html.slice(iIntro, iTabela);
    const abre = (entre.match(/data-clausula-campo="conteudo"/g) || []).length;
    assert(abre === 0, 'a tabela de preços caiu dentro do container editável da introdução');
  });

  test(`[${rotulo}] tabelas FINAME/BNDES e fiscais continuam fixas (não editáveis)`, () => {
    const html = gerar(custom);
    const iFiname = html.indexOf('Ref. FINAME');
    const trechoFiname = html.slice(iFiname - 600, html.indexOf('04051088'));
    assert(!/data-clausula-campo/.test(trechoFiname), 'a tabela FINAME virou editável');
    const iFiscal = html.indexOf('Tabela de Classificação Fiscal');
    const trechoFiscal = html.slice(iFiscal - 600, iFiscal);
    assert(!/data-clausula-campo/.test(trechoFiscal), 'a tabela fiscal virou editável');
  });
}

test('texto editado no banco aparece no lugar do padrão (a edição realmente vale)', () => {
  const editadas = comoBanco.map(c => (
    /^5\.23\b/.test(c.titulo) ? { ...c, conteudo: '<p>TEXTO EDITADO PELA VENDEDORA</p>' } : c
  ));
  const html = gerar(editadas);
  assert(html.includes('TEXTO EDITADO PELA VENDEDORA'), 'o texto editado da 5.23 não foi usado');
  assert(!html.includes('A CONTRATANTE pagará pelos equipamentos'), 'o texto padrão continuou aparecendo por cima do editado');
  assert(html.includes('TOTAL DA PROPOSTA'), 'a tabela de preços sumiu ao editar o texto');
});

test('proposta LEGADA (cláusulas salvas antes, sem 5.23 no banco) ainda mostra os textos da 5.23', () => {
  const legado = comoBanco.filter(c => !/^5\.23/.test(c.titulo));
  const html = gerar(legado);
  assert(html.includes('5.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS'), 'o título da 5.23 sumiu na proposta legada');
  assert(html.includes('A CONTRATANTE pagará pelos equipamentos'), 'a introdução da 5.23 sumiu na proposta legada');
  assert(html.includes('Primeira Parcela/Entrada'), 'a condição de pagamento sumiu na proposta legada');
  assert(/data-clausula-slot="23"[^>]*data-clausula-key="temp-|data-clausula-key="temp-[^"]*"[^>]*data-clausula-slot="23"/.test(html),
    'na proposta legada os blocos da 5.23 precisam de key temp-* para que a 1ª edição vire cláusula nova no banco');
});

test('dado REAL da proposta 74: cláusula salva como "5.23 CONSIDERAÇÃO FINAL" vai para a página de assinatura', () => {
  // Antes da reserva do slot 23 existir, o /clausulas/inicializar gravava a CONSIDERAÇÃO
  // FINAL como 5.23. Em produção há proposta assim (74). Se o número mandasse sozinho,
  // ela ocuparia o slot dos textos da 5.23 — o documento perderia a CONDIÇÃO DE PAGAMENTO
  // inteira e a consideração final apareceria no meio, antes da tabela de preços.
  const legado = getClausulasDefault()
    .filter(c => !/^5\.23/.test(c.numero) && c.numero !== '5.24')
    .map((c, i) => ({ id: 200 + i, ordem: i, ativo: 1, titulo: `${c.numero} ${c.titulo}`, conteudo: c.conteudo }));
  legado.push({ id: 299, ordem: 99, ativo: 1, titulo: '5.23 CONSIDERAÇÃO FINAL', conteudo: '<p>Texto final.</p>' });
  const html = gerar(legado);
  const src = html.slice(html.indexOf('id="proposalSource"'));
  const iGrupo523 = src.indexOf('five-23-preco-group');
  const iConsideracao = src.indexOf('CONSIDERAÇÃO FINAL');
  const iCondicao = src.indexOf('Primeira Parcela/Entrada');
  const iAssinatura = src.indexOf('pagina-assinatura');
  assert(iCondicao > -1, 'a CONDIÇÃO DE PAGAMENTO sumiu do documento');
  assert(iGrupo523 < iConsideracao, 'a CONSIDERAÇÃO FINAL ficou ANTES da seção 5.23 (I2)');
  assert(iAssinatura > -1 && iConsideracao > iAssinatura, 'a CONSIDERAÇÃO FINAL não foi para a página de assinatura');
  assert(html.includes('A CONTRATANTE pagará pelos equipamentos'), 'a introdução padrão da 5.23 sumiu');
});

test('a 5.23 aparece uma única vez (não duplica entre a lista de cláusulas e a seção de preço)', () => {
  const html = gerar(comoBanco);
  const ocorrencias = (html.match(/5\.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS/g) || []).length;
  assert(ocorrencias === 1, `título da 5.23 aparece ${ocorrencias}x (esperado 1)`);
  const iForo = html.indexOf('5.21 FORO');
  const i523 = html.indexOf('5.23 PREÇO');
  const i524 = html.indexOf('5.24 CONSIDERAÇÃO FINAL');
  assert(iForo < i523 && i523 < i524, 'a 5.23 saiu fora de ordem em relação a 5.21/5.24');
});

test('round-trip do título: o que o editor lê de volta é EXATAMENTE o título salvo', () => {
  // Contrato com o editor inline (clausulasInlineEditor.lerClausulasDoSource): o título
  // salvo é data-titulo-prefixo + textContent do elemento de título. Se essa soma deixar
  // de bater com o título do banco, a cláusula sai do slot 23 na próxima renderização e
  // a 5.23 se parte no meio da lista de cláusulas.
  const html = gerar(comoBanco);
  const secoes = html.match(/<section[^>]*data-clausula-slot="23"[\s\S]*?<\/section>/g) || [];
  assert(secoes.length >= 2, `esperava 2 seções da 5.23, veio ${secoes.length}`);
  const lidos = secoes.map((s) => {
    const el = s.match(/<(h3|p)[^>]*data-clausula-campo="titulo"[^>]*>([\s\S]*?)<\/\1>/);
    const prefixo = (s.match(/data-titulo-prefixo="([^"]*)"/) || ['', ''])[1];
    return `${prefixo}${el ? el[2] : ''}`.trim();
  });
  const salvos = comoBanco.filter(c => /^5\.23/.test(c.titulo)).map(c => c.titulo);
  assert.deepStrictEqual(lidos, salvos, `título lido ${JSON.stringify(lidos)} != salvo ${JSON.stringify(salvos)}`);
});

test('o prefixo numérico do 2º bloco NÃO é exibido (o documento mostra só "CONDIÇÃO DE PAGAMENTO:")', () => {
  const html = gerar(comoBanco);
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  assert(texto.includes('CONDIÇÃO DE PAGAMENTO:'), 'sumiu o subtítulo da condição de pagamento');
  assert(!texto.includes('5.23.1'), 'o prefixo interno 5.23.1 vazou para o texto do documento');
});

test('ramo hardcoded (sem cláusulas salvas) traz os MESMOS textos da 5.23', () => {
  const html = gerar(null);
  assert(html.includes('5.23 PREÇO, CONDIÇÃO DE PAGAMENTO E IMPOSTOS'), 'faltou o título da 5.23 no ramo fixo');
  assert(html.includes('A CONTRATANTE pagará pelos equipamentos'), 'faltou a introdução da 5.23 no ramo fixo');
  assert(html.includes('Primeira Parcela/Entrada'), 'faltou a condição de pagamento no ramo fixo');
  assert(html.includes('TOTAL DA PROPOSTA') && html.includes('Ref. FINAME'), 'faltou tabela no ramo fixo');
});

test('os dois ramos (fixo e custom) usam o mesmo texto — sem divergência PDF x preview', () => {
  const semTags = (s) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const fixo = semTags(gerar(null));
  const custom = semTags(gerar(comoBanco));
  for (const trecho of [
    'A CONTRATANTE pagará pelos equipamentos e/ou serviços indicados no ESCOPO DE FORNECIMENTO',
    'Primeira Parcela/Entrada',
    '40% (quarenta por cento) sobre o valor total da proposta',
    'multa pecuniária de 2% (dois por cento)',
  ]) {
    assert(fixo.includes(trecho), `ramo fixo perdeu: "${trecho}"`);
    assert(custom.includes(trecho), `ramo custom perdeu: "${trecho}"`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`); process.exit(failed ? 1 : 0);
