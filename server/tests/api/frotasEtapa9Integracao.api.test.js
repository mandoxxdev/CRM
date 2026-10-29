/**
 * Frota Etapa 9 — I1 (integracao): a fiacao da etapa, pela rota (login REAL) e pelo servico, cruzando o S1 (servidor) com o que o C1
 * (tela) manda de fato.
 *
 *   (a) Pela rota: POST /destinos com o endereco inteiro (CEP sem hifen) -> 201 com o endereco montado -> POST /viagens do gestor com
 *       destino_id em TEXTO (como o select manda) e sem origem -> destino = nome, destino_id, origem GMP -> desativa o destino -> PUT
 *       so do km com o mesmo destino_id (numero) -> 200, destino mantido (RN-F9.12, A3) -> renomear nao renomeia a viagem (A5) ->
 *       PUT com o id de OUTRO destino desativado -> 400 `Destino não encontrado`, nada muda.
 *   (b) Pela rota: destino ANTIGO (so nome + endereco texto, gravado por SQL) desativado -> PUT /destinos/:id com o que o formulario do
 *       gestor manda (nome, ativo 1 e as 7 chaves null) -> 200, ativo, endereco intacto (A2/B92) -> aparece no /portal/inicio da Ana ->
 *       saida com o destino_id dele grava.
 *   (c) Pela rota: "+" do motorista com nome ja ativo e SEM endereco -> 409 DESTINO_DUPLICADO com `destino` {id,nome,endereco,cidade,
 *       uf,ativo} (A4/A8) -> saida com esse id grava.
 *   (d) Pelo servico: createDestino + createViagem com destino_id; `configuracoes` criada aqui (o harness nao cria) -> getMeta().
 *       origemEndereco no formato da RN-F9.21 e portalService.inicio().origem.
 *
 * O que cada galho ja prova sozinho (frotasDestinoEndereco, frotasViagemDestinoGestor) nao se repete aqui.
 *
 * Plano: docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md
 * Executar: cd server && node tests/api/frotasEtapa9Integracao.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, comLoginReal, ADMIN } = require('../helpers/frotasTestApp');
const { comEndereco, ENDERECO_OK_MONTADO } = require('../helpers/frotasDestinoFixture');
const { dbRun, dbGet } = require('../../services/frotas/db');
const portalService = require('../../services/frotas/portalService');
const frotasService = require('../../services/frotas/frotasService');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx; let login;
const S = {};
const GESTOR = 1; const ANA = 2;
const REG = '/api/frotas/portal/registros';
const MSG_DESTINO = 'Destino não encontrado';
const MONTADO_COMPLETO = 'Av. Industrial, 1500 - Galpão 3, Batistini, São Bernardo do Campo/SP, CEP 09844-100';

const viagemDb = (id) => dbGet(ctx.db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
const destinoDb = (id) => dbGet(ctx.db, 'SELECT * FROM frotas_destinos WHERE id = ?', [id]);
const contaViagens = async () => (await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_viagens')).n;

async function cenario() {
  ctx.setUser(ADMIN);
  const m = await ctx.req('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: ANA });
  assert.strictEqual(m.status, 201, JSON.stringify(m.body));
  S.ma = m.body;
  const v = await ctx.req('post', '/api/frotas/veiculos', { placa: 'INT9001', km_atual: 1000, uso_funcionarios: true });
  assert.strictEqual(v.status, 201, JSON.stringify(v.body));
  S.v = v.body;
  ctx.setUser(null);
  login = await comLoginReal(ctx);
}

// ── (a) ────────────────────────────────────────────────────────────────────────────────────────
test('(a) pela rota: destino com endereco (CEP sem hifen) -> viagem do gestor com destino_id texto e sem origem -> desativa -> PUT do km mantem; outro id desativado -> 400', async () => {
  const gestor = login.como(GESTOR);

  const d = await gestor('post', '/api/frotas/destinos', {
    nome: 'Cliente Alfa', cep: '09844100', logradouro: 'Av. Industrial', numero: '1500', complemento: 'Galpão 3',
    bairro: 'Batistini', cidade: 'São Bernardo do Campo', uf: 'sp', endereco: 'ignorado pelo servidor',
  });
  assert.strictEqual(d.status, 201, JSON.stringify(d.body));
  assert.strictEqual(d.body.endereco, MONTADO_COMPLETO, 'RN-F9.06: montado pelo servidor; o endereco do corpo e ignorado');
  assert.strictEqual(d.body.cep, '09844-100');
  assert.strictEqual(d.body.uf, 'SP');
  assert.strictEqual(d.body.criado_por_id, GESTOR, 'o login real poe o gestor como quem cadastrou');
  S.da = d.body;

  // a tela manda o value do select (string) e nao manda origem (RN-F9.24)
  const cria = await gestor('post', '/api/frotas/viagens', {
    veiculo_id: S.v.id, km_saida: 1000, data_saida: '2026-10-29', finalidade: 'Entrega', destino_id: String(S.da.id), destino: 'texto perdido',
  });
  assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
  assert.strictEqual(cria.body.destino, 'Cliente Alfa', 'com id e texto, o id manda (RN-F9.10)');
  assert.strictEqual(cria.body.destino_id, S.da.id);
  assert.strictEqual(cria.body.origem, 'GMP', 'sem origem no corpo -> GMP (RN-F9.20/24)');
  S.vg = cria.body;
  const naLista = (await gestor('get', '/api/frotas/viagens')).body.find((x) => x.id === S.vg.id);
  assert.deepStrictEqual([naLista.origem, naLista.destino, naLista.destino_id], ['GMP', 'Cliente Alfa', S.da.id]);

  // um segundo destino, desativado — para o 400 do fim
  const d2 = await gestor('post', '/api/frotas/destinos', comEndereco({ nome: 'Cliente Beta' }));
  assert.strictEqual(d2.status, 201, JSON.stringify(d2.body));
  S.db = d2.body;
  assert.strictEqual((await gestor('delete', `/api/frotas/destinos/${S.db.id}`)).status, 200);

  // desativa o destino da viagem
  const del = await gestor('delete', `/api/frotas/destinos/${S.da.id}`);
  assert.strictEqual(del.status, 200, JSON.stringify(del.body));
  assert.strictEqual((await destinoDb(S.da.id)).ativo, 0);

  // editar so o km, o formulario reenvia o destino_id gravado (agora numero, A3): 200 e o destino fica (RN-F9.12)
  const put = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { km_saida: 1010, destino_id: S.da.id });
  assert.strictEqual(put.status, 200, `viagem de destino desativado deixou de ser editavel: ${JSON.stringify(put.body)}`);
  assert.strictEqual(put.body.km_saida, 1010);
  assert.strictEqual(put.body.destino, 'Cliente Alfa');
  assert.strictEqual(put.body.destino_id, S.da.id);
  assert.strictEqual(put.body.origem, 'GMP');

  // A5: reativado e renomeado, o mesmo id nao renomeia a viagem
  assert.strictEqual((await gestor('put', `/api/frotas/destinos/${S.da.id}`, { nome: 'Cliente Alfa Novo', ativo: 1 })).status, 200);
  const put2 = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { km_saida: 1011, destino_id: String(S.da.id) });
  assert.strictEqual(put2.status, 200, JSON.stringify(put2.body));
  assert.strictEqual(put2.body.destino, 'Cliente Alfa', 'A5: mantem o nome gravado');
  assert.strictEqual((await gestor('delete', `/api/frotas/destinos/${S.da.id}`)).status, 200);

  // outro id, de destino desativado -> 400 e nada muda
  const put3 = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { km_saida: 1020, destino_id: S.db.id });
  assert.strictEqual(put3.status, 400, JSON.stringify(put3.body));
  assert.strictEqual(put3.body.error, MSG_DESTINO);
  const gravada = await viagemDb(S.vg.id);
  assert.deepStrictEqual([gravada.km_saida, gravada.destino, gravada.destino_id], [1011, 'Cliente Alfa', S.da.id], 'o 400 nao gravou nada');

  // e a viagem nova com o id desativado tambem -> 400 (RN-F9.10), nada gravado
  const antes = await contaViagens();
  const nova = await gestor('post', '/api/frotas/viagens', { veiculo_id: S.v.id, destino_id: S.da.id });
  assert.strictEqual(nova.status, 400, JSON.stringify(nova.body));
  assert.strictEqual(nova.body.error, MSG_DESTINO);
  assert.strictEqual(await contaViagens(), antes);
});

// ── (b) ────────────────────────────────────────────────────────────────────────────────────────
test('(b) pela rota: destino antigo desativado -> PUT do formulario (7 chaves null) reativa sem mexer no endereco -> portal/inicio lista -> saida grava', async () => {
  const gestor = login.como(GESTOR);
  const ana = login.como(ANA);
  const ENDERECO_ANTIGO = 'Rua Velha 12 - Centro';
  const r = await dbRun(ctx.db, 'INSERT INTO frotas_destinos (nome, endereco, ativo) VALUES (?, ?, 0)', ['Obra Antiga', ENDERECO_ANTIGO]);
  const id = r.lastID;

  const ini0 = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini0.status, 200, JSON.stringify(ini0.body));
  assert(!ini0.body.destinos.some((q) => q.id === id), 'desativado nao aparece no portal');

  // exatamente o que o formulario do gestor manda ao so reativar (A2/B92)
  const put = await gestor('put', `/api/frotas/destinos/${id}`, {
    nome: 'Obra Antiga', ativo: 1, cep: null, logradouro: null, numero: null, complemento: null, bairro: null, cidade: null, uf: null,
  });
  assert.strictEqual(put.status, 200, `reativar destino antigo pelo formulario falhou: ${JSON.stringify(put.body)}`);
  assert.strictEqual(put.body.ativo, 1);
  assert.strictEqual(put.body.endereco, ENDERECO_ANTIGO, 'o endereco antigo fica');
  assert.strictEqual(put.body.logradouro, null);
  const gravado = await destinoDb(id);
  assert.deepStrictEqual([gravado.ativo, gravado.endereco, gravado.cidade], [1, ENDERECO_ANTIGO, null]);

  const ini1 = await ana('get', '/api/frotas/portal/inicio');
  assert.deepStrictEqual(ini1.body.destinos.find((q) => q.id === id), { id, nome: 'Obra Antiga', endereco: ENDERECO_ANTIGO, cidade: null, uf: null });
  assert.deepStrictEqual(ini1.body.origem, { nome: 'GMP', endereco: '' }, 'sem configuracoes, a origem vem sem endereco');

  const saida = await ana('post', REG, {
    tipo: 'saida', veiculo_id: S.v.id, km: 1100, data: '2026-10-29', horario: '08:00', destino_id: String(id), condutor_nome: 'Carlos',
  });
  assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
  assert.deepStrictEqual([saida.body.viagem.origem, saida.body.viagem.destino, saida.body.viagem.destino_id], ['GMP', 'Obra Antiga', id]);
  const ret = await ana('post', REG, { tipo: 'retorno', km: 1120, data: '2026-10-29', horario: '10:00' });
  assert.strictEqual(ret.status, 201, JSON.stringify(ret.body));
  S.antigo = id;
});

// ── (c) ────────────────────────────────────────────────────────────────────────────────────────
test('(c) pela rota: "+" do motorista com nome ja ativo e sem endereco -> 409 com o existente -> saida com esse id grava', async () => {
  const ana = login.como(ANA);
  const gestor = login.como(GESTOR);
  const d = await gestor('post', '/api/frotas/destinos', comEndereco({ nome: 'Fornecedor Gama' }));
  assert.strictEqual(d.status, 201, JSON.stringify(d.body));

  const antes = (await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_destinos')).n;
  const dup = await ana('post', '/api/frotas/destinos', { nome: '  fornecedor   GAMA ' });
  assert.strictEqual(dup.status, 409, `A8: o nome decide antes do endereco: ${JSON.stringify(dup.body)}`);
  assert.strictEqual(dup.body.code, 'DESTINO_DUPLICADO');
  assert.deepStrictEqual(dup.body.destino, {
    id: d.body.id, nome: 'Fornecedor Gama', endereco: ENDERECO_OK_MONTADO, cidade: 'São Bernardo do Campo', uf: 'SP', ativo: 1,
  }, 'A4: o extra traz id, nome, endereco, cidade, uf e ativo');
  assert.strictEqual((await dbGet(ctx.db, 'SELECT COUNT(*) n FROM frotas_destinos')).n, antes, 'nada criado');

  // a tela seleciona o existente e a saida usa o id dele
  const saida = await ana('post', REG, {
    tipo: 'saida', veiculo_id: S.v.id, km: 1130, destino_id: dup.body.destino.id, condutor_nome: 'Carlos',
  });
  assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
  assert.strictEqual(saida.body.viagem.destino, 'Fornecedor Gama');
  assert.strictEqual(saida.body.viagem.destino_id, d.body.id);
  assert.strictEqual(saida.body.viagem.origem, 'GMP');
  const ret = await ana('post', REG, { tipo: 'retorno', km: 1150 });
  assert.strictEqual(ret.status, 201, JSON.stringify(ret.body));
});

// ── (d) ────────────────────────────────────────────────────────────────────────────────────────
test('(d) pelo servico: createDestino + createViagem com destino_id; configuracoes preenchida -> meta.origemEndereco e inicio.origem (RN-F9.21/22)', async () => {
  const { db } = ctx;
  const gestorUser = { id: GESTOR, nome: 'Gestor', role: 'admin' };
  const anaUser = { id: ANA, nome: 'Ana', role: 'usuario' };
  const dest = await frotasService.createDestino(db, gestorUser, {
    nome: ' Cliente  Delta ', cep: '09.844-100', logradouro: ' Rua  Um ', numero: 'S/N', bairro: 'Batistini', cidade: 'São Bernardo do Campo', uf: 'sp',
  });
  assert.strictEqual(dest.nome, 'Cliente Delta');
  assert.strictEqual(dest.endereco, 'Rua Um, S/N, Batistini, São Bernardo do Campo/SP, CEP 09844-100');
  const vg = await frotasService.createViagem(db, gestorUser, { veiculo_id: S.v.id, destino_id: String(dest.id) });
  assert.deepStrictEqual([vg.destino, vg.destino_id, vg.origem], ['Cliente Delta', dest.id, 'GMP']);
  await frotasService.deleteDestino(db, dest.id);
  const ed = await frotasService.updateViagem(db, vg.id, { km_saida: 1200, destino_id: dest.id }, gestorUser);
  assert.deepStrictEqual([ed.km_saida, ed.destino, ed.destino_id], [1200, 'Cliente Delta', dest.id]);

  // sem a tabela: '' (nunca 500)
  assert.strictEqual((await frotasService.getMeta(db)).origemEndereco, '');
  await dbRun(db, 'CREATE TABLE IF NOT EXISTS configuracoes (id INTEGER PRIMARY KEY AUTOINCREMENT, chave TEXT UNIQUE NOT NULL, valor TEXT)');
  const pares = [
    ['empresa_endereco', 'Av. Angelo Demarchi 130, Batistini'], ['empresa_cidade', 'São Bernardo do Campo'],
    ['empresa_estado', 'sp'], ['empresa_cep', '09844100'],
  ];
  for (const p of pares) await dbRun(db, 'INSERT OR REPLACE INTO configuracoes (chave, valor) VALUES (?, ?)', p);
  const ESPERADO = 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP, CEP 09844-100';
  assert.strictEqual((await frotasService.getMeta(db)).origemEndereco, ESPERADO);
  assert.deepStrictEqual((await portalService.inicio(db, anaUser)).origem, { nome: 'GMP', endereco: ESPERADO });
  // e pela rota (login real) chega igual
  assert.strictEqual((await login.como(GESTOR)('get', '/api/frotas/meta')).body.origemEndereco, ESPERADO);
  assert.deepStrictEqual((await login.como(ANA)('get', '/api/frotas/portal/inicio')).body.origem, { nome: 'GMP', endereco: ESPERADO });

  // Configuracoes sem CEP -> termina em /SP
  await dbRun(db, "DELETE FROM configuracoes WHERE chave = 'empresa_cep'");
  assert.strictEqual((await frotasService.getMeta(db)).origemEndereco, 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrota Etapa 9 — I1 (integracao pela rota e pelo servico)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
