/**
 * Clonar produto: POST /api/produtos/:id/clonar
 *
 * Pedido (02/08/2026), logo depois do clone de familia: "Na aba de produtos, tmb deve ter um
 * botao de clonar". Mesma regra de permissao combinada la: so admin.
 *
 * O PONTO DELICADO E O CODIGO. produtos.codigo e UNIQUE e segue o padrao
 * {grupo}-{posicao da familia}-{MODELO}-{sequencial}, por exemplo 60-01-DHY-10-01. O clone
 * tira o sequencial e usa o MAIOR ja existente naquela serie + 1 - MAX, nunca COUNT, senao
 * excluir um produto faria o proximo reaproveitar um numero ja impresso em proposta.
 *
 * A IMAGEM E DUPLICADA, nunca compartilhada. Isso aqui nao e zelo teorico: no clone de
 * familia eu compartilhei o arquivo, e o usuario perdeu a foto da familia original ao trocar
 * a da copia - a rota de upload apaga o arquivo antigo. A rota de imagem de produto tem
 * exatamente o mesmo unlink, entao a ultima secao deste teste percorre esse caminho inteiro.
 *
 * Executar: node tests/clonarProduto.test.js
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');
const { resolveJwtSecret } = require('../services/runtimeSecrets');

const PORTA = 5124;
const RAIZ = path.join(__dirname, '..');
const BANCO = path.join(RAIZ, 'data', 'database.sqlite');
// De config/paths, nao montado a mao: o diretorio real fica sob PERSISTENT_DATA_DIR, e
// escrever no lugar errado faz a checagem de arquivo passar sem provar nada.
const DIR_IMAGENS = require('../config/paths').uploadsProdutosDir;
const MARCA = 'ZZTST';
const IMG_ORIGEM = 'zzteste-produto-origem.png';

let ok = 0, total = 0;
const t = (nome, fn) => {
  total++;
  try { fn(); ok++; console.log('  OK   ' + nome); }
  catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); }
};

const db = new sqlite3.Database(BANCO);
const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
const get = (sql, p = []) => new Promise((res, rej) => db.get(sql, p, (e, r) => e ? rej(e) : res(r)));
const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r || [])));

function pedir(caminho, token, corpo, metodo) {
  return new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = http.request({
      host: 'localhost', port: PORTA, path: caminho, method: metodo || (corpo ? 'POST' : 'GET'),
      headers: Object.assign(
        { Authorization: 'Bearer ' + token },
        dados ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(dados) } : {}
      ),
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
    if (dados) req.write(dados);
    req.end();
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const apagarArquivo = (arquivo) => {
  if (!arquivo) return;
  try {
    const caminho = path.join(DIR_IMAGENS, arquivo);
    if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
  } catch (_) { /* nao derruba a limpeza */ }
};

async function limpar() {
  const produtos = await all("SELECT imagem FROM produtos WHERE codigo LIKE ?", [MARCA + '%']);
  produtos.forEach((p) => apagarArquivo(p.imagem));
  apagarArquivo(IMG_ORIGEM);
  await run("DELETE FROM produtos WHERE codigo LIKE ?", [MARCA + '%']);
  await run('DELETE FROM usuarios WHERE id IN (9201, 9202)');
}

let servidor = null;

