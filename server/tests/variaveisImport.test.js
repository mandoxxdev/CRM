/**
 * Testes da importação de variáveis técnicas por planilha.
 * Executar: node server/tests/variaveisImport.test.js
 *
 * Cobre as três camadas: similaridade (pura), parser/análise (pura) e as rotas
 * de ponta a ponta, subindo um Express real com SQLite em memória e enviando
 * um .xlsx de verdade por multipart.
 */

const assert = require('assert');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const XLSX = require('xlsx');

const similaridade = require('../services/variaveisImport/similaridade');
const { parsePlanilha, expandirFamilias, gerarChave } = require('../services/variaveisImport/parser');
const { analisar, planejarAplicacao, resolverFamilia, ACOES, SITUACOES } = require('../services/variaveisImport/analise');
const { dbRun, dbGet, dbAll } = require('../services/variaveisImport/db');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      return r.then(() => { passed++; console.log(`  ✓ ${name}`); })
        .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
    }
    passed++; console.log(`  ✓ ${name}`);
    return Promise.resolve();
  } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${e.message}`);
    return Promise.resolve();
  }
}

/* ══════════════════════════════ SIMILARIDADE ══════════════════════════════ */
async function testesSimilaridade() {
  console.log('\n── Similaridade de texto');

  await test('caso do usuário: "Aço inox" x "inox" passa de 80%', () => {
    const r = similaridade.compararTextos('Aço inox', 'inox');
    assert(r.score >= 0.8, `esperado >= 0.8, veio ${r.score}`);
  });

  await test('ignora acento e caixa', () => {
    const r = similaridade.compararTextos('POTÊNCIA TOTAL', 'potencia total');
    assert.strictEqual(r.score, 1);
    assert.strictEqual(r.exato, true);
  });

  await test('ignora pontuação e unidade entre colchetes', () => {
    const r = similaridade.compararTextos('POTÊNCIA TOTAL [kW]', 'POTENCIA TOTAL');
    assert(r.score >= 0.8, `veio ${r.score}`);
  });

  await test('pega erro de digitação (Levenshtein)', () => {
    const r = similaridade.compararTextos('POTENICA MOTOR', 'POTÊNCIA MOTOR');
    assert(r.score >= 0.8, `veio ${r.score}`);
  });

  await test('pega reordenação de palavras', () => {
    const r = similaridade.compararTextos('BOCAL DE SAÍDA', 'SAÍDA DO BOCAL');
    assert(r.score >= 0.8, `veio ${r.score}`);
  });

  await test('NÃO confunde MOTOR ESQUERDO com MOTOR DIREITO', () => {
    const r = similaridade.compararTextos('MOTOR ESQUERDO [kW]', 'MOTOR DIREITO [kW]');
    assert(r.score < 0.8, `falso positivo: ${r.score}`);
  });

  await test('NÃO confunde TAMPO SUPERIOR com TAMPO INFERIOR', () => {
    const r = similaridade.compararTextos('TAMPO SUPERIOR', 'TAMPO INFERIOR');
    assert(r.score < 0.8, `falso positivo: ${r.score}`);
  });

  await test('variáveis sem relação ficam com score baixo', () => {
    const r = similaridade.compararTextos('RASPADOR', 'VACUÔMETRO');
    assert(r.score < 0.4, `veio ${r.score}`);
  });

  await test('token curto sozinho não fecha containment (evita "kW" casar com tudo)', () => {
    const r = similaridade.compararTextos('kW', 'POTÊNCIA TOTAL kW');
    assert(r.score < 0.8, `falso positivo: ${r.score}`);
  });

  await test('encontrarSimilares ordena do mais parecido ao menos', () => {
    const achados = similaridade.encontrarSimilares('AÇO INOX', [
      { id: 1, nome: 'RASPADOR' },
      { id: 2, nome: 'INOX' },
      { id: 3, nome: 'AÇO INOX 304' }
    ], { limiar: 0.7 });
    assert(achados.length >= 2, 'deveria achar ao menos 2');
    assert(achados[0].similaridade >= achados[achados.length - 1].similaridade);
    assert(!achados.some((a) => a.nome === 'RASPADOR'), 'RASPADOR não deveria entrar');
  });

  await test('percentual vem inteiro, pronto para a tela', () => {
    const achados = similaridade.encontrarSimilares('AÇO INOX', [{ id: 1, nome: 'INOX' }], { limiar: 0.7 });
    assert.strictEqual(typeof achados[0].percentual, 'number');
    assert(Number.isInteger(achados[0].percentual));
  });
}

/* ═════════════════════════════════ PARSER ═════════════════════════════════ */
function planilhaExemplo() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['nome', 'chave', 'tipo', 'categoria', 'sufixo', 'ordem', 'familias'],
    ['Acabamento', '', 'lista', 'Acabamento', '', 1, ''],
    ['Conexão do bocal de saída', '', '', 'Bocais', '', 2, ''],
    ['Nota técnica', '', 'texto', 'Geral', '', 3, 'F01']
  ]), 'Variaveis');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['variavel', 'valor', 'familias'],
    ['Acabamento', 'Escovado', 'F18'],
    ['Acabamento', 'Usinado', 'F19'],
    ['Conexão do bocal de saída', 'Flange liso solto 150 lbs', 'F01–F03'],
    ['Tampo inferior', 'Torrisférico', 'F01']
  ]), 'Opcoes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['codigo', 'nome', 'grupo'],
    ['F01', 'Masseira Helicoidal ATM', 'Masseiras'],
    ['F02', 'Masseira Bimix ATM', 'Masseiras'],
    ['F03', 'Masseira Trimix ATM', 'Masseiras'],
    ['F18', 'Disco Dispersor', 'Hélices e Acessórios'],
    ['F19', 'Eixo de Laboratório', 'Hélices e Acessórios']
  ]), 'Familias');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function testesParser() {
  console.log('\n── Parser da planilha');

  await test('expande faixa com en dash (formato do catálogo)', () => {
    assert.deepStrictEqual(expandirFamilias('F01–F05'), ['F01', 'F02', 'F03', 'F04', 'F05']);
  });

  await test('expande faixa com hífen comum', () => {
    assert.deepStrictEqual(expandirFamilias('F01-F03'), ['F01', 'F02', 'F03']);
  });

  await test('mistura faixa e lista solta', () => {
    assert.deepStrictEqual(expandirFamilias('F06, F07, F13–F15'), ['F06', 'F07', 'F13', 'F14', 'F15']);
  });

  await test('remove repetição preservando ordem', () => {
    assert.deepStrictEqual(expandirFamilias('F01; F01; F02'), ['F01', 'F02']);
  });

  await test('campo vazio devolve lista vazia', () => {
    assert.deepStrictEqual(expandirFamilias(''), []);
    assert.deepStrictEqual(expandirFamilias(null), []);
  });

  await test('gera chave no mesmo formato do sistema (lossy, sem acento)', () => {
    // Precisa bater com o slug de index.js, senão não casa com familia_variaveis
    assert.strictEqual(gerarChave('GRAU DE PROTEÇÃO MOTORES'), 'grau_de_proteo_motores');
    assert.strictEqual(gerarChave('MOTOR ESQUERDO [kW]'), 'motor_esquerdo_kw');
  });

  await test('lê as três abas e associa opções às variáveis', () => {
    const r = parsePlanilha(planilhaExemplo());
    assert.strictEqual(r.erros.length, 0, JSON.stringify(r.erros));
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert(acab, 'ACABAMENTO não foi lida');
    assert.strictEqual(acab.opcoes.length, 2);
    assert.strictEqual(acab.nome, 'ACABAMENTO', 'nome deve ir para caixa alta');
  });

  await test('infere tipo "lista" quando a variável tem opções', () => {
    const r = parsePlanilha(planilhaExemplo());
    const conexao = r.variaveis.find((v) => v.chave === gerarChave('Conexão do bocal de saída'));
    assert.strictEqual(conexao.tipo, 'lista');
  });

  await test('mantém tipo "texto" quando não há opções', () => {
    const r = parsePlanilha(planilhaExemplo());
    const nota = r.variaveis.find((v) => v.chave === 'nota_tcnica');
    assert.strictEqual(nota.tipo, 'texto');
  });

  await test('expande a faixa dentro da célula de opção', () => {
    const r = parsePlanilha(planilhaExemplo());
    const conexao = r.variaveis.find((v) => v.chave === gerarChave('Conexão do bocal de saída'));
    assert.deepStrictEqual(conexao.opcoes[0].familias, ['F01', 'F02', 'F03']);
  });

  await test('variável citada só na aba Opcoes é criada e avisada', () => {
    const r = parsePlanilha(planilhaExemplo());
    const tampo = r.variaveis.find((v) => v.chave === 'tampo_inferior');
    assert(tampo, 'TAMPO INFERIOR deveria ter sido criada');
    assert.strictEqual(tampo.implicita, true);
    assert(r.avisos.some((a) => a.includes('TAMPO INFERIOR')));
  });

  await test('famílias da variável herdam as citadas nas opções', () => {
    const r = parsePlanilha(planilhaExemplo());
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert(acab.familias.includes('F18') && acab.familias.includes('F19'));
  });

  await test('lê legenda de famílias', () => {
    const r = parsePlanilha(planilhaExemplo());
    assert.strictEqual(r.familias.length, 5);
    assert.strictEqual(r.familias[0].codigo, 'F01');
  });

  await test('aba única com valores separados por ponto e vírgula', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['variavel', 'valor'],
      ['Pressão de trabalho', 'ATM; 7 – 11 bar']
    ]), 'Planilha1');
    const r = parsePlanilha(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const v = r.variaveis[0];
    assert.strictEqual(v.opcoes.length, 2, 'deveria quebrar em 2 valores');
  });

  console.log('\n── Formato simples (uma aba, colunas em português)');

  const planilhaSimples = () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Variável', 'Opção', 'Famílias', 'Unidade'],
      ['Acabamento', 'Escovado', 'Disco Dispersor', ''],
      ['Acabamento', 'Usinado', 'Eixo de Laboratório', ''],
      ['Acabamento', 'Natural do material', 'Tela de Lisa de Moinho', ''],
      ['Potência motor central', '7.5 kW', 'Masseira Helicoidal ATM', 'kW'],
      ['Nota técnica', '', 'Masseira Helicoidal ATM', '']
    ]), 'Variáveis');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };

  await test('agrupa as linhas repetidas numa variável só', () => {
    const r = parsePlanilha(planilhaSimples());
    assert.strictEqual(r.erros.length, 0, JSON.stringify(r.erros));
    assert.strictEqual(r.variaveis.length, 3, 'Acabamento não pode virar 3 variáveis');
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert.strictEqual(acab.opcoes.length, 3);
  });

  await test('junta as famílias de todas as linhas da mesma variável', () => {
    const r = parsePlanilha(planilhaSimples());
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert.deepStrictEqual(acab.familias, ['Disco Dispersor', 'Eixo de Laboratório', 'Tela de Lisa de Moinho']);
  });

  await test('linha sem opção vira variável de texto livre', () => {
    const r = parsePlanilha(planilhaSimples());
    const nota = r.variaveis.find((v) => v.chave === 'nota_tcnica');
    assert.strictEqual(nota.tipo, 'texto');
    assert.strictEqual(nota.opcoes.length, 0);
  });

  await test('coluna Unidade alimenta o sufixo', () => {
    const r = parsePlanilha(planilhaSimples());
    const pot = r.variaveis.find((v) => v.chave === 'potncia_motor_central');
    assert.strictEqual(pot.sufixo, 'kW');
  });

  await test('nome de família por extenso é aceito no lugar do código', () => {
    const r = parsePlanilha(planilhaSimples());
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert(acab.familias.includes('Disco Dispersor'));
  });

  console.log('\n── Formato matriz (uma coluna por família, marca X)');

  const planilhaMatriz = (marcas) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Variável', 'Opção', 'Unidade', 'Disco Dispersor', 'Eixo de Laboratório', 'Tacho Móvel'],
      ['Acabamento', 'Escovado', '', marcas[0], marcas[1], marcas[2]],
      ['Acabamento', 'Usinado', '', marcas[3], marcas[4], marcas[5]]
    ]), 'Variáveis');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  };

  await test('X vira vínculo de família', () => {
    const r = parsePlanilha(planilhaMatriz(['X', '', '', '', 'X', '']));
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert.deepStrictEqual(acab.familias, ['Disco Dispersor', 'Eixo de Laboratório']);
  });

  await test('cada opção guarda só as famílias da própria linha', () => {
    const r = parsePlanilha(planilhaMatriz(['X', '', '', '', 'X', '']));
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    const escovado = acab.opcoes.find((o) => o.valor === 'Escovado');
    const usinado = acab.opcoes.find((o) => o.valor === 'Usinado');
    assert.deepStrictEqual(escovado.familias, ['Disco Dispersor']);
    assert.deepStrictEqual(usinado.familias, ['Eixo de Laboratório']);
  });

  await test('aceita x minúsculo, "sim" e "1" como marcação', () => {
    const r = parsePlanilha(planilhaMatriz(['x', 'sim', '1', '', '', '']));
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert.deepStrictEqual(acab.familias, ['Disco Dispersor', 'Eixo de Laboratório', 'Tacho Móvel']);
  });

  await test('célula com "não" ou "0" NÃO marca', () => {
    const r = parsePlanilha(planilhaMatriz(['não', '0', 'X', '', '', '']));
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert.deepStrictEqual(acab.familias, ['Tacho Móvel']);
  });

  await test('coluna Unidade não é confundida com família', () => {
    const r = parsePlanilha(planilhaMatriz(['X', '', '', '', '', '']));
    const acab = r.variaveis.find((v) => v.chave === 'acabamento');
    assert(!acab.familias.includes('Unidade'), JSON.stringify(acab.familias));
  });

  await test('arquivo corrompido não derruba o parser', () => {
    const r = parsePlanilha(Buffer.from('isto não é uma planilha'));
    assert.strictEqual(r.variaveis.length, 0);
    assert(r.erros.length > 0);
  });
}

/* ═════════════════════════════════ ANÁLISE ════════════════════════════════ */
async function testesAnalise() {
  console.log('\n── Análise contra o cadastro atual');

  const existentes = [
    { id: 10, chave: 'aco_inox', nome: 'AÇO INOX', tipo: 'lista', opcoes: JSON.stringify(['304', '316']) },
    { id: 11, chave: 'acabamento', nome: 'ACABAMENTO', tipo: 'lista', opcoes: JSON.stringify(['Escovado']) },
    { id: 12, chave: 'raspador', nome: 'RASPADOR', tipo: 'texto', opcoes: null }
  ];
  const familias = [
    { id: 1, nome: 'Masseira Helicoidal ATM', codigo: 10 },
    { id: 2, nome: 'Disco Dispersor', codigo: 20 }
  ];
  const legenda = [
    { codigo: 'F01', nome: 'Masseira Helicoidal ATM' },
    { codigo: 'F18', nome: 'Disco Dispersor' },
    { codigo: 'F99', nome: 'Família Que Não Existe' }
  ];

  await test('classifica variável inédita como "nova"', () => {
    const r = analisar([{ linha: 2, nome: 'VACUÔMETRO', chave: 'vacumetro', tipo: 'texto', familias: [], opcoes: [] }],
      existentes, familias, legenda);
    assert.strictEqual(r.itens[0].situacao, SITUACOES.NOVA);
    assert.strictEqual(r.itens[0].acaoSugerida, ACOES.CRIAR);
  });

  await test('classifica chave igual como "existente" e sugere mesclar', () => {
    const r = analisar([{ linha: 2, nome: 'ACABAMENTO', chave: 'acabamento', tipo: 'lista', familias: [], opcoes: [{ valor: 'Usinado', familias: [] }] }],
      existentes, familias, legenda);
    assert.strictEqual(r.itens[0].situacao, SITUACOES.EXISTENTE);
    assert.strictEqual(r.itens[0].acaoSugerida, ACOES.MESCLAR_OPCOES);
  });

  await test('o caso do usuário: "INOX" vira CONFLITO com "AÇO INOX"', () => {
    const r = analisar([{ linha: 2, nome: 'INOX', chave: 'inox', tipo: 'lista', familias: [], opcoes: [] }],
      existentes, familias, legenda);
    const item = r.itens[0];
    assert.strictEqual(item.situacao, SITUACOES.CONFLITO);
    assert.strictEqual(item.similares[0].nome, 'AÇO INOX');
    assert(item.similares[0].percentual >= 80, `veio ${item.similares[0].percentual}%`);
  });

  await test('conflito NÃO recebe ação sugerida (exige decisão humana)', () => {
    const r = analisar([{ linha: 2, nome: 'INOX', chave: 'inox', tipo: 'lista', familias: [], opcoes: [] }],
      existentes, familias, legenda);
    assert.strictEqual(r.itens[0].acaoSugerida, null);
  });

  await test('só marca como novas as opções que ainda não existem', () => {
    const r = analisar([{
      linha: 2, nome: 'ACABAMENTO', chave: 'acabamento', tipo: 'lista', familias: [],
      opcoes: [{ valor: 'Escovado', familias: [] }, { valor: 'Usinado', familias: [] }]
    }], existentes, familias, legenda);
    assert.deepStrictEqual(r.itens[0].opcoesNovas, ['Usinado']);
  });

  await test('resolve família pelo código da legenda', () => {
    const f = resolverFamilia('F01', legenda, familias);
    assert.strictEqual(f.id, 1);
  });

  await test('resolve família pelo nome direto', () => {
    const f = resolverFamilia('Disco Dispersor', legenda, familias);
    assert.strictEqual(f.id, 2);
  });

  await test('família inexistente é reportada, não inventada', () => {
    const r = analisar([{ linha: 2, nome: 'X', chave: 'x', tipo: 'texto', familias: ['F99'], opcoes: [] }],
      existentes, familias, legenda);
    assert.deepStrictEqual(r.itens[0].familiasNaoEncontradas, ['F99']);
    assert.strictEqual(r.itens[0].familiasResolvidas.length, 0);
  });

  await test('resumo conta cada situação', () => {
    const r = analisar([
      { linha: 2, nome: 'VACUÔMETRO', chave: 'vacumetro', tipo: 'texto', familias: [], opcoes: [] },
      { linha: 3, nome: 'ACABAMENTO', chave: 'acabamento', tipo: 'lista', familias: [], opcoes: [] },
      { linha: 4, nome: 'INOX', chave: 'inox', tipo: 'lista', familias: [], opcoes: [] }
    ], existentes, familias, legenda);
    assert.strictEqual(r.resumo.novas, 1);
    assert.strictEqual(r.resumo.existentes, 1);
    assert.strictEqual(r.resumo.conflitos, 1);
  });

  console.log('\n── Plano de gravação a partir das decisões');

  const relatorioConflito = analisar(
    [{ linha: 2, nome: 'INOX', chave: 'inox', tipo: 'lista', familias: ['F01'], opcoes: [{ valor: '316L', familias: ['F01'] }] }],
    existentes, familias, legenda
  );

  await test('conflito sem decisão fica pendente e não gera operação', () => {
    const { operacoes, pendentes } = planejarAplicacao(relatorioConflito, {});
    assert.strictEqual(operacoes.length, 0);
    assert.strictEqual(pendentes.length, 1);
  });

  await test('decisão "manter" gera ignorar', () => {
    const { operacoes } = planejarAplicacao(relatorioConflito, { inox: { acao: ACOES.MANTER } });
    assert.strictEqual(operacoes[0].tipo, 'ignorar');
  });

  await test('decisão "criar" gera criação mesmo havendo parecida', () => {
    const { operacoes } = planejarAplicacao(relatorioConflito, { inox: { acao: ACOES.CRIAR } });
    assert.strictEqual(operacoes[0].tipo, 'criar');
    assert.deepStrictEqual(operacoes[0].opcoesFinais, ['316L']);
  });

  await test('decisão "sobrescrever" substitui a lista da existente', () => {
    const { operacoes } = planejarAplicacao(relatorioConflito, { inox: { acao: ACOES.SOBRESCREVER, alvo_id: 10 } });
    assert.strictEqual(operacoes[0].tipo, 'atualizar');
    assert.strictEqual(operacoes[0].atualizarCadastro, true);
    assert.deepStrictEqual(operacoes[0].opcoesFinais, ['316L'], 'sobrescrever descarta 304/316');
  });

  await test('decisão "mesclar_opcoes" soma as listas sem perder as atuais', () => {
    const { operacoes } = planejarAplicacao(relatorioConflito, { inox: { acao: ACOES.MESCLAR_OPCOES, alvo_id: 10 } });
    assert.strictEqual(operacoes[0].atualizarCadastro, false, 'mesclar não mexe no cadastro');
    assert.deepStrictEqual(operacoes[0].opcoesFinais, ['304', '316', '316L']);
  });

  await test('mesclar não duplica opção que já existe', () => {
    const rel = analisar(
      [{ linha: 2, nome: 'ACABAMENTO', chave: 'acabamento', tipo: 'lista', familias: [], opcoes: [{ valor: 'escovado', familias: [] }] }],
      existentes, familias, legenda
    );
    const { operacoes } = planejarAplicacao(rel, { acabamento: { acao: ACOES.MESCLAR_OPCOES } });
    assert.deepStrictEqual(operacoes[0].opcoesFinais, ['Escovado'], 'comparação deve ignorar caixa');
  });

  await test('alvo_id que não bate com a análise é rejeitado', () => {
    const { operacoes, pendentes } = planejarAplicacao(relatorioConflito, { inox: { acao: ACOES.SOBRESCREVER, alvo_id: 999 } });
    assert.strictEqual(operacoes.length, 0);
    assert.strictEqual(pendentes.length, 1);
  });

  await test('aplicarFamilias=false zera os vínculos planejados', () => {
    const { operacoes } = planejarAplicacao(relatorioConflito, { inox: { acao: ACOES.CRIAR } }, { aplicarFamilias: false });
    assert.deepStrictEqual(operacoes[0].familias, []);
  });
}

/* ══════════════════════════ INTEGRAÇÃO (HTTP real) ════════════════════════ */
async function criarServidor(user) {
  const db = new sqlite3.Database(':memory:');
  await dbRun(db, `CREATE TABLE variaveis_tecnicas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, chave TEXT NOT NULL UNIQUE,
    categoria TEXT, tipo TEXT DEFAULT 'texto', opcoes TEXT, ordem INTEGER DEFAULT 0,
    prefixo TEXT, sufixo TEXT, fonte_opcoes TEXT, grupo_compras_id INTEGER, ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await dbRun(db, `CREATE TABLE familias_produto (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL UNIQUE, ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1, codigo INTEGER)`);
  await dbRun(db, `CREATE TABLE familia_variaveis (
    id INTEGER PRIMARY KEY AUTOINCREMENT, familia_id INTEGER NOT NULL, variavel_chave TEXT NOT NULL,
    ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1, UNIQUE(familia_id, variavel_chave))`);
  await dbRun(db, `CREATE TABLE familia_variavel_opcoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, familia_id INTEGER NOT NULL, variavel_chave TEXT NOT NULL,
    valor TEXT NOT NULL, ordem INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1,
    UNIQUE(familia_id, variavel_chave, valor))`);
  await dbRun(db, `CREATE TABLE logs_auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER, usuario_nome TEXT, usuario_email TEXT,
    tipo TEXT NOT NULL, modulo TEXT, nome_modulo TEXT, acao TEXT, detalhes TEXT,
    ip_address TEXT, user_agent TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

  await dbRun(db, "INSERT INTO familias_produto (nome, codigo) VALUES ('Masseira Helicoidal ATM', 10)");
  await dbRun(db, "INSERT INTO familias_produto (nome, codigo) VALUES ('Disco Dispersor', 20)");
  await dbRun(db, "INSERT INTO variaveis_tecnicas (nome, chave, tipo, opcoes, ativo) VALUES ('AÇO INOX', 'aco_inox', 'lista', ?, 1)", [JSON.stringify(['304'])]);

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  const auth = (req, _res, next) => { req.user = user; next(); };
  require('../routes/variaveisImport')(app, db, auth);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  return { db, app, server, base: `http://127.0.0.1:${server.address().port}` };
}

