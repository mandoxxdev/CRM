/**
 * Frota Etapa 8 (G2) — saida do portal com origem GMP, carro liberado para funcionarios (condutor) e destino cadastrado (features 21 e 22).
 *
 *   RN-F8.15  POST/PUT /veiculos aceitam uso_funcionarios (0/1, true/false, '0'/'1'); GET devolve 0/1; ausente no PUT mantem
 *   RN-F8.17  saida sem origem -> 'GMP'; origem '' -> 'GMP' (ajuste 11); origem 'Filial' -> 'Filial'
 *   RN-F8.18  carro liberado: condutor ausente/vazio/so espacos -> 400 'Informe quem vai dirigir (condutor)'; > 120 -> 400; com -> aparado.
 *             Carro comum: opcional
 *   RN-F8.19  CORRIDA: a marca ligada enquanto a saida espera na fila -> 400 (o veiculo e relido DENTRO da fila)
 *   ajuste T-2  ordem dentro da fila: destino -> condutor -> km menor: km menor E sem condutor -> 400 (nao 409)
 *   RN-F8.20  POST/PUT /viagens com condutor_nome (<= 120; null/ausente no PUT mantem — ajuste 8); a aprovada consumida mantem a
 *             origem do gestor e ganha o condutor (ajuste 10: COALESCE(?, origem, 'GMP'))
 *   RN-F8.21  /portal/inicio.viagem_aberta.condutor_nome
 *   RN-F8.31  destino_id ativo -> destino = nome e destino_id; inexistente/desativado/nao numerico -> 400 'Destino não encontrado';
 *             texto sem id continua; com os dois o id manda; renomear/desativar depois nao muda a viagem
 *   RN-F8.32  /portal/inicio.destinos = ativos { id, nome, endereco } por nome
 *   ajuste 22  GET /viagens?search= acha pelo condutor
 *   RN-F8.39  o mesmo pelo servico (portalService.registrar), sem HTTP
 *
 * Plano: docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md
 * Executar: cd server && node tests/api/frotasSaidaCondutor.api.test.js
 */
