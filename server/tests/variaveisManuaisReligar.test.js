/**
 * Variaveis manuais sobrevivendo ao salvamento da proposta.
 *
 * BUG (relatado em 30/07/2026): "as variaveis manuais ficam ao salvar, ate ai ok. Porem
 * quando eu adiciono outro item a proposta, no caso outro produto, elas zeram".
 *
 * Causa: proposta_variaveis_manuais e chaveada por item_id, e o PUT /api/propostas/:id faz
 * DELETE FROM proposta_itens seguido de re-INSERT de TODOS os itens. Os itens voltam com
 * ids novos (AUTOINCREMENT), e os valores continuam apontando para os ids antigos - viram
 * orfaos, e o template renderiza os campos em branco.
 *
 * Por isso o bug parecia intermitente: salvar sem mexer nos itens tambem apaga e reinsere,
 * mas quando a lista e a mesma o efeito so aparece porque os ids MUDAM de qualquer jeito.
 * Este teste comeca provando exatamente isso (os ids mudam), para o motivo ficar registrado.
 *
 * Correcao: religar os valores pela mesma identidade que a mesclagem e a auditoria ja usam
 * (chaveDe = codigo_produto || descricao || nome), com indice de ocorrencia para nao trocar
 * valores entre dois itens iguais.
 *
 * Executar: node tests/variaveisManuaisReligar.test.js
 */
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const { chaveDe } = require('../propostaItensDiff');

const arq = path.join(os.tmpdir(), `vm-religar-${Date.now()}.sqlite`);
const db = new sqlite3.Database(arq);

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

// Copia fiel de religarVariaveisManuais (server/index.js, PUT /api/propostas/:id).
async function religar(propostaId, itensAntigos) {
  if (!itensAntigos.length) return;
  const chavesComOrdinal = (lista) => {
    const contador = new Map();
    return lista.map((it) => {
      const base = chaveDe(it);
      const n = (contador.get(base) || 0) + 1;
      contador.set(base, n);
      return base + '#' + n;
    });
  };
  const valores = await all('SELECT item_id, chave, valor FROM proposta_variaveis_manuais WHERE proposta_id = ?', [propostaId]);
  if (!valores.length) return;
  const deIdAntigo = new Map();
  chavesComOrdinal(itensAntigos).forEach((k, i) => deIdAntigo.set(String(itensAntigos[i].id), k));
  const novos = await all('SELECT id, codigo_produto, descricao FROM proposta_itens WHERE proposta_id = ? ORDER BY id ASC', [propostaId]);
  if (!novos.length) return;
  const paraIdNovo = new Map();
  chavesComOrdinal(novos).forEach((k, i) => paraIdNovo.set(k, novos[i].id));
  const remapeados = [];
  valores.forEach((v) => {
    const k = deIdAntigo.get(String(v.item_id));
    const novoItemId = k ? paraIdNovo.get(k) : null;
    if (novoItemId != null && String(v.valor == null ? '' : v.valor).trim() !== '') {
      remapeados.push([propostaId, novoItemId, v.chave, v.valor]);
    }
  });
  await run('DELETE FROM proposta_variaveis_manuais WHERE proposta_id = ?', [propostaId]);
  for (const r of remapeados) {
    await run('INSERT OR REPLACE INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)', r);
  }
}

// O que o PUT faz com os itens: apaga tudo e reinsere.
async function salvarProposta(propostaId, itensNovos, { comReligar }) {
  const antigos = await all('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [propostaId]);
  await run('DELETE FROM proposta_itens WHERE proposta_id = ?', [propostaId]);
  for (const it of itensNovos) {
    await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
      [propostaId, it.codigo_produto || null, it.descricao || null]);
  }
  if (comReligar) await religar(propostaId, antigos);
  return antigos;
}

const valoresVisiveis = async (propostaId) => {
  // Como o template le: casa vm.item_id com o id ATUAL do item.
  const linhas = await all(`SELECT pi.codigo_produto AS cod, vm.chave, vm.valor
                              FROM proposta_variaveis_manuais vm
                              JOIN proposta_itens pi ON pi.id = vm.item_id
                             WHERE vm.proposta_id = ?
                             ORDER BY pi.id, vm.chave`, [propostaId]);
  return linhas.map((l) => `${l.cod}:${l.chave}=${l.valor}`);
};

