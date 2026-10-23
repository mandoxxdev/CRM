/**
 * Etapa 186 (T5) — integracao dos PDFs da remessa a terceiros e da posicao do cliente: a resposta REAL das rotas vira fixture do client.
 *
 * O desenho dos dois PDFs mudou (celula quebra em linhas, colunas novas, titulo quebra) — mas os geradores comem o corpo das rotas. Os
 * testes Jest das telas (client/src/components/almoxarifado/pdfsDeRemessaEPosicaoPelaTela.test.js) leem as fixtures versionadas
 * client/src/utils/__fixtures__/remessa.rota.json e posicaoCliente.rota.json. Aqui, SEMPRE, as chaves de cada nivel (cabecalho, item,
 * aplicacao, cliente) da fixture = as da resposta real — se o servidor renomear um campo, este teste cai sem ninguem lembrar de regravar.
 * Com CRM_GRAVAR_FIXTURE=1 ele regrava as fixtures com o corpo real. Molde: epiFichaConfirmacaoIntegracao.api.test.js.
 *
 * Os dados sao os longos da Fase 0 do plano: razao social de 69 letras, codigo de 25, nome de 71, projeto de 80, observacao longa.
 * A remessa leva DOIS itens do MESMO cliente (emenda I3: material do cliente e material proprio na mesma remessa sao recusados —
 * `resolverProprietario`), para a linha *Material de propriedade de …* sair com dado de rota.
 *
 * Executar: cd server && node tests/api/pdfsRemessaPosicaoFixture.api.test.js
 * Regravar: cd server && CRM_GRAVAR_FIXTURE=1 node tests/api/pdfsRemessaPosicaoFixture.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

const DIR = path.join(__dirname, '..', '..', '..', 'client', 'src', 'utils', '__fixtures__');
const FIXTURE_REMESSA = path.join(DIR, 'remessa.rota.json');
const FIXTURE_POSICAO = path.join(DIR, 'posicaoCliente.rota.json');
const GRAVAR = process.env.CRM_GRAVAR_FIXTURE === '1';

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const RAZAO_69 = 'Industria e Comercio de Equipamentos para Saneamento Basicos Ltda EPP';
const CODIGO_25 = 'EIXO-SAE1045-D50-L1200-RT';
const NOME_71 = 'Eixo usinado em aco SAE 1045 retificado diametro 50 mm comprimento 1200';
const PROJETO_80 = 'Ampliacao da estacao de tratamento de efluentes industriais da planta Sul fase B';
const OBSERVACAO = 'Material embalado em caixa de madeira lacrada, conferir lacre na chegada. '.repeat(16).trim();
for (const [nome, v, n] of [['RAZAO_69', RAZAO_69, 69], ['CODIGO_25', CODIGO_25, 25], ['NOME_71', NOME_71, 71], ['PROJETO_80', PROJETO_80, 80]]) {
  if (v.length !== n) throw new Error(`${nome} tem ${v.length} letras, nao ${n}`);
}

const chaves = (o) => Object.keys(o || {}).sort();
function conferirChaves(rotulo, fixture, real) {
  assert.deepStrictEqual(chaves(fixture), chaves(real), `${rotulo}: a fixture do client nao e o corpo do servidor`);
}

(async () => {
  const { app, db, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);

  // `projetos` e `ordens_servico` sao tabelas CORE (server/index.js), fora do initSchema do almoxarifado — mesmo precedente de
  // materialClientePosicao.api.test.js.
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)');
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER, projeto_id INTEGER, status TEXT)`);

  const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', [RAZAO_69])).lastID;
  const proj = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?, ?)', [cli, PROJETO_80])).lastID;
  const os = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)', ['2026-00042', cli, proj])).lastID;
  const material = async (codigo, nome) => (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id)
    VALUES (?, ?, 'UN', 0, 0, 10, 1, ?)`, [codigo, nome, cli])).lastID;
  const eixo = await material(CODIGO_25, NOME_71);
  const chapa = await material('EPI-MASC-SOLDA-07', 'Chapa de aco inox 304 2B 3,00 x 1250 x 3000 mm');

  const mov = async (body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send(body);
    assert.ok(r.status >= 200 && r.status < 300, `movimentacao ${body.tipo}: ${r.status} ${JSON.stringify(r.body)}`);
  };
  let remessaRota; let posicaoRota;

  await test('preparo pela rota: entrada do material do cliente, saida para OS e para projeto, remessa com 2 itens do mesmo cliente', async () => {
    await mov({ material_id: eixo, tipo: 'ENTRADA_MANUAL', quantidade: 20, motivo: 'remessa do cliente' });
    await mov({ material_id: chapa, tipo: 'ENTRADA_MANUAL', quantidade: 10, motivo: 'remessa do cliente' });
    await mov({ material_id: eixo, tipo: 'SAIDA_PRODUCAO', quantidade: 3, motivo: 'corte', projeto_id: proj });
    await mov({ material_id: eixo, tipo: 'SAIDA_MONTAGEM', quantidade: 2, motivo: 'montagem', os_id: os });
    const c = await request(app).post('/api/almoxarifado/remessas-terceiros').send({
      fornecedor_nome: 'Galvanizadora Sul LTDA', tipo_servico: 'Galvanizacao', prazo_previsto: '2026-11-30', observacoes: OBSERVACAO,
      itens: [{ material_id: eixo, quantidade: 4, peso: 12.5 }, { material_id: chapa, quantidade: 2 }],
    });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const r = await request(app).get(`/api/almoxarifado/remessas-terceiros/${c.body.id}`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    remessaRota = r.body;
    const p = await request(app).get(`/api/almoxarifado/materiais-cliente/posicao?cliente_id=${cli}`);
    assert.strictEqual(p.status, 200, JSON.stringify(p.body));
    posicaoRota = p.body;
  });

  await test('a resposta real traz os textos longos que o PDF desenha (o dado de rota exerce a quebra)', async () => {
    assert.strictEqual(remessaRota.proprietario_cliente_nome, RAZAO_69);
    assert.strictEqual(remessaRota.observacoes, OBSERVACAO);
    assert.deepStrictEqual(remessaRota.itens.map((i) => i.material_codigo), [CODIGO_25, 'EPI-MASC-SOLDA-07']);
    assert.strictEqual(remessaRota.itens[0].material_nome, NOME_71);
    assert.strictEqual(posicaoRota.cliente.razao_social, RAZAO_69);
    assert.ok(posicaoRota.itens.some((i) => i.codigo === CODIGO_25 && i.nome === NOME_71), JSON.stringify(posicaoRota.itens));
    assert.ok(posicaoRota.aplicacoes.some((a) => a.projeto_nome === PROJETO_80), JSON.stringify(posicaoRota.aplicacoes));
    assert.ok(posicaoRota.aplicacoes.some((a) => a.numero_os === '2026-00042'), JSON.stringify(posicaoRota.aplicacoes));
  });

  await test('[integracao com o client] as fixtures versionadas tem as chaves da resposta real (cabecalho, item, aplicacao, cliente)', async () => {
    assert.ok(remessaRota && posicaoRota, 'as respostas de cima nao vieram');
    if (GRAVAR) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FIXTURE_REMESSA, `${JSON.stringify(remessaRota, null, 2)}\n`);
      fs.writeFileSync(FIXTURE_POSICAO, `${JSON.stringify(posicaoRota, null, 2)}\n`);
      console.log(`  (fixtures regravadas: ${FIXTURE_REMESSA}, ${FIXTURE_POSICAO})`);
    }
    for (const f of [FIXTURE_REMESSA, FIXTURE_POSICAO]) assert.ok(fs.existsSync(f), `fixture ausente: ${f} (gere com CRM_GRAVAR_FIXTURE=1)`);
    const remessa = JSON.parse(fs.readFileSync(FIXTURE_REMESSA, 'utf8'));
    const posicao = JSON.parse(fs.readFileSync(FIXTURE_POSICAO, 'utf8'));
    conferirChaves('remessa (cabecalho)', remessa, remessaRota);
    assert.ok(Array.isArray(remessa.itens) && remessa.itens.length === 2, 'fixture da remessa sem os 2 itens');
    for (const i of remessa.itens) conferirChaves('remessa (item)', i, remessaRota.itens[0]);
    conferirChaves('posicao (corpo)', posicao, posicaoRota);
    conferirChaves('posicao (cliente)', posicao.cliente, posicaoRota.cliente);
    assert.ok(posicao.itens.length > 0 && posicao.aplicacoes.length >= 2, 'fixture da posicao sem itens ou aplicacoes');
    for (const i of posicao.itens) conferirChaves('posicao (item)', i, posicaoRota.itens[0]);
    for (const a of posicao.aplicacoes) conferirChaves('posicao (aplicacao)', a, posicaoRota.aplicacoes[0]);
    // e os textos longos estao na fixture (o Jest da tela confere o nome inteiro no papel)
    assert.strictEqual(remessa.itens[0].material_nome, NOME_71, 'a fixture da remessa foi gravada com outro material');
    assert.strictEqual(posicao.cliente.razao_social, RAZAO_69, 'a fixture da posicao foi gravada com outro cliente');
  });

  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
