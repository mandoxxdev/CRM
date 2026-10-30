/**
 * Etapa 123 (C216, B794) — o dono do material tem de existir em Clientes.
 *
 * Ate a 123 o `POST /materiais` gravava `proprietario_cliente_id: 99999` (201) e o `PUT` trocava para 88888 (200) sem
 * conferir Clientes: o schema so exige inteiro positivo, e a tela so oferece cadastrados — mas a API e porta propria. O
 * material ficava "de cliente #99999": selo de cliente, guardas de material de cliente ligadas, e nenhum cliente para
 * cobrar ou devolver. Correcao: so a EXISTENCIA (`SELECT 1 FROM clientes WHERE id = ?`; inativo e aceito), no servico
 * (`createMaterial`, depois da recusa do saldo inicial e antes da familia) e na rota do `PUT` (so quando o dono MUDA para
 * um id, depois do 403 da troca de dono). Legado com dono inexistente continua editavel (RN-12).
 *
 * Executar: cd server && node tests/api/materialDonoInexistente.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 (RN-193.02): PUT, DELETE e foto de /api/almoxarifado/materiais recusam para todos por padrao (o cadastro e so do
// Compras). Este arquivo prova o handler e as guardas que ficam ATRAS da recusa pela porta do almoxarifado (os perfis do
// almoxarifado, as guardas de estoque de quem pode), com a chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`,
// services/compras/cadastroDeMaterial.js) — sem ela nenhum desses gestos tem porta (letra C). A recusa: cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

const LITERAL = (n) => `O cliente dono informado (#${n}) não existe em Clientes — escolha um cliente cadastrado ou deixe o `
  + 'material como estoque próprio.';
const INEXISTENTE = 99999;

(async () => {
  console.log('\n═══ Etapa 123 — C216: o dono que nao existe ═══\n');
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('K123', 'Familia K123', 1)")).lastID;
  const famInativa = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('K123I', 'Familia inativa', 0)")).lastID;
  const ATIVO = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente Alfa LTDA')")).lastID;
  const INATIVO = (await dbRun(db, "INSERT INTO clientes (razao_social, status) VALUES ('Cliente Inativo SA', 'inativo')")).lastID;
  // M1: cliente sem razao social (gravada vazia) EXISTE — a conferencia e por id, nao por nome.
  const SEM_NOME = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('')")).lastID;

  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  const cod = () => { seq += 1; return `K123-${seq}`; };
  const body = (codigo, extra = {}) => ({ codigo, nome: `Chapa ${codigo}`, unidade: 'PC', categoria: 'OUTROS', familia_id: fam, ...extra });
  const post = (u, b) => as(u, () => request(app).post('/api/almoxarifado/materiais').send(b));
  const put = (u, id, b) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(b));
  const contagem = async () => ({
    materiais: (await dbGet(db, 'SELECT COUNT(*) n FROM materiais_almoxarifado')).n,
    movimentos: (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado')).n,
    auditoria: (await dbGet(db, 'SELECT COUNT(*) n FROM auditoria_log_almoxarifado')).n,
  });
  const porCodigo = (c) => dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE codigo = ?', [c]);
  const linha = (id) => dbGet(db, 'SELECT proprietario_cliente_id dono, nome, updated_at FROM materiais_almoxarifado WHERE id = ?', [id]);
  async function materialDireto({ dono = null, qtd = 0 } = {}) {
    const codigo = cod();
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, proprietario_cliente_id, familia_id)
      VALUES (?, ?, 'PC', ?, 0, 10, 1, ?, ?)`, [codigo, `Chapa ${codigo}`, qtd, dono, fam])).lastID;
    return { id, codigo };
  }

  // ── RN-10 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-10] POST com dono que nao existe em Clientes -> 400 com a literal, nada gravado (material, saldo, Auditoria)', async () => {
    const antes = await contagem();
    const c = cod();
    const r = await post(SUPER, body(c, { proprietario_cliente_id: INEXISTENTE }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, LITERAL(INEXISTENTE));
    assert.strictEqual(await porCodigo(c), undefined, 'o material foi gravado');
    assert.deepStrictEqual(await contagem(), antes, 'a recusa gravou algo');
    // metade positiva: o mesmo corpo com um cliente cadastrado passa e grava o dono.
    const ok = await post(SUPER, body(c, { proprietario_cliente_id: ATIVO }));
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
    assert.strictEqual((await porCodigo(c)).proprietario_cliente_id, ATIVO);
  });

  await test('[RN-10] pelo SERVICO: createMaterial com dono inexistente lanca status 400 com a literal; com cliente cadastrado grava', async () => {
    const antes = await contagem();
    const c = cod();
    let erro = null;
    try {
      await materialService.createMaterial(db, SUPER, body(c, { proprietario_cliente_id: 88888 }));
    } catch (e) { erro = e; }
    assert.ok(erro, 'o servico nao lancou');
    assert.strictEqual(erro.status, 400);
    assert.strictEqual(erro.message, LITERAL(88888));
    assert.strictEqual(erro.message, materialService.mensagemDonoInexistente(88888));
    assert.deepStrictEqual(await contagem(), antes, 'a recusa do servico gravou algo');
    const ok = await materialService.createMaterial(db, SUPER, body(c, { proprietario_cliente_id: ATIVO }));
    assert.strictEqual((await porCodigo(c)).proprietario_cliente_id, ATIVO, JSON.stringify(ok));
  });

  await test('[RN-10] a conferencia exportada: existe para cadastrado (ate sem razao social, M1), nao existe para o resto', async () => {
    assert.strictEqual(await materialService.clienteDonoExiste(db, ATIVO), true);
    assert.strictEqual(await materialService.clienteDonoExiste(db, INATIVO), true);
    assert.strictEqual(await materialService.clienteDonoExiste(db, SEM_NOME), true);
    assert.strictEqual(await materialService.clienteDonoExiste(db, INEXISTENTE), false);
  });

  // ── RN-10b ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-10b] cliente INATIVO e cliente sem razao social -> 201 com o dono (so a existencia)', async () => {
    for (const dono of [INATIVO, SEM_NOME]) {
      const c = cod();
      const r = await post(SUPER, body(c, { proprietario_cliente_id: dono }));
      assert.strictEqual(r.status, 201, `dono ${dono}: ${JSON.stringify(r.body)}`);
      assert.strictEqual((await porCodigo(c)).proprietario_cliente_id, dono);
    }
  });

  await test('[RN-10b] dono vazio/null/omitido -> 201 nosso; pelo servico tambem 0 e "" -> nosso, sem conferir', async () => {
    for (const extra of [{ proprietario_cliente_id: null }, { proprietario_cliente_id: '' }, {}]) {
      const c = cod();
      const r = await post(SUPER, body(c, extra));
      assert.strictEqual(r.status, 201, `${JSON.stringify(extra)}: ${JSON.stringify(r.body)}`);
      assert.strictEqual((await porCodigo(c)).proprietario_cliente_id, null);
    }
    for (const dono of [0, '', null, undefined]) {
      const c = cod();
      await materialService.createMaterial(db, SUPER, body(c, { proprietario_cliente_id: dono }));
      assert.strictEqual((await porCodigo(c)).proprietario_cliente_id, null, `servico com ${JSON.stringify(dono)}`);
    }
    // metade negativa no mesmo corpo: o id inexistente continua recusado.
    const r = await post(SUPER, body(cod(), { proprietario_cliente_id: INEXISTENTE }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
  });

  // ── RN-10c ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-10c] saldo inicial + dono inexistente -> a recusa do saldo inicial ("e de cliente") vem antes', async () => {
    const antes = await contagem();
    const c = cod();
    const r = await post(SUPER, body(c, { proprietario_cliente_id: INEXISTENTE, quantidade_atual: 5 }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, materialService.mensagemSaldoInicialRecusado(c, ['é de cliente']));
    assert.deepStrictEqual(await contagem(), antes);
    // metade positiva: sem o saldo, a mesma chamada cai na do dono.
    const r2 = await post(SUPER, body(c, { proprietario_cliente_id: INEXISTENTE }));
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, LITERAL(INEXISTENTE));
  });

  await test('[RN-10c] dono inexistente + familia inativa -> a do dono (saldo inicial -> dono -> familia)', async () => {
    const antes = await contagem();
    const c = cod();
    const r = await post(SUPER, body(c, { proprietario_cliente_id: INEXISTENTE, familia_id: famInativa }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, LITERAL(INEXISTENTE));
    assert.deepStrictEqual(await contagem(), antes);
    // metade positiva: com cliente cadastrado, a recusa que sobra e a da familia de hoje.
    const r2 = await post(SUPER, body(c, { proprietario_cliente_id: ATIVO, familia_id: famInativa }));
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, 'Família inativa — não é possível vincular novos itens');
  });

  // ── RN-11 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-11] PUT trocando para dono inexistente (sem historico, Almoxarife) -> 400 com a literal, dono inalterado', async () => {
    for (const de of [null, ATIVO]) {
      const m = await materialDireto({ dono: de });
      const antesLinha = await linha(m.id);
      const antes = await contagem();
      const r = await put(ALMOXARIFE, m.id, { nome: 'Nome novo', proprietario_cliente_id: 77777 });
      assert.strictEqual(r.status, 400, `de ${de}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, LITERAL(77777));
      assert.deepStrictEqual(await linha(m.id), antesLinha, 'a recusa tocou o cadastro');
      assert.deepStrictEqual(await contagem(), antes, 'a recusa gravou Auditoria');
      // metade positiva: para um cliente cadastrado (inativo vale), 200 e gravado.
      const ok = await put(ALMOXARIFE, m.id, { nome: 'Nome novo', proprietario_cliente_id: INATIVO });
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
      assert.strictEqual((await linha(m.id)).dono, INATIVO);
    }
  });

  // ── RN-11b ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-11b] material COM historico, Almoxarife, dono inexistente -> 403 da troca de dono (nao o 400)', async () => {
    const m = await materialDireto({ dono: ATIVO, qtd: 10 });
    const antesLinha = await linha(m.id);
    const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: 66666 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(/exige a permissao "ajustar_material_cliente"/.test(r.body.error), r.body.error);
    assert.deepStrictEqual(await linha(m.id), antesLinha);
    // metade positiva: quem pode trocar (superadmin) passa do 403 e cai no 400 do dono.
    const r2 = await put(SUPER, m.id, { proprietario_cliente_id: 66666 });
    assert.strictEqual(r2.status, 400, JSON.stringify(r2.body));
    assert.strictEqual(r2.body.error, LITERAL(66666));
    assert.deepStrictEqual(await linha(m.id), antesLinha);
  });

  // ── RN-12 ────────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-12] legado com dono 77777 inexistente: renomear sem a chave 200; repetir 77777 200; para null 200', async () => {
    const m = await materialDireto({ dono: 77777 });
    const r1 = await put(ALMOXARIFE, m.id, { nome: 'Renomeado sem a chave' });
    assert.strictEqual(r1.status, 200, JSON.stringify(r1.body));
    assert.strictEqual((await linha(m.id)).nome, 'Renomeado sem a chave');
    assert.strictEqual((await linha(m.id)).dono, 77777);
    const r2 = await put(ALMOXARIFE, m.id, { nome: 'Repete o dono', proprietario_cliente_id: 77777 });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.body));
    assert.strictEqual((await linha(m.id)).nome, 'Repete o dono');
    assert.strictEqual((await linha(m.id)).dono, 77777);
    const r3 = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: null });
    assert.strictEqual(r3.status, 200, JSON.stringify(r3.body));
    assert.strictEqual((await linha(m.id)).dono, null);
    // metade negativa: o mesmo material, agora nosso, nao volta para o 77777 (mudaria para um id que nao existe).
    const r4 = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: 77777 });
    assert.strictEqual(r4.status, 400, JSON.stringify(r4.body));
    assert.strictEqual(r4.body.error, LITERAL(77777));
    assert.strictEqual((await linha(m.id)).dono, null);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