(async () => {
  await run('CREATE TABLE proposta_itens (id INTEGER PRIMARY KEY AUTOINCREMENT, proposta_id INTEGER, codigo_produto TEXT, descricao TEXT)');
  await run(`CREATE TABLE proposta_variaveis_manuais (
    id INTEGER PRIMARY KEY AUTOINCREMENT, proposta_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
    chave TEXT NOT NULL, valor TEXT NOT NULL DEFAULT '', UNIQUE(proposta_id, item_id, chave))`);

  const MOINHO = { codigo_produto: '10-02-MLY-2-01', descricao: 'MOINHO DE LABORATORIO MLY' };
  const MASSEIRA = { codigo_produto: '20-01-MHY-30-01', descricao: 'MASSEIRA HELICOIDAL ATM' };

  // Proposta com 1 item e duas variaveis manuais preenchidas no preview.
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
    [1, MOINHO.codigo_produto, MOINHO.descricao]);
  const itemInicial = (await all('SELECT id FROM proposta_itens WHERE proposta_id = 1'))[0].id;
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)',
    [1, itemInicial, 'nota_tecnica', 'A produtividade varia conforme o elemento de moagem.']);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)',
    [1, itemInicial, 'produto_processado', 'Tinta base solvente']);

  console.log('\n[causa] o re-INSERT troca os ids dos itens');
  const antesDoSave = (await all('SELECT id FROM proposta_itens WHERE proposta_id = 1')).map((r) => r.id);
  await salvarProposta(1, [MOINHO], { comReligar: false });
  const depoisDoSave = (await all('SELECT id FROM proposta_itens WHERE proposta_id = 1')).map((r) => r.id);
  t('os ids realmente mudam ao salvar (a raiz do bug)',
    () => assert.notDeepStrictEqual(antesDoSave, depoisDoSave));
  const orfaos = await valoresVisiveis(1);
  t('SEM religar: a proposta reabre com os campos em branco',
    () => assert.deepStrictEqual(orfaos, [], 'deveria estar vazio (valores orfaos)'));

  console.log('\n[correcao] o caso relatado: adicionar outro produto');
  // Recomeca com os valores preenchidos.
  await run('DELETE FROM proposta_itens WHERE proposta_id = 2');
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
    [2, MOINHO.codigo_produto, MOINHO.descricao]);
  const item2 = (await all('SELECT id FROM proposta_itens WHERE proposta_id = 2'))[0].id;
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)',
    [2, item2, 'nota_tecnica', 'Texto do moinho']);

  // Salva ACRESCENTANDO a masseira — exatamente o que o usuario faz.
  await salvarProposta(2, [MOINHO, MASSEIRA], { comReligar: true });
  const depois = await valoresVisiveis(2);
  t('valor preservado apos adicionar outro produto',
    () => assert.deepStrictEqual(depois, ['10-02-MLY-2-01:nota_tecnica=Texto do moinho']));
  t('o item novo nao herda valor nenhum',
    () => assert(!depois.some((l) => l.startsWith(MASSEIRA.codigo_produto))));

  console.log('\n[ordem] reordenar itens nao troca os valores de lugar');
  await salvarProposta(2, [MASSEIRA, MOINHO], { comReligar: true });
  const reordenado = await valoresVisiveis(2);
  t('o valor continua no MOINHO, mesmo ele virando o segundo item',
    () => assert.deepStrictEqual(reordenado, ['10-02-MLY-2-01:nota_tecnica=Texto do moinho']));

  console.log('\n[itens iguais] dois produtos identicos na mesma proposta');
  await run('DELETE FROM proposta_itens WHERE proposta_id = 3');
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)', [3, MOINHO.codigo_produto, MOINHO.descricao]);
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)', [3, MOINHO.codigo_produto, MOINHO.descricao]);
  const doisIguais = await all('SELECT id FROM proposta_itens WHERE proposta_id = 3 ORDER BY id');
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)', [3, doisIguais[0].id, 'nota', 'PRIMEIRO']);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)', [3, doisIguais[1].id, 'nota', 'SEGUNDO']);
  await salvarProposta(3, [MOINHO, MOINHO], { comReligar: true });
  const iguais = await all(`SELECT vm.valor FROM proposta_variaveis_manuais vm
                              JOIN proposta_itens pi ON pi.id = vm.item_id
                             WHERE vm.proposta_id = 3 ORDER BY pi.id`, []);
  t('cada copia mantem o SEU valor (o ordinal evita a troca)',
    () => assert.deepStrictEqual(iguais.map((r) => r.valor), ['PRIMEIRO', 'SEGUNDO']));

  console.log('\n[remocao] item excluido leva o valor junto');
  await salvarProposta(2, [MASSEIRA], { comReligar: true });
  const semMoinho = await valoresVisiveis(2);
  t('removido o moinho, o valor dele nao fica sobrando',
    () => assert.deepStrictEqual(semMoinho, []));
  const sobras = await all('SELECT COUNT(*) AS n FROM proposta_variaveis_manuais WHERE proposta_id = 2');
  t('e nao sobra linha orfa no banco', () => assert.strictEqual(sobras[0].n, 0));

  db.close(() => {
    try { fs.unlinkSync(arq); } catch (_) {}
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
})().catch((e) => { console.error(e); process.exit(1); });
