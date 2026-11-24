/**
 * Etapa 260 (item 2) — RN-260.03/04/06: o projeto na requisicao.
 *
 * - RN-260.03: as listas de projetos para o formulario (almoxarifado: com cliente; requisicoes-material: so id, nome, status), ativos
 *   primeiro, depois por nome; sem a tabela core, [].
 * - RN-260.04: as duas aux de OS dizem o projeto da OS (`projeto_id`; null sem a coluna).
 * - RN-260.06: a criacao confere o projeto — inexistente, nao e o da OS, ou de outro cliente que o da OS (OS sem projeto) -> 400 com a
 *   frase; inativo passa; a copia leva o projeto so se ainda passa, e nunca falha por ele.
 * - Integracao: criada pela rota com projeto e sem OS cadastrada -> a fila mostra o projeto; material de cliente com o projeto do dono
 *   e aprovado, separado e entregue pelas rotas, e a saida leva o projeto.
 *
 * O harness nao tem `projetos`/`ordens_servico` (tabelas core): o teste as cria — primeiro SEM elas, depois `ordens_servico` sem
 * `projeto_id` (as ~25 suites que a criam assim), depois com a coluna.
 * Plano: docs/superpowers/plans/2026-11-23-almoxarifado-etapa260-fornecedores-na-busca-projeto-e-fila-agrupada.md
 * Executar: cd server && node tests/api/requisicaoProjeto.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const requisitionCreateService = require('../../services/almoxarifado/requisitionCreateService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 600)}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const SOL = { id: 26002, nome: 'Solicitante 260', role: 'admin', is_superadmin: 1, email: 'sol260@test.com' };
const API = '/api/almoxarifado';
const MSG_NAO_E_DA_OS = (os) => `O projeto escolhido não é o da OS ${os}. Escolha o projeto da OS ou deixe o campo vazio.`;
const MSG_OUTRO_CLIENTE = (os) => `O projeto escolhido é de outro cliente que o da OS ${os}. Escolha um projeto do mesmo cliente ou deixe o campo vazio.`;

(async () => {
  console.log('\n=== Etapa 260 (item 2): o projeto na requisicao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser(ADMIN);
  const cfg = (k, v) => dbRun(db, `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
    ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [k, v]);
  await cfg('liberacao_valor_ativo', '0');
  await cfg('aprovacao_automatica', '0');

  let seq = 0;
  const material = async (cliente = null) => {
    seq += 1;
    const codigo = `E260-M${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo, proprietario_cliente_id) VALUES (?, ?, 'PC', 0, 0, 10, 1, ?)`, [codigo, codigo, cliente])).lastID;
    const e = await request(app).post(`${API}/movimentacoes/v2`).send({ material_id: id, tipo: 'ENTRADA', quantidade: 20,
      motivo: 'setup e260', justificativa: 'setup e260', documento_vinculado: 'NF-E260' });
    assert.strictEqual(e.status, 201, JSON.stringify(e.body));
    return { id, codigo };
  };
  const M = await material();
  // Quem cria (SOL) nao e quem aprova (ADMIN): a mesma pessoa nao aprova a propria requisicao.
  const comoSol = async (fn) => { setUser(SOL); try { return await fn(); } finally { setUser(ADMIN); } };
  const criar = (extra, url = `${API}/requisicoes`) => comoSol(() => request(app).post(url)
    .send({ os_referencia: 'OS TEXTO 260', itens: [{ material_id: M.id, quantidade: 1 }], ...extra }));
  const projetoDaReq = async (id) => (await dbGet(db, 'SELECT projeto_id FROM requisicoes_almoxarifado WHERE id = ?', [id])).projeto_id;

  // ══════════════ sem as tabelas core ══════════════
  await test('[RN-260.03] sem a tabela `projetos`: as duas listas respondem []', async () => {
    for (const url of [`${API}/aux/projetos`, '/api/requisicoes-material/aux/projetos']) {
      const r = await request(app).get(url);
      assert.deepStrictEqual([r.status, r.body], [200, []], url);
    }
  });

  await test('[RN-260.06] sem a tabela `projetos`: projeto informado -> 400 "Projeto #<id> nao encontrado"', async () => {
    const r = await criar({ projeto_id: 5 });
    assert.deepStrictEqual([r.status, r.body.error], [400, 'Projeto #5 não encontrado']);
  });

  // ══════════════ ordens_servico SEM projeto_id (como ~25 suites) ══════════════
  await dbRun(db, `CREATE TABLE ordens_servico (id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT UNIQUE NOT NULL, cliente_id INTEGER,
    tipo_os TEXT NOT NULL DEFAULT 'producao', status TEXT DEFAULT 'pendente', data_abertura DATE NOT NULL DEFAULT '2026-11-23')`);
  await dbRun(db, 'CREATE TABLE projetos (id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT NOT NULL, status TEXT DEFAULT \'ativo\')');
  const cliA = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente A E260')")).lastID;
  const cliB = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Cliente B E260')")).lastID;
  const projeto = async (nome, cliente = null, status = 'ativo') => (await dbRun(db,
    'INSERT INTO projetos (nome, cliente_id, status) VALUES (?, ?, ?)', [nome, cliente, status])).lastID;
  const PA = await projeto('Linha 2', cliA);
  const PB = await projeto('Ampliação', cliB);
  const PI = await projeto('Zeta interno', null);
  const PINAT = await projeto('Antigo', cliA, 'inativo');
  const osSemColuna = (await dbRun(db, "INSERT INTO ordens_servico (numero_os, cliente_id) VALUES ('OS-260-0', ?)", [cliA])).lastID;

  await test('[RN-260.04] aux de OS com `ordens_servico` sem a coluna projeto_id: 200 e projeto_id null (as duas rotas)', async () => {
    for (const url of [`${API}/aux/ordens-servico`, '/api/requisicoes-material/aux/ordens-servico']) {
      const r = await request(app).get(url);
      assert.strictEqual(r.status, 200, url);
      const os = r.body.find((o) => o.id === osSemColuna);
      assert.ok(os, `${url}: a OS esta na lista`);
      assert.strictEqual(os.projeto_id, null, url);
    }
  });

  await test('[RN-260.06] OS sem a coluna projeto_id: confere pelo cliente (A com projeto de A passa; projeto de B recusa)', async () => {
    let r = await criar({ os_id: osSemColuna, projeto_id: PA });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    r = await criar({ os_id: osSemColuna, projeto_id: PB });
    assert.deepStrictEqual([r.status, r.body.error], [400, MSG_OUTRO_CLIENTE('OS-260-0')]);
  });

  await dbRun(db, 'ALTER TABLE ordens_servico ADD COLUMN projeto_id INTEGER');
  const novaOs = async (numero, cliente, projetoId = null) => (await dbRun(db,
    'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?, ?, ?)', [numero, cliente, projetoId])).lastID;
  const OS_PA = await novaOs('OS-260-1', cliA, PA);
  const OS_A = await novaOs('OS-260-2', cliA);
  const OS_SEM = await novaOs('OS-260-3', null);

  // ══════════════ RN-260.03 / RN-260.04 ══════════════
  await test('[RN-260.03] aux do almoxarifado: id, nome, status, cliente; ativos primeiro, depois por nome', async () => {
    const r = await request(app).get(`${API}/aux/projetos`);
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.map((p) => [p.id, p.nome, p.status]),
      [[PB, 'Ampliação', 'ativo'], [PA, 'Linha 2', 'ativo'], [PI, 'Zeta interno', 'ativo'], [PINAT, 'Antigo', 'inativo']]);
    const a = r.body.find((p) => p.id === PA);
    assert.deepStrictEqual([a.cliente_id, a.cliente_nome], [cliA, 'Cliente A E260']);
  });

  await test('[RN-260.03] aux de requisicoes-material: so id, nome e status (sem cliente), na mesma ordem', async () => {
    const r = await request(app).get('/api/requisicoes-material/aux/projetos');
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body, [
      { id: PB, nome: 'Ampliação', status: 'ativo' }, { id: PA, nome: 'Linha 2', status: 'ativo' },
      { id: PI, nome: 'Zeta interno', status: 'ativo' }, { id: PINAT, nome: 'Antigo', status: 'inativo' }]);
  });

  await test('[RN-260.04] aux de OS (as duas rotas): cada OS diz o projeto dela', async () => {
    for (const url of [`${API}/aux/ordens-servico`, '/api/requisicoes-material/aux/ordens-servico']) {
      const r = await request(app).get(url);
      const por = new Map(r.body.map((o) => [o.id, o.projeto_id]));
      assert.deepStrictEqual([por.get(OS_PA), por.get(OS_A)], [PA, null], url);
    }
  });

  // ══════════════ RN-260.06 — a criacao ══════════════
  await test('[RN-260.06] projeto sem OS cadastrada: grava; projeto inativo tambem passa', async () => {
    let r = await criar({ projeto_id: PB });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await projetoDaReq(r.body.id), PB);
    r = await criar({ projeto_id: PINAT });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await projetoDaReq(r.body.id), PINAT);
  });

  await test('[RN-260.06] projeto inexistente -> 400 nas duas rotas e no rascunho; nada gravado', async () => {
    const antes = (await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n;
    for (const [extra, url] of [[{}, undefined], [{ salvar_rascunho: true }, undefined], [{ setor: 'Manutenção' }, '/api/requisicoes-material']]) {
      const r = await criar({ projeto_id: 99999, ...extra }, url);
      assert.deepStrictEqual([r.status, r.body.error], [400, 'Projeto #99999 não encontrado'], JSON.stringify([extra, url]));
    }
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM requisicoes_almoxarifado')).n, antes);
  });

  await test('[RN-260.06] o servico (a copia nao passa pelo Zod): projeto nao inteiro -> 400 "Projeto inválido"', async () => {
    for (const v of ['abc', -3, 1.5]) {
      await assert.rejects(requisitionCreateService.createRequisicao(db, ADMIN, {
        os_referencia: 'OS X', projeto_id: v, itens: [{ material_id: M.id, quantidade: 1 }],
      }), (e) => e.status === 400 && e.message === 'Projeto inválido', String(v));
    }
  });

  await test('[RN-260.06 a] OS com projeto: o mesmo projeto passa; outro -> 400 com o numero da OS', async () => {
    let r = await criar({ os_id: OS_PA, projeto_id: PA });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await projetoDaReq(r.body.id), PA);
    r = await criar({ os_id: OS_PA, projeto_id: PINAT }); // mesmo cliente, mas nao e o projeto da OS
    assert.deepStrictEqual([r.status, r.body.error], [400, MSG_NAO_E_DA_OS('OS-260-1')]);
  });

  await test('[RN-260.06 b] OS sem projeto: projeto do cliente da OS passa; de outro cliente ou interno -> 400; os dois sem cliente passam', async () => {
    let r = await criar({ os_id: OS_A, projeto_id: PINAT });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    r = await criar({ os_id: OS_A, projeto_id: PB });
    assert.deepStrictEqual([r.status, r.body.error], [400, MSG_OUTRO_CLIENTE('OS-260-2')]);
    r = await criar({ os_id: OS_A, projeto_id: PI });
    assert.deepStrictEqual([r.status, r.body.error], [400, MSG_OUTRO_CLIENTE('OS-260-2')], 'projeto interno com OS de cliente');
    r = await criar({ os_id: OS_SEM, projeto_id: PI });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    r = await criar({ os_id: OS_SEM, projeto_id: PA });
    assert.deepStrictEqual([r.status, r.body.error], [400, MSG_OUTRO_CLIENTE('OS-260-3')], 'OS sem cliente, projeto de cliente');
  });

  await test('[RN-260.06] sem projeto: nada muda (a OS com projeto nao preenche o da requisicao)', async () => {
    const r = await criar({ os_id: OS_PA });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(await projetoDaReq(r.body.id), null);
  });

  // ══════════════ RN-260.06 — a copia ══════════════
  const copiar = (id) => request(app).post(`${API}/requisicoes/${id}/copiar`).send({});
  await test('[RN-260.06] copia: leva o projeto (inativo inclusive); projeto apagado ou que deixou de bater com a OS -> copia sem ele', async () => {
    let r = await criar({ projeto_id: PINAT });
    let c = await copiar(r.body.id);
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual(await projetoDaReq(c.body.id), PINAT, 'inativo vai');

    const PX = await projeto('Some depois', cliA);
    r = await criar({ projeto_id: PX });
    await dbRun(db, 'DELETE FROM projetos WHERE id = ?', [PX]);
    c = await copiar(r.body.id);
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    assert.strictEqual(await projetoDaReq(c.body.id), null, 'apagado nao vai');

    const OS_MUDA = await novaOs('OS-260-4', cliA, PA);
    r = await criar({ os_id: OS_MUDA, projeto_id: PA });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    await dbRun(db, 'UPDATE ordens_servico SET projeto_id = ? WHERE id = ?', [PINAT, OS_MUDA]);
    c = await copiar(r.body.id);
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const copia = await dbGet(db, 'SELECT projeto_id, os_id FROM requisicoes_almoxarifado WHERE id = ?', [c.body.id]);
    assert.deepStrictEqual([copia.os_id, copia.projeto_id], [OS_MUDA, null], 'a OS vai; o projeto que nao e mais o dela, nao');
  });

  // ══════════════ integracao — rota de criacao -> fila -> aprovar -> separar -> entregar ══════════════
  await test('[integracao] criada pela rota com projeto e sem OS cadastrada: a fila mostra o projeto; material de cliente sai pelo projeto do dono', async () => {
    const mc = await material(cliA);
    const r = await comoSol(() => request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS DIGITADA', projeto_id: PA,
      itens: [{ material_id: mc.id, quantidade: 3 }] }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    const ap = await request(app).put(`${API}/requisicoes/${r.body.id}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    const fila = await request(app).get(`${API}/fila-separacao`);
    const naFila = fila.body.find((x) => x.id === r.body.id);
    assert.ok(naFila, 'a requisicao esta na fila');
    assert.deepStrictEqual([naFila.projeto_id, naFila.projeto_nome], [PA, 'Linha 2']);
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    const sep = await request(app).put(`${API}/requisicoes/${r.body.id}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 3 }] });
    assert.strictEqual(sep.status, 200, JSON.stringify(sep.body));
    const ent = await request(app).put(`${API}/requisicoes/${r.body.id}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 3 }] });
    assert.strictEqual(ent.status, 200, JSON.stringify(ent.body));
    const saida = await dbGet(db, "SELECT projeto_id, quantidade FROM movimentacoes_almoxarifado WHERE requisicao_id = ? AND tipo = 'SAIDA'", [r.body.id]);
    assert.deepStrictEqual([saida.projeto_id, Number(saida.quantidade)], [PA, 3]);
  });

  await test('[integracao, controle] o mesmo material de cliente com o projeto de OUTRO cliente: a entrega recusa pela regra do dono', async () => {
    const mc = await material(cliA);
    const r = await comoSol(() => request(app).post(`${API}/requisicoes`).send({ os_referencia: 'OS DIGITADA', projeto_id: PB,
      itens: [{ material_id: mc.id, quantidade: 2 }] }));
    assert.strictEqual(r.status, 201, 'sem OS cadastrada nao ha com o que comparar o projeto na criacao');
    await request(app).put(`${API}/requisicoes/${r.body.id}/aprovar`).send({});
    const it = (await dbGet(db, 'SELECT id FROM itens_requisicao_almoxarifado WHERE requisicao_id = ?', [r.body.id])).id;
    await request(app).put(`${API}/requisicoes/${r.body.id}/separar`).send({ itens_separados: [{ item_id: it, quantidade_separada: 2 }] });
    const ent = await request(app).put(`${API}/requisicoes/${r.body.id}/entregar`).send({ itens_atendidos: [{ item_id: it, quantidade_atendida: 2 }] });
    assert.notStrictEqual(ent.status, 200, JSON.stringify(ent.body));
    assert.ok(/pertence ao cliente Cliente A E260, mas o projeto Ampliação/.test(ent.body.error), ent.body.error);
  });

  await close();
  console.log(`\n${passed} passou, ${failed} falhou`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
