/**
 * Etapa 66, Task 6 (integracao, cruza os galhos) — motivo de movimentacao do cadastro, ponta a ponta.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa66-motivos-de-movimentacao.md (T6 e a
 * secao "Fase 2 — revisao do plano", que prevalece sobre o texto anterior).
 *
 * TUDO PELAS ROTAS HTTP (o banco so e tocado para montar localizacao/material): T1 (cadastro), T2
 * (motor + v2) e T3 (relatorio) foram testados cada um no seu galho; aqui se prova que as tres
 * pecas conversam — o id que o cadastro devolve e o que a v2 grava, e o que o relatorio filtra.
 *
 *  (1) admin cadastra "Avaria no manuseio" (AJUSTE, PERDA)
 *  (2) almoxarife lista: ?tipo=AJUSTE e ?tipo=PERDA trazem, ?tipo=TRANSFERENCIA nao
 *  (3) sem perfil (fallback PRODUCAO): le a lista, mas POST/PUT/DELETE -> 403
 *  (4) PERDA pela v2 com motivo_id + complemento -> livro e extrato com motivo, justificativa e id
 *  (5) relatorio por motivo_id traz a linha do cadastro e NAO a de texto livre com o mesmo nome
 *  (6) renomear (PUT) nao reescreve o livro; nova PERDA grava o nome novo; o filtro junta as duas
 *  (7) desativar (DELETE): v2 recusa com o literal, sem tocar no saldo; some do ?tipo=, fica no ?todos=1
 *  (8) estornar a PERDA original funciona e a linha ESTORNO nao entra no filtro por motivo (a original
 *      estornada tambem sai: o historico exclui cancelado = 1 desde antes desta etapa)
 *
 * Executar: cd server && node tests/api/motivosMovimentacaoIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 666, nome: 'Admin E66T6', role: 'admin', is_superadmin: 1, email: 'e66t6@test.com' };
const ALMOXARIFE = { id: 6661, nome: 'Almoxarife E66T6', perfil_almoxarifado: 'ALMOXARIFE' };
const SEM_PERFIL = { id: 6662, nome: 'Chao de Fabrica E66T6' };

const URL_MOT = '/api/almoxarifado/motivos-movimentacao';
const URL_REL = '/api/almoxarifado/relatorios/historico-movimentacoes';
const NOME = 'Avaria no manuseio';
const NOVO_NOME = 'Avaria';

(async () => {
  console.log('\n=== Etapa 66 Task 6: motivo do cadastro ponta a ponta ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });
  setUser({ ...ADMIN });

  const loc = (await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?,?,1)', ['E66T6-L', 'E66T6-L'])).lastID;
  const matId = (await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, unidade, quantidade_atual, ativo, tipo_material, localizacao_padrao_id) VALUES (?, 'Mat E66T6', 'UN', 0, 1, 'ACO', ?)`,
  ['E66T6-M', loc])).lastID;

  const v2 = (body) => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: matId, ...body });
  const ok = async (body) => {
    const r = await v2(body);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  const livro = async () => {
    const r = await request(app).get('/api/almoxarifado/movimentacoes').query({ material_id: matId });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const extrato = async () => {
    const r = await request(app).get(`/api/almoxarifado/materiais/${matId}/extrato`);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const relatorio = async (query) => {
    const r = await request(app).get(URL_REL).query({ material_id: matId, ...query });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const listar = async (query) => {
    const r = await request(app).get(URL_MOT).query(query);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const nomes = (lista) => lista.map((m) => m.nome);

  await ok({ tipo: 'ENTRADA', quantidade: 50, localizacao_destino_id: loc, motivo: 'setup e66t6' });

  let motivo = null; // { id, nome, tipos, ativo } devolvido pelo POST
  let idOriginal = null; // a PERDA de (4), com o nome antigo
  let idTextoLivre = null; // a PERDA de texto livre com o mesmo nome
  let idRenomeado = null; // a PERDA de (6), com o nome novo

  await test('(1) admin cadastra o motivo pela rota (201, id inteiro, tipos e ativo)', async () => {
    setUser({ ...ADMIN });
    const r = await request(app).post(URL_MOT).send({ nome: NOME, tipos: ['AJUSTE', 'PERDA'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.ok(Number.isInteger(r.body.id) && r.body.id > 0, JSON.stringify(r.body));
    assert.strictEqual(r.body.nome, NOME);
    assert.deepStrictEqual(r.body.tipos, ['AJUSTE', 'PERDA']);
    assert.strictEqual(r.body.ativo, 1);
    motivo = r.body;
  });

  await test('(2) almoxarife: ?tipo=AJUSTE e ?tipo=PERDA o listam; ?tipo=TRANSFERENCIA nao', async () => {
    setUser({ ...ALMOXARIFE });
    assert.ok(nomes(await listar({ tipo: 'AJUSTE' })).includes(NOME), '?tipo=AJUSTE deveria trazer o motivo');
    assert.ok(nomes(await listar({ tipo: 'PERDA' })).includes(NOME), '?tipo=PERDA deveria trazer o motivo');
    assert.ok(!nomes(await listar({ tipo: 'TRANSFERENCIA' })).includes(NOME), '?tipo=TRANSFERENCIA NAO deveria trazer o motivo');
  });

  await test('(3) sem perfil (fallback PRODUCAO): le a lista, mas POST/PUT/DELETE tomam 403 e nada muda', async () => {
    setUser({ ...SEM_PERFIL });
    // Presenca primeiro: a leitura funciona (o gate de leitura e so o do modulo).
    assert.ok(nomes(await listar({ tipo: 'PERDA' })).includes(NOME), 'sem perfil deveria LER a lista');
    const post = await request(app).post(URL_MOT).send({ nome: 'Intruso E66T6', tipos: ['PERDA'] });
    assert.strictEqual(post.status, 403, `POST sem perfil: ${post.status} ${JSON.stringify(post.body)}`);
    const put = await request(app).put(`${URL_MOT}/${motivo.id}`).send({ nome: 'Renomeado por intruso' });
    assert.strictEqual(put.status, 403, `PUT sem perfil: ${put.status} ${JSON.stringify(put.body)}`);
    const del = await request(app).delete(`${URL_MOT}/${motivo.id}`);
    assert.strictEqual(del.status, 403, `DELETE sem perfil: ${del.status} ${JSON.stringify(del.body)}`);
    setUser({ ...ADMIN });
    const todos = await listar({ todos: 1 });
    assert.ok(!nomes(todos).includes('Intruso E66T6'), 'o POST recusado nao pode ter gravado');
    const atual = todos.find((m) => m.id === motivo.id);
    assert.strictEqual(atual.nome, NOME, 'o PUT recusado nao pode ter renomeado');
    assert.strictEqual(atual.ativo, 1, 'o DELETE recusado nao pode ter desativado');
  });

  await test('(4) PERDA pela v2 com motivo_id + complemento: livro e extrato trazem motivo, justificativa e motivo_id', async () => {
    setUser({ ...ALMOXARIFE });
    const r = await ok({ tipo: 'PERDA', quantidade: 2, localizacao_origem_id: loc, motivo_id: motivo.id, justificativa: '  caixa amassada  ' });
    idOriginal = r.id || r.movimentacao_id || r.movimentacao?.id;
    // A de texto livre com EXATAMENTE o mesmo texto — a que o relatorio por id nao pode trazer.
    const t = await ok({ tipo: 'PERDA', quantidade: 1, localizacao_origem_id: loc, motivo: NOME, justificativa: NOME });
    idTextoLivre = t.id || t.movimentacao_id || t.movimentacao?.id;

    const linhas = (await livro()).filter((l) => l.tipo === 'PERDA');
    const doCadastro = linhas.filter((l) => l.motivo_id === motivo.id);
    assert.strictEqual(doCadastro.length, 1, `livro: esperava 1 PERDA com motivo_id=${motivo.id}: ${JSON.stringify(linhas.map((l) => [l.id, l.motivo, l.motivo_id]))}`);
    const l = doCadastro[0];
    if (!idOriginal) idOriginal = l.id;
    assert.strictEqual(l.motivo, NOME);
    assert.strictEqual(l.justificativa, `${NOME} — caixa amassada`);
    const livre = linhas.find((x) => x.id !== l.id);
    if (!idTextoLivre) idTextoLivre = livre.id;
    assert.strictEqual(livre.motivo, NOME);
    assert.strictEqual(livre.motivo_id, null, 'a PERDA de texto livre nao pode ganhar motivo_id');

    const ex = await extrato();
    const le = ex.movimentacoes.find((x) => x.id === l.id);
    assert.ok(le, 'a linha nao apareceu no extrato do material');
    assert.strictEqual(le.motivo, NOME);
    assert.strictEqual(le.justificativa, `${NOME} — caixa amassada`);
    assert.strictEqual(le.motivo_id, motivo.id);
    assert.strictEqual(ex.material.quantidade_atual, 47, 'saldo depois de 50 - 2 - 1');
  });

  await test('(5) relatorio ?motivo_id traz a linha do cadastro e NAO a de texto livre com o mesmo nome', async () => {
    setUser({ ...ADMIN });
    const semFiltro = await relatorio({ tipo: 'PERDA' });
    assert.strictEqual(semFiltro.length, 2, 'sem o filtro as duas PERDAs aparecem');
    const r = await relatorio({ motivo_id: motivo.id });
    assert.deepStrictEqual(r.map((x) => x.id), [idOriginal],
      `filtro por id: esperava so [${idOriginal}], vieram ${JSON.stringify(r.map((x) => [x.id, x.motivo, x.motivo_id]))}`);
    assert.ok(!r.some((x) => x.id === idTextoLivre), 'a PERDA de texto livre entrou no filtro por id');
    assert.strictEqual(r[0].motivo, NOME);
    assert.strictEqual(r[0].justificativa, `${NOME} — caixa amassada`);
  });

  await test('(6) renomear (PUT) nao reescreve o livro; nova PERDA grava o nome novo; o filtro por id junta as duas', async () => {
    setUser({ ...ADMIN });
    const put = await request(app).put(`${URL_MOT}/${motivo.id}`).send({ nome: NOVO_NOME });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual(put.body.nome, NOVO_NOME);

    const antiga = (await livro()).find((l) => l.id === idOriginal);
    assert.strictEqual(antiga.motivo, NOME, `o PUT reescreveu o motivo da linha antiga: "${antiga.motivo}"`);
    assert.strictEqual(antiga.justificativa, `${NOME} — caixa amassada`, `o PUT reescreveu a justificativa: "${antiga.justificativa}"`);
    assert.strictEqual(antiga.motivo_id, motivo.id, 'a linha antiga perdeu o motivo_id');
    const antigaExtrato = (await extrato()).movimentacoes.find((l) => l.id === idOriginal);
    assert.strictEqual(antigaExtrato.motivo, NOME, 'o extrato mostra o nome novo na linha antiga');

    setUser({ ...ALMOXARIFE });
    const nova = await ok({ tipo: 'PERDA', quantidade: 1, localizacao_origem_id: loc, motivo_id: motivo.id });
    idRenomeado = nova.id || nova.movimentacao_id || nova.movimentacao?.id;
    const ln = (await livro()).filter((l) => l.motivo_id === motivo.id && l.id !== idOriginal);
    assert.strictEqual(ln.length, 1, JSON.stringify(ln));
    if (!idRenomeado) idRenomeado = ln[0].id;
    assert.strictEqual(ln[0].motivo, NOVO_NOME);
    assert.strictEqual(ln[0].justificativa, NOVO_NOME, 'sem complemento a justificativa e so o nome (sem "Nome — ")');

    setUser({ ...ADMIN });
    const r = await relatorio({ motivo_id: motivo.id });
    assert.deepStrictEqual(r.map((x) => x.id).sort((a, b) => a - b), [idOriginal, idRenomeado].sort((a, b) => a - b),
      `o filtro por id deveria juntar os dois nomes: ${JSON.stringify(r.map((x) => [x.id, x.motivo]))}`);
    assert.deepStrictEqual(r.map((x) => x.motivo).sort(), [NOVO_NOME, NOME].sort());
  });

  await test('(7) desativar (DELETE): v2 recusa com o literal sem tocar no saldo; some do ?tipo=, fica no ?todos=1', async () => {
    setUser({ ...ADMIN });
    const del = await request(app).delete(`${URL_MOT}/${motivo.id}`);
    assert.strictEqual(del.status, 200, JSON.stringify(del.body));

    setUser({ ...ALMOXARIFE });
    const antes = (await extrato()).material.quantidade_atual;
    const qtdLivro = (await livro()).length;
    const r = await v2({ tipo: 'PERDA', quantidade: 1, localizacao_origem_id: loc, motivo_id: motivo.id });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, `O motivo "${NOVO_NOME}" está desativado`);
    assert.strictEqual((await extrato()).material.quantidade_atual, antes, 'a recusa mexeu no saldo');
    assert.strictEqual((await livro()).length, qtdLivro, 'a recusa gravou linha no livro');

    // Presenca no ?todos=1 antes da ausencia no ?tipo= (ausencia sozinha passaria com a lista vazia).
    const todos = await listar({ todos: 1 });
    const desativado = todos.find((m) => m.id === motivo.id);
    assert.ok(desativado, '?todos=1 deveria trazer o desativado');
    assert.strictEqual(desativado.ativo, 0);
    assert.ok(!(await listar({ tipo: 'PERDA' })).some((m) => m.id === motivo.id), '?tipo=PERDA nao pode oferecer o desativado');
    assert.ok(!(await listar({ tipo: 'AJUSTE' })).some((m) => m.id === motivo.id), '?tipo=AJUSTE nao pode oferecer o desativado');

    const linhaAntiga = (await extrato()).movimentacoes.find((l) => l.id === idOriginal);
    assert.ok(linhaAntiga, 'o extrato perdeu a linha antiga');
    assert.strictEqual(linhaAntiga.motivo, NOME);
  });

  await test('(8) estornar a PERDA original funciona e a linha ESTORNO nao entra no filtro por motivo', async () => {
    setUser({ ...ADMIN });
    const antes = (await extrato()).material.quantidade_atual;
    const c = await request(app).post(`/api/almoxarifado/movimentacoes/${idOriginal}/cancelar`).send({ motivo: 'lancada por engano e66t6' });
    assert.strictEqual(c.status, 200, JSON.stringify(c.body));
    assert.strictEqual((await extrato()).material.quantidade_atual, antes + 2, 'o estorno da PERDA de 2 devolve 2 ao saldo');

    const linhas = await livro();
    const estornos = linhas.filter((l) => l.tipo === 'ESTORNO');
    assert.strictEqual(estornos.length, 1, `esperava 1 ESTORNO no livro: ${JSON.stringify(estornos)}`);
    assert.strictEqual(estornos[0].motivo_id, null, `o ESTORNO herdou motivo_id=${estornos[0].motivo_id}`);
    assert.strictEqual(linhas.find((l) => l.id === idOriginal).cancelado, 1);

    const r = await relatorio({ motivo_id: motivo.id });
    assert.ok(!r.some((x) => x.tipo === 'ESTORNO'), `a linha ESTORNO entrou no filtro: ${JSON.stringify(r.map((x) => [x.id, x.tipo]))}`);
    // O historico ja exclui `cancelado = 1` (reportService, antes desta etapa): a original estornada
    // sai do filtro junto com o ESTORNO, e fica so a PERDA renomeada.
    assert.deepStrictEqual(r.map((x) => x.id), [idRenomeado],
      `depois do estorno o filtro deveria trazer so [${idRenomeado}]: ${JSON.stringify(r.map((x) => [x.id, x.tipo, x.cancelado]))}`);
    // Controle: sem o filtro o ESTORNO aparece no historico (prova que a ausencia acima e o filtro).
    assert.ok((await relatorio({})).some((x) => x.tipo === 'ESTORNO'), 'o ESTORNO nem aparece no historico sem filtro');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
