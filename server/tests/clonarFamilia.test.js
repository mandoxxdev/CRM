/**
 * Clonar familia: POST /api/familias/:id/clonar
 *
 * Pedido (02/08/2026): "as vezes o item e EXTREMAMENTE PARECIDO... precisaria de um botao
 * chamado clonar para nao ter que refazer todo o processo de cadastro". E logo depois: "esse
 * botao so deve aparecer para quem tem a func admin".
 *
 * O caso real sao familias irmas que so mudam o material - "Tacho Movel (Aco Carbono)" e
 * "Tacho Movel (TCRY)" - repetindo as mesmas variaveis, opcoes e modelo de contrato.
 *
 * COBERTURA DE PERMISSAO: o botao escondido no front NAO e permissao - a rota continua
 * alcancavel por quem chamar a API direto. Por isso as checagens de 403 abaixo batem no
 * SERVIDOR, com um token de usuario comum, e nao na interface.
 *
 * Este teste sobe o servidor de verdade e fala HTTP. Testar uma copia da funcao ja me
 * enganou antes (ver filtroDashboard.test.js): a copia passava e o codigo real estava
 * quebrado. Aqui o que responde e a rota que vai para producao.
 *
 * Executar: node tests/clonarFamilia.test.js
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3');
const jwt = require('jsonwebtoken');
const { resolveJwtSecret } = require('../services/runtimeSecrets');

const PORTA = 5123;
const RAIZ = path.join(__dirname, '..');
const BANCO = path.join(RAIZ, 'data', 'database.sqlite');
// O diretorio vem de config/paths, nao montado a mao: o real e data/uploads/familias-produtos
// (dentro de PERSISTENT_DATA_DIR), e existe TAMBEM um server/uploads/familias-produtos legado.
// Escrevendo no diretorio errado o teste passa sem provar nada - foi o que aconteceu na
// primeira versao desta secao.
const DIR_UPLOADS = require('../config/paths').uploadsFamiliasDir;
const MARCA = 'ZZTESTE-CLONE';
const FOTO_ORIGEM = 'zzteste-clone-foto.png';
const ESQ_ORIGEM = 'zzteste-clone-esq.png';

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

function pedir(caminho, token, corpo) {
  return new Promise((resolve, reject) => {
    const dados = corpo ? JSON.stringify(corpo) : null;
    const req = http.request({
      host: 'localhost', port: PORTA, path: caminho, method: corpo ? 'POST' : 'GET',
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

async function limpar() {
  const familias = await all('SELECT id, foto, esquematico FROM familias_produto WHERE nome LIKE ?', [MARCA + '%']);
  const apagar = (arquivo) => {
    if (!arquivo) return;
    try {
      const caminho = path.join(DIR_UPLOADS, arquivo);
      if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
    } catch (_) { /* nao e motivo para derrubar a limpeza */ }
  };
  for (const f of familias) {
    await run('DELETE FROM familia_variavel_opcoes WHERE familia_id = ?', [f.id]);
    await run('DELETE FROM familia_variaveis WHERE familia_id = ?', [f.id]);
    // Inclui os arquivos que o clone duplicou e a foto trocada no meio do teste.
    apagar(f.foto);
    apagar(f.esquematico);
  }
  apagar(FOTO_ORIGEM);
  apagar(ESQ_ORIGEM);
  await run('DELETE FROM familias_produto WHERE nome LIKE ?', [MARCA + '%']);
  await run('DELETE FROM usuarios WHERE id IN (9101, 9102)');
}

let servidor = null;

