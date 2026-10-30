/**
 * Etapa 124 (D (123), B800) — o formulario de material manda a familia e a subfamilia que leu (`familia_lida`), e o salvar
 * que desfaria a mudanca feita por outra pessoa depois de o formulario abrir e recusado (RN-01..RN-06 do plano da Etapa 124).
 *
 * Antes: o formulario mandava `familia_id`/`subfamilia_id` de quando abriu, e o `PUT` so protegia o que mudava DENTRO do
 * salvar (B798). Uma mudanca de subfamilia (ou de familia) feita por outra pessoa enquanto o formulario estava aberto era
 * validada como "troca" e desfeita calada — medido na Fase 0 (200, o par velho gravado).
 *
 * "Outra pessoa" = escrita direta no banco depois da "abertura". Perfis EXPLICITOS: usuario sem perfil cai em PRODUCAO.
 *
 * Executar: cd server && node tests/api/materialFamiliaLida.api.test.js
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

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };

// O contrato congelado do plano da Etapa 124 (por extenso, nao importado do servico).
const CAUDA = ' foi mudada por outra pessoa depois que você abriu o cadastro — salvar desfaria essa mudança, e nada foi '
  + 'gravado. Recarregue o material e salve de novo.';
const E1F = (codigo) => `A família do material ${codigo}${CAUDA}`;
const E1S = (codigo) => `A subfamília do material ${codigo}${CAUDA}`;
const E1C = (codigo) => `O controle por número de série do material ${codigo} foi ligado por outra pessoa depois `
  + 'que você abriu o cadastro — salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seqF = 0;
  const familia = async (parent = null, ativo = 1) => {
    seqF += 1;
    return (await dbRun(db, 'INSERT INTO familias_material_almoxarifado (codigo, nome, parent_id, ativo) VALUES (?, ?, ?, ?)',
      [`F124-${seqF}`, `Familia 124 ${seqF}`, parent, ativo])).lastID;
  };
  const F1 = await familia(); const F2 = await familia();
  const S1 = await familia(F1); const S2 = await familia(F1); const S3 = await familia(F2);
  let seq = 0;
  async function material(familiaId = F1, subId = S1, extra = {}) {
    seq += 1;
    const codigo = `E124-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo, familia_id, subfamilia_id)
      VALUES (?, ?, 'PC', 0, 0, 10, 1, ?, ?)`, [codigo, `Peca ${seq}`, familiaId, subId])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo, nome: `Peca ${seq}` };
  }
  /** A "outra pessoa": muda o par direto no banco, depois da abertura do formulario. */
  const outroMove = (m, fam, sub) => dbRun(db, 'UPDATE materiais_almoxarifado SET familia_id = ?, subfamilia_id = ? WHERE id = ?',
    [fam, sub, m.id]);
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, `SELECT nome, familia_id, subfamilia_id, proprietario_cliente_id, controle_serie, ativo
    FROM materiais_almoxarifado WHERE id = ?`, [id]);
  const auditorias = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'material' AND entidade_id = ?`, [id])).n;
  /** O 409 com nada gravado (nome, par) e sem Auditoria. */
  const recusa = async (u, m, body, esperadoMsg, parGravado) => {
    const aud = await auditorias(m.id);
    const r = await put(u, m.id, body);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, esperadoMsg);
    const l = await linha(m.id);
    assert.deepStrictEqual({ nome: l.nome, familia_id: l.familia_id, subfamilia_id: l.subfamilia_id },
      { nome: m.nome, familia_id: parGravado[0], subfamilia_id: parGravado[1] });
    assert.strictEqual(await auditorias(m.id), aud, 'a recusa gravou auditoria');
  };
  const salvarComo = (fam, sub, lida, extra = {}) => ({ nome: 'Renomeado', familia_id: fam, subfamilia_id: sub,
    familia_lida: lida, ...extra });

  // ── RN-01 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-01] subfamilia mudada por outro (S1 -> S2): o Almoxarife renomeia com o par lido -> 409 E1s, S2 fica', async () => {
    const m = await material();
    await outroMove(m, F1, S2);
    await recusa(ALMOXARIFE, m, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }), E1S(m.codigo), [F1, S2]);
  });

  await test('[RN-01] o Administrador (perfil) e o superadmin tambem recebem — nao e guarda de perfil', async () => {
    for (const u of [ADM_PERFIL, SUPER]) {
      const m = await material();
      await outroMove(m, F1, S2);
      await recusa(u, m, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }), E1S(m.codigo), [F1, S2]);
    }
  });

  await test('[RN-01b] familia mudada por outro (F1/S1 -> F2/null) -> 409 E1f, F2 fica', async () => {
    const m = await material();
    await outroMove(m, F2, null);
    await recusa(ALMOXARIFE, m, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }), E1F(m.codigo), [F2, null]);
  });

  await test('[RN-01c] familia e subfamilia mudadas (F1/S1 -> F2/S3) -> E1f (a familia vence)', async () => {
    const m = await material();
    await outroMove(m, F2, S3);
    await recusa(ALMOXARIFE, m, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }), E1F(m.codigo), [F2, S3]);
  });

  await test('[RN-01d] subfamilia tirada por outro (S1 -> null), o salvar manda S1 -> E1s', async () => {
    const m = await material();
    await outroMove(m, F1, null);
    await recusa(ALMOXARIFE, m, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }), E1S(m.codigo), [F1, null]);
  });

  await test('[RN-01d] subfamilia posta por outro (null -> S2), o salvar manda null (lida null) -> E1s', async () => {
    const m = await material(F1, null);
    await outroMove(m, F1, S2);
    await recusa(ALMOXARIFE, m, salvarComo(F1, null, { familia_id: F1, subfamilia_id: null }), E1S(m.codigo), [F1, S2]);
  });

  // ── RN-02 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-02] lido S1, gravado S2, o salvar manda S2 (escolheu igual): 200, nada desfeito', async () => {
    const m = await material();
    await outroMove(m, F1, S2);
    const r = await put(ALMOXARIFE, m.id, salvarComo(F1, S2, { familia_id: F1, subfamilia_id: S1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.familia_id, l.subfamilia_id], ['Renomeado', F1, S2]);
  });

  await test('[RN-02] lido F1/S1, gravado F2/S3, familia_id e subfamilia_id omitidos: 200, par gravado intacto', async () => {
    const m = await material();
    await outroMove(m, F2, S3);
    const r = await put(ALMOXARIFE, m.id, { nome: 'Omitidas', familia_lida: { familia_id: F1, subfamilia_id: S1 } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.familia_id, l.subfamilia_id], ['Omitidas', F2, S3]);
  });

  // ── RN-03 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-03] sem familia_lida: o comportamento de antes (200, o par do corpo gravado) — API, Sobras, Remessas', async () => {
    const m = await material();
    await outroMove(m, F1, S2);
    const r = await put(ALMOXARIFE, m.id, { nome: 'Antigo', familia_id: F1, subfamilia_id: S1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.subfamilia_id], ['Antigo', S1]);
  });

  await test('[RN-03] so familia_id em familia_lida (subfamilia mudada por outro): 200, a subfamilia nao e comparada', async () => {
    const m = await material();
    await outroMove(m, F1, S2);
    const r = await put(ALMOXARIFE, m.id, salvarComo(F1, S1, { familia_id: F1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).subfamilia_id, S1);
  });

  await test('[RN-03] so subfamilia_id em familia_lida, mudada: 409 E1s (prova que a chave chega a rota)', async () => {
    const m = await material();
    await outroMove(m, F1, S2);
    await recusa(ALMOXARIFE, m, salvarComo(F1, S1, { subfamilia_id: S1 }), E1S(m.codigo), [F1, S2]);
  });

  await test('[RN-03] subfamilia_id "" em familia_lida vale como ausente: 200', async () => {
    const m = await material();
    await outroMove(m, F1, S2);
    const r = await put(ALMOXARIFE, m.id, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: '' }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).subfamilia_id, S1);
  });

  await test('[RN-03] familia_lida com valor invalido: 400 do schema, nada gravado', async () => {
    const m = await material();
    const r = await put(ALMOXARIFE, m.id, { nome: 'Invalido', familia_lida: { familia_id: 'x' } });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).nome, m.nome);
  });

  // ── RN-04 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-04] lido = gravado, o usuario troca a subfamilia S1 -> S2: 200, S2 gravada, EDICAO com o de/para', async () => {
    const m = await material();
    const aud = await auditorias(m.id);
    const r = await put(ALMOXARIFE, m.id, salvarComo(F1, S2, { familia_id: F1, subfamilia_id: S1 }));
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).subfamilia_id, S2);
    assert.strictEqual(await auditorias(m.id), aud + 1);
    const log = await dbGet(db, `SELECT dados_anteriores, dados_novos FROM auditoria_log_almoxarifado
      WHERE entidade = 'material' AND entidade_id = ? ORDER BY id DESC LIMIT 1`, [m.id]);
    assert.strictEqual(JSON.parse(log.dados_anteriores).subfamilia_id, S1);
    assert.strictEqual(JSON.parse(log.dados_novos).subfamilia_id, S2);
  });

  // ── RN-05 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-05a] controles E familia mudados por outro: o 409 da C233 (controles), nao o da familia', async () => {
    const m = await material(F1, S1, { controle_serie: 1 });
    await outroMove(m, F1, S2);
    const r = await put(ALMOXARIFE, m.id, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }, {
      controle_lote: false, controle_serie: false, controles_lidos: { controle_lote: false, controle_serie: false } }));
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1C(m.codigo));
  });

  await test('[RN-05b] familia mudada E troca de dono proibida (material com saldo): E1f, nao o 403 do dono', async () => {
    const m = await material(F1, S1, { quantidade_atual: 3 });
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E124')")).lastID;
    // controle: sem a familia mudada, a troca de dono do Almoxarife e recusada (403) — prova que o cenario a alcanca
    const sem = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: cli, familia_lida: { familia_id: F1, subfamilia_id: S1 } });
    assert.strictEqual(sem.status, 403, JSON.stringify(sem.body));
    await outroMove(m, F2, null);
    await recusa(ALMOXARIFE, m, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }, { proprietario_cliente_id: cli }),
      E1F(m.codigo), [F2, null]);
    assert.strictEqual((await linha(m.id)).proprietario_cliente_id, null);
  });

  await test('[RN-05c] familia mudada E inativar com saldo: E1f, nao o 400 do saldo', async () => {
    const m = await material(F1, S1, { quantidade_atual: 3 });
    // controle: sem a familia mudada, inativar com saldo e recusado (400)
    const sem = await put(ALMOXARIFE, m.id, { ativo: 0, familia_lida: { familia_id: F1, subfamilia_id: S1 } });
    assert.strictEqual(sem.status, 400, JSON.stringify(sem.body));
    await outroMove(m, F1, S2);
    await recusa(ALMOXARIFE, m, salvarComo(F1, S1, { familia_id: F1, subfamilia_id: S1 }, { ativo: 0 }), E1S(m.codigo), [F1, S2]);
    assert.strictEqual((await linha(m.id)).ativo, 1);
  });

  // ── RN-06 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-06] familia_lida falso nao autoriza: lido = gravado e subfamilia inativa no corpo -> a recusa de sempre', async () => {
    const m = await material();
    const SI = await familia(F1, 0);
    const r = await put(ALMOXARIFE, m.id, salvarComo(F1, SI, { familia_id: F1, subfamilia_id: S1 }));
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Subfamília inválida para a família selecionada');
    assert.strictEqual((await linha(m.id)).subfamilia_id, S1);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
