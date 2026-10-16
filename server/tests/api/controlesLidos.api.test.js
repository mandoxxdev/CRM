/**
 * Etapa 116 (C233) — o formulario de material manda os controles que leu, e o salvar que desfaria o controle mudado por
 * outra pessoa e recusado (RN-01..RN-05 do plano da Etapa 116).
 *
 * Antes: o formulario mandava `controle_lote`/`controle_serie` com o valor de quando abriu, e a conferencia da 115 (B750)
 * so pegava a mudanca que caia entre a leitura e a gravacao do proprio salvar. Um formulario aberto ha minutos desligava
 * calado a serie que o Administrador tinha ligado — ou, com series ja entradas, recebia a recusa do desligar, que enganava.
 *
 * Perfis EXPLICITOS em toda negativa: usuario sem perfil cai em PRODUCAO, nao em "sem acesso".
 *
 * Executar: cd server && node tests/api/controlesLidos.api.test.js
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

// E1 (409) — o contrato congelado do plano da Etapa 116.
const E1 = (codigo, nomes, verbo) => `O controle por ${nomes} do material ${codigo} foi ${verbo} por outra pessoa depois `
  + 'que você abriu o cadastro — salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo.';
const E115 = (codigo, n, perfil) => `Desligar o controle por número de série no material ${codigo} exige a permissão `
  + `"ajustar_estoque" (seu perfil: ${perfil}): há ${n} série(s) em estoque. Depois de desligar, a saída não baixa essas `
  + 'séries, e elas continuam "Em estoque" depois que o material sai. Peça ao Administrador do almoxarifado para desligar '
  + 'o controle.';
const LIDOS0 = { controle_lote: false, controle_serie: false };

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `E116-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return { id, codigo };
  }
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, 'SELECT nome, controle_lote, controle_serie, proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?', [id]);
  const auditorias = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'material' AND entidade_id = ?`, [id])).n;
  const entrarSeries = async (m, numeros) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, tipo: 'ENTRADA',
      quantidade: numeros.length, series: numeros, motivo: 'e116', justificativa: 'preparo e116', documento_vinculado: 'NF-116' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  };
  // o 409 E1 com nada gravado e sem auditoria
  const recusaE1 = async (u, m, body, nomes, verbo, esperado) => {
    const aud = await auditorias(m.id);
    const r = await put(u, m.id, body);
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(m.codigo, nomes, verbo));
    const l = await linha(m.id);
    assert.deepStrictEqual({ nome: l.nome, controle_lote: l.controle_lote, controle_serie: l.controle_serie }, esperado);
    assert.strictEqual(await auditorias(m.id), aud, 'a recusa gravou auditoria');
  };

  // ── RN-01 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-01] leu a serie desligada, o Administrador ligou: o Almoxarife renomeia -> 409 E1 "ligado", serie fica 1', async () => {
    const m = await material({ controle_serie: 1 });
    await recusaE1(ALMOXARIFE, m, { nome: 'Renomeado', controle_lote: false, controle_serie: false, controles_lidos: LIDOS0 },
      'número de série', 'ligado', { nome: `Peca ${seq}`, controle_lote: 0, controle_serie: 1 });
  });

  await test('[RN-01] o mesmo com 2 series ja entradas: 409 E1, nao a recusa do desligar da 115', async () => {
    const m = await material({ controle_serie: 1 });
    await entrarSeries(m, ['A1', 'A2']);
    await recusaE1(ALMOXARIFE, m, { nome: 'Renomeado', controle_lote: false, controle_serie: false, controles_lidos: LIDOS0 },
      'número de série', 'ligado', { nome: `Peca ${seq}`, controle_lote: 0, controle_serie: 1 });
  });

  await test('[RN-01] lote ligado por outro: 409 E1 "por lote ... foi ligado"', async () => {
    const m = await material({ controle_lote: 1 });
    await recusaE1(ALMOXARIFE, m, { nome: 'X', controle_lote: false, controle_serie: false, controles_lidos: LIDOS0 },
      'lote', 'ligado', { nome: `Peca ${seq}`, controle_lote: 1, controle_serie: 0 });
  });

  await test('[RN-01] lote desligado por outro e o salvar manda o lote ligado: 409 E1 "foi desligado"', async () => {
    const m = await material();
    await recusaE1(ALMOXARIFE, m, { nome: 'X', controle_lote: true, controle_serie: false,
      controles_lidos: { controle_lote: true, controle_serie: false } },
    'lote', 'desligado', { nome: `Peca ${seq}`, controle_lote: 0, controle_serie: 0 });
  });

  await test('[RN-01] os dois mudados por outro: 409 E1 "por lote e por número de série ... foi mudado"', async () => {
    const m = await material({ controle_serie: 1 });
    await recusaE1(ALMOXARIFE, m, { nome: 'X', controle_lote: true, controle_serie: false,
      controles_lidos: { controle_lote: true, controle_serie: false } },
    'lote e por número de série', 'mudado', { nome: `Peca ${seq}`, controle_lote: 0, controle_serie: 1 });
  });

  await test('[RN-01] o Administrador (perfil) e o superadmin tambem recebem — nao e guarda de perfil', async () => {
    for (const u of [ADM_PERFIL, SUPER]) {
      const m = await material({ controle_serie: 1 });
      await recusaE1(u, m, { nome: 'X', controle_lote: false, controle_serie: false, controles_lidos: LIDOS0 },
        'número de série', 'ligado', { nome: `Peca ${seq}`, controle_lote: 0, controle_serie: 1 });
    }
  });

  // ── RN-02 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-02] leu 0, gravado 1, o salvar manda 1 (marcou igual): 200, nada desfeito', async () => {
    const m = await material({ controle_serie: 1 });
    const r = await put(ALMOXARIFE, m.id, { nome: 'Igual', controle_lote: false, controle_serie: true, controles_lidos: LIDOS0 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.controle_serie], ['Igual', 1]);
  });

  await test('[RN-02] leu 0, gravado 1, a chave omitida: 200, serie continua 1', async () => {
    const m = await material({ controle_serie: 1 });
    const r = await put(ALMOXARIFE, m.id, { nome: 'Omitida', controles_lidos: LIDOS0 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.deepStrictEqual([l.nome, l.controle_serie], ['Omitida', 1]);
  });

  await test('[RN-02] lido = gravado e o usuario liga o lote (sem saldo): 200, lote 1', async () => {
    const m = await material();
    const r = await put(ALMOXARIFE, m.id, { controle_lote: true, controle_serie: false, controles_lidos: LIDOS0 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_lote, 1);
  });

  // ── RN-03 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-03] sem controles_lidos: o comportamento de antes (200, desliga) — para integracao e cliente antigo', async () => {
    const m = await material({ controle_serie: 1 });
    const r = await put(ALMOXARIFE, m.id, { nome: 'Antigo', controle_lote: false, controle_serie: false });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
  });

  await test('[RN-03] so controle_lote em controles_lidos: a serie nao e comparada (200)', async () => {
    const m = await material({ controle_serie: 1 });
    const r = await put(ALMOXARIFE, m.id, { controle_lote: false, controle_serie: false, controles_lidos: { controle_lote: 0 } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
  });

  await test('[RN-03] so controle_serie em controles_lidos, mudada: 409 E1 (prova que a chave chega a rota)', async () => {
    const m = await material({ controle_serie: 1 });
    await recusaE1(ALMOXARIFE, m, { controle_serie: false, controles_lidos: { controle_serie: 0 } },
      'número de série', 'ligado', { nome: `Peca ${seq}`, controle_lote: 0, controle_serie: 1 });
  });

  await test('[RN-03] controles_lidos com valor invalido: 400 do schema, nada gravado', async () => {
    const m = await material();
    const r = await put(ALMOXARIFE, m.id, { nome: 'Invalido', controles_lidos: { controle_serie: 'x' } });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).nome, `Peca ${seq}`);
  });

  // ── RN-04 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-04] E1 + troca de dono sem permissao (material com historico): a E1, nao o 403 do dono', async () => {
    const m = await material({ controle_serie: 1, quantidade_atual: 3 });
    const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente E116')")).lastID;
    // controle: sem a mudanca dos controles, a troca de dono do Almoxarife e recusada (403) — prova que o cenario a alcanca
    const sem = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: cli, controles_lidos: { controle_lote: false, controle_serie: true } });
    assert.strictEqual(sem.status, 403, JSON.stringify(sem.body));
    await recusaE1(ALMOXARIFE, m, { proprietario_cliente_id: cli, controle_lote: false, controle_serie: false, controles_lidos: LIDOS0 },
      'número de série', 'ligado', { nome: `Peca ${seq}`, controle_lote: 0, controle_serie: 1 });
    assert.strictEqual((await linha(m.id)).proprietario_cliente_id, null);
  });

  await test('[RN-04] E1 antes da recusa do desligar da 115 (so a chave da serie, 2 series entradas depois de abrir)', async () => {
    // leu lote 0/serie 0; o Administrador ligou a serie e entraram 2 series; o salvar desligaria -> E1, nao a da 115
    const m = await material({ controle_serie: 1 });
    await entrarSeries(m, ['B1', 'B2']);
    const r = await put(ALMOXARIFE, m.id, { controle_serie: false, controles_lidos: { controle_serie: false } });
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(m.codigo, 'número de série', 'ligado'));
  });

  // ── RN-05 ──────────────────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-05] controles_lidos igual ao gravado nao autoriza: o Almoxarife desliga a serie com 2 -> 403 da 115', async () => {
    const m = await material({ controle_serie: 1 });
    await entrarSeries(m, ['C1', 'C2']);
    const r = await put(ALMOXARIFE, m.id, { controle_serie: false, controles_lidos: { controle_lote: false, controle_serie: true } });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E115(m.codigo, 2, 'ALMOXARIFE'));
    assert.strictEqual((await linha(m.id)).controle_serie, 1);
  });

  await test('[RN-05] o Administrador com lido = gravado desliga a serie com 2 (a 115): 200', async () => {
    const m = await material({ controle_serie: 1 });
    await entrarSeries(m, ['D1', 'D2']);
    const r = await put(ADM_PERFIL, m.id, { controle_serie: false, controles_lidos: { controle_lote: false, controle_serie: true } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
