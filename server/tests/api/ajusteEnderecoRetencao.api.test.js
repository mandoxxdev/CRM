/**
 * Etapa 128, T3 (tronco, motor) — a contagem por endereco que deixa o DISPONIVEL negativo passa a avisar (C209).
 *
 * Antes: material com reserva da requisicao separada (ou so reservada, ou bloqueada), a contagem "0 no A" gravava (201) e o
 * disponivel ficava negativo sem ninguem saber — a entrega depois dizia "Maximo: 0 ... disponivel negativo (reservado alem do
 * fisico)". O `aviso_caixa` da Etapa 104 so olha a caixa SEM reserva. Agora a resposta ganha `aviso_retencao` (literal A2 do
 * plano) quando o disponivel depois do ajuste com endereco ficou negativo e ha retencao. Aditivo: a contagem continua gravando.
 *
 * Usuarios reais por header (molde da 104). Casos `[128 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-16-almoxarifado-etapa128-o-tempo-do-recebimento-e-o-aviso-da-retencao.md
 *
 * Executar: cd server && node tests/api/ajusteEnderecoRetencao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 128', role: 'admin', is_superadmin: 1, email: 'a128@t.com' },
  S: { id: 12821, nome: 'Solic 128', role: 'user', email: 's128@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 12822, nome: 'Almox 128', role: 'user', email: 'x128@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

const NOSSO = 'perfil Administrador ou Gestor do almoxarifado';
const DO_CLIENTE = 'perfil Administrador do almoxarifado';
// Literal A2 (plano, "Regras de negocio" — C209; refeita na Fase 2, I1/I2/M4): o "se perdeu" e uma acao por retencao presente.
const RES = 'libere a reserva (perfil Administrador ou Almoxarife)';
const RES_CX = 'devolva-o à prateleira na requisição e libere a reserva (perfil Administrador ou Almoxarife)';
const BLOQ = 'desbloqueie o que se perdeu (perfil Administrador ou Gestor)';
const INSP = 'decida a inspeção';
const TERC = 'resolva a remessa ao terceiro';
const juntar = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
const A2 = (cod, total, partes, retido, acoes, { quem = NOSSO, un = 'PC' } = {}) => {
  const q = (n) => [n, un].filter((x) => x !== undefined && x !== null && x !== '').join(' ');
  const terceiros = acoes.includes(TERC) ? ' O que está em terceiros continua no saldo do endereço: a contagem tem de somá-lo.' : '';
  return `Ajuste gravado, mas o disponível de ${cod} ficou negativo: o estoque (${q(total)}) é menor que o retido (${partes}, total `
    + `retido: ${q(retido)}), e nada dele sai pela entrega de requisição enquanto for assim.${terceiros} Se o material existe e a `
    + `contagem não o incluiu, estorne o ajuste que baixou o estoque (${quem}); se ele se perdeu, ${juntar(acoes)}.`;
};
// A1 da Etapa 104 (o aviso da caixa), para o cenario dos dois juntos.
const A1 = (cod, total, caixa, lista) => `Ajuste gravado, mas o disponível de ${cod} ficou em ${total} PC, abaixo dos ${caixa} PC `
  + `separados para ${lista}: a entrega fica limitada ao disponível. Se o material está na caixa, a contagem não o incluiu `
  + '— estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, devolva-o '
  + 'à prateleira na requisição.';

(async () => {
  console.log('\n=== Etapa 128: o ajuste com endereco avisa quando o disponivel fica negativo (C209) ===\n');
  const { app, db, setUser } = await createTestApp({ user: { ...USERS.ADMIN } });
  setUser({ ...USERS.ADMIN });
  app.use((req, res, next) => { const k = req.headers['x-teste-usuario']; setUser({ ...(USERS[k] || USERS.ADMIN) }); next(); });
  const stack = app._router.stack; const mw = stack.pop();
  const iJson = stack.findIndex((l) => l.name === 'jsonParser');
  assert.ok(iJson >= 0, 'premissa: jsonParser na pilha');
  stack.splice(iJson + 1, 0, mw);
  const como = (k) => ({
    post: (u, b = {}) => request(app).post(u).set('x-teste-usuario', k).send(b).then((x) => x),
    put: (u, b = {}) => request(app).put(u).set('x-teste-usuario', k).send(b).then((x) => x),
  });

  const material = async ({ unidade = 'PC', permiteNegativo = 0 } = {}) => {
    const c = `E128-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario, permite_saldo_negativo) VALUES (?, ?, ?, 0, 0, 1, 0.1, ?)`, [c, c, unidade, permiteNegativo])).lastID;
    return { id, codigo: c };
  };
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e128', 1)",
    [`L128-${++seq}`])).lastID;
  const req = async (m, q) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-128', itens: [{ material_id: m, quantidade: q }],
    });
    assert.ok(cr.body.id, `criar: ${cr.status} ${JSON.stringify(cr.body)}`);
    const ids = (await dbAll(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id=? ORDER BY id', [cr.body.id])).map((r) => r.id);
    const { numero } = await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id=?', [cr.body.id]);
    return { R: cr.body.id, ids, numero };
  };
  const aprovar = async (R) => {
    const r = await como('ADMIN').put(`${API}/requisicoes/${R}/aprovar`, {});
    assert.strictEqual(r.status, 200, `aprovar: ${JSON.stringify(r.body)}`);
  };
  const mov = (b, u = 'ADMIN') => como(u).post(`${API}/movimentacoes/v2`, { motivo: 'e128', justificativa: 'contagem e128', ...b });
  const entrar = async (m, q, l) => {
    const r = await mov({ material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: l });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const ajuste = (m, q, l, u) => mov({ material_id: m, tipo: 'AJUSTE', quantidade: q, localizacao_destino_id: l }, u);
  const separar = async (R, item, q) => {
    const s = await como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
  };
  const estado = async (m) => dbGet(db, `SELECT quantidade_atual q, quantidade_reservada r, quantidade_bloqueada b
    FROM materiais_almoxarifado WHERE id=?`, [m]);
  const semRetencao = (r, rotulo) => {
    assert.strictEqual(r.status, 201, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(!('aviso_retencao' in r.body), `${rotulo}: nao devia ter aviso_retencao: ${JSON.stringify(r.body)}`);
  };

  await test('[128 RN-11] C209: reserva 4 separada, contagem "0 no A" -> 201, aviso_retencao A2 (reservada: 4), sem aviso_caixa, gravou', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    const a = await req(mat.id, 4); await aprovar(a.R);
    await separar(a.R, a.ids[0], 4);
    const r = await ajuste(mat.id, 0, A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 0, 'reservada: 4', 4, [RES_CX]));
    assert.ok(!('aviso_caixa' in r.body), `a caixa esta coberta pela reserva: ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual([r.body.saldo_anterior, r.body.saldo_posterior], [4, 0]);
    const e = await estado(mat.id);
    assert.deepStrictEqual([e.q, e.r], [0, 4], 'a contagem gravou e a reserva ficou');
  });

  await test('[128 RN-12] reserva sem caixa: fisico 4, reserva 3 nao separada, "1 no A" -> A2 (estoque 1, reservada: 3, retido 3)', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    const a = await req(mat.id, 3); await aprovar(a.R);
    const r = await ajuste(mat.id, 1, A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 1, 'reservada: 3', 3, [RES]));
  });

  await test('[128 RN-13] bloqueado 3: "1 no A" -> bloqueada: 3; duas retencoes (reservada 2 + bloqueada 2, "3 no A") na ordem', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 3 WHERE id = ?', [mat.id]);
    const r = await ajuste(mat.id, 1, A);
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 1, 'bloqueada: 3', 3, [BLOQ]));
    const m2 = await material(); const B = await loc();
    await entrar(m2.id, 4, B);
    const a = await req(m2.id, 2); await aprovar(a.R);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [m2.id]);
    const r2 = await ajuste(m2.id, 3, B);
    assert.strictEqual(r2.body.aviso_retencao, A2(m2.codigo, 3, 'reservada: 2, bloqueada: 2', 4, [RES, BLOQ]));
  });

  await test('[128 RN-13] em inspecao e em terceiros entram com os rotulos da M6', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 5, A);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_inspecao = 2, quantidade_em_terceiros = 1.5 WHERE id = ?', [mat.id]);
    const r = await ajuste(mat.id, 3, A);
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 3, 'em inspeção: 2, em terceiros: 1.5', 3.5, [INSP, TERC]));
  });

  await test('[128 RN-13] (Fase 2, I2) so em terceiros: a frase manda somar o que esta no terceiro e resolver a remessa', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_em_terceiros = 3 WHERE id = ?', [mat.id]);
    const r = await ajuste(mat.id, 1, A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 1, 'em terceiros: 3', 3, [TERC]));
    assert.ok(!/libere/.test(r.body.aviso_retencao), 'sem reserva nem bloqueio, nao manda liberar');
  });

  await test('[128 RN-14] disponivel exatamente 0 nao avisa (metade positiva: um a menos avisa); positivo nao avisa', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 5, A);
    const a = await req(mat.id, 3); await aprovar(a.R);
    semRetencao(await ajuste(mat.id, 4, A), 'disponivel 1');
    semRetencao(await ajuste(mat.id, 3, A), 'disponivel 0');
    const r = await ajuste(mat.id, 2, A);
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 2, 'reservada: 3', 3, [RES]), 'disponivel -1 avisa');
  });

  await test('[128 RN-14] sem retencao nunca avisa; ENTRADA, SAIDA e TRANSFERENCIA nao avisam; o AJUSTE sem endereco segue 400 (Etapa 10)', async () => {
    const livre = await material(); const L = await loc();
    await entrar(livre.id, 4, L);
    semRetencao(await ajuste(livre.id, 0, L), 'sem retencao');
    const mat = await material(); const A = await loc(); const B = await loc();
    await entrar(mat.id, 4, A);
    const a = await req(mat.id, 3); await aprovar(a.R);
    assert.ok((await ajuste(mat.id, 1, A)).body.aviso_retencao, 'premissa: o estado ja esta negativo (-2)');
    semRetencao(await mov({ material_id: mat.id, tipo: 'ENTRADA', quantidade: 1, localizacao_destino_id: A }), 'ENTRADA');
    semRetencao(await mov({ material_id: mat.id, tipo: 'TRANSFERENCIA', quantidade: 1, localizacao_origem_id: A, localizacao_destino_id: B }), 'TRANSFERENCIA');
    const s = await mov({ material_id: mat.id, tipo: 'SAIDA', quantidade: 1, localizacao_origem_id: B, emergencial: true });
    assert.ok(!('aviso_retencao' in (s.body || {})), `SAIDA: ${JSON.stringify(s.body)}`);
    const r = await mov({ material_id: mat.id, tipo: 'AJUSTE', quantidade: 1 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Ajuste para 1 PC deixaria o disponível negativo (reservada: 3, mínimo aceitável: 3 PC). Resolva a '
      + 'retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.');
  });

  await test('[128 RN-14] fisico negativo sem retencao (material que permite negativo) nao avisa', async () => {
    const mat = await material({ permiteNegativo: 1 }); const A = await loc(); const B = await loc();
    await entrar(mat.id, 2, A);
    const s = await mov({ material_id: mat.id, tipo: 'SAIDA', quantidade: 5, localizacao_origem_id: A });
    assert.strictEqual(s.status, 201, `premissa: a saida que deixa negativo passa: ${JSON.stringify(s.body)}`);
    const r = await ajuste(mat.id, 0, B);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const e = await estado(mat.id);
    assert.ok(e.q < 0, `premissa: o fisico continua negativo (${e.q})`);
    semRetencao(r, 'negativo sem retencao');
  });

  await test('[128 RN-15] material de cliente: o parentese nomeia so o Administrador', async () => {
    const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente E128'])).lastID;
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET proprietario_cliente_id = ?, quantidade_bloqueada = 3 WHERE id = ?', [cli, mat.id]);
    const r = await ajuste(mat.id, 1, A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 1, 'bloqueada: 3', 3, [BLOQ], { quem: DO_CLIENTE }));
  });

  await test('[128 RN-16] os dois avisos juntos: X caixa 4 sem reserva, Y reserva 2, fisico 6 -> "1 no A": aviso_caixa (0 PC) e aviso_retencao (reservada: 2)', async () => {
    const mat = await material(); const A = await loc();
    const x = await req(mat.id, 4); await aprovar(x.R); // sem estoque: sem reserva
    await entrar(mat.id, 6, A);
    const y = await req(mat.id, 2); await aprovar(y.R); // com estoque: reserva 2
    await separar(x.R, x.ids[0], 4);
    const r = await ajuste(mat.id, 1, A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_caixa, A1(mat.codigo, 0, 4, `a requisição ${x.numero}`));
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 1, 'reservada: 2', 2, [RES]));
  });

  await test('[128 RN-11] unidade vazia: sem "null" nem espaco duplo', async () => {
    const mat = await material({ unidade: '' }); const A = await loc();
    await entrar(mat.id, 4, A);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 3 WHERE id = ?', [mat.id]);
    const r = await ajuste(mat.id, 1, A);
    assert.strictEqual(r.body.aviso_retencao, A2(mat.codigo, 1, 'bloqueada: 3', 3, [BLOQ], { un: '' }));
    assert.ok(!/null|  /.test(r.body.aviso_retencao), r.body.aviso_retencao);
  });

  await test('[128 RN-11] pelo SERVICO: registrarMovimentacao devolve aviso_retencao no retorno', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 3 WHERE id = ?', [mat.id]);
    const r = await stockService.registrarMovimentacao(db, USERS.ADMIN, {
      material_id: mat.id, tipo: 'AJUSTE', quantidade: 2, localizacao_destino_id: A, motivo: 'e128', justificativa: 'contagem e128',
    });
    assert.strictEqual(r.aviso_retencao, A2(mat.codigo, 2, 'bloqueada: 3', 3, [BLOQ]));
  });

  await test('[128 RN-11] funcoes puras: avisoRetencaoDoAjuste (null sem retencao, null em 0, null em -1e-10, A2 abaixo) e partesDaRetencao', async () => {
    const base = { codigo: 'MX', unidade: 'PC', quantidade_atual: 1, quantidade_reservada: 0, quantidade_bloqueada: 0,
      quantidade_em_inspecao: 0, quantidade_em_terceiros: 0 };
    assert.strictEqual(stockService.avisoRetencaoDoAjuste(base), null, 'sem retencao');
    assert.strictEqual(stockService.avisoRetencaoDoAjuste({ ...base, quantidade_reservada: 1 }), null, 'disponivel 0');
    assert.strictEqual(stockService.avisoRetencaoDoAjuste({ ...base, quantidade_reservada: 1 + 1e-10 }), null, 'resto de ponto flutuante');
    assert.strictEqual(stockService.avisoRetencaoDoAjuste({ ...base, quantidade_reservada: 3 }), A2('MX', 1, 'reservada: 3', 3, [RES]));
    assert.strictEqual(stockService.avisoRetencaoDoAjuste({ ...base, quantidade_reservada: 3 }, 2), A2('MX', 1, 'reservada: 3', 3, [RES_CX]), 'com caixa coberta por reserva');
    assert.strictEqual(stockService.avisoRetencaoDoAjuste({ ...base, quantidade_reservada: 1, quantidade_bloqueada: 1, quantidade_em_inspecao: 1, quantidade_em_terceiros: 1 }),
      A2('MX', 1, 'reservada: 1, bloqueada: 1, em inspeção: 1, em terceiros: 1', 4, [RES, BLOQ, INSP, TERC]), 'as quatro, na ordem');
    assert.strictEqual(stockService.avisoRetencaoDoAjuste({ ...base, quantidade_atual: -2 }), null, 'fisico negativo sem retencao');
    assert.strictEqual(stockService.avisoRetencaoDoAjuste({ ...base, quantidade_reservada: 3, proprietario_cliente_id: 7 }),
      A2('MX', 1, 'reservada: 3', 3, [RES], { quem: DO_CLIENTE }));
    assert.deepStrictEqual(stockService.partesDaRetencao({ ...base, quantidade_reservada: 1, quantidade_bloqueada: 2,
      quantidade_em_inspecao: 3, quantidade_em_terceiros: 4 }, 5),
    { partes: ['reservada: 1', 'bloqueada: 2', 'em inspeção: 3', 'em terceiros: 4', 'separada na caixa de requisição: 5'], retido: 15 });
    assert.deepStrictEqual(stockService.partesDaRetencao(base, 0), { partes: [], retido: 0 });
  });

  await test('[128 RN-17] a recusa do ajuste SEM endereco continua byte a byte (com caixa e com as quatro retencoes)', async () => {
    const m = { unidade: 'PC', quantidade_reservada: 1, quantidade_bloqueada: 2, quantidade_em_inspecao: 3, quantidade_em_terceiros: 4 };
    assert.strictEqual(stockService.motivoRecusaAjustePorRetencao(m, 2, 5),
      'Ajuste para 2 PC deixaria o disponível negativo (reservada: 1, bloqueada: 2, em inspeção: 3, em terceiros: 4, separada na '
      + 'caixa de requisição: 5, mínimo aceitável: 15 PC). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor '
      + 'maior ou igual ao mínimo.');
    assert.strictEqual(stockService.motivoRecusaAjustePorRetencao(m, 9), 'Ajuste para 9 PC deixaria o disponível negativo (reservada: 1, '
      + 'bloqueada: 2, em inspeção: 3, em terceiros: 4, mínimo aceitável: 10 PC). Resolva a retenção antes de ajustar para menos, ou '
      + 'ajuste para um valor maior ou igual ao mínimo.');
    assert.strictEqual(stockService.motivoRecusaAjustePorRetencao(m, 15, 5), null, 'cabe');
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
