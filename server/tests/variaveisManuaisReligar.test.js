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
  // NAO-DESTRUTIVO: so reaponta o item_id de quem casou. Nada e apagado.
  const paraAtualizar = [];
  deIdAntigo.forEach((k, idAntigo) => {
    const idNovo = paraIdNovo.get(k);
    if (idNovo != null && String(idNovo) !== String(idAntigo)) paraAtualizar.push([idNovo, propostaId, idAntigo]);
  });
  for (const r of paraAtualizar) {
    await run("UPDATE OR REPLACE proposta_variaveis_manuais SET item_id = ? WHERE proposta_id = ? AND item_id = ?", r);
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

  console.log('\n[remocao] item excluido: valor some da proposta mas NAO do banco');
  // Mudanca deliberada de comportamento (nao e o teste se acomodando ao codigo): a versao
  // anterior apagava tudo e reinseria so o que casasse, entao uma falha de casamento
  // destruia os valores. A versao atual NUNCA apaga - so reaponta quem casou. O preco e
  // deixar a linha orfa no banco; o beneficio, abaixo, e que ela volta se o item voltar.
  await salvarProposta(2, [MASSEIRA], { comReligar: true });
  const semMoinho = await valoresVisiveis(2);
  t('removido o moinho, o valor dele nao aparece mais na proposta',
    () => assert.deepStrictEqual(semMoinho, []));
  const sobras = await all('SELECT COUNT(*) AS n FROM proposta_variaveis_manuais WHERE proposta_id = 2');
  t('a linha fica guardada (nada e destruido)', () => assert.strictEqual(sobras[0].n, 1));

  // NAO recupera ao readicionar o produto: removido o item, a linha perde a referencia e a
  // religacao nao tem como saber a que produto ela pertencia (a identidade vive na linha do
  // ITEM, que foi apagada). Fica registrado para ninguem prometer o contrario - so seria
  // possivel gravando a identidade do item junto do valor.
  await salvarProposta(2, [MASSEIRA, MOINHO], { comReligar: true });
  const readicionado = await valoresVisiveis(2);
  t('readicionar o produto NAO traz o texto de volta (limitacao conhecida)',
    () => assert.deepStrictEqual(readicionado, []));

  console.log('\n[ordem] a religacao precisa esperar os INSERTs terminarem');
  // Os INSERTs dos itens usam db.prepare/stmt.run, que NAO passa pela fila de escrita do
  // wrapDatabase (ela cobre run/get/all/exec). O SELECT dos ids novos usa db.all e passa.
  // Se a religacao rodar ANTES das insercoes, ela nao acha item nenhum e nao faz nada -
  // sem erro, com o mesmo sintoma do bug original. Este caso simula esse adiantamento.
  await run('DELETE FROM proposta_itens WHERE proposta_id = 4');
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
    [4, MOINHO.codigo_produto, MOINHO.descricao]);
  const item4 = (await all('SELECT id FROM proposta_itens WHERE proposta_id = 4'))[0].id;
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)',
    [4, item4, 'nota', 'Texto que nao pode sumir']);

  const antigos4 = await all('SELECT * FROM proposta_itens WHERE proposta_id = 4 ORDER BY id');
  await run('DELETE FROM proposta_itens WHERE proposta_id = 4');
  // Religa AGORA, com a tabela de itens ainda vazia (o adiantamento).
  await religar(4, antigos4);
  // So depois os itens sao inseridos, como o stmt.run faria fora da fila.
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
    [4, MOINHO.codigo_produto, MOINHO.descricao]);
  const adiantado = await valoresVisiveis(4);
  t('religar cedo demais perde o valor (por isso o codigo espera o finalize)',
    () => assert.deepStrictEqual(adiantado, [], 'sem itens na hora da religacao, nada e religado'));

  // Mesma sequencia, agora na ordem certa: insere e SO ENTAO religa.
  await run('DELETE FROM proposta_itens WHERE proposta_id = 5');
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
    [5, MOINHO.codigo_produto, MOINHO.descricao]);
  const item5 = (await all('SELECT id FROM proposta_itens WHERE proposta_id = 5'))[0].id;
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor) VALUES (?, ?, ?, ?)',
    [5, item5, 'nota', 'Texto que nao pode sumir']);
  await salvarProposta(5, [MOINHO, MASSEIRA], { comReligar: true });
  const naOrdem = await valoresVisiveis(5);
  t('esperando os INSERTs, o valor sobrevive',
    () => assert.deepStrictEqual(naOrdem, ['10-02-MLY-2-01:nota=Texto que nao pode sumir']));

  db.close(() => {
    try { fs.unlinkSync(arq); } catch (_) {}
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
})().catch((e) => { console.error(e); process.exit(1); });
