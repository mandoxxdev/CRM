/**
 * `materialPhoto` — o ponto ÚNICO de mintagem de URL de upload do módulo (Etapa 33, furo C42).
 *
 * ⚠️ Este arquivo substitui `server/tests/materialPhoto.test.js`, que foi **apagado**. Aquele
 * arquivo era **órfão**: nenhum script de `package.json` o rodava (`test:api` só descobre
 * `tests/api/*.api.test.js`), e ele congelava as URLs **sem assinatura** como contrato —
 * continuaria afirmando no repositório que a URL é pública, e quebraria em silêncio quando
 * `materialPhotoUrl` passou a exigir assinador. Foi a revisão do plano que o encontrou.
 *
 * ORDEM IMPORTA NESTE ARQUIVO: o primeiro cenário exige que o assinador **não** esteja
 * configurado, e `configurarAssinador` é estado global de PROCESSO — qualquer `createTestApp()`
 * anterior o configuraria. O runner faz `spawnSync` por arquivo, então este processo nasce limpo;
 * por isso o cenário do "lança" vem primeiro e nenhum `createTestApp` roda antes dele.
 */
const assert = require('assert');
const materialPhoto = require('../../services/almoxarifado/materialPhoto');
const { criarAssinadorUpload } = require('../../services/almoxarifado/urlUpload');

let passou = 0, falhou = 0;
const testes = [];
function test(nome, fn) { testes.push([nome, fn]); }

// PRIMEIRO cenário, e a posição é a regra — ver o cabeçalho.
test('[ORDEM: primeiro] sem assinador configurado, materialPhotoUrl LANCA em vez de devolver URL crua', () => {
  assert.throws(() => materialPhoto.materialPhotoUrl('material-1.png'),
    /assinador nao configurado/,
    'devolver `prefixo + nome` aqui seria o furo C42 de volta, e de volta em SILENCIO');

  // Metade positiva no mesmo cenário: com assinador, sai URL assinada. Sem isto, o `throws` acima
  // passaria com uma implementação que lança SEMPRE.
  materialPhoto.configurarAssinador(criarAssinadorUpload('segredo-de-teste'));
  assert.match(materialPhoto.materialPhotoUrl('material-1.png'),
    /^\/api\/uploads\/almoxarifado\/material-1\.png\?exp=\d+&sig=[0-9a-f]{32}$/);
});

test('materialPhotoFilename extrai o nome de um caminho legado', () => {
  assert.strictEqual(materialPhotoFilenameDe('/uploads/almoxarifado/material-123.jpg'), 'material-123.jpg');
  assert.strictEqual(materialPhotoFilenameDe('material-456.png'), 'material-456.png');
  // Barra invertida do Windows também: o valor vem de coluna gravada por multer.
  assert.strictEqual(materialPhotoFilenameDe('uploads\\almoxarifado\\material-789.webp'), 'material-789.webp');
});
const materialPhotoFilenameDe = (v) => materialPhoto.materialPhotoFilename(v);

test('materialPhotoUrl assina, e o caminho legado vira nome antes de assinar', () => {
  const url = materialPhoto.materialPhotoUrl('/uploads/almoxarifado/material-123.jpg');
  assert.ok(url.startsWith('/api/uploads/almoxarifado/material-123.jpg?'), url);
  assert.match(url, /sig=[0-9a-f]{32}/);
  // A assinatura tem de valer para o NOME, não para o caminho — senão o middleware recusaria a
  // própria URL que este módulo minou.
  const assinador = criarAssinadorUpload('segredo-de-teste');
  const exp = url.match(/exp=(\d+)/)[1];
  const sig = url.match(/sig=([0-9a-f]{32})/)[1];
  assert.strictEqual(assinador.verificar('material-123.jpg', exp, sig), true);
});

test('enrichMaterialRow troca `foto` pela URL assinada e preenche `foto_url`', () => {
  const row = materialPhoto.enrichMaterialRow({ id: 1, nome: 'Folha A4', foto: '/uploads/almoxarifado/x.webp' });
  assert.strictEqual(row.foto, row.foto_url, 'as duas chaves têm de apontar para a mesma URL');
  assert.match(row.foto_url, /^\/api\/uploads\/almoxarifado\/x\.webp\?exp=\d+&sig=[0-9a-f]{32}$/);
  assert.strictEqual(row.nome, 'Folha A4', 'o resto da linha não pode ser tocado');
});

test('enrichMaterialRow com foto vazia devolve foto_url null e NAO chama o assinador', () => {
  for (const vazio of [null, undefined, '', '   ']) {
    const row = materialPhoto.enrichMaterialRow({ id: 1, foto: vazio });
    assert.strictEqual(row.foto_url, null, `foto=${JSON.stringify(vazio)}`);
  }
  assert.deepStrictEqual(materialPhoto.enrichMaterialRows(null), []);
});

(async () => {
  for (const [nome, fn] of testes) {
    try { await fn(); console.log(`  ✓ ${nome}`); passou++; }
    catch (e) { console.log(`  ✗ ${nome}\n    ${e.message}`); falhou++; }
  }
  console.log(`\n${passou} passed, ${falhou} failed`);
  process.exit(falhou ? 1 : 0);
})();