const assert = require('assert');
const { createFrotasTestApp, ADMIN, MOTORISTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const { comEndereco } = require('../helpers/frotasDestinoFixture');
const { dbGet, dbRun } = require('../../services/frotas/db');
const { naFilaDeViagens } = require('../../services/frotas/filaDeViagens');
const portalService = require('../../services/frotas/portalService');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

let ctx;
const S = {};
const ana = (m, u, c) => ctx.como(MOTORISTA)(m, u, c);
const bruno = (m, u, c) => ctx.como(MOTORISTA2)(m, u, c);
const gestor = (m, u, c) => ctx.como(ADMIN)(m, u, c);
const REG = '/api/frotas/portal/registros';
const MSG_CONDUTOR = 'Informe quem vai dirigir (condutor)';
const MSG_CONDUTOR_LONGO = 'Condutor: no máximo 120 caracteres';
const MSG_DESTINO = 'Destino não encontrado';

const conta = async (sql, p = []) => (await dbGet(ctx.db, sql, p)).n;
const kmDe = async (id) => Number((await dbGet(ctx.db, 'SELECT km_atual FROM frotas_veiculos WHERE id = ?', [id])).km_atual) || 0;
const viagemDb = (id) => dbGet(ctx.db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Saida que tem de dar 201: km = o atual do veiculo + 1. Devolve a viagem da resposta. */
async function saidaOk(quem, veiculo, extra = {}) {
  const r = await quem('post', REG, { tipo: 'saida', veiculo_id: veiculo.id, km: (await kmDe(veiculo.id)) + 1, ...extra });
  assert.strictEqual(r.status, 201, `saida ${JSON.stringify(extra)} -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.viagem;
}
async function retornoOk(quem, viagem, extra = {}) {
  const r = await quem('post', REG, { tipo: 'retorno', km: Number(viagem.km_saida) + 5, ...extra });
  assert.strictEqual(r.status, 201, `retorno -> ${r.status} ${JSON.stringify(r.body)}`);
  return r.body.viagem;
}
/** Saida que tem de ser recusada; prova que nada foi gravado. */
async function saidaRecusada(quem, veiculo, extra, status, msg) {
  const antes = { v: await conta('SELECT COUNT(*) n FROM frotas_viagens'), c: await conta('SELECT COUNT(*) n FROM frotas_checklists') };
  const km = extra.km !== undefined ? extra.km : (await kmDe(veiculo.id)) + 1;
  const r = await quem('post', REG, { tipo: 'saida', veiculo_id: veiculo.id, ...extra, km });
  assert.strictEqual(r.status, status, `${JSON.stringify(extra)} -> ${r.status} ${JSON.stringify(r.body)}`);
  if (msg) assert.strictEqual(r.body.error, msg, JSON.stringify(extra));
  assert.strictEqual(await conta('SELECT COUNT(*) n FROM frotas_viagens'), antes.v, 'nenhuma viagem gravada');
  assert.strictEqual(await conta('SELECT COUNT(*) n FROM frotas_checklists'), antes.c, 'nenhum registro gravado');
  return r;
}

async function cenario() {
  const v = async (placa, extra = {}) => {
    const r = await gestor('post', '/api/frotas/veiculos', { placa, ...extra });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  S.v1 = await v('SAI0001', { km_atual: 1000 });
  S.v2 = await v('SAI0002', { km_atual: 500, uso_funcionarios: true });
  S.v3 = await v('SAI0003', { km_atual: 100 });
  S.v4 = await v('SAI0004', { km_atual: 100 });
  S.v5 = await v('SAI0005', { km_atual: 300 });
  S.v6 = await v('SAI0006', { km_atual: 2000, uso_funcionarios: '1' });
  S.ma = (await gestor('post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 })).body;
  S.mb = (await gestor('post', '/api/frotas/motoristas', { nome: 'Bruno Motorista', usuario_id: 4 })).body;
  assert(S.ma.id && S.mb.id);
  const d = async (corpo) => {
    const r = await ana('post', '/api/frotas/destinos', comEndereco(corpo)); // Etapa 9 (A12): endereco obrigatorio
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  S.dAlfa = await d({ nome: 'Cliente Alfa', logradouro: 'Rua A', numero: '10' });
  S.dBeta = await d({ nome: 'Obra Beta' });
  S.dDesat = await d({ nome: 'Antigo' });
  const del = await gestor('delete', `/api/frotas/destinos/${S.dDesat.id}`);
  assert.strictEqual(del.status, 200);
}

// ── RN-F8.15 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.15 uso_funcionarios: POST com true/\'1\' -> 1, sem -> 0; PUT normaliza (true/\'1\'/1 -> 1, resto 0); ausente no PUT mantem', async () => {
  assert.strictEqual(S.v1.uso_funcionarios, 0);
  assert.strictEqual(S.v2.uso_funcionarios, 1);
  assert.strictEqual(S.v6.uso_funcionarios, 1);
  const lista = await gestor('get', '/api/frotas/veiculos');
  assert.strictEqual(lista.body.find((x) => x.id === S.v1.id).uso_funcionarios, 0);
  assert.strictEqual(lista.body.find((x) => x.id === S.v2.id).uso_funcionarios, 1);
  const um = await gestor('get', `/api/frotas/veiculos/${S.v2.id}`);
  assert.strictEqual(um.body.uso_funcionarios, 1);
  const on = await gestor('put', `/api/frotas/veiculos/${S.v1.id}`, { uso_funcionarios: true });
  assert.strictEqual(on.status, 200, JSON.stringify(on.body));
  assert.strictEqual(on.body.uso_funcionarios, 1);
  const mantem = await gestor('put', `/api/frotas/veiculos/${S.v1.id}`, { modelo: 'Strada' });
  assert.strictEqual(mantem.body.uso_funcionarios, 1, 'ausente no PUT mantem');
  const off = await gestor('put', `/api/frotas/veiculos/${S.v1.id}`, { uso_funcionarios: '0' });
  assert.strictEqual(off.body.uso_funcionarios, 0);
  const on1 = await gestor('put', `/api/frotas/veiculos/${S.v1.id}`, { uso_funcionarios: '1' });
  assert.strictEqual(on1.body.uso_funcionarios, 1);
  const offFalse = await gestor('put', `/api/frotas/veiculos/${S.v1.id}`, { uso_funcionarios: false });
  assert.strictEqual(offFalse.body.uso_funcionarios, 0);
  const onNum = await gestor('put', `/api/frotas/veiculos/${S.v1.id}`, { uso_funcionarios: 1 });
  assert.strictEqual(onNum.body.uso_funcionarios, 1);
  const lixo = await gestor('put', `/api/frotas/veiculos/${S.v1.id}`, { uso_funcionarios: 'sim' });
  assert.strictEqual(lixo.body.uso_funcionarios, 0, 'o que nao e true/1 vira 0');
  const semMarca = await gestor('post', '/api/frotas/veiculos', { placa: 'SAI0007', uso_funcionarios: 'false' });
  assert.strictEqual(semMarca.body.uso_funcionarios, 0);
  // /portal/inicio traz a marca em cada veiculo
  const ini = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.veiculos.find((x) => x.id === S.v2.id).uso_funcionarios, 1);
  assert.strictEqual(ini.body.veiculos.find((x) => x.id === S.v1.id).uso_funcionarios, 0);
});

// ── RN-F8.17 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.17 saida sem origem -> GMP; origem \'\' -> GMP; origem \'Filial\' -> Filial', async () => {
  const semOrigem = await saidaOk(ana, S.v1, { destino: 'Cliente X' });
  assert.strictEqual(semOrigem.origem, 'GMP');
  assert.strictEqual(semOrigem.destino, 'Cliente X');
  assert.strictEqual(semOrigem.destino_id, null);
  assert.strictEqual(semOrigem.condutor_nome, null);
  assert.strictEqual(semOrigem.status, 'em_andamento');
  await retornoOk(ana, semOrigem);
  const vazia = await saidaOk(ana, S.v1, { origem: '' });
  assert.strictEqual(vazia.origem, 'GMP');
  await retornoOk(ana, vazia);
  const filial = await saidaOk(ana, S.v1, { origem: 'Filial' });
  assert.strictEqual(filial.origem, 'Filial');
  await retornoOk(ana, filial);
  assert.strictEqual((await viagemDb(semOrigem.id)).origem, 'GMP', 'no banco tambem');
});

// ── RN-F8.18 / RN-F8.21 ────────────────────────────────────────────────────────────────────────
test('RN-F8.18 carro liberado: sem condutor (ausente, vazio, espacos, nao-string) -> 400; > 120 -> 400; com -> grava aparado (RN-F8.21 no inicio)', async () => {
  await saidaRecusada(ana, S.v2, {}, 400, MSG_CONDUTOR);
  await saidaRecusada(ana, S.v2, { condutor_nome: '' }, 400, MSG_CONDUTOR);
  await saidaRecusada(ana, S.v2, { condutor_nome: '   ' }, 400, MSG_CONDUTOR);
  await saidaRecusada(ana, S.v2, { condutor_nome: null }, 400, MSG_CONDUTOR);
  await saidaRecusada(ana, S.v2, { condutor_nome: 123 }, 400, MSG_CONDUTOR);
  await saidaRecusada(ana, S.v2, { condutor_nome: 'x'.repeat(121) }, 400, MSG_CONDUTOR_LONGO);
  const viagem = await saidaOk(ana, S.v2, { condutor_nome: '  Carlos  ', destino: 'Obra' });
  assert.strictEqual(viagem.condutor_nome, 'Carlos');
  assert.strictEqual(viagem.origem, 'GMP');
  const ini = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.viagem_aberta.id, viagem.id);
  assert.strictEqual(ini.body.viagem_aberta.condutor_nome, 'Carlos', 'RN-F8.21');
  assert.strictEqual(ini.body.viagem_aberta.destino, 'Obra');
  await retornoOk(ana, viagem);
  // 120 exatos passam (espacos em volta nao contam)
  const limite = await saidaOk(ana, S.v2, { condutor_nome: `  ${'y'.repeat(120)}  ` });
  assert.strictEqual(limite.condutor_nome, 'y'.repeat(120));
  await retornoOk(ana, limite);
});

test('RN-F8.18 carro comum: condutor opcional (sem -> null; com -> grava; > 120 -> 400 mesmo assim)', async () => {
  const sem = await saidaOk(ana, S.v1, {});
  assert.strictEqual(sem.condutor_nome, null);
  await retornoOk(ana, sem);
  const com = await saidaOk(ana, S.v1, { condutor_nome: ' Dani ' });
  assert.strictEqual(com.condutor_nome, 'Dani');
  await retornoOk(ana, com);
  await saidaRecusada(ana, S.v1, { condutor_nome: 'x'.repeat(121) }, 400, MSG_CONDUTOR_LONGO);
});

// ── RN-F8.19 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.19 CORRIDA: o gestor liga a marca enquanto a saida sem condutor espera na fila -> 400 (veiculo relido dentro da fila)', async () => {
  const ini = await bruno('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.veiculos.find((x) => x.id === S.v5.id).uso_funcionarios, 0, 'a tela do Bruno nao mostra o campo');
  const antes = await conta('SELECT COUNT(*) n FROM frotas_viagens');
  // Segura a fila de viagens (e a mesma do processo): a saida entra e espera atras deste gancho
  let soltar;
  const gancho = new Promise((r) => { soltar = r; });
  const segurando = naFilaDeViagens(() => gancho);
  // `.then` dispara o envio AGORA (o Test do supertest e preguicoso: sem isso a requisicao so sairia no `await`, depois de soltar o
  // gancho — e o teste passava sem provar a fila)
  const saida = bruno('post', REG, { tipo: 'saida', veiculo_id: S.v5.id, km: 301 }).then((r) => r);
  await sleep(150); // a requisicao ja passou pelas validacoes de fora e esta na fila
  await dbRun(ctx.db, 'UPDATE frotas_veiculos SET uso_funcionarios = 1 WHERE id = ?', [S.v5.id]); // o gestor, um segundo antes
  soltar();
  await segurando;
  const r = await saida;
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, MSG_CONDUTOR);
  assert.strictEqual(await conta('SELECT COUNT(*) n FROM frotas_viagens'), antes, 'nada gravado');
  assert.strictEqual(await kmDe(S.v5.id), 300, 'o km do veiculo nao subiu');
  // com o condutor, agora passa
  const ok = await saidaOk(bruno, S.v5, { condutor_nome: 'Fabio' });
  assert.strictEqual(ok.condutor_nome, 'Fabio');
  await retornoOk(bruno, ok);
});

// ── ajuste T-2 ─────────────────────────────────────────────────────────────────────────────────
test('ajuste T-2 ordem na fila: km menor E sem condutor -> 400 do condutor (nao 409); destino torto vem antes do condutor; so com tudo certo o 409', async () => {
  assert.strictEqual(await kmDe(S.v6.id), 2000);
  await saidaRecusada(ana, S.v6, { km: 1500 }, 400, MSG_CONDUTOR);
  await saidaRecusada(ana, S.v6, { km: 1500, destino_id: 9999 }, 400, MSG_DESTINO);
  await saidaRecusada(ana, S.v6, { km: 1500, destino_id: 9999, condutor_nome: 'Eva' }, 400, MSG_DESTINO);
  const r = await saidaRecusada(ana, S.v6, { km: 1500, condutor_nome: 'Eva' }, 409);
  assert.strictEqual(r.body.code, 'KM_MENOR_QUE_ATUAL');
  // confirmando o km menor, com o condutor, grava
  const ok = await ana('post', REG, { tipo: 'saida', veiculo_id: S.v6.id, km: 1500, condutor_nome: 'Eva', confirmar_km_menor: true });
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.viagem.condutor_nome, 'Eva');
  assert.strictEqual(ok.body.viagem.km_saida, 1500);
  // confirmar o km menor NAO dispensa o condutor (o retorno sobe acima do atual do veiculo, 2000, para nao cair no 409 do retorno)
  await retornoOk(ana, ok.body.viagem, { km: 2005 });
  await saidaRecusada(ana, S.v6, { km: 1500, confirmar_km_menor: true }, 400, MSG_CONDUTOR);
});

// ── RN-F8.20 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.20 gestor: POST/PUT /viagens com condutor_nome (aparado, <= 120); null/ausente no PUT mantem (ajuste 8); GET devolve', async () => {
  const r = await gestor('post', '/api/frotas/viagens', {
    veiculo_id: S.v3.id, motorista_id: S.ma.id, data_saida: '2026-10-01T08:00', destino: 'Feira', condutor_nome: '  Carlos  ',
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  assert.strictEqual(r.body.condutor_nome, 'Carlos');
  assert.strictEqual(r.body.destino_id, null);
  // Frota Etapa 9 (RN-F9.24): a tela do gestor nao manda mais a origem — o servidor grava o GMP (antes a tela preenchia)
  assert.strictEqual(r.body.origem, 'GMP', 'o POST do gestor sem origem grava GMP (Etapa 9)');
  S.vg = r.body;
  const longo = await gestor('post', '/api/frotas/viagens', { veiculo_id: S.v3.id, condutor_nome: 'x'.repeat(121) });
  assert.strictEqual(longo.status, 400);
  assert.strictEqual(longo.body.error, MSG_CONDUTOR_LONGO);
  const lista = await gestor('get', '/api/frotas/viagens');
  assert.strictEqual(lista.body.find((x) => x.id === S.vg.id).condutor_nome, 'Carlos');
  const muda = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { condutor_nome: ' Dani ' });
  assert.strictEqual(muda.status, 200, JSON.stringify(muda.body));
  assert.strictEqual(muda.body.condutor_nome, 'Dani');
  const nulo = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { condutor_nome: null, destino: 'Feira 2' });
  assert.strictEqual(nulo.body.condutor_nome, 'Dani', 'null mantem (B80)');
  assert.strictEqual(nulo.body.destino, 'Feira 2');
  const ausente = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { finalidade: 'Compra' });
  assert.strictEqual(ausente.body.condutor_nome, 'Dani', 'ausente mantem');
  const vazio = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { condutor_nome: '' });
  assert.strictEqual(vazio.body.condutor_nome, 'Dani', "'' mantem (a tela manda null no campo vazio)");
  const longoPut = await gestor('put', `/api/frotas/viagens/${S.vg.id}`, { condutor_nome: 'x'.repeat(121) });
  assert.strictEqual(longoPut.status, 400);
  assert.strictEqual(longoPut.body.error, MSG_CONDUTOR_LONGO);
  assert.strictEqual((await viagemDb(S.vg.id)).condutor_nome, 'Dani');
  // o motorista tambem manda condutor na propria viagem (registrar_operacoes)
  const doMotorista = await ana('post', '/api/frotas/viagens', { veiculo_id: S.v3.id, destino: 'Mercado', condutor_nome: 'Gui' });
  assert.strictEqual(doMotorista.status, 201, JSON.stringify(doMotorista.body));
  assert.strictEqual(doMotorista.body.condutor_nome, 'Gui');
  assert.strictEqual(doMotorista.body.motorista_id, S.ma.id);
});

test('ajuste 22 GET /viagens?search=Carlos acha pelo condutor', async () => {
  const r = await gestor('get', '/api/frotas/viagens?search=Carlos');
  assert.strictEqual(r.status, 200);
  assert(r.body.length >= 1, 'achou a viagem do portal com condutor Carlos');
  assert(r.body.every((x) => /Carlos/.test(`${x.condutor_nome} ${x.destino} ${x.finalidade} ${x.placa}`)));
  assert(r.body.some((x) => x.condutor_nome === 'Carlos' && x.veiculo_id === S.v2.id));
  const nada = await gestor('get', '/api/frotas/viagens?search=Ninguem');
  assert.deepStrictEqual(nada.body, []);
});

test('RN-F8.20 (ajuste 10) aprovada com origem Matriz consumida pela saida sem origem MANTEM Matriz e ganha o condutor', async () => {
  const ap = await gestor('post', '/api/frotas/viagens', {
    veiculo_id: S.v3.id, motorista_id: S.ma.id, status: 'aprovada', origem: 'Matriz', destino: 'Obra Velha', finalidade: 'Visita',
  });
  assert.strictEqual(ap.status, 201, JSON.stringify(ap.body));
  const v = await saidaOk(ana, S.v3, { condutor_nome: 'Carlos' });
  assert.strictEqual(v.id, ap.body.id, 'B8: a aprovada virou a desta saida');
  assert.strictEqual(v.status, 'em_andamento');
  assert.strictEqual(v.origem, 'Matriz', 'a origem do gestor nao e sobrescrita pelo GMP');
  assert.strictEqual(v.destino, 'Obra Velha');
  assert.strictEqual(v.destino_id, null);
  assert.strictEqual(v.condutor_nome, 'Carlos');
  assert.strictEqual(v.finalidade, 'Visita');
  await retornoOk(ana, v);
});

test('RN-F8.20 (ajuste 10) aprovada SEM origem consumida sem origem -> GMP; destino_id da saida manda; condutor da aprovada fica se a saida nao manda', async () => {
  const ap = await gestor('post', '/api/frotas/viagens', {
    veiculo_id: S.v4.id, motorista_id: S.mb.id, status: 'aprovada', destino: 'Qualquer', condutor_nome: 'Pre',
  });
  assert.strictEqual(ap.status, 201, JSON.stringify(ap.body));
  assert.strictEqual(ap.body.origem, 'GMP', 'Etapa 9 (RN-F9.24): o POST do gestor sem origem ja grava GMP');
  const v = await saidaOk(bruno, S.v4, { destino_id: S.dAlfa.id });
  assert.strictEqual(v.id, ap.body.id);
  assert.strictEqual(v.origem, 'GMP');
  assert.strictEqual(v.destino, 'Cliente Alfa');
  assert.strictEqual(v.destino_id, S.dAlfa.id);
  assert.strictEqual(v.condutor_nome, 'Pre', 'COALESCE: sem condutor na saida, fica o da aprovada');
  await retornoOk(bruno, v);
});

// ── RN-F8.31 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.31 destino_id ativo -> destino = nome e destino_id (numero ou texto numerico); texto sem id continua', async () => {
  const v = await saidaOk(ana, S.v1, { destino_id: S.dAlfa.id, condutor_nome: 'Heitor' });
  assert.strictEqual(v.destino, 'Cliente Alfa');
  assert.strictEqual(v.destino_id, S.dAlfa.id);
  assert.strictEqual(v.origem, 'GMP');
  assert.strictEqual(v.condutor_nome, 'Heitor');
  const g = await gestor('get', '/api/frotas/viagens');
  const naLista = g.body.find((x) => x.id === v.id);
  assert.strictEqual(naLista.destino, 'Cliente Alfa');
  assert.strictEqual(naLista.destino_id, S.dAlfa.id);
  assert.strictEqual(naLista.condutor_nome, 'Heitor');
  await retornoOk(ana, v);
  const texto = await saidaOk(ana, S.v1, { destino: 'Texto livre' });
  assert.strictEqual(texto.destino, 'Texto livre');
  assert.strictEqual(texto.destino_id, null);
  await retornoOk(ana, texto);
  const comoString = await saidaOk(ana, S.v1, { destino_id: String(S.dBeta.id) });
  assert.strictEqual(comoString.destino, 'Obra Beta');
  assert.strictEqual(comoString.destino_id, S.dBeta.id);
  await retornoOk(ana, comoString);
  const semNada = await saidaOk(ana, S.v1, {});
  assert.strictEqual(semNada.destino, null);
  assert.strictEqual(semNada.destino_id, null);
  await retornoOk(ana, semNada);
});

test('RN-F8.31 destino_id inexistente/desativado/nao numerico/zero/negativo -> 400 Destino não encontrado; nada gravado', async () => {
  for (const destino_id of [9999, S.dDesat.id, 'abc', 0, -1, '12.5', 1.5, {}, [], true]) {
    await saidaRecusada(ana, S.v1, { destino_id, destino: 'Ignorado' }, 400, MSG_DESTINO);
  }
  // o destino desativado no meio da fila tambem cai (o SELECT e dentro da fila)
  const extra = (await ana('post', '/api/frotas/destinos', comEndereco({ nome: 'Efemero' }))).body;
  let soltar;
  const gancho = new Promise((r) => { soltar = r; });
  const segurando = naFilaDeViagens(() => gancho);
  const saida = ana('post', REG, { tipo: 'saida', veiculo_id: S.v1.id, km: (await kmDe(S.v1.id)) + 1, destino_id: extra.id }).then((r) => r);
  await sleep(150); // envio disparado pelo `.then`; a saida espera na fila atras do gancho
  await gestor('delete', `/api/frotas/destinos/${extra.id}`);
  soltar();
  await segurando;
  const r = await saida;
  assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  assert.strictEqual(r.body.error, MSG_DESTINO);
});

test('RN-F8.31 com destino texto E destino_id, o id manda; renomear/desativar o destino depois nao muda a viagem', async () => {
  const v = await saidaOk(ana, S.v1, { destino_id: S.dBeta.id, destino: 'Ignorado' });
  assert.strictEqual(v.destino, 'Obra Beta');
  assert.strictEqual(v.destino_id, S.dBeta.id);
  const ren = await gestor('put', `/api/frotas/destinos/${S.dBeta.id}`, { nome: 'Obra Beta Nova' });
  assert.strictEqual(ren.status, 200, JSON.stringify(ren.body));
  assert.strictEqual((await viagemDb(v.id)).destino, 'Obra Beta', 'a viagem guarda o nome da hora');
  const ini = await ana('get', '/api/frotas/portal/inicio');
  assert.strictEqual(ini.body.viagem_aberta.destino, 'Obra Beta');
  assert(ini.body.destinos.some((d) => d.nome === 'Obra Beta Nova'));
  await gestor('delete', `/api/frotas/destinos/${S.dBeta.id}`);
  assert.strictEqual((await viagemDb(v.id)).destino, 'Obra Beta');
  assert.strictEqual((await viagemDb(v.id)).destino_id, S.dBeta.id, 'a referencia fica (historico)');
  await retornoOk(ana, v);
  const fechada = await viagemDb(v.id);
  assert.strictEqual(fechada.status, 'concluida');
  assert.strictEqual(fechada.destino, 'Obra Beta');
});

// ── RN-F8.32 ───────────────────────────────────────────────────────────────────────────────────
// Frota Etapa 9 (RN-F9.09, A12): + cidade e uf; o endereco e o montado pelo servidor
test('RN-F8.32/RN-F9.09 /portal/inicio.destinos = ativos { id, nome, endereco, cidade, uf } por nome (o desativado fica fora)', async () => {
  const r = await bruno('get', '/api/frotas/portal/inicio');
  assert.strictEqual(r.status, 200);
  assert(Array.isArray(r.body.destinos));
  assert(r.body.destinos.length >= 1);
  for (const d of r.body.destinos) assert.deepStrictEqual(Object.keys(d).sort(), ['cidade', 'endereco', 'id', 'nome', 'uf']);
  const nomes = r.body.destinos.map((d) => d.nome);
  assert.deepStrictEqual(nomes, [...nomes].sort((a, b) => a.localeCompare(b)));
  assert(!r.body.destinos.some((d) => d.id === S.dDesat.id), 'desativado fora');
  assert(!r.body.destinos.some((d) => d.id === S.dBeta.id), 'o Beta foi desativado no teste anterior');
  assert.deepStrictEqual(r.body.destinos.find((d) => d.id === S.dAlfa.id), {
    id: S.dAlfa.id, nome: 'Cliente Alfa', endereco: 'Rua A, 10, Centro, São Bernardo do Campo/SP', cidade: 'São Bernardo do Campo', uf: 'SP',
  });
  // sem vinculo tambem recebe a lista (a tela monta o select antes de saber)
  const sem = await ctx.como({ id: 99, nome: 'Sem vinculo', role: 'usuario' })('get', '/api/frotas/portal/inicio');
  assert.strictEqual(sem.status, 200);
  assert(Array.isArray(sem.body.destinos));
});

// ── RN-F8.39 ───────────────────────────────────────────────────────────────────────────────────
test('RN-F8.39 pelo servico (portalService.registrar, sem HTTP): origem GMP, destino pelo id, condutor; a marca exige o condutor', async () => {
  const user = { id: 4, nome: 'Bruno', role: 'usuario' };
  assert.strictEqual((await dbGet(ctx.db, 'SELECT uso_funcionarios u FROM frotas_veiculos WHERE id = ?', [S.v5.id])).u, 1);
  const kmAtual = await kmDe(S.v5.id);
  await assert.rejects(
    () => portalService.registrar(ctx.db, user, { tipo: 'saida', veiculo_id: S.v5.id, km: kmAtual + 1, destino_id: S.dAlfa.id }),
    (e) => e.status === 400 && e.message === MSG_CONDUTOR,
  );
  const { viagem } = await portalService.registrar(ctx.db, user, {
    tipo: 'saida', veiculo_id: S.v5.id, km: (await kmDe(S.v5.id)) + 1, destino_id: S.dAlfa.id, condutor_nome: ' Zeca ',
  });
  assert.strictEqual(viagem.origem, 'GMP');
  assert.strictEqual(viagem.destino, 'Cliente Alfa');
  assert.strictEqual(viagem.destino_id, S.dAlfa.id);
  assert.strictEqual(viagem.condutor_nome, 'Zeca');
  const fechada = await portalService.registrar(ctx.db, user, { tipo: 'retorno', km: Number(viagem.km_saida) + 3 });
  assert.strictEqual(fechada.viagem.status, 'concluida');
  assert.strictEqual(fechada.viagem.condutor_nome, 'Zeca');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrota Etapa 8 — G2 (saida: origem GMP, condutor, destino cadastrado)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
