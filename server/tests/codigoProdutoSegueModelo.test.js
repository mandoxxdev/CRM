/**
 * Trocar o MODELO troca a serie do codigo do produto.
 *
 * Pedido (02/08/2026), depois de clonar um produto: "ao clonar ele sobe como se o codigo
 * fosse um +1 do que foi clonado, ate ai esta certo, mas se eu mudar o modelo, como estou
 * fazendo ali, ele deve atualizar o codigo automaticamente". No print, o clone estava com
 * codigo 60-01-DHY-10-02 e modelo ja trocado para DHY-80 - codigo descrevendo o modelo
 * errado.
 *
 * A correcao de interface foi soltar a regeneracao na EDICAO (o formulario so regenerava em
 * cadastro novo). Quem monta o codigo, porem, e /api/produtos/proximo-codigo, e e ele que
 * este teste exercita: e o servidor que decide a serie, o formulario so pergunta.
 *
 * Formato: {numero do grupo}-{posicao da familia no grupo}-{MODELO}-{sequencial}.
 *
 * Executar: node tests/codigoProdutoSegueModelo.test.js
 */
const assert = require('assert');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');
const { resolveJwtSecret } = require('../services/runtimeSecrets');

const PORTA = 5125;
const RAIZ = path.join(__dirname, '..');
const BANCO = path.join(RAIZ, 'data', 'database.sqlite');
const MARCA = 'ZZMOD';
const FAMILIA = 'ZZMOD FAMILIA DE TESTE';

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const db = new sqlite3.Database(BANCO);
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));

