/**
 * Etapa 116 (T4) — integracao que cruza Materiais, Movimentacoes e Series pelas rotas reais (C233 + C232).
 *
 * (i)   o Almoxarife abre o cadastro (GET) -> o Administrador liga a serie e entra 2 series -> o Almoxarife salva o que o
 *       formulario mandaria (o GET antigo + controles_lidos dele) -> 409 E1 -> recarrega (GET) -> salva -> 200, serie ligada;
 * (ii)  RN-09 inteira: Entrada de 2 series -> Saida com as 2 -> o Administrador desliga -> estorno E2 -> religa -> estorno
 *       200 -> 2 Em estoque, fisico 2, e o invariante fisico == series presentes vale;
 * (iii) a Saida sem serie feita depois do desligar continua estornavel, e a Saida com series nao.
 *
 * Executar: cd server && node tests/api/controlesLidosIntegracao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const E1 = (codigo) => `O controle por número de série do material ${codigo} foi ligado por outra pessoa depois que você `
  + 'abriu o cadastro — salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.';
const E2 = (codigo, n) => `Não é possível estornar: esta saída baixou ${n} série(s) do material ${codigo} e o controle por `
  + 'número de série foi desligado depois — o estorno devolveria o saldo sem devolver as séries. Religue o controle por '
  + 'número de série no cadastro do material e estorne de novo.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const dbAll = (sql, p) => new Promise((res, rej) => db.all(sql, p, (err, rows) => (err ? rej(err) : res(rows))));
  const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('I116', 'Integracao 116', 1)")).lastID;
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `I116-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, familia_id, categoria)
      VALUES (?, ?, 'PC', 0, 0, 10, 1, ?, 'OUTROS')`, [codigo, `Peca ${seq}`, fam])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const mov = async (u, m, body) => {
    const r = await as(u, () => request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'i116',
      justificativa: 'integracao e116', documento_vinculado: 'NF-I116', ...body }));
    assert.strictEqual(r.status, 201, `${body.tipo}: ${JSON.stringify(r.body)}`);
    return (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = ? ORDER BY id DESC LIMIT 1',
      [m.id, body.tipo])).id;
  };
  const get = (u, id) => as(u, () => request(app).get(`/api/almoxarifado/materiais/${id}`));
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const estornar = (u, movId) => as(u, () => request(app).post(`/api/almoxarifado/movimentacoes/${movId}/cancelar`)
    .send({ motivo: 'estorno i116' }));
  // o que o formulario manda no PUT a partir do GET (os campos que importam aqui + os controles lidos dele)
  const doFormulario = (lido, mudancas = {}) => ({
    codigo: lido.codigo, nome: lido.nome, familia_id: lido.familia_id, categoria: lido.categoria, unidade: lido.unidade,
    controle_lote: !!lido.controle_lote, controle_serie: !!lido.controle_serie,
    controles_lidos: { controle_lote: !!lido.controle_lote, controle_serie: !!lido.controle_serie },
    ...mudancas,
  });
  const presentes = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ?
    AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [id])).n;
  const fisico = async (id) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [id])).q;

  await test('(i) formulario aberto, o Administrador liga a serie e entra 2: o salvar do Almoxarife -> 409 E1; recarregado -> 200', async () => {
    const m = await material();
    const aberto = await get(ALMOXARIFE, m.id);
    assert.strictEqual(aberto.status, 200, JSON.stringify(aberto.body));
    assert.strictEqual(Number(aberto.body.controle_serie || 0), 0);
    const liga = await put(ADM_PERFIL, m.id, { controle_serie: true });
    assert.strictEqual(liga.status, 200, JSON.stringify(liga.body));
    await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 2, series: ['I1', 'I2'] });
    const velho = await put(ALMOXARIFE, m.id, doFormulario(aberto.body, { nome: 'Renomeado no formulario velho' }));
    assert.strictEqual(velho.status, 409, JSON.stringify(velho.body));
    assert.strictEqual(velho.body.error, E1(m.codigo));
    const depois = await get(ALMOXARIFE, m.id);
    assert.strictEqual(Number(depois.body.controle_serie), 1);
    assert.strictEqual(depois.body.nome, `Peca ${seq}`);
    const novo = await put(ALMOXARIFE, m.id, doFormulario(depois.body, { nome: 'Renomeado recarregado' }));
    assert.strictEqual(novo.status, 200, JSON.stringify(novo.body));
    const fim = await get(ALMOXARIFE, m.id);
    assert.deepStrictEqual([fim.body.nome, Number(fim.body.controle_serie)], ['Renomeado recarregado', 1]);
    assert.strictEqual(await presentes(m.id), 2);
  });

  await test('(ii) Saida de 2 series -> desligar -> estorno E2 -> religar -> estorno 200: fisico 2 e 2 series presentes', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 2, series: ['J1', 'J2'] });
    const ids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m.id])).map((x) => x.id);
    const saida = await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 2, serie_ids: ids });
    // o caminho da 115 (Saida com as series, depois desligar) — 0 presentes, o Almoxarife desliga
    const aberto = await get(ALMOXARIFE, m.id);
    const desliga = await put(ALMOXARIFE, m.id, doFormulario(aberto.body, { controle_serie: false }));
    assert.strictEqual(desliga.status, 200, JSON.stringify(desliga.body));
    const recusa = await estornar(ADM_PERFIL, saida);
    assert.strictEqual(recusa.status, 400, JSON.stringify(recusa.body));
    assert.strictEqual(recusa.body.error, E2(m.codigo, 2));
    assert.deepStrictEqual([await fisico(m.id), await presentes(m.id)], [0, 0]);
    // religar pelo formulario do Administrador (fisico 0, 0 presentes: a regua da 112 nao recusa nem o Almoxarife)
    const reaberto = await get(ADM_PERFIL, m.id);
    const religa = await put(ADM_PERFIL, m.id, doFormulario(reaberto.body, { controle_serie: true }));
    assert.strictEqual(religa.status, 200, JSON.stringify(religa.body));
    const ok = await estornar(ADM_PERFIL, saida);
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.deepStrictEqual([await fisico(m.id), await presentes(m.id)], [2, 2]);
    // e as series voltaram a circular: a Saida seguinte com uma delas passa
    await mov(ALMOXARIFE, m, { tipo: 'SAIDA', quantidade: 1, serie_ids: [ids[0]] });
    assert.deepStrictEqual([await fisico(m.id), await presentes(m.id)], [1, 1]);
  });

  await test('(iii) depois do desligar, a Saida sem serie e estornavel e a Saida com series nao', async () => {
    const m = await material({ controle_serie: 1 });
    await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 1, series: ['K1'] });
    const ids = (await dbAll('SELECT id FROM series_almoxarifado WHERE material_id = ?', [m.id])).map((x) => x.id);
    const saidaSerie = await mov(SUPER, m, { tipo: 'SAIDA', quantidade: 1, serie_ids: ids });
    const desliga = await put(SUPER, m.id, { controle_serie: false });
    assert.strictEqual(desliga.status, 200, JSON.stringify(desliga.body));
    await mov(SUPER, m, { tipo: 'ENTRADA', quantidade: 3 });
    const saidaSemSerie = await mov(SUPER, m, { tipo: 'SAIDA', quantidade: 2 });
    const r1 = await estornar(SUPER, saidaSemSerie);
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    assert.strictEqual(await fisico(m.id), 3);
    const r2 = await estornar(SUPER, saidaSerie);
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, E2(m.codigo, 1));
    assert.strictEqual(await fisico(m.id), 3);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
