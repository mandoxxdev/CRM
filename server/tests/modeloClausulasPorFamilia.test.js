/**
 * Modelo de contrato por familia.
 *
 * Pedido (31/07/2026): helices e discos usam um contrato diferente do de equipamentos, mas
 * o resto do documento (capa, precos, tabelas) continua igual. E, com as palavras do
 * usuario: "caso haja os 2 itens, DEVE SEMPRE PREVALECER A DE EQUIPAMENTO".
 *
 * Por que a regra e essa: o contrato de equipamentos tem 29 clausulas contra 10 do de pecas
 * - inclui startup, obrigacoes das partes, cancelamento e foro. Escolher o menor numa
 * proposta que tem equipamento deixaria o fornecimento descoberto. Na duvida, o mais
 * completo protege os dois lados.
 *
 * Executar: node tests/modeloClausulasPorFamilia.test.js
 */
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { getClausulasDefault } = require('../clausulasDefault');
const { getClausulasHelices } = require('../clausulasHelices');

const arq = path.join(os.tmpdir(), `modelo-clausulas-${Date.now()}.sqlite`);
const db = new sqlite3.Database(arq);

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));

// Copia fiel de resolverModeloClausulas (server/index.js).
async function resolverModelo(propostaId) {
  const padrao = await get('SELECT id FROM clausulas_modelo WHERE is_padrao = 1 AND ativo = 1 ORDER BY id ASC LIMIT 1');
  const idPadrao = padrao ? padrao.id : null;
  const linhas = await all(
    `SELECT DISTINCT f.clausulas_modelo_id AS modelo_id
       FROM proposta_itens pi
       LEFT JOIN familias_produto f
         ON TRIM(LOWER(f.nome)) = TRIM(LOWER(COALESCE(pi.familia_produto, '')))
      WHERE pi.proposta_id = ?`, [propostaId]);
  if (!linhas.length) return idPadrao;
  const temPadrao = linhas.some((l) => l.modelo_id == null || String(l.modelo_id) === String(idPadrao));
  if (temPadrao) return idPadrao;
  const distintos = Array.from(new Set(linhas.map((l) => String(l.modelo_id))));
  if (distintos.length > 1) return idPadrao;
  return linhas[0].modelo_id;
}

let idEquip, idHelices;
const addItem = (pid, familia) =>
  run('INSERT INTO proposta_itens (proposta_id, descricao, familia_produto) VALUES (?, ?, ?)', [pid, 'item', familia]);