function pedir(caminho, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: 'localhost', port: PORTA, path: caminho, method: 'GET',
      headers: { Authorization: 'Bearer ' + token },
    }, (res) => {
      let txt = '';
      res.on('data', (c) => { txt += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(txt); } catch (_) { json = { bruto: txt.slice(0, 200) }; }
        resolve({ status: res.statusCode, body: json });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const proximo = (token, modelo) =>
  pedir('/api/produtos/proximo-codigo?familia=' + encodeURIComponent(FAMILIA)
        + '&modelo=' + encodeURIComponent(modelo) + '&nome=' + encodeURIComponent('PRODUTO DE TESTE'), token);

async function limpar() {
  // Os produtos de teste precisam ter o codigo no FORMATO REAL (77-01-ZZ-10-01) para o
  // endpoint conta-los, entao nao da para marca-los pelo codigo. A familia e que serve de
  // marca - ela e exclusiva deste teste.
  await run('DELETE FROM produtos WHERE familia = ?', [FAMILIA]);
  await run("DELETE FROM produtos WHERE codigo LIKE ?", [MARCA + '%']);
  await run('DELETE FROM familias_produto WHERE nome = ?', [FAMILIA]);
  await run('DELETE FROM grupos_produto WHERE nome = ?', [MARCA + ' GRUPO']);
  await run('DELETE FROM usuarios WHERE id = 9301');
}

let servidor = null;

(async () => {
  await limpar();

  const grupo = await run("INSERT INTO grupos_produto (nome, numero, ativo) VALUES (?, 77, 1)", [MARCA + ' GRUPO']);
  await run('INSERT INTO familias_produto (nome, ordem, ativo, grupo_id, codigo) VALUES (?, 0, 1, ?, 9700)',
    [FAMILIA, grupo.lastID]);

  // Serie ZZ-10 com uma LACUNA: existe 01 e 03, nao existe 02. Se o servidor contasse em vez
  // de olhar o maior, devolveria 03 e colidiria com um codigo ja em uso.
  const addProduto = (codigo, modelo) => run(
    "INSERT INTO produtos (codigo, nome, familia, modelo, preco_base, ativo) VALUES (?, 'PRODUTO DE TESTE', ?, ?, 100, 1)",
    [codigo, FAMILIA, modelo]);

  await run("INSERT INTO usuarios (id, nome, email, senha, role, ativo) VALUES (9301, 'ZZMOD ADMIN', 'a9301@x', 'x', 'admin', 1)");
  const segredo = resolveJwtSecret(process.env.PERSISTENT_DATA_DIR || path.join(RAIZ, 'data'));
  const token = jwt.sign({ id: 9301, email: 'a9301@x', role: 'admin' }, segredo, { expiresIn: '1h' });

  servidor = spawn(process.execPath, ['index.js'], {
    cwd: RAIZ, env: Object.assign({}, process.env, { PORT: String(PORTA) }), stdio: 'ignore',
  });
  // A porta abre ANTES do banco; nesse intervalo o app responde 503 DB_STARTING.
  let subiu = false;
  for (let i = 0; i < 120 && !subiu; i++) {
    await esperar(500);
    try { const r = await pedir('/api/produtos', token); subiu = r.status && r.status !== 503; }
    catch (_) { /* porta ainda fechada */ }
  }
  if (!subiu) throw new Error('o servidor nao ficou pronto na porta ' + PORTA + ' em 60s');

  // O prefixo depende da posicao da familia no grupo; como o grupo e novo e so tem esta
  // familia, a posicao e 01. Numero do grupo = 77.
  const PREFIXO = '77-01';

  console.log('\n[serie vazia comeca no 01]');
  const vazia = await proximo(token, 'ZZ-10');
  t('primeiro produto do modelo ZZ-10',
    () => assert.strictEqual(vazia.body.codigo, PREFIXO + '-ZZ-10-01', JSON.stringify(vazia.body)));

  await addProduto(PREFIXO + '-ZZ-10-01', 'ZZ-10');
  await addProduto(PREFIXO + '-ZZ-10-03', 'ZZ-10');
  // Serie VIZINHA cujo prefixo comeca igual: nao pode ser contada como ZZ-10.
  await addProduto(PREFIXO + '-ZZ-10-2-07', 'ZZ-10-2');

  console.log('\n[a serie continua do MAIOR, nao da contagem]');
  const dez = await proximo(token, 'ZZ-10');
  t('com 01 e 03 na serie, o proximo e 04',
    () => assert.strictEqual(dez.body.codigo, PREFIXO + '-ZZ-10-04', JSON.stringify(dez.body)));
  t('NAO reaproveita a lacuna do 02',
    () => assert.notStrictEqual(dez.body.codigo, PREFIXO + '-ZZ-10-02'));
  t('a serie vizinha ZZ-10-2 nao contamina a contagem',
    () => assert(!dez.body.codigo.includes('-2-'), dez.body.codigo));

  console.log('\n[TROCAR O MODELO TROCA A SERIE - o pedido do usuario]');
  const oitenta = await proximo(token, 'ZZ-80');
  t('modelo ZZ-80 gera codigo de outra serie',
    () => assert.strictEqual(oitenta.body.codigo, PREFIXO + '-ZZ-80-01', JSON.stringify(oitenta.body)));
  t('e o codigo realmente MUDA em relacao ao modelo anterior',
    () => assert.notStrictEqual(oitenta.body.codigo, dez.body.codigo));
  t('o modelo aparece dentro do codigo',
    () => assert(oitenta.body.codigo.includes('-ZZ-80-'), oitenta.body.codigo));

  console.log('\n[bordas]');
  const semModelo = await proximo(token, '');
  t('sem modelo, devolve vazio em vez de um codigo de rascunho',
    () => assert.strictEqual(semModelo.body.codigo, '', JSON.stringify(semModelo.body)));
  const semFamilia = await pedir('/api/produtos/proximo-codigo?familia=' + encodeURIComponent('FAMILIA QUE NAO EXISTE')
    + '&modelo=ZZ-10&nome=X', token);
  t('familia desconhecida devolve vazio e avisa', () => {
    assert.strictEqual(semFamilia.body.codigo, '');
    assert(semFamilia.body.aviso, 'deveria vir um aviso explicando');
  });

  if (servidor) servidor.kill();
  await limpar();
  const sobrouProduto = await get("SELECT COUNT(*) n FROM produtos WHERE familia = ?", [FAMILIA]);
  const sobrouFamilia = await get('SELECT COUNT(*) n FROM familias_produto WHERE nome = ?', [FAMILIA]);
  t('os dados de teste foram removidos do banco',
    () => assert.strictEqual(sobrouProduto.n + sobrouFamilia.n, 0));

  db.close(() => {
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
})().catch(async (e) => {
  console.error(e);
  if (servidor) servidor.kill();
  try { await limpar(); } catch (_) {}
  process.exit(1);
});