(async () => {
  await limpar();

  if (!fs.existsSync(DIR_IMAGENS)) fs.mkdirSync(DIR_IMAGENS, { recursive: true });
  fs.writeFileSync(path.join(DIR_IMAGENS, IMG_ORIGEM), Buffer.from('imagem da origem'));

  // Serie com uma lacuna DE PROPOSITO: existe o 01 e o 03, nao existe o 02. Se o codigo novo
  // sair como 02 (COUNT em vez de MAX) ele colide com um numero que ja circulou em proposta.
  const origem = await run(
    `INSERT INTO produtos (codigo, nome, descricao, familia, modelo, preco_base, icms, ipi, ncm,
                           especificacoes_tecnicas, imagem, ativo, classificacao_area)
     VALUES (?, 'DISPERSOR DE TESTE', 'DESCRICAO DE TESTE', 'FAMILIA DE TESTE', 'ZZ-10',
             145196.88, 12, 5, '8479.82.90', 'ESPECIFICACAO TECNICA', ?, 1, 'ÁREA CLASSIFICADA (ATEX)')`,
    [MARCA + '-01-ZZ-10-01', IMG_ORIGEM]
  );
  const origemId = origem.lastID;
  await run(
    `INSERT INTO produtos (codigo, nome, familia, modelo, preco_base, ativo)
     VALUES (?, 'IRMAO', 'FAMILIA DE TESTE', 'ZZ-10', 100, 1)`,
    [MARCA + '-01-ZZ-10-03']
  );
  // Produto de OUTRA serie, cujo prefixo comeca igual: nao pode influenciar a contagem.
  await run(
    `INSERT INTO produtos (codigo, nome, familia, modelo, preco_base, ativo)
     VALUES (?, 'OUTRA SERIE', 'FAMILIA DE TESTE', 'ZZ-10-2', 100, 1)`,
    [MARCA + '-01-ZZ-10-2-07']
  );
  // Cadastro antigo, codigo sem sequencial numerico.
  const legado = await run(
    `INSERT INTO produtos (codigo, nome, familia, modelo, preco_base, ativo)
     VALUES (?, 'LEGADO', 'FAMILIA DE TESTE', 'ZZ-10', 100, 1)`,
    [MARCA + 'LEGADO']
  );

  await run("INSERT INTO usuarios (id, nome, email, senha, role, ativo) VALUES (9201, 'ZZTST ADMIN', 'a9201@x', 'x', 'admin', 1)");
  await run("INSERT INTO usuarios (id, nome, email, senha, role, ativo) VALUES (9202, 'ZZTST COMUM', 'u9202@x', 'x', 'usuario', 1)");

  const segredo = resolveJwtSecret(process.env.PERSISTENT_DATA_DIR || path.join(RAIZ, 'data'));
  const tokenAdmin = jwt.sign({ id: 9201, email: 'a9201@x', role: 'admin' }, segredo, { expiresIn: '1h' });
  const tokenComum = jwt.sign({ id: 9202, email: 'u9202@x', role: 'usuario' }, segredo, { expiresIn: '1h' });

  servidor = spawn(process.execPath, ['index.js'], {
    cwd: RAIZ, env: Object.assign({}, process.env, { PORT: String(PORTA) }), stdio: 'ignore',
  });
  // A porta abre ANTES do banco: nesse intervalo o app responde 503 DB_STARTING. Esperar so
  // a porta faz o teste bater na janela errada.
  let subiu = false;
  for (let i = 0; i < 120 && !subiu; i++) {
    await esperar(500);
    try {
      const r = await pedir('/api/produtos', tokenAdmin);
      subiu = r.status && r.status !== 503;
    } catch (_) { /* porta ainda fechada */ }
  }
  if (!subiu) throw new Error('o servidor nao ficou pronto na porta ' + PORTA + ' em 60s');

  console.log('\n[permissao: o servidor recusa, nao so o botao some]');
  const negado = await pedir(`/api/produtos/${origemId}/clonar`, tokenComum, {});
  t('usuario comum recebe 403', () => assert.strictEqual(negado.status, 403));
  const nadaCriado = await get("SELECT COUNT(*) n FROM produtos WHERE codigo LIKE ?", [MARCA + '%']);
  t('e nenhum produto foi criado', () => assert.strictEqual(nadaCriado.n, 4));

  console.log('\n[o codigo novo]');
  const r = await pedir(`/api/produtos/${origemId}/clonar`, tokenAdmin, {});
  t('admin consegue clonar', () => assert.strictEqual(r.status, 200, JSON.stringify(r.body)));
  t('o codigo continua na serie da origem, apos o MAIOR (03 -> 04)',
    () => assert.strictEqual(r.body.codigo, MARCA + '-01-ZZ-10-04'));
  t('NAO reaproveita a lacuna do 02 (seria MAX vs COUNT)',
    () => assert.notStrictEqual(r.body.codigo, MARCA + '-01-ZZ-10-02'));
  t('a resposta diz de qual produto veio',
    () => assert.strictEqual(r.body.clonado_de, MARCA + '-01-ZZ-10-01'));

  console.log('\n[o cadastro veio junto]');
  const clone = await get('SELECT * FROM produtos WHERE id = ?', [r.body.id]);
  t('nome', () => assert.strictEqual(clone.nome, 'DISPERSOR DE TESTE'));
  t('descricao', () => assert.strictEqual(clone.descricao, 'DESCRICAO DE TESTE'));
  t('familia', () => assert.strictEqual(clone.familia, 'FAMILIA DE TESTE'));
  t('modelo', () => assert.strictEqual(clone.modelo, 'ZZ-10'));
  t('preco base', () => assert.strictEqual(clone.preco_base, 145196.88));
  t('icms e ipi', () => { assert.strictEqual(clone.icms, 12); assert.strictEqual(clone.ipi, 5); });
  t('ncm', () => assert.strictEqual(clone.ncm, '8479.82.90'));
  t('especificacoes tecnicas', () => assert.strictEqual(clone.especificacoes_tecnicas, 'ESPECIFICACAO TECNICA'));
  t('classificacao de area', () => assert.strictEqual(clone.classificacao_area, 'ÁREA CLASSIFICADA (ATEX)'));
  t('nasce ativo', () => assert.strictEqual(clone.ativo, 1));
  t('id proprio', () => assert.notStrictEqual(clone.id, origemId));

  console.log('\n[serie vizinha nao contamina]');
  t('o produto ZZ-10-2-07 (outra serie) nao virou 08',
    () => assert(!String(r.body.codigo).includes('-2-'), r.body.codigo));

  console.log('\n[codigo fora do padrao]');
  const rLegado = await pedir(`/api/produtos/${legado.lastID}/clonar`, tokenAdmin, {});
  t('clona mesmo assim', () => assert.strictEqual(rLegado.status, 200, JSON.stringify(rLegado.body)));
  t('gera codigo unico a partir do proprio', () => assert.strictEqual(rLegado.body.codigo, MARCA + 'LEGADO-01'));
  t('e AVISA que precisa de revisao', () => assert.strictEqual(rLegado.body.codigo_fora_do_padrao, true));

  console.log('\n[imagem: cada produto com o SEU arquivo]');
  t('a imagem foi copiada', () => assert.strictEqual(r.body.imagem_copiada, true));
  t('o clone NAO aponta para o arquivo da origem',
    () => assert.notStrictEqual(clone.imagem, IMG_ORIGEM));
  t('o arquivo do clone existe no disco',
    () => assert(fs.existsSync(path.join(DIR_IMAGENS, clone.imagem))));
  t('com o mesmo conteudo', () => assert.strictEqual(
    fs.readFileSync(path.join(DIR_IMAGENS, clone.imagem), 'utf8'), 'imagem da origem'));

  // O caminho exato que quebrou no clone de familia, agora percorrido em produtos: a rota de
  // imagem apaga o arquivo antigo, entao arquivo compartilhado sumiria da origem.
  await run('UPDATE produtos SET imagem = ? WHERE id = ?', ['outra-imagem.png', clone.id]);
  apagarArquivo(clone.imagem);
  t('A IMAGEM DA ORIGEM CONTINUA NO DISCO',
    () => assert(fs.existsSync(path.join(DIR_IMAGENS, IMG_ORIGEM)),
      'apagar a imagem do clone levou junto a da origem'));
  const origemDepois = await get('SELECT imagem FROM produtos WHERE id = ?', [origemId]);
  t('e a origem continua apontando para ela',
    () => assert.strictEqual(origemDepois.imagem, IMG_ORIGEM));

  console.log('\n[bordas]');
  const semProduto = await pedir('/api/produtos/99999999/clonar', tokenAdmin, {});
  t('origem inexistente devolve 404', () => assert.strictEqual(semProduto.status, 404));

  if (servidor) servidor.kill();
  await limpar();
  const sobrou = await get("SELECT COUNT(*) n FROM produtos WHERE codigo LIKE ?", [MARCA + '%']);
  t('os dados de teste foram removidos do banco', () => assert.strictEqual(sobrou.n, 0));

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