(async () => {
  await run('CREATE TABLE clausulas_modelo (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT UNIQUE, descricao TEXT, is_padrao INTEGER DEFAULT 0, ativo INTEGER DEFAULT 1)');
  await run('CREATE TABLE clausulas_modelo_itens (id INTEGER PRIMARY KEY AUTOINCREMENT, modelo_id INTEGER, ordem INTEGER, numero TEXT, titulo TEXT, conteudo TEXT)');
  await run('CREATE TABLE familias_produto (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, ativo INTEGER DEFAULT 1, clausulas_modelo_id INTEGER)');
  await run('CREATE TABLE proposta_itens (id INTEGER PRIMARY KEY AUTOINCREMENT, proposta_id INTEGER, descricao TEXT, familia_produto TEXT)');

  const eq = await run("INSERT INTO clausulas_modelo (nome, is_padrao) VALUES ('Equipamentos', 1)");
  idEquip = eq.lastID;
  const he = await run("INSERT INTO clausulas_modelo (nome, is_padrao) VALUES ('Hélices e Discos', 0)");
  idHelices = he.lastID;
  const semear = async (modeloId, lista) => {
    for (let i = 0; i < lista.length; i++) {
      await run('INSERT INTO clausulas_modelo_itens (modelo_id, ordem, numero, titulo, conteudo) VALUES (?, ?, ?, ?, ?)',
        [modeloId, i, lista[i].numero, lista[i].titulo, lista[i].conteudo]);
    }
  };
  await semear(idEquip, getClausulasDefault());
  await semear(idHelices, getClausulasHelices());

  await run("INSERT INTO familias_produto (nome, clausulas_modelo_id) VALUES ('MOINHO DE LABORATÓRIO (MLY)', NULL)");
  await run("INSERT INTO familias_produto (nome, clausulas_modelo_id) VALUES ('HÉLICES E IMPELIDORES', ?)", [idHelices]);
  await run("INSERT INTO familias_produto (nome, clausulas_modelo_id) VALUES ('DISCOS DISPERSORES', ?)", [idHelices]);

  console.log('\n[conteudo] os dois modelos existem e sao diferentes');
  const cEq = await all('SELECT numero, titulo FROM clausulas_modelo_itens WHERE modelo_id = ? ORDER BY ordem', [idEquip]);
  const cHe = await all('SELECT numero, titulo FROM clausulas_modelo_itens WHERE modelo_id = ? ORDER BY ordem', [idHelices]);
  t(`Equipamentos tem ${cEq.length} clausulas`, () => assert.strictEqual(cEq.length, getClausulasDefault().length));
  t(`Hélices e Discos tem ${cHe.length} clausulas`, () => assert.strictEqual(cHe.length, getClausulasHelices().length));
  t('helices NAO traz clausulas so de equipamento (startup, foro, aliciamento)', () => {
    const titulos = cHe.map((c) => c.titulo).join(' | ');
    ['STARTUP', 'FORO', 'ALICIAMENTO', 'CANCELAMENTO'].forEach((termo) =>
      assert(!titulos.includes(termo), `helices nao deveria ter ${termo}`));
  });
  t('helices numera dentro da estrutura de equipamentos (5.x), nao 4..13', () => {
    const numeros = cHe.map((c) => c.numero);
    assert(numeros.includes('5.1') && numeros.includes('5.8'), numeros.join(','));
    assert(!numeros.includes('13.'), 'ficou com a numeracao do PDF antigo');
  });
  t('as secoes estruturais NAO viraram clausula em helices', () => {
    const titulos = cHe.map((c) => c.titulo).join(' | ');
    // escopo, tabela de precos e tabela fiscal sao montados pelo template
    ['ESCOPO DE FORNECIMENTO', 'CLASSIFICAÇÃO FISCAL'].forEach((termo) =>
      assert(!titulos.includes(termo), `${termo} duplicaria o que o template ja monta`));
  });

  console.log('\n[escolha] proposta so de helices usa o contrato de helices');
  await addItem(1, 'HÉLICES E IMPELIDORES');
  const r1 = await resolverModelo(1);
  t('modelo resolvido = Hélices', () => assert.strictEqual(r1, idHelices));

  console.log('\n[escolha] proposta so de equipamento usa o padrao');
  await addItem(2, 'MOINHO DE LABORATÓRIO (MLY)');
  const r2 = await resolverModelo(2);
  t('modelo resolvido = Equipamentos', () => assert.strictEqual(r2, idEquip));

  console.log('\n[REGRA] misturando os dois, EQUIPAMENTO PREVALECE');
  await addItem(3, 'HÉLICES E IMPELIDORES');
  await addItem(3, 'MOINHO DE LABORATÓRIO (MLY)');
  const r3 = await resolverModelo(3);
  t('helice + equipamento -> Equipamentos', () => assert.strictEqual(r3, idEquip));
  // E a ordem dos itens nao pode mudar o resultado.
  await addItem(4, 'MOINHO DE LABORATÓRIO (MLY)');
  await addItem(4, 'DISCOS DISPERSORES');
  const r4 = await resolverModelo(4);
  t('equipamento + disco (ordem trocada) -> Equipamentos', () => assert.strictEqual(r4, idEquip));

  console.log('\n[bordas] o padrao e a rede de seguranca');
  await addItem(5, 'FAMILIA QUE NAO EXISTE NO CADASTRO');
  const r5 = await resolverModelo(5);
  t('familia desconhecida cai no padrao', () => assert.strictEqual(r5, idEquip));

  const r6 = await resolverModelo(999); // proposta sem itens
  t('proposta sem itens cai no padrao', () => assert.strictEqual(r6, idEquip));

  await addItem(7, 'HÉLICES E IMPELIDORES');
  await addItem(7, 'DISCOS DISPERSORES');
  const r7 = await resolverModelo(7);
  t('duas familias que apontam para o MESMO modelo mantem esse modelo',
    () => assert.strictEqual(r7, idHelices));

  await addItem(8, 'HÉLICES E IMPELIDORES');
  await addItem(8, '');
  const r8 = await resolverModelo(8);
  t('item sem familia puxa para o padrao (nao arrisca contrato curto)',
    () => assert.strictEqual(r8, idEquip));

  db.close(() => {
    try { fs.unlinkSync(arq); } catch (_) {}
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
})().catch((e) => { console.error(e); process.exit(1); });