(async () => {
  await limpar();

  // Arquivos DE VERDADE no disco: o clone duplica o arquivo, entao sem eles a copia nao
  // teria o que copiar e o teste passaria por engano.
  if (!fs.existsSync(DIR_UPLOADS)) fs.mkdirSync(DIR_UPLOADS, { recursive: true });
  fs.writeFileSync(path.join(DIR_UPLOADS, FOTO_ORIGEM), Buffer.from('foto da origem'));
  fs.writeFileSync(path.join(DIR_UPLOADS, ESQ_ORIGEM), Buffer.from('esquematico da origem'));

  // --- origem, com configuracao para o clone ter o que copiar ---
  const origem = await run(
    `INSERT INTO familias_produto (nome, foto, ordem, ativo, marcadores_vista, grupo_id, codigo, esquematico, clausulas_modelo_id)
     VALUES (?, ?, 7, 1, 'vista-lateral', 3, 990, ?, 2)`,
    [MARCA + ' ORIGEM', FOTO_ORIGEM, ESQ_ORIGEM]
  );
  const origemId = origem.lastID;
  for (const [chave, ordem] of [['diametro', 0], ['motor', 1], ['tensao', 2]]) {
    await run('INSERT INTO familia_variaveis (familia_id, variavel_chave, ordem, ativo) VALUES (?, ?, ?, 1)',
      [origemId, chave, ordem]);
  }
  // Uma variavel DESATIVADA: nao pode reviver no clone.
  await run('INSERT INTO familia_variaveis (familia_id, variavel_chave, ordem, ativo) VALUES (?, ?, ?, 0)',
    [origemId, 'variavel_morta', 9]);
  for (const [chave, valor, ordem] of [
    ['diametro', '320mm', 0], ['diametro', '400mm', 1],
    ['motor', '5 CV', 0], ['tensao', '220V', 0],
  ]) {
    await run('INSERT INTO familia_variavel_opcoes (familia_id, variavel_chave, valor, ordem, ativo) VALUES (?, ?, ?, ?, 1)',
      [origemId, chave, valor, ordem]);
  }
  await run('INSERT INTO familia_variavel_opcoes (familia_id, variavel_chave, valor, ordem, ativo) VALUES (?, ?, ?, ?, 0)',
    [origemId, 'motor', 'OPCAO MORTA', 9]);

  await run("INSERT INTO usuarios (id, nome, email, senha, role, ativo) VALUES (9101, ?, 'a9101@x', 'x', 'admin', 1)", [MARCA + ' ADMIN']);
  await run("INSERT INTO usuarios (id, nome, email, senha, role, ativo) VALUES (9102, ?, 'u9102@x', 'x', 'usuario', 1)", [MARCA + ' COMUM']);

  const segredo = resolveJwtSecret(process.env.PERSISTENT_DATA_DIR || path.join(RAIZ, 'data'));
  const tokenAdmin = jwt.sign({ id: 9101, email: 'a9101@x', role: 'admin' }, segredo, { expiresIn: '1h' });
  const tokenComum = jwt.sign({ id: 9102, email: 'u9102@x', role: 'usuario' }, segredo, { expiresIn: '1h' });

  // --- sobe o servidor de verdade ---
  servidor = spawn(process.execPath, ['index.js'], {
    cwd: RAIZ, env: Object.assign({}, process.env, { PORT: String(PORTA) }), stdio: 'ignore',
  });
  // A subida leva ~15s, e a PORTA ABRE ANTES DO BANCO: nesse intervalo o app responde 503
  // com code DB_STARTING. Esperar so a porta faz o teste bater na janela errada e reprovar
  // por 503, que foi exatamente o que aconteceu na primeira tentativa. Entao a espera vai
  // ate uma resposta de verdade.
  let subiu = false;
  for (let i = 0; i < 120 && !subiu; i++) {
    await esperar(500);
    try {
      const r = await pedir('/api/familias', tokenAdmin);
      subiu = r.status && r.status !== 503;
    } catch (_) { /* porta ainda fechada */ }
  }
  if (!subiu) throw new Error('o servidor nao ficou pronto na porta ' + PORTA + ' em 60s');

  console.log('\n[permissao: o servidor recusa, nao so o botao some]');
  const semPermissao = await pedir(`/api/familias/${origemId}/clonar`, tokenComum, { nome: MARCA + ' TENTATIVA' });
  t('usuario comum recebe 403', () => assert.strictEqual(semPermissao.status, 403));
  const naoCriou = await get('SELECT COUNT(*) n FROM familias_produto WHERE nome = ?', [MARCA + ' TENTATIVA']);
  t('e nada foi criado no banco', () => assert.strictEqual(naoCriou.n, 0));

  console.log('\n[o clone leva a configuracao]');
  const r = await pedir(`/api/familias/${origemId}/clonar`, tokenAdmin, { nome: MARCA + ' CLONE' });
  t('admin consegue clonar', () => assert.strictEqual(r.status, 200, JSON.stringify(r.body)));
  const clone = await get('SELECT * FROM familias_produto WHERE nome = ?', [MARCA + ' CLONE']);
  t('a nova familia existe', () => assert(clone, 'clone nao encontrado'));
  t('a foto veio junto', () => assert(clone.foto, 'clone ficou sem foto'));
  t('o esquematico veio junto', () => assert(clone.esquematico, 'clone ficou sem esquematico'));
  t('grupo veio junto', () => assert.strictEqual(clone.grupo_id, 3));
  t('marcadores da vista vieram junto', () => assert.strictEqual(clone.marcadores_vista, 'vista-lateral'));
  t('modelo de contrato veio junto', () => assert.strictEqual(clone.clausulas_modelo_id, 2));
  t('nasce ativa', () => assert.strictEqual(clone.ativo, 1));

  console.log('\n[o que NAO pode ser copiado]');
  t('o codigo e NOVO, nao o da origem', () => assert.notStrictEqual(clone.codigo, 990));
  t('o id e outro', () => assert.notStrictEqual(clone.id, origemId));

  console.log('\n[variaveis e opcoes]');
  const vars = await all('SELECT variavel_chave, ordem FROM familia_variaveis WHERE familia_id = ? AND ativo = 1 ORDER BY ordem', [clone.id]);
  t('as 3 variaveis ativas vieram', () => assert.strictEqual(vars.length, 3));
  t('A ORDEM foi preservada', () => assert.deepStrictEqual(
    vars.map((v) => v.variavel_chave), ['diametro', 'motor', 'tensao']));
  const mortas = await all('SELECT 1 FROM familia_variaveis WHERE familia_id = ? AND variavel_chave = ?', [clone.id, 'variavel_morta']);
  t('variavel DESATIVADA na origem nao revive no clone', () => assert.strictEqual(mortas.length, 0));

  const opcoes = await all('SELECT variavel_chave, valor FROM familia_variavel_opcoes WHERE familia_id = ? AND ativo = 1', [clone.id]);
  t('as 4 opcoes ativas vieram', () => assert.strictEqual(opcoes.length, 4));
  t('opcao DESATIVADA na origem nao revive', () => assert(!opcoes.some((o) => o.valor === 'OPCAO MORTA')));
  t('a resposta informa quantos itens copiou', () => {
    assert.strictEqual(r.body.variaveis_copiadas, 3);
    assert.strictEqual(r.body.opcoes_copiadas, 4);
    assert.strictEqual(r.body.clonada_de, MARCA + ' ORIGEM');
  });

  console.log('\n[imagem: cada familia com o SEU arquivo]');
  // Esta secao existe por causa de um bug que chegou na mao do usuario: a primeira versao do
  // clone compartilhava o caminho do arquivo, ele trocou a foto da copia e a ORIGINAL ficou
  // com imagem quebrada - a rota de upload apaga o arquivo antigo, que era o mesmo arquivo.
  t('o clone NAO aponta para o arquivo da origem',
    () => assert.notStrictEqual(clone.foto, FOTO_ORIGEM));
  t('o esquematico do clone tambem e proprio',
    () => assert.notStrictEqual(clone.esquematico, ESQ_ORIGEM));
  t('o arquivo duplicado existe no disco',
    () => assert(fs.existsSync(path.join(DIR_UPLOADS, clone.foto)), 'arquivo do clone nao foi criado'));
  t('e tem o mesmo conteudo da origem', () => assert.strictEqual(
    fs.readFileSync(path.join(DIR_UPLOADS, clone.foto), 'utf8'), 'foto da origem'));

  // A REGRESSAO PROPRIAMENTE DITA: trocar a foto do clone pela rota de verdade e conferir
  // que a original continua com a imagem dela.
  const pngMinimo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const troca = await pedir(`/api/familias/${clone.id}/foto-base64`, tokenAdmin, { foto_base64: pngMinimo });
  t('trocar a foto do clone funciona', () => assert.strictEqual(troca.status, 200, JSON.stringify(troca.body)));
  t('A FOTO DA ORIGEM CONTINUA NO DISCO (era o bug)',
    () => assert(fs.existsSync(path.join(DIR_UPLOADS, FOTO_ORIGEM)),
      'a troca de foto do clone apagou o arquivo que a origem usa'));
  const origemDepois = await get('SELECT foto FROM familias_produto WHERE id = ?', [origemId]);
  t('e a origem continua apontando para ela',
    () => assert.strictEqual(origemDepois.foto, FOTO_ORIGEM));

  console.log('\n[independencia: mexer no clone nao afeta a origem]');
  await run('UPDATE familia_variaveis SET ativo = 0 WHERE familia_id = ? AND variavel_chave = ?', [clone.id, 'motor']);
  const origemIntacta = await all('SELECT 1 FROM familia_variaveis WHERE familia_id = ? AND variavel_chave = ? AND ativo = 1', [origemId, 'motor']);
  t('desativar variavel no clone nao mexe na origem', () => assert.strictEqual(origemIntacta.length, 1));

  console.log('\n[nome]');
  const repetido = await pedir(`/api/familias/${origemId}/clonar`, tokenAdmin, { nome: MARCA + ' CLONE' });
  t('nome repetido e recusado', () => assert.strictEqual(repetido.status, 400));
  const vazio = await pedir(`/api/familias/${origemId}/clonar`, tokenAdmin, { nome: '   ' });
  t('nome vazio e recusado', () => assert.strictEqual(vazio.status, 400));
  const inexistente = await pedir('/api/familias/99999999/clonar', tokenAdmin, { nome: MARCA + ' DE ONDE' });
  t('origem inexistente devolve 404', () => assert.strictEqual(inexistente.status, 404));

  if (servidor) servidor.kill();
  await limpar();
  const sobrou = await get('SELECT COUNT(*) n FROM familias_produto WHERE nome LIKE ?', [MARCA + '%']);
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
