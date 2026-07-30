// Cadastro de variavel tecnica: o NOME vai para CAIXA ALTA; PREFIXO/SUFIXO ficam literais.
//
// Pedido (30/07/2026): "Ao cadastrar uma variavel, independente se for em caps ou nao ela
// deve ficar em caps, para padronizar o cadastro."
//
// Executar: node tests/variavelNomeCaps.test.js
// Replica a normalizacao das rotas POST/PUT /api/variaveis-tecnicas contra um SQLite real,
// para provar que o que chega ao banco esta padronizado.
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');
const SERVER = path.join(__dirname, '..');
const sqlite3 = require('sqlite3');

const arq = path.join(os.tmpdir(), `caps-var-${Date.now()}.sqlite`);
const db = new sqlite3.Database(arq);

// ---- copia fiel da normalizacao das rotas (server/index.js) ----
function normalizar(body) {
  var nome = (body.nome || '').trim().toLocaleUpperCase('pt-BR');
  var chave = (body.chave || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  if (!nome) return { erro: 'Nome é obrigatório' };
  if (!chave) chave = nome.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || ('var_' + Date.now());
  return {
    nome,
    chave,
    prefixo: (body.prefixo || '').trim() || null,
    sufixo: (body.sufixo || '').trim() || null,
  };
}

const gravar = (body) => new Promise((resolve, reject) => {
  const n = normalizar(body);
  if (n.erro) return resolve(n);
  db.run('INSERT INTO variaveis_tecnicas (nome, chave, prefixo, sufixo) VALUES (?, ?, ?, ?)',
    [n.nome, n.chave, n.prefixo, n.sufixo], function (err) {
      if (err) return reject(err);
      db.get('SELECT * FROM variaveis_tecnicas WHERE id = ?', [this.lastID], (e, row) => e ? reject(e) : resolve(row));
    });
});

let ok = 0, total = 0;
const t = (nome, fn) => { total++; try { fn(); ok++; console.log('  OK   ' + nome); } catch (e) { console.error('  FALHA ' + nome + ': ' + e.message); process.exitCode = 1; } };

db.serialize(async () => {
  await new Promise((r) => db.run('CREATE TABLE variaveis_tecnicas (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT, chave TEXT UNIQUE, prefixo TEXT, sufixo TEXT)', r));

  console.log('\n[nome] sempre em CAIXA ALTA, qualquer que seja a digitacao');
  const r1 = await gravar({ nome: 'Volume da câmara de moagem' });
  t('minusculo/misto -> CAPS, com acentos', () => assert.strictEqual(r1.nome, 'VOLUME DA CÂMARA DE MOAGEM'));

  const r2 = await gravar({ nome: 'VOLUME ÚTIL DE TRABALHO', chave: 'volume_util_trab' });
  t('ja em CAPS continua igual', () => assert.strictEqual(r2.nome, 'VOLUME ÚTIL DE TRABALHO'));

  const r3 = await gravar({ nome: '  potência motor central (cv)  ', chave: 'pot_motor' });
  t('espacos nas pontas somem e vira CAPS', () => assert.strictEqual(r3.nome, 'POTÊNCIA MOTOR CENTRAL (CV)'));

  const r4 = await gravar({ nome: 'diâmetro bocal de saída [pol.]', chave: 'diam_bocal' });
  t('acentos minusculos sobem certo (í->Í, â->Â)', () => assert.strictEqual(r4.nome, 'DIÂMETRO BOCAL DE SAÍDA [POL.]'));

  const r5 = await gravar({ nome: 'grau de proteção do ccm', chave: 'grau_prot' });
  t('cedilha e til sobem certo (ç->Ç, ã->Ã)', () => assert.strictEqual(r5.nome, 'GRAU DE PROTEÇÃO DO CCM'));

  console.log('\n[prefixo/sufixo] LITERAIS — sao unidades sensiveis a caixa');
  const r6 = await gravar({ nome: 'rotação motor', chave: 'rot_motor', sufixo: 'RPM', prefixo: 'aprox.' });
  t('sufixo RPM intacto', () => assert.strictEqual(r6.sufixo, 'RPM'));
  t('prefixo "aprox." NAO vira CAPS', () => assert.strictEqual(r6.prefixo, 'aprox.'));

  const r7 = await gravar({ nome: 'motor central', chave: 'mot_central', sufixo: 'kW' });
  t('sufixo kW preserva o k minusculo (kW != KW)', () => assert.strictEqual(r7.sufixo, 'kW'));

  const r8 = await gravar({ nome: 'volume util moagem', chave: 'vol_moagem', sufixo: 'l/h' });
  t('sufixo l/h preserva minusculo', () => assert.strictEqual(r8.sufixo, 'l/h'));

  console.log('\n[chave] o identificador NAO muda de forma');
  t('chave informada continua minuscula', () => assert.strictEqual(r2.chave, 'volume_util_trab'));
  const r9 = await gravar({ nome: 'Teste Sem Chave Informada' });
  t('chave derivada do nome sai minuscula, nao em CAPS',
    () => assert.strictEqual(r9.chave, 'teste_sem_chave_informada'));

  // Regressao: o CAPS do nome nao pode alterar a chave derivada, senao produtos ja
  // cadastrados (specs sao indexadas por chave) perderiam o vinculo.
  const semCaps = 'Volume Da Camara X'.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  const comCaps = 'Volume Da Camara X'.toLocaleUpperCase('pt-BR').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  t('derivar a chave antes ou depois do CAPS da o MESMO resultado',
    () => assert.strictEqual(semCaps, comCaps));

  console.log('\n[proposta] o rotulo exibido continua em caixa de frase');
  const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X' },
    [{
      produto_nome: 'Masseira', descricao: 'Masseira', quantidade: 1, unidade: 'UN',
      valor_unitario: 1, valor_total: 1, familia_produto: 'F',
      especificacoes_tecnicas: JSON.stringify({ k0: 'AÇO INOX AISI 316' }),
    }],
    { total: 1, dataEmissao: '30/07/2026' },
    {
      variaveis_proposta_por_familia: { F: ['k0'] },
      // nome como fica no cadastro DEPOIS desta mudanca: CAIXA ALTA
      variaveis_proposta_labels: { k0: { nome: 'MATERIAL EIXOS E HÉLICES' } },
    },
    null, false, true
  );
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  t('rotulo em CAPS no cadastro sai em caixa de frase na proposta',
    () => assert(texto.includes('Material eixos e hélices: AÇO INOX AISI 316'),
      'nao achei o rotulo em caixa de frase'));
  t('o VALOR cadastrado continua exatamente como esta',
    () => assert(texto.includes('AÇO INOX AISI 316')));

  db.close(() => {
    try { fs.unlinkSync(arq); } catch (_) {}
    console.log(`\n${ok}/${total} checagens`);
    console.log(ok === total ? '0 failed' : `${total - ok} failed`);
    process.exit(ok === total ? 0 : 1);
  });
});
