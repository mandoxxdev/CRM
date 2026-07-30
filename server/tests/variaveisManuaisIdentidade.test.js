/**
 * Variaveis manuais: o valor guarda A QUE PRODUTO pertence, e a LEITURA conserta.
 *
 * Relatado tres vezes (30/07/2026): "a variavel manual ainda segue sem ficar salva ao
 * adicionar ou remover algum item".
 *
 * As tentativas anteriores tentavam religar os ids no momento do SALVAMENTO. O problema
 * dessa abordagem e depender de a religacao rodar na hora exata e casar corretamente; se
 * qualquer coisa falhar, o valor fica orfao e o campo reabre em branco - sem erro nenhum.
 *
 * A causa estrutural e outra: o valor so sabia apontar para proposta_itens.id, e o salvar
 * da proposta APAGA e reinsere todos os itens, gerando ids novos. O vinculo dependia de um
 * identificador que o proprio sistema destroi a cada save.
 *
 * Correcao: gravar item_chave (identidade do produto) na propria linha do valor, e
 * consertar na LEITURA - preview e PDF reapontam sozinhos o que estiver orfao. Assim o
 * valor aparece mesmo que a religacao no salvamento nunca tenha acontecido.
 *
 * Executar: node tests/variaveisManuaisIdentidade.test.js
 */
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const sqlite3 = require('sqlite3');

const arq = path.join(os.tmpdir(), `vm-identidade-${Date.now()}.sqlite`);
const db = new sqlite3.Database(arq);

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

// Copia fiel de repararVariaveisManuais (server/index.js).
function repararVariaveisManuais(vmRows, itens) {
  if (!Array.isArray(vmRows) || vmRows.length === 0) return vmRows || [];
  const lista = Array.isArray(itens) ? itens : [];
  const idsAtuais = new Set(lista.map((i) => String(i.id)));
  if (vmRows.every((v) => idsAtuais.has(String(v.item_id)))) return vmRows;
  const identidade = (it) => String(
    (it.codigo_produto && String(it.codigo_produto).trim())
    || (it.descricao && String(it.descricao).trim())
    || (it.nome && String(it.nome).trim()) || ''
  );
  const contador = new Map();
  const porChave = new Map();
  lista.forEach((it) => {
    const base = identidade(it);
    if (!base) return;
    const n = (contador.get(base) || 0) + 1;
    contador.set(base, n);
    porChave.set(base + '#' + n, it.id);
  });
  const usados = new Map();
  return vmRows.map((v) => {
    if (idsAtuais.has(String(v.item_id))) return v;
    const base = String(v.item_chave || '').trim();
    if (!base) return v;
    const n = (usados.get(base) || 0) + 1;
    usados.set(base, n);
    const novoId = porChave.get(base + '#' + n);
    return novoId != null ? { ...v, item_id: novoId } : v;
  });
}

// Como o template monta o mapa: "<item_id>:<chave>".
const comoOTemplateVe = (vmRows, itens) => {
  const reparado = repararVariaveisManuais(vmRows, itens);
  const porId = new Map(itens.map((i) => [String(i.id), i]));
  return reparado
    .filter((v) => porId.has(String(v.item_id)))
    .map((v) => `${porId.get(String(v.item_id)).codigo_produto}:${v.chave}=${v.valor}`)
    .sort();
};

// Salvar a proposta: apaga e reinsere TODOS os itens (o que troca os ids).
async function salvarPropostaSemReligarNada(propostaId, itensNovos) {
  await run('DELETE FROM proposta_itens WHERE proposta_id = ?', [propostaId]);
  for (const it of itensNovos) {
    await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
      [propostaId, it.codigo_produto, it.descricao]);
  }
  return all('SELECT * FROM proposta_itens WHERE proposta_id = ? ORDER BY id', [propostaId]);
}

const MOINHO = { codigo_produto: '10-02-MLY-2-01', descricao: 'MOINHO DE LABORATORIO MLY' };
const MASSEIRA = { codigo_produto: '20-01-MHY-30-01', descricao: 'MASSEIRA HELICOIDAL ATM' };

