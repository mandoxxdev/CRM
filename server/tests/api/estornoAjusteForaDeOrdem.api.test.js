/**
 * Etapa 258 (C550) — o estorno do Ajuste sem localizacao desfaz a DIFERENCA que o Ajuste aplicou, nao volta a um valor fixo.
 *
 * Ate a 257 o estorno do AJUSTE sem localizacao fazia `SET quantidade_atual = saldo_anterior`: todo movimento do material feito DEPOIS do
 * Ajuste (Entrada, Saida, estorno de outra) sumia do total, e o residuo (total - as outras linhas) deixava a padrao negativa num material
 * sem negativo. Padrao A 3, B 5; Saida 6; Ajuste para 1; estorno da Saida; estorno do Ajuste -> total 2, A -2, B 4 (certo: 8, A 3, B 5).
 * Agora: novo total = atual - (saldo_posterior - saldo_anterior), recusa se ficaria negativo, e sem lote drena as outras posicoes antes de
 * negativar a padrao (RN-258.01..06).
 *
 * Cuidado com teste vazio: sem movimento depois do Ajuste os dois calculos dao o mesmo numero — todo cenario de RN-258.01..04 tem um
 * movimento do material entre o Ajuste e o estorno, e confere o total E as linhas.
 *
 * Plano: docs/superpowers/plans/2026-11-20-almoxarifado-etapa258-estorno-ajuste-fora-de-ordem.md
 * Executar: cd server && node tests/api/estornoAjusteForaDeOrdem.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 700)}`); });
}
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const ADMIN = { id: 1, nome: 'Adm 258', role: 'admin', is_superadmin: 1, email: 'a258@t.com' };
const API = '/api/almoxarifado';
const NEGATIVO = 'Não é possível estornar: o saldo já foi consumido (o estorno deixaria o material negativo)';

(async () => {
  console.log('\n=== Etapa 258: o estorno do Ajuste sem localizacao desfaz a diferenca (C550) ===\n');
  const { app, db } = await createTestApp({ user: { ...ADMIN } });
  const post = (u, b = {}) => request(app).post(u).send(b);
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('aprovacao_automatica', '0'); await cfg('liberacao_valor_ativo', '0');
  const alm = await post(`${API}/almoxarifados`, { codigo: 'ALM258T', nome: 'A258T' });
  const loc = async (codigo) => {
    await post(`${API}/localizacoes`, { codigo, descricao: codigo, almoxarifado_id: alm.body.id, tipo: 'Prateleira' });
    return dbGet(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE codigo = ?', [codigo]);
  };
  const A = await loc('A258T'); const B = await loc('B258T');
  let seq = 0;
  const material = async ({ padrao = A.id, negativo = 0 } = {}) => {
    const c = `EAF258-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo, controle_lote,
      controle_serie, permite_saldo_negativo, localizacao_padrao_id, custo_unitario) VALUES (?,?,'UN',0,1,0,0,?,?,1)`,
    [c, c, negativo, padrao])).lastID;
  };
  const v2 = (b) => post(`${API}/movimentacoes/v2`, { motivo: 'teste 258', justificativa: 'teste 258', ...b });
  const cancelar = (id) => post(`${API}/movimentacoes/${id}/cancelar`, { motivo: 'teste 258' });
  const linhas = async (m) => (await dbAll(db, `SELECT COALESCE(l.codigo,'-') loc, COALESCE(lt.codigo,'-') lote, s.quantidade q
    FROM estoque_saldo_almoxarifado s LEFT JOIN localizacoes_almoxarifado l ON l.id=s.localizacao_id
    LEFT JOIN lotes_almoxarifado lt ON lt.id=s.lote_id WHERE s.material_id=?`, [m]))
    .map((r) => `${r.loc}/${r.lote}=${Math.round(r.q * 1e6) / 1e6}`).sort().join(' ');
  const fis = async (m) => Number((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q);
  const vivo = async (movId) => Number((await dbGet(db, 'SELECT cancelado c FROM movimentacoes_almoxarifado WHERE id=?', [movId])).c) === 0;
  const mov = async (m, tipo, q, extra = {}) => {
    const r = await v2({ material_id: m, tipo, quantidade: q, ...extra });
    assert.strictEqual(r.status, 201, `${tipo} de premissa: ${JSON.stringify(r.body)}`);
    return r.body.id;
  };
  const estornar = async (id) => {
    const r = await cancelar(id);
    assert.strictEqual(r.status, 200, `estorno: ${JSON.stringify(r.body)}`);
  };
  const loteId = async (m, codigo) => (await dbGet(db, 'SELECT id FROM lotes_almoxarifado WHERE material_id=? AND codigo=?', [m, codigo])).id;
  const comFalhaNoLivro = async (fn) => {
    await dbRun(db, `CREATE TRIGGER t258_falha BEFORE INSERT ON movimentacoes_almoxarifado WHEN NEW.tipo = 'ESTORNO'
      BEGIN SELECT RAISE(ABORT, 'falha forcada 258'); END`);
    try { return await fn(); } finally { await dbRun(db, 'DROP TRIGGER IF EXISTS t258_falha'); }
  };

  // ── RN-258.01: o total volta pela diferenca ──────────────────────────────────────────────────────────────────────────
  await test('[RN-258.01] C550: Saida, Ajuste para 1, estorno da Saida e depois o do Ajuste -> total 8, A 3, B 5 (antes: 2, A -2, B 4)',
    async () => {
      const m = await material();
      await mov(m, 'ENTRADA', 3);
      await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
      const s = await mov(m, 'SAIDA', 6); // A 0, B 2
      const aj = await mov(m, 'AJUSTE', 1); // A 0, B 1
      await estornar(s); // A 3, B 4
      assert.strictEqual(await linhas(m), 'A258T/-=3 B258T/-=4', 'premissa');
      await estornar(aj);
      assert.strictEqual(await fis(m), 8, 'o total voltou ao valor fixo (saldo_anterior)');
      assert.strictEqual(await linhas(m), 'A258T/-=3 B258T/-=5');
    });

  await test('[RN-258.01] Entrada depois do Ajuste: A 3, Ajuste para 1, Entrada 5 em B, estorno -> 8, A 3, B 5 (antes: 3, A -2)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3);
    const aj = await mov(m, 'AJUSTE', 1);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    await estornar(aj);
    assert.strictEqual(await fis(m), 8, 'a Entrada feita depois do Ajuste sumiu do total');
    assert.strictEqual(await linhas(m), 'A258T/-=3 B258T/-=5');
  });

  await test('[RN-258.01] o livro do estorno grava o novo total (saldo_posterior 8); sem movimento no meio, o de antes (3)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3);
    const aj = await mov(m, 'AJUSTE', 1);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    await estornar(aj);
    const e = await dbGet(db, "SELECT saldo_posterior p FROM movimentacoes_almoxarifado WHERE tipo='ESTORNO' AND material_id=?", [m]);
    assert.strictEqual(Number(e.p), 8);
    const m2 = await material();
    await mov(m2, 'ENTRADA', 3);
    const aj2 = await mov(m2, 'AJUSTE', 7);
    await estornar(aj2);
    assert.strictEqual(await fis(m2), 3);
    assert.strictEqual(await linhas(m2), 'A258T/-=3');
  });

  // ── RN-258.02: total negativo ────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-258.02] Ajuste para cima e Saida depois: o estorno que deixaria -7 e recusado, nada muda (antes: total 2, inventava 8)',
    async () => {
      const m = await material();
      await mov(m, 'ENTRADA', 2);
      const aj = await mov(m, 'AJUSTE', 10);
      await mov(m, 'SAIDA', 9);
      const r = await cancelar(aj);
      assert.strictEqual(r.status, 400, `o estorno passou: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, NEGATIVO);
      assert.strictEqual(await fis(m), 1);
      assert.strictEqual(await linhas(m), 'A258T/-=1');
      assert.ok(await vivo(aj), 'o Ajuste ficou cancelado depois da recusa');
    });

  await test('[RN-258.02] material que permite negativo: o mesmo estorno passa e o total fica -7', async () => {
    const m = await material({ negativo: 1 });
    await mov(m, 'ENTRADA', 2);
    const aj = await mov(m, 'AJUSTE', 10);
    await mov(m, 'SAIDA', 9);
    await estornar(aj);
    assert.strictEqual(await fis(m), -7);
    assert.strictEqual(await linhas(m), 'A258T/-=-7');
  });

  await test('[RN-258.02] a configuracao global que permite negativo tambem deixa passar', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 2);
    const aj = await mov(m, 'AJUSTE', 10);
    await mov(m, 'SAIDA', 9);
    await cfg('permite_saldo_negativo_global', '1');
    try { await estornar(aj); } finally { await cfg('permite_saldo_negativo_global', '0'); }
    assert.strictEqual(await fis(m), -7);
  });

  // ── RN-258.03: as guardas usam o novo total ──────────────────────────────────────────────────────────────────────────
  await test('[RN-258.03] lote: Ajuste do lote, Entrada do lote em B depois, estorno -> 8, A/L 3, B/L 5 (antes: 3)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3, { lote: 'L258A' });
    const L = await loteId(m, 'L258A');
    const aj = await mov(m, 'AJUSTE', 1, { lote_id: L });
    await mov(m, 'ENTRADA', 5, { lote: 'L258A', localizacao_destino_id: B.id });
    await estornar(aj);
    assert.strictEqual(await fis(m), 8);
    assert.strictEqual(await linhas(m), 'A258T/L258A=3 B258T/L258A=5');
  });

  await test('[RN-258.03] lote: a recusa do lote diz o novo total (2, nao o de antes 3)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3, { lote: 'L258B' });
    const L = await loteId(m, 'L258B');
    const aj = await mov(m, 'AJUSTE', 5, { lote_id: L }); // total 5, L 5
    await mov(m, 'ENTRADA', 4, { localizacao_destino_id: B.id }); // 9 (4 sem lote)
    await mov(m, 'SAIDA', 5, { lote_id: L, localizacao_origem_id: A.id }); // 4, L 0
    const r = await cancelar(aj);
    assert.strictEqual(r.status, 400, `o estorno passou: ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Não é possível estornar: o estorno volta o total para 2 UN, mas fora do lote L258B já há 4 UN — '
      + 'o lote L258B ficaria com saldo negativo (-2 UN). Faça um novo ajuste em vez de estornar.');
    assert.ok(await vivo(aj));
  });

  await test('[RN-258.03] retencao: Ajuste para cima, Entrada e Bloqueio depois -> a recusa e pelo novo total (5, nao 2)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 2);
    const aj = await mov(m, 'AJUSTE', 10);
    await mov(m, 'ENTRADA', 3); // 13
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'BLOQUEIO', quantidade: 6, motivo: 'teste 258',
      justificativa: 'teste 258' });
    const r = await cancelar(aj);
    assert.strictEqual(r.status, 400, `o estorno passou: ${JSON.stringify(r.body)}`);
    assert.ok(/^Não é possível estornar: Ajuste para 5 UN deixaria o disponível negativo/.test(r.body.error), r.body.error);
    assert.strictEqual(await fis(m), 13);
  });

  await test('[RN-258.03, Fase 2 achado 1] material que permite negativo: a retencao continua valendo (recusa, nao total -2 com 5 bloqueados)',
    async () => {
      const m = await material({ negativo: 1 });
      await mov(m, 'ENTRADA', 2);
      const aj = await mov(m, 'AJUSTE', 10);
      await stockService.registrarMovimentacao(db, ADMIN, { material_id: m, tipo: 'BLOQUEIO', quantidade: 5, motivo: 'teste 258',
        justificativa: 'teste 258' });
      await mov(m, 'SAIDA', 4); // total 6, 5 bloqueados
      const r = await cancelar(aj);
      assert.strictEqual(r.status, 400, `o estorno passou: ${JSON.stringify(r.body)}`);
      assert.ok(/^Não é possível estornar: Ajuste para -2 UN deixaria o disponível negativo/.test(r.body.error), r.body.error);
      assert.strictEqual(await fis(m), 6);
      assert.ok(await vivo(aj));
    });

  // ── RN-258.07: um ajuste do total mais recente vale ─────────────────────────────────────────────────────────────────
  await test('[RN-258.07, Fase 2 achado 3] 5, Ajuste para 3, Ajuste para 7: o estorno do 1o e recusado (daria 9); na ordem inversa, 3 e 5',
    async () => {
      const m = await material();
      await mov(m, 'ENTRADA', 5);
      const aj1 = await mov(m, 'AJUSTE', 3);
      const aj2 = await mov(m, 'AJUSTE', 7);
      const r = await cancelar(aj1);
      assert.strictEqual(r.status, 400, `o estorno passou: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, `Não é possível estornar: há um ajuste do total deste material feito depois deste (movimentação #${aj2}) `
        + '— a contagem mais recente vale. Estorne primeiro o ajuste mais recente ou faça um novo ajuste.');
      assert.strictEqual(await fis(m), 7);
      assert.ok(await vivo(aj1));
      await estornar(aj2);
      assert.strictEqual(await fis(m), 3);
      await estornar(aj1);
      assert.strictEqual(await fis(m), 5);
      assert.strictEqual(await linhas(m), 'A258T/-=5');
    });

  await test('[RN-258.07] o ajuste COM localizacao feito depois nao trava (ele conta so a posicao dele)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3);
    await mov(m, 'ENTRADA', 4, { localizacao_destino_id: B.id });
    const aj = await mov(m, 'AJUSTE', 1); // 7 -> 1: A 0, B 1
    await mov(m, 'AJUSTE', 2, { localizacao_destino_id: B.id }); // B 2, total 2
    await estornar(aj);
    assert.strictEqual(await fis(m), 8);
  });

  // ── RN-258.04: sem lote, drena antes de negativar a padrao ───────────────────────────────────────────────────────────
  await test('[RN-258.04] A 2, B 5, Ajuste para 10, Saida 5 de A, estorno -> total 2, A 0, B 2 (sem drenar: A -3)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 2);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const aj = await mov(m, 'AJUSTE', 10); // A 5, B 5
    await mov(m, 'SAIDA', 5, { localizacao_origem_id: A.id }); // A 0
    await estornar(aj);
    assert.strictEqual(await fis(m), 2);
    assert.strictEqual(await linhas(m), 'A258T/-=0 B258T/-=2', 'a padrao ficou negativa');
  });

  await test('[C551, documenta] estornar o Ajuste e depois a Saida que veio depois dele: total certo, prateleiras trocadas (A 5, B 2)',
    async () => {
      // Achado da Fase 2: o estorno do Ajuste (cenario acima) faz B ceder 3 para a padrao nao ficar negativa; o estorno seguinte da Saida
      // devolve as 5 a A, de onde ela tirou. Total 7 certo; o certo nas prateleiras seria A 2, B 5 (na ordem inversa — a Saida antes —
      // da A 2, B 5). Sem o ceder, a padrao ficava -3 no meio. Declarado (C551, B1605); este cenario afirma o comportamento de hoje.
      const m = await material();
      await mov(m, 'ENTRADA', 2);
      await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
      const aj = await mov(m, 'AJUSTE', 10);
      const s = await mov(m, 'SAIDA', 5, { localizacao_origem_id: A.id });
      await estornar(aj);
      await estornar(s);
      assert.strictEqual(await fis(m), 7);
      assert.strictEqual(await linhas(m), 'A258T/-=5 B258T/-=2');
    });

  // ── RN-258.05: desfazer ──────────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-258.05] o livro do estorno falhando (com a drenagem): estado de antes; de novo, sem a falha, certo', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 2);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const aj = await mov(m, 'AJUSTE', 10);
    await mov(m, 'SAIDA', 5, { localizacao_origem_id: A.id }); // total 5, A 0, B 5
    const r = await comFalhaNoLivro(() => cancelar(aj));
    assert.ok(r.status >= 400, `o estorno passou com o livro falhando: ${r.status}`);
    assert.strictEqual(await fis(m), 5, 'o total nao voltou');
    assert.strictEqual(await linhas(m), 'A258T/-=0 B258T/-=5', 'o desfazer nao devolveu a drenada');
    assert.ok(await vivo(aj));
    await estornar(aj);
    assert.strictEqual(await fis(m), 2);
    assert.strictEqual(await linhas(m), 'A258T/-=0 B258T/-=2');
  });

  await test('[RN-258.05] C550 com o livro falhando: total 7, A 3, B 4 de volta; de novo -> 8, A 3, B 5', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 3);
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const s = await mov(m, 'SAIDA', 6);
    const aj = await mov(m, 'AJUSTE', 1);
    await estornar(s);
    const r = await comFalhaNoLivro(() => cancelar(aj));
    assert.ok(r.status >= 400, `o estorno passou com o livro falhando: ${r.status}`);
    assert.strictEqual(await fis(m), 7);
    assert.strictEqual(await linhas(m), 'A258T/-=3 B258T/-=4');
    await estornar(aj);
    assert.strictEqual(await fis(m), 8);
    assert.strictEqual(await linhas(m), 'A258T/-=3 B258T/-=5');
  });

  // ── Integracao: pelo servico e o gesto seguinte ──────────────────────────────────────────────────────────────────────
  await test('[integracao] pelo servico: registrarMovimentacao + cancelarMovimentacao, e uma Saida de 8 depois cabe', async () => {
    const m = await material();
    const base = { motivo: 'servico 258', justificativa: 'servico 258' };
    await stockService.registrarMovimentacao(db, ADMIN, { ...base, material_id: m, tipo: 'ENTRADA', quantidade: 3 });
    const aj = await stockService.registrarMovimentacao(db, ADMIN, { ...base, material_id: m, tipo: 'AJUSTE', quantidade: 1 });
    await stockService.registrarMovimentacao(db, ADMIN, { ...base, material_id: m, tipo: 'ENTRADA', quantidade: 5,
      localizacao_destino_id: B.id });
    await stockService.cancelarMovimentacao(db, ADMIN, aj.id, 'servico');
    assert.strictEqual(await fis(m), 8);
    assert.strictEqual(await linhas(m), 'A258T/-=3 B258T/-=5');
    await mov(m, 'SAIDA', 8);
    assert.strictEqual(await fis(m), 0);
    assert.strictEqual(await linhas(m), 'A258T/-=0 B258T/-=0');
  });

  // ── RN-258.06: o que nao muda ────────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-258.06] o Ajuste COM localizacao continua por diferenca na posicao (o de sempre)', async () => {
    const m = await material();
    await mov(m, 'ENTRADA', 5, { localizacao_destino_id: B.id });
    const aj = await mov(m, 'AJUSTE', 2, { localizacao_destino_id: B.id }); // B 2
    await mov(m, 'ENTRADA', 4); // A 4
    await estornar(aj);
    assert.strictEqual(await fis(m), 9);
    assert.strictEqual(await linhas(m), 'A258T/-=4 B258T/-=5');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