async function enviarPlanilha(base, buffer, nome) {
  const fd = new FormData();
  fd.append('arquivo', new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }), nome || 'planilha.xlsx');
  const res = await fetch(`${base}/api/variaveis-tecnicas/importacao/analisar`, { method: 'POST', body: fd });
  return { status: res.status, body: await res.json() };
}

async function testesIntegracao() {
  console.log('\n── Integração: rotas HTTP com planilha real');

  const admin = { id: 1, nome: 'Admin', email: 'admin@gmp.ind.br', role: 'admin' };
  const ctx = await criarServidor(admin);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['nome', 'tipo', 'categoria', 'sufixo', 'familias'],
    ['INOX', 'lista', 'Materiais', '', 'F01'],
    ['VACUÔMETRO', 'texto', 'Instrumentos', '', 'F01;F18']
  ]), 'Variaveis');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['variavel', 'valor', 'familias'],
    ['INOX', '316L', 'F01'],
    ['VACUÔMETRO', 'Analógico', 'F18']
  ]), 'Opcoes');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['codigo', 'nome'],
    ['F01', 'Masseira Helicoidal ATM'],
    ['F18', 'Disco Dispersor']
  ]), 'Familias');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  let token = null;

  const baixarModelo = async () => {
    const res = await fetch(`${ctx.base}/api/variaveis-tecnicas/importacao/modelo`);
    assert.strictEqual(res.status, 200);
    return Buffer.from(await res.arrayBuffer());
  };

  await test('modelo abre e tem a aba de dados + a de ajuda', async () => {
    const lido = XLSX.read(await baixarModelo(), { type: 'buffer' });
    assert(lido.SheetNames.includes('Variáveis'));
    assert(lido.SheetNames.includes('Ajuda'));
  });

  await test('cabeçalho em português, com uma coluna por família', async () => {
    const lido = XLSX.read(await baixarModelo(), { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(lido.Sheets['Variáveis'], { header: 1 });
    assert.deepStrictEqual(linhas[0].slice(0, 3), ['Variável', 'Opção', 'Unidade']);
    assert(linhas[0].includes('Masseira Helicoidal ATM'), 'família deveria virar coluna');
    assert(linhas[0].includes('Disco Dispersor'));
  });

  await test('modelo já vem preenchido com o que está cadastrado', async () => {
    const lido = XLSX.read(await baixarModelo(), { type: 'buffer' });
    const linhas = XLSX.utils.sheet_to_json(lido.Sheets['Variáveis'], { header: 1 });
    const acoInox = linhas.slice(1).find((l) => l[0] === 'AÇO INOX');
    assert(acoInox, 'a variável já cadastrada deveria estar na planilha');
    assert.strictEqual(acoInox[1], '304', 'a opção existente deveria vir junto');
  });

  await test('coluna Variável tem dropdown das variáveis existentes (aviso, não bloqueio)', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await baixarModelo());
    const dv = wb.getWorksheet('Variáveis').getCell('A2').dataValidation;
    assert(dv, 'faltou validação na coluna Variável');
    assert.strictEqual(dv.type, 'list');
    // O Excel omite showErrorMessage quando é falso — ausente já quer dizer
    // "sugere, mas deixa digitar", que é o necessário para nome novo.
    assert(!dv.showErrorMessage, 'não pode bloquear nome de variável nova');
  });

  await test('colunas de família só aceitam X, com bloqueio', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await baixarModelo());
    const dv = wb.getWorksheet('Variáveis').getCell('D2').dataValidation;
    assert(dv, 'faltou validação na coluna de família');
    assert.deepStrictEqual(dv.formulae, ['"X"']);
    assert.strictEqual(dv.showErrorMessage, true);
  });

  await test('dropdown cobre linhas vazias, para o que ainda vai ser digitado', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await baixarModelo());
    const dv = wb.getWorksheet('Variáveis').getCell('D400').dataValidation;
    assert(dv, 'linha nova sem validação — o usuário perderia o dropdown');
  });

  await test('ida e volta: baixar o modelo e subir de novo não inventa conflito', async () => {
    const r = await enviarPlanilha(ctx.base, await baixarModelo(), 'variaveis-tecnicas.xlsx');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.resumo.conflitos, 0, 'o próprio cadastro não pode conflitar consigo mesmo');
    assert.strictEqual(r.body.resumo.novas, 0, 'nada deveria ser novo');
    assert.strictEqual(r.body.resumo.opcoesNovas, 0, 'nenhuma opção nova no ida e volta');
  });

  await test('ida e volta preserva o vínculo de família marcado com X', async () => {
    // Vincula AÇO INOX à família 1 e confere que o X volta resolvido.
    await dbRun(ctx.db, "INSERT OR REPLACE INTO familia_variaveis (familia_id, variavel_chave, ordem, ativo) VALUES (1, 'aco_inox', 0, 1)");
    const r = await enviarPlanilha(ctx.base, await baixarModelo(), 'variaveis-tecnicas.xlsx');
    // A busca é pelo NOME: a chave derivada da planilha ("ao_inox", sem o ç)
    // não precisa coincidir com a gravada no banco — o casamento por nome é
    // justamente a rede de proteção para isso.
    const item = r.body.itens.find((i) => i.nome === 'AÇO INOX');
    assert(item, 'AÇO INOX sumiu no ida e volta');
    assert.strictEqual(item.familiasNaoEncontradas.length, 0, JSON.stringify(item.familiasNaoEncontradas));
    assert(item.familiasResolvidas.some((f) => f.id === 1),
      'o X da coluna da família deveria virar vínculo: ' + JSON.stringify(item.familiasResolvidas));
    await dbRun(ctx.db, "DELETE FROM familia_variaveis WHERE variavel_chave = 'aco_inox'");
  });

  await test('POST analisar aceita o upload e devolve token + resumo', async () => {
    const r = await enviarPlanilha(ctx.base, buffer);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert(r.body.token, 'faltou token');
    token = r.body.token;
    assert.strictEqual(r.body.resumo.total, 2);
  });

  await test('analisar detecta o conflito INOX x AÇO INOX com percentual', async () => {
    const r = await enviarPlanilha(ctx.base, buffer);
    const inox = r.body.itens.find((i) => i.chave === 'inox');
    assert.strictEqual(inox.situacao, 'conflito');
    assert.strictEqual(inox.similares[0].nome, 'AÇO INOX');
    assert(inox.similares[0].percentual >= 80);
    token = r.body.token;
  });

  await test('analisar NÃO grava nada no banco', async () => {
    const linhas = await dbAll(ctx.db, 'SELECT chave FROM variaveis_tecnicas');
    assert.strictEqual(linhas.length, 1, 'só a AÇO INOX pré-existente deveria estar lá');
  });

  await test('confirmar com token inválido devolve 410', async () => {
    const res = await fetch(`${ctx.base}/api/variaveis-tecnicas/importacao/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'inexistente', decisoes: {} })
    });
    assert.strictEqual(res.status, 410);
  });

  await test('confirmar aplica mesclar no conflito e cria a variável nova', async () => {
    const res = await fetch(`${ctx.base}/api/variaveis-tecnicas/importacao/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        decisoes: {
          inox: { acao: 'mesclar_opcoes', alvo_id: 1 },
          vacumetro: { acao: 'criar' }
        }
      })
    });
    const body = await res.json();
    assert.strictEqual(res.status, 200, JSON.stringify(body));
    assert.strictEqual(body.criadas, 1, 'VACUÔMETRO deveria ser criada');
    assert.strictEqual(body.atualizadas, 1, 'AÇO INOX deveria ser atualizada');
    assert.strictEqual(body.pendentes.length, 0);
  });

  await test('mesclar somou 316L sem apagar 304 nem renomear a variável', async () => {
    const row = await dbGet(ctx.db, 'SELECT nome, opcoes FROM variaveis_tecnicas WHERE id = 1');
    assert.strictEqual(row.nome, 'AÇO INOX', 'mesclar não pode renomear');
    assert.deepStrictEqual(JSON.parse(row.opcoes), ['304', '316L']);
  });

  await test('a variável nova entrou com nome em caixa alta', async () => {
    const row = await dbGet(ctx.db, "SELECT nome, tipo FROM variaveis_tecnicas WHERE chave = 'vacumetro'");
    assert(row, 'VACUÔMETRO não foi criada');
    assert.strictEqual(row.nome, 'VACUÔMETRO');
  });

  await test('vínculos família↔variável foram gravados (é o que faz aparecer na proposta)', async () => {
    const vinculos = await dbAll(ctx.db, 'SELECT familia_id, variavel_chave FROM familia_variaveis WHERE ativo = 1 ORDER BY familia_id');
    assert(vinculos.length >= 2, `esperado >= 2 vínculos, veio ${vinculos.length}`);
    assert(vinculos.some((v) => v.variavel_chave === 'vacumetro' && v.familia_id === 1));
    assert(vinculos.some((v) => v.variavel_chave === 'vacumetro' && v.familia_id === 2));
  });

  await test('opção específica de família virou familia_variavel_opcoes', async () => {
    const ops = await dbAll(ctx.db, "SELECT familia_id, valor FROM familia_variavel_opcoes WHERE variavel_chave = 'vacumetro'");
    assert(ops.some((o) => o.valor === 'Analógico' && o.familia_id === 2), JSON.stringify(ops));
  });

  await test('a importação ficou registrada na auditoria', async () => {
    const log = await dbGet(ctx.db, "SELECT tipo, acao, detalhes FROM logs_auditoria WHERE tipo = 'importacao_variaveis'");
    assert(log, 'nada foi gravado em logs_auditoria');
    assert.strictEqual(log.acao, 'importacao_confirmada');
    assert(JSON.parse(log.detalhes).criadas === 1);
  });

  await test('token é descartado após confirmar (não dá para aplicar 2x)', async () => {
    const res = await fetch(`${ctx.base}/api/variaveis-tecnicas/importacao/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, decisoes: {} })
    });
    assert.strictEqual(res.status, 410);
  });

  await test('conflito sem decisão não grava e volta como pendente', async () => {
    const r = await enviarPlanilha(ctx.base, buffer);
    const res = await fetch(`${ctx.base}/api/variaveis-tecnicas/importacao/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: r.body.token, decisoes: {} })
    });
    const body = await res.json();
    assert.strictEqual(body.pendentes.length, 1, JSON.stringify(body.pendentes));
    assert.strictEqual(body.pendentes[0].chave, 'inox');
  });

  await test('planilha sem variável nenhuma devolve 400', async () => {
    const vazio = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(vazio, XLSX.utils.aoa_to_sheet([['nada', 'aqui']]), 'Planilha1');
    const r = await enviarPlanilha(ctx.base, XLSX.write(vazio, { type: 'buffer', bookType: 'xlsx' }));
    assert.strictEqual(r.status, 400);
  });

  await test('extensão não suportada é barrada', async () => {
    const fd = new FormData();
    fd.append('arquivo', new Blob([Buffer.from('x')], { type: 'text/plain' }), 'lista.txt');
    const res = await fetch(`${ctx.base}/api/variaveis-tecnicas/importacao/analisar`, { method: 'POST', body: fd });
    assert.strictEqual(res.status, 400);
  });

  ctx.server.close();
  ctx.db.close();

  // Usuário sem permissão administrativa
  const ctx2 = await criarServidor({ id: 9, nome: 'Vendedor', email: 'v@gmp.ind.br', role: 'user' });

  await test('usuário comum recebe 403 em analisar', async () => {
    const r = await enviarPlanilha(ctx2.base, buffer);
    assert.strictEqual(r.status, 403);
  });

  await test('usuário comum recebe 403 no modelo', async () => {
    const res = await fetch(`${ctx2.base}/api/variaveis-tecnicas/importacao/modelo`);
    assert.strictEqual(res.status, 403);
  });

  await test('usuário comum recebe 403 em confirmar', async () => {
    const res = await fetch(`${ctx2.base}/api/variaveis-tecnicas/importacao/confirmar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'x', decisoes: {} })
    });
    assert.strictEqual(res.status, 403);
  });

  ctx2.server.close();
  ctx2.db.close();
}

/* ═══════════════════════════════════ RUN ══════════════════════════════════ */
(async () => {
  console.log('\n═══ Importação de Variáveis Técnicas ═══');
  await testesSimilaridade();
  await testesParser();
  await testesAnalise();
  await testesIntegracao();

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  console.error('Erro fatal na suíte:', e);
  process.exit(1);
});