(async () => {
  await run('CREATE TABLE proposta_itens (id INTEGER PRIMARY KEY AUTOINCREMENT, proposta_id INTEGER, codigo_produto TEXT, descricao TEXT)');
  await run(`CREATE TABLE proposta_variaveis_manuais (
    id INTEGER PRIMARY KEY AUTOINCREMENT, proposta_id INTEGER NOT NULL, item_id INTEGER NOT NULL,
    chave TEXT NOT NULL, valor TEXT NOT NULL DEFAULT '', item_chave TEXT,
    UNIQUE(proposta_id, item_id, chave))`);

  // Proposta com o moinho; o vendedor preenche a nota tecnica no preview.
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)',
    [1, MOINHO.codigo_produto, MOINHO.descricao]);
  const item1 = (await all('SELECT id FROM proposta_itens WHERE proposta_id = 1'))[0].id;
  // O upsert grava a identidade junto (mesma expressao SQL da rota).
  await run(`INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave)
             VALUES (?, ?, ?, ?, (SELECT COALESCE(NULLIF(TRIM(pi.codigo_produto), ''), NULLIF(TRIM(pi.descricao), ''))
                                    FROM proposta_itens pi WHERE pi.id = ?))`,
    [1, item1, 'nota_tecnica', 'A produtividade varia conforme o elemento de moagem.', item1]);

  console.log('\n[gravacao] a identidade do produto fica junto do valor');
  const gravado = (await all('SELECT item_chave FROM proposta_variaveis_manuais WHERE proposta_id = 1'))[0];
  t('item_chave preenchido a partir do item',
    () => assert.strictEqual(gravado.item_chave, MOINHO.codigo_produto));

  console.log('\n[o caso relatado] ADICIONAR um produto, sem religar nada no salvamento');
  let itens = await salvarPropostaSemReligarNada(1, [MOINHO, MASSEIRA]);
  let vm = await all('SELECT item_id, chave, valor, item_chave FROM proposta_variaveis_manuais WHERE proposta_id = 1');
  t('o valor ficou orfao no banco (id antigo)',
    () => assert(!itens.some((i) => String(i.id) === String(vm[0].item_id))));
  t('mesmo assim a proposta MOSTRA o valor (conserto na leitura)',
    () => assert.deepStrictEqual(comoOTemplateVe(vm, itens),
      ['10-02-MLY-2-01:nota_tecnica=A produtividade varia conforme o elemento de moagem.']));
  t('o produto novo nao herda valor nenhum',
    () => assert(!comoOTemplateVe(vm, itens).some((l) => l.startsWith(MASSEIRA.codigo_produto))));

  console.log('\n[o caso relatado] REMOVER um produto');
  itens = await salvarPropostaSemReligarNada(1, [MASSEIRA]);
  vm = await all('SELECT item_id, chave, valor, item_chave FROM proposta_variaveis_manuais WHERE proposta_id = 1');
  t('removido o moinho, o valor dele nao aparece',
    () => assert.deepStrictEqual(comoOTemplateVe(vm, itens), []));

  console.log('\n[recuperacao] readicionar o produto TRAZ o texto de volta');
  // Isto e o que a abordagem por id nunca conseguiu: a identidade sobrevive ao item.
  itens = await salvarPropostaSemReligarNada(1, [MASSEIRA, MOINHO]);
  vm = await all('SELECT item_id, chave, valor, item_chave FROM proposta_variaveis_manuais WHERE proposta_id = 1');
  t('o texto digitado volta ao reaparecer o produto',
    () => assert.deepStrictEqual(comoOTemplateVe(vm, itens),
      ['10-02-MLY-2-01:nota_tecnica=A produtividade varia conforme o elemento de moagem.']));

  console.log('\n[itens iguais] dois produtos identicos nao trocam de valor');
  await run('DELETE FROM proposta_itens WHERE proposta_id = 2');
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)', [2, MOINHO.codigo_produto, MOINHO.descricao]);
  await run('INSERT INTO proposta_itens (proposta_id, codigo_produto, descricao) VALUES (?, ?, ?)', [2, MOINHO.codigo_produto, MOINHO.descricao]);
  const dois = await all('SELECT id FROM proposta_itens WHERE proposta_id = 2 ORDER BY id');
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave) VALUES (?, ?, ?, ?, ?)',
    [2, dois[0].id, 'nota', 'PRIMEIRO', MOINHO.codigo_produto]);
  await run('INSERT INTO proposta_variaveis_manuais (proposta_id, item_id, chave, valor, item_chave) VALUES (?, ?, ?, ?, ?)',
    [2, dois[1].id, 'nota', 'SEGUNDO', MOINHO.codigo_produto]);
  const itens2 = await salvarPropostaSemReligarNada(2, [MOINHO, MOINHO]);
  const vm2 = await all('SELECT item_id, chave, valor, item_chave FROM proposta_variaveis_manuais WHERE proposta_id = 2 ORDER BY id');
  const reparado2 = repararVariaveisManuais(vm2, itens2);
  t('cada copia mantem o SEU valor, na ordem',
    () => assert.deepStrictEqual(
      reparado2.map((v) => v.valor),
      ['PRIMEIRO', 'SEGUNDO']));
  t('e cada uma aponta para um item diferente',
    () => assert.strictEqual(new Set(reparado2.map((v) => String(v.item_id))).size, 2));

  console.log('\n[seguranca] o conserto nao inventa nem estraga nada');
  t('linha sem identidade gravada (dado antigo) e deixada como esta', () => {
    const semChave = [{ item_id: 999, chave: 'x', valor: 'v', item_chave: null }];
    assert.deepStrictEqual(repararVariaveisManuais(semChave, itens2), semChave);
  });
  t('sem orfaos, a lista volta identica (nao mexe no que ja esta certo)', () => {
    const okRows = [{ item_id: itens2[0].id, chave: 'x', valor: 'v', item_chave: MOINHO.codigo_produto }];
    assert.strictEqual(repararVariaveisManuais(okRows, itens2), okRows);
  });
  t('identidade que nao existe mais entre os itens nao vira valor de outro produto', () => {
    const perdida = [{ item_id: 999, chave: 'x', valor: 'v', item_chave: 'PRODUTO-QUE-SUMIU' }];
    const r = repararVariaveisManuais(perdida, itens2);
    assert.strictEqual(String(r[0].item_id), '999', 'deveria continuar orfa, e nao adotar outro item');
  });
  t('lista vazia nao quebra', () => assert.deepStrictEqual(repararVariaveisManuais([], itens2), []));

  db.close(() => {
    try { fs.unlinkSync(arq); } catch (_) {}
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
})().catch((e) => { console.error(e); process.exit(1); });
