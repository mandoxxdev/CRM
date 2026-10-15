/**
 * Etapa 104 — o AJUSTE com endereco que deixa o estoque abaixo da caixa sem reserva passa a AVISAR (C186, B495, B704).
 *
 * Antes: separados 4 de um material com 4 no endereco A (sem reserva), a contagem "0 no A" gravava (201), o total ia a 0
 * e a requisicao ficava presa em "Maximo: 0" na entrega — sem ninguem saber que a contagem bateu numa caixa. A decisao
 * (B704, opcao (b)): a contagem continua gravando (a decisao do cliente — a contagem por endereco REDEFINE o saldo; e o
 * teste da Etapa 10 em ajusteRetencao) e a resposta ganha `aviso_caixa` (literal A1) quando o total ficou abaixo da
 * caixa sem reserva. Descartada: projetar e recusar (opcao (a)).
 *
 * Usuarios reais por header (molde da 97): S sem perfil (PRODUCAO) cria; ADMIN superadmin aprova e movimenta; ALMOX
 * (ALMOXARIFE) separa. Casos `[104 RN-xx]`.
 * Plano: docs/superpowers/plans/2026-10-15-almoxarifado-etapa104-ajuste-endereco-avisa-caixa.md
 *
 * Executar: cd server && node tests/api/ajusteEnderecoCaixa.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { PERFIS } = require('../../services/almoxarifado/permissions');
const caixaSql = require('../../services/almoxarifado/caixaSql');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const USERS = {
  ADMIN: { id: 1, nome: 'Adm 104', role: 'admin', is_superadmin: 1, email: 'a104@t.com' },
  S: { id: 10411, nome: 'Solic 104', role: 'user', email: 's104@t.com' }, // sem perfil = PRODUCAO
  ALMOX: { id: 10412, nome: 'Almox 104', role: 'user', email: 'x104@t.com', perfil_almoxarifado: PERFIS.ALMOXARIFE },
};
const API = '/api/almoxarifado';
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

// Literal A1 (plano, "Contrato congelado").
const A1 = (cod, total, caixa, lista) => `Ajuste gravado, mas o disponível de ${cod} ficou em ${total} PC, abaixo dos ${caixa} PC `
  + `separados para ${lista}: a entrega fica limitada ao disponível. Se o material está na caixa, a contagem não o incluiu `
  + '— estorne o ajuste que baixou o estoque (perfil Administrador ou Gestor do almoxarifado); se ele se perdeu, devolva-o '
  + 'à prateleira na requisição.';

(async () => {
  console.log('\n=== Etapa 104: o ajuste com endereco avisa quando leva a caixa ===\n');
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

  const material = async () => {
    const c = `E104-${++seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
        ativo, custo_unitario) VALUES (?, ?, 'PC', 0, 0, 1, 0.1)`, [c, c])).lastID;
    return { id, codigo: c };
  };
  const loc = async () => (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES (?, 'e104', 1)",
    [`L104-${++seq}`])).lastID;
  const req = async (m, q) => {
    const cr = await como('S').post('/api/requisicoes-material', {
      setor: 'Comercial', urgencia: 'NORMAL', os_referencia: 'OS-104', itens: [{ material_id: m, quantidade: q }],
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
  const mov = (b, u = 'ADMIN') => como(u).post(`${API}/movimentacoes/v2`, { motivo: 'e104', justificativa: 'contagem e104', ...b });
  const entrar = async (m, q, l) => {
    const r = await mov({ material_id: m, tipo: 'ENTRADA', quantidade: q, localizacao_destino_id: l });
    assert.strictEqual(r.status, 201, `entrada: ${JSON.stringify(r.body)}`);
  };
  const ajuste = (m, q, l, u) => mov({ material_id: m, tipo: 'AJUSTE', quantidade: q, localizacao_destino_id: l }, u);
  const separar = async (R, item, q) => {
    const s = await como('ALMOX').put(`${API}/requisicoes/${R}/separar`, { itens_separados: [{ item_id: item, quantidade_separada: q }] });
    assert.strictEqual(s.status, 200, `separar: ${JSON.stringify(s.body)}`);
  };
  const total = async (m) => (await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id=?', [m])).q;
  const semAviso = (r, rotulo) => {
    assert.strictEqual(r.status, 201, `${rotulo}: ${r.status} ${JSON.stringify(r.body)}`);
    assert.ok(!('aviso_caixa' in r.body), `${rotulo}: nao devia ter aviso_caixa: ${JSON.stringify(r.body)}`);
  };
  // Montagem P1: caixa sem reserva `pede` no endereco A com `fisico` (a ENTRADA vem DEPOIS da aprovacao: sem reserva).
  const montagem = async ({ fisico = 4, pede = 4 } = {}) => {
    const mat = await material(); const A = await loc();
    const a = await req(mat.id, pede); await aprovar(a.R);
    await entrar(mat.id, fisico, A);
    await separar(a.R, a.ids[0], pede);
    return { ...mat, m: mat.id, A, ...a };
  };

  await test('[104 RN-01/RN-02] P1: caixa sem reserva 4, contagem "0 no A" -> 201, total 0, linha 0, aviso_caixa = A1 inteira', async () => {
    const x = await montagem();
    const r = await ajuste(x.m, 0, x.A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_caixa, A1(x.codigo, 0, 4, `a requisição ${x.numero}`));
    assert.deepStrictEqual([r.body.saldo_anterior, r.body.saldo_posterior], [4, 0]);
    assert.strictEqual(await total(x.m), 0, 'RN-01: a contagem gravou');
    const linha = await dbGet(db, 'SELECT quantidade FROM estoque_saldo_almoxarifado WHERE material_id=? AND localizacao_id=?', [x.m, x.A]);
    assert.strictEqual(linha.quantidade, 0);
  });

  await test('[104 RN-02] P3: A:4 B:2, caixa 4 — B->0 (total 4 = caixa) sem aviso; A->1 avisa (total 1); A->3 sobe e ainda avisa (total 3); A->4 sem aviso', async () => {
    const mat = await material(); const A = await loc(); const B = await loc();
    const a = await req(mat.id, 4); await aprovar(a.R);
    await entrar(mat.id, 4, A); await entrar(mat.id, 2, B);
    await separar(a.R, a.ids[0], 4);
    semAviso(await ajuste(mat.id, 0, B), 'B->0');
    const r1 = await ajuste(mat.id, 1, A);
    assert.strictEqual(r1.body.aviso_caixa, A1(mat.codigo, 1, 4, `a requisição ${a.numero}`), 'A->1');
    const r3 = await ajuste(mat.id, 3, A);
    assert.strictEqual(r3.body.aviso_caixa, A1(mat.codigo, 3, 4, `a requisição ${a.numero}`), 'A->3 (sobe, ainda abaixo)');
    semAviso(await ajuste(mat.id, 4, A), 'A->4');
  });

  await test('[104 RN-02] sem caixa nunca avisa: material sem requisicao, A:4 -> 0 (201, total 0, sem chave)', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    semAviso(await ajuste(mat.id, 0, A), 'sem requisicao');
    assert.strictEqual(await total(mat.id), 0);
  });

  await test('[104 RN-02] duas requisicoes com caixa: a lista e a do sufixo ("as requisicoes X e Y") e a caixa e a soma', async () => {
    const mat = await material(); const A = await loc();
    const a = await req(mat.id, 2); const b = await req(mat.id, 2);
    await aprovar(a.R); await aprovar(b.R);
    await entrar(mat.id, 4, A);
    await separar(a.R, a.ids[0], 2); await separar(b.R, b.ids[0], 2);
    const r = await ajuste(mat.id, 1, A);
    assert.strictEqual(r.body.aviso_caixa, A1(mat.codigo, 1, 4, `as requisições ${a.numero} e ${b.numero}`));
  });

  await test('[104 C209] caixa COBERTA por reserva (entrada antes da aprovacao): A->0 grava sem aviso (declarado: a entrega diz "disponivel negativo")', async () => {
    const mat = await material(); const A = await loc();
    await entrar(mat.id, 4, A);
    const a = await req(mat.id, 4); await aprovar(a.R);
    await separar(a.R, a.ids[0], 4);
    semAviso(await ajuste(mat.id, 0, A), 'reserva cobre');
    // metade positiva: a reserva esta la e o total foi a 0 (o caso existe, so nao e o desta etapa)
    const m = await dbGet(db, 'SELECT quantidade_atual q, quantidade_reservada r FROM materiais_almoxarifado WHERE id=?', [mat.id]);
    assert.deepStrictEqual([m.q, m.r], [0, 4]);
  });

  await test('[104 RN-03] so o ajuste com endereco: ENTRADA e TRANSFERENCIA com caixa nao avisam; o ajuste SEM endereco segue recusado (97)', async () => {
    const x = await montagem({ fisico: 4, pede: 4 });
    const B = await loc();
    // o estado ja abaixo da caixa (A->1 avisa), para que ENTRADA e TRANSFERENCIA avisariam se o aviso nao fosse so do ajuste
    assert.ok((await ajuste(x.m, 1, x.A)).body.aviso_caixa, 'premissa: A->1 avisa');
    semAviso(await mov({ material_id: x.m, tipo: 'ENTRADA', quantidade: 1, localizacao_destino_id: x.A }), 'ENTRADA');
    semAviso(await mov({ material_id: x.m, tipo: 'TRANSFERENCIA', quantidade: 1, localizacao_origem_id: x.A, localizacao_destino_id: B }), 'TRANSFERENCIA');
    const r = await mov({ material_id: x.m, tipo: 'AJUSTE', quantidade: 1 }); // 2 -> 1: reduz (a 97 so recusa o que reduz)
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/separada na caixa de requisição: 4/.test(r.body.error), r.body.error);
    // o ajuste SEM endereco que SOBE e continua abaixo da caixa grava (97, F5-1) e nao avisa: o aviso e do ramo com endereco
    semAviso(await mov({ material_id: x.m, tipo: 'AJUSTE', quantidade: 3 }), 'AJUSTE sem endereco 2->3');
  });

  await test('[104 RN-02] (Fase 2, achado 2) a regua e o DISPONIVEL: bloqueado 2, A:6, caixa 4 -> A->4 (total 4 = caixa) avisa com disponivel 2 = o "Maximo" da entrega', async () => {
    const x = await montagem({ fisico: 6, pede: 4 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_bloqueada = 2 WHERE id = ?', [x.m]);
    const r = await ajuste(x.m, 4, x.A);
    assert.strictEqual(r.body.aviso_caixa, A1(x.codigo, 2, 4, `a requisição ${x.numero}`));
    const e = await como('ALMOX').put(`${API}/requisicoes/${x.R}/entregar`, { itens_atendidos: [{ item_id: x.ids[0], quantidade_atendida: 4 }] });
    assert.strictEqual(e.status, 400);
    assert.ok(/Máximo: 2 /.test(e.body.error), `o numero do aviso e o da entrega: ${e.body.error}`);
  });

  await test('[104 RN-02] (Fase 2, achado 2) a reserva de OUTRA requisicao: X caixa 4 sem reserva, Y reserva 3, A:7 -> A->4 avisa com disponivel 1', async () => {
    const mat = await material(); const A = await loc();
    const x = await req(mat.id, 4); await aprovar(x.R); // sem estoque: sem reserva
    await entrar(mat.id, 7, A);
    const y = await req(mat.id, 3); await aprovar(y.R); // com estoque: reserva 3
    await separar(x.R, x.ids[0], 4);
    const r = await ajuste(mat.id, 4, A);
    assert.strictEqual(r.body.aviso_caixa, A1(mat.codigo, 1, 4, `a requisição ${x.numero}`));
  });

  await test('[104 RN-02] (Fase 5) pela rota, disponivel NEGATIVO aparece como 0: X caixa 4 sem reserva, Y reserva 3, A:7 -> A->0', async () => {
    const mat = await material(); const A = await loc();
    const x = await req(mat.id, 4); await aprovar(x.R);
    await entrar(mat.id, 7, A);
    const y = await req(mat.id, 3); await aprovar(y.R);
    await separar(x.R, x.ids[0], 4);
    const r = await ajuste(mat.id, 0, A);
    assert.strictEqual(r.body.aviso_caixa, A1(mat.codigo, 0, 4, `a requisição ${x.numero}`), 'disponivel -3 -> "ficou em 0 PC"');
  });

  await test('[104 RN-02] pelo SERVICO: registrarMovimentacao devolve aviso_caixa no retorno', async () => {
    const x = await montagem();
    const r = await stockService.registrarMovimentacao(db, { ...USERS.ADMIN },
      { material_id: x.m, tipo: 'AJUSTE', quantidade: 0, localizacao_destino_id: x.A, motivo: 'e104', justificativa: 'contagem e104' });
    assert.strictEqual(r.aviso_caixa, A1(x.codigo, 0, 4, `a requisição ${x.numero}`));
  });

  await test('[104 RN-04] a leitura da caixa falha depois do livro -> 201 sem aviso, o ajuste gravado', async () => {
    const x = await montagem();
    const original = caixaSql.lerCaixa;
    let chamadas = 0;
    caixaSql.lerCaixa = async () => { chamadas++; throw new Error('sonda: leitura da caixa falhou'); };
    const avisoOrig = console.warn; console.warn = () => {};
    let r;
    try { r = await ajuste(x.m, 0, x.A); } finally { caixaSql.lerCaixa = original; console.warn = avisoOrig; }
    semAviso(r, 'leitura falhou');
    assert.ok(chamadas >= 1, 'premissa: o motor tentou ler a caixa (senao o teste nao prova o try/catch)');
    assert.strictEqual(await total(x.m), 0);
    assert.ok(r.body.id && (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE id=?', [r.body.id])), 'o livro tem o ajuste');
  });

  await test('[104 RN-02] funcao pura avisoCaixaDoAjuste: caixa 0/ausente -> null; igual -> null; resto 1e-10 -> null; acima -> A1', async () => {
    const mat = { codigo: 'MX', unidade: 'PC' };
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 0, requisicoes: [] }, 0, mat), null);
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste(undefined, 0, mat), null);
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, 4, mat), null);
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, 4 - 1e-10, mat), null);
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, 3.9999, mat), A1('MX', 3.9999, 4, 'a requisição R1'));
    // Fase 5 (rv2 achado 2): 0.1 + 0.1 da exatamente 0.2 e nao provava o arredondamento; 0.1 + 0.2 = 0.30000000000000004
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 0.4, requisicoes: ['R1'] }, 0.1 + 0.2, mat), A1('MX', 0.3, 0.4, 'a requisição R1'));
    // Fase 5 (rv1 achado 1): unidade nula ou vazia nao vira "null" nem espaco duplo (o filtro do sufixoCaixa)
    for (const un of [null, '', undefined]) {
      const t = caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, 0, { codigo: 'MX', unidade: un });
      assert.ok(t.startsWith('Ajuste gravado, mas o disponível de MX ficou em 0, abaixo dos 4 separados para a requisição R1: '), `unidade ${un}: ${t}`);
    }
    // disponivel negativo (reservado alem do fisico): mostra 0, como as recusas de saldo
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, -2, mat), A1('MX', 0, 4, 'a requisição R1'));
  });

  await test('[104 RN-02] descreverRequisicoes e o sufixoCaixa byte a byte o de antes (uma, duas, tres, cinco, nenhuma)', async () => {
    assert.strictEqual(caixaSql.descreverRequisicoes(['R1']), 'a requisição R1');
    assert.strictEqual(caixaSql.descreverRequisicoes(['R1', 'R2']), 'as requisições R1 e R2');
    assert.strictEqual(caixaSql.descreverRequisicoes(['R1', 'R2', 'R3']), 'as requisições R1, R2 e R3');
    assert.strictEqual(caixaSql.descreverRequisicoes(['R1', 'R2', 'R3', 'R4', 'R5']), 'as requisições R1, R2, R3 e mais 2');
    assert.strictEqual(caixaSql.descreverRequisicoes([]), 'requisições em separação');
    const FIM = ' e só saem pela entrega (material perdido da caixa: devolva-o à prateleira na requisição e dê a baixa, '
      + 'ou peça ao administrador do almoxarifado para excluí-la)';
    assert.strictEqual(caixaSql.sufixoCaixa({ caixa: 4, requisicoes: ['R1'] }, 'PC'), ` — 4 PC estão separados para a requisição R1${FIM}`);
    assert.strictEqual(caixaSql.sufixoCaixa({ caixa: 2, requisicoes: ['R1', 'R2', 'R3', 'R4'] }, 'PC'),
      ` — 2 PC estão separados para as requisições R1, R2, R3 e mais 1${FIM}`);
    assert.strictEqual(caixaSql.sufixoCaixa({ caixa: 0, requisicoes: ['R1'] }, 'PC'), '');
  });

  // Etapa 106 (RN-08, B710): o estorno de ajuste de material de cliente passou a exigir `ajustar_material_cliente` (so
  // Administrador) — o aviso que ensina "estorne o ajuste que baixou" nao pode mandar o cliente pedir ao Gestor.
  const A1_CLIENTE = (cod, total, caixa, lista) => A1(cod, total, caixa, lista)
    .replace('(perfil Administrador ou Gestor do almoxarifado)', () => '(perfil Administrador do almoxarifado)');

  await test('[106 RN-08] funcao pura: material de cliente -> o parentese nomeia so o Administrador; material nosso byte a byte', async () => {
    const cliente = { codigo: 'MX', unidade: 'PC', proprietario_cliente_id: 7 };
    const t = caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, 0, cliente);
    assert.strictEqual(t, A1_CLIENTE('MX', 0, 4, 'a requisição R1'));
    assert.ok(t.includes('(perfil Administrador do almoxarifado)') && !t.includes('Gestor'), t);
    for (const dono of [null, undefined, 0]) {
      assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, 0, { codigo: 'MX', unidade: 'PC', proprietario_cliente_id: dono }),
        A1('MX', 0, 4, 'a requisição R1'), `dono ${dono}`);
    }
    assert.strictEqual(caixaSql.avisoCaixaDoAjuste({ caixa: 4, requisicoes: ['R1'] }, 4, cliente), null, 'sem aviso continua sem aviso');
  });

  await test('[106 RN-08] pela rota: o Administrador conta "0 no A" de material de CLIENTE com caixa -> A1 nomeia so o Administrador', async () => {
    const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente E106'])).lastID;
    const x = await montagem();
    await dbRun(db, 'UPDATE materiais_almoxarifado SET proprietario_cliente_id = ? WHERE id = ?', [cli, x.m]);
    const r = await ajuste(x.m, 0, x.A);
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.aviso_caixa, A1_CLIENTE(x.codigo, 0, 4, `a requisição ${x.numero}`));
  });

  terminou = true;
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
