/**
 * Etapa 112 (C222) — ligar controle por lote ou por numero de serie num material com saldo nao identificado exige
 * `ajustar_estoque`.
 *
 * Ate a 112 o `PUT /materiais/:id` gravava `controle_lote`/`controle_serie` como qualquer campo: o Almoxarife e a
 * Engenharia ligavam o controle num material com saldo, e o saldo que ja estava la (sem lote / sem series) passava a ser
 * recusado na Saida (medido na Fase 0). A regularizacao existe e e do Administrador (series pela tela de Series; lote por
 * Entrada com lote + Ajuste do total), entao ligar nesse estado passa a ser dele (RN-01..RN-07 do plano da Etapa 112).
 *
 * Perfis EXPLICITOS em toda negativa: usuario sem perfil cai em PRODUCAO, nao em "sem acesso".
 *
 * Executar: cd server && node tests/api/controleComSaldo.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const ENGENHARIA = { id: 6, nome: 'Eng Teste', role: 'user', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };

const NOMES = { lote: 'por lote', serie: 'por número de série', ambos: 'por lote e por número de série' };
const e1 = (codigo, qual, partes, perfil) => `Ligar o controle ${NOMES[qual]} no material ${codigo} exige a permissão `
  + `"ajustar_estoque" (seu perfil: ${perfil}): ${partes}. Depois de ligar, a saída desse saldo é recusada até ele ser `
  + 'regularizado, e regularizar é do Administrador do almoxarifado. Peça a ele para ligar o controle e regularizar o saldo.';
const E4 = (codigo) => `O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material `
  + 'e salve de novo.';

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material({ extra = {} } = {}) {
    seq += 1;
    const codigo = `E112-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) {
      await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    }
    return { id, codigo };
  }
  const lancar = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'e112',
      justificativa: 'preparo e112', documento_vinculado: 'NF-112', ...body });
    assert.strictEqual(r.status, 201, `preparo ${body.tipo}: ${JSON.stringify(r.body)}`);
  };
  // material com `q` de saldo SEM lote/serie (Entrada pelo motor, sem controle ligado)
  const comSaldo = async (q, extra = {}) => {
    const m = await material({ extra });
    await lancar(m, { tipo: 'ENTRADA', quantidade: q });
    return m;
  };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, `SELECT nome, controle_lote, controle_serie, requer_inspecao, familia_id, updated_at
    FROM materiais_almoxarifado WHERE id = ?`, [id]);
  const auditorias = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'material' AND entidade_id = ?`, [id])).n;
  const recusa = async (u, m, body, qual, partes, perfil) => {
    const antes = await linha(m.id);
    const aud = await auditorias(m.id);
    const r = await put(u, m.id, { nome: 'Nome novo', ...body });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, qual, partes, perfil));
    assert.deepStrictEqual(await linha(m.id), antes, 'o cadastro foi tocado');
    assert.strictEqual(await auditorias(m.id), aud, 'a recusa gravou auditoria');
  };
  const grava = async (u, m, body, confere) => {
    const r = await put(u, m.id, body);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    for (const [k, v] of Object.entries(confere)) assert.strictEqual(l[k], v, `${k}: ${l[k]}`);
  };

  for (const [nomeU, u, perfil] of [['Almoxarife', ALMOXARIFE, 'ALMOXARIFE'], ['Engenharia', ENGENHARIA, 'ENGENHARIA']]) {
    await test(`[RN-01] ${nomeU} liga o lote com 5 sem lote: 403 E1 e nada muda`, async () => {
      await recusa(u, await comSaldo(5), { controle_lote: 1 }, 'lote', 'há 5 sem lote atribuído', perfil);
    });
    await test(`[RN-01] ${nomeU} liga a serie com fisico 3 e nenhuma serie: 403 E1 e nada muda`, async () => {
      await recusa(u, await comSaldo(3), { controle_serie: true }, 'serie', 'o físico é 3 e há 0 série(s) em estoque', perfil);
    });
  }

  await test('[RN-01] liga os dois juntos: uma mensagem, as duas partes separadas por ";"', async () => {
    await recusa(ALMOXARIFE, await comSaldo(5), { controle_lote: 1, controle_serie: 1 }, 'ambos',
      'há 5 sem lote atribuído; o físico é 5 e há 0 série(s) em estoque', 'ALMOXARIFE');
  });

  await test('[RN-01] parte do saldo em lote: so a sobra sem lote aparece', async () => {
    const m = await material();
    await lancar(m, { tipo: 'ENTRADA', quantidade: 3, lote: 'L-A' });
    await lancar(m, { tipo: 'ENTRADA', quantidade: 2 });
    await recusa(ENGENHARIA, m, { controle_lote: 1 }, 'lote', 'há 2 sem lote atribuído', 'ENGENHARIA');
  });

  await test('[RN-01] sobra negativa (saida sem lote de saldo em lote) tambem prende', async () => {
    const m = await material();
    await lancar(m, { tipo: 'ENTRADA', quantidade: 5, lote: 'L-N' });
    await lancar(m, { tipo: 'SAIDA', quantidade: 2 });
    await recusa(ALMOXARIFE, m, { controle_lote: 1 }, 'lote', 'há -2 sem lote atribuído', 'ALMOXARIFE');
  });

  await test('[RN-01] ruido de ponto flutuante sai arredondado a 6 casas (0.1 + 0.2 -> 0.3)', async () => {
    const m = await material({ extra: { quantidade_atual: 0.1 + 0.2 } });
    await recusa(ALMOXARIFE, m, { controle_lote: 1 }, 'lote', 'há 0.3 sem lote atribuído', 'ALMOXARIFE');
  });

  await test('[RN-01] fisico 0 com 2 series presentes (desligou e saiu sem serie): religar a serie e recusado', async () => {
    const m = await material({ extra: { controle_serie: 1 } });
    await lancar(m, { tipo: 'ENTRADA', quantidade: 2, series: ['A1', 'A2'] });
    // Etapa 115 (C225): desligar a serie com series presentes passou a ser do Administrador — o estado de partida e o mesmo.
    await grava(ADM_PERFIL, m, { controle_serie: 0 }, { controle_serie: 0 });
    await lancar(m, { tipo: 'SAIDA', quantidade: 2 });
    await recusa(ALMOXARIFE, m, { controle_serie: 1 }, 'serie', 'o físico é 0 e há 2 série(s) em estoque', 'ALMOXARIFE');
  });

  await test('[RN-01] cliente sem perfil (PRODUCAO) nao chega a esta regra: 403 do editar_material', async () => {
    const m = await comSaldo(5);
    const r = await put({ id: 99, nome: 'Sem perfil', role: 'user', email: 'sp@test.com' }, m.id, { controle_lote: 1 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.acao, 'editar_material');
  });

  for (const [nomeU, u] of [['Administrador por perfil', ADM_PERFIL], ['superadmin', SUPER]]) {
    await test(`[RN-02] ${nomeU} liga lote e serie com saldo nao identificado (200, grava)`, async () => {
      await grava(u, await comSaldo(5), { controle_lote: 1, controle_serie: 1 }, { controle_lote: 1, controle_serie: 1 });
    });
  }

  await test('[RN-03] saldo todo em lote: o Almoxarife liga o lote (200)', async () => {
    const m = await material();
    await lancar(m, { tipo: 'ENTRADA', quantidade: 5, lote: 'L9' });
    await grava(ALMOXARIFE, m, { controle_lote: 1 }, { controle_lote: 1 });
  });

  await test('[RN-03] series presentes = fisico (desligou sem movimentar): a Engenharia religa (200)', async () => {
    const m = await material({ extra: { controle_serie: 1 } });
    await lancar(m, { tipo: 'ENTRADA', quantidade: 2, series: ['B1', 'B2'] });
    // Etapa 115 (C225): desligar a serie com series presentes passou a ser do Administrador — o estado de partida e o mesmo.
    await grava(ADM_PERFIL, m, { controle_serie: 0 }, { controle_serie: 0 });
    await grava(ENGENHARIA, m, { controle_serie: 1 }, { controle_serie: 1 });
  });

  await test('[RN-03] fisico 0 sem nada: ligar os dois e livre; o livro nao conta', async () => {
    const m = await comSaldo(4);
    await lancar(m, { tipo: 'SAIDA', quantidade: 4 });
    await grava(ENGENHARIA, m, { controle_lote: 1, controle_serie: 1 }, { controle_lote: 1, controle_serie: 1 });
  });

  await test('[RN-03] residuo abaixo de 1e-6 nao conta como saldo', async () => {
    const m = await material({ extra: { quantidade_atual: 1e-12 } });
    await grava(ALMOXARIFE, m, { controle_lote: 1, controle_serie: 1 }, { controle_lote: 1 });
  });

  await test('[RN-04] o que ja estava ligado continua editavel com saldo preso (o formulario manda as chaves)', async () => {
    const m = await comSaldo(5, {});
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1, controle_serie = 1 WHERE id = ?', [m.id]);
    await grava(ALMOXARIFE, m, { nome: 'Renomeado', controle_lote: true, controle_serie: 1, requer_inspecao: 0 },
      { nome: 'Renomeado' });
    await grava(ENGENHARIA, m, { nome: 'So o nome' }, { nome: 'So o nome', controle_lote: 1 });
  });

  await test('[RN-05] desligar com saldo e livre; requer_inspecao com saldo e livre', async () => {
    const m = await comSaldo(5);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1, controle_serie = 1 WHERE id = ?', [m.id]);
    await grava(ALMOXARIFE, m, { controle_lote: 0, controle_serie: false }, { controle_lote: 0, controle_serie: 0 });
    await grava(ENGENHARIA, m, { requer_inspecao: 1 }, { requer_inspecao: 1 });
  });

  await test('[RN-05] desliga um e liga o outro com saldo: recusa so pelo que liga', async () => {
    const m = await comSaldo(5);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    await recusa(ALMOXARIFE, m, { controle_lote: 0, controle_serie: 1 }, 'serie', 'o físico é 5 e há 0 série(s) em estoque',
      'ALMOXARIFE');
  });

  // RN-06/RN-07: injecao na janela entre a guarda previa e o UPDATE (padrao de saldoInicialFamiliaFase5).
  let injecoes = [];
  const getOriginal = db.get.bind(db);
  db.get = function (sql, params, cb) {
    if (typeof params === 'function') { cb = params; params = []; }
    const s = String(sql).replace(/\s+/g, ' ').trim();
    const i = injecoes.findIndex((inj) => inj.sql.test(s));
    if (i >= 0) {
      const inj = injecoes[i]; injecoes.splice(i, 1);
      return getOriginal(sql, params, (err, row) => {
        if (!inj.depois) return cb(err, row);
        inj.depois().then(() => cb(err, row), (e) => cb(e));
      });
    }
    return getOriginal(sql, params, cb);
  };
  const SQL_GUARDA = /^SELECT quantidade_atual AS fisico, /;
  const SQL_LEITURA = /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/;

  await test('[RN-06] uma Entrada sem lote de 4 cai depois da guarda e antes do UPDATE: 403 E1 "ha 4", nada gravado', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_GUARDA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { nome: 'Nao grava', controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, 'lote', 'há 4 sem lote atribuído', 'ALMOXARIFE'));
    const l = await linha(m.id);
    assert.strictEqual(l.controle_lote, 0);
    assert.strictEqual(l.nome, `Peca ${seq}`);
  });

  await test('[RN-06] a serie: Entrada de 2 sem serie na janela -> 403 E1 "fisico 2 e ha 0"', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_GUARDA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m.id]) }];
    const r = await put(ENGENHARIA, m.id, { controle_serie: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, 'serie', 'o físico é 2 e há 0 série(s) em estoque', 'ENGENHARIA'));
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
  });

  await test('[RN-06] manter ligado: outra aba desliga na janela -> 409 E4, nao regrava o ligado', async () => {
    const m = await comSaldo(5);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    injecoes = [{ sql: SQL_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { nome: 'Nao grava', controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    assert.strictEqual((await linha(m.id)).controle_lote, 0);
  });

  await test('[RN-06] o Administrador nao leva a condicao: saldo que cai na janela nao recusa (200)', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 4 WHERE id = ?', [m.id]) }];
    const r = await put(ADM_PERFIL, m.id, { controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('[RN-07] Almoxarife troca o dono E liga o lote com saldo: a 403 da troca de dono vem antes', async () => {
    const cli = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente E112'])).lastID;
    const m = await comSaldo(5);
    const r = await put(ALMOXARIFE, m.id, { proprietario_cliente_id: cli, controle_lote: 1 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.ok(/^Trocar o dono do material/.test(r.body.error), r.body.error);
  });

  await test('[RN-07] liga o lote com saldo E manda familia inativa: E1 vem antes da familia', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('F112', 'Fam 112', 0)")).lastID;
    const m = await comSaldo(5);
    await recusa(ALMOXARIFE, m, { familia_id: f, controle_lote: 1 }, 'lote', 'há 5 sem lote atribuído', 'ALMOXARIFE');
  });

  await test('[RN-07] na releitura tambem: saldo cai e a familia nova e inativada na janela -> E1, nao a da familia', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('F112B', 'Fam 112B', 1)")).lastID;
    const m = await material();
    injecoes = [{ sql: /^SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/, depois: async () => {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 3 WHERE id = ?', [m.id]);
      await dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [f]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { familia_id: f, controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, 'lote', 'há 3 sem lote atribuído', 'ALMOXARIFE'));
  });

  // ── Fase 5 (revisao por sabotagem): cenarios que faltavam ─────────────────────────────────────────────────────────
  const SQL_FAM = /^SELECT id, ativo, parent_id FROM familias_material_almoxarifado WHERE id = \?$/;

  await test('[RN-03 F5] serie BLOQUEADA conta como presente: 1 em estoque + 1 bloqueada, fisico 2 -> religar 200', async () => {
    const m = await material({ extra: { controle_serie: 1 } });
    await lancar(m, { tipo: 'ENTRADA', quantidade: 2, series: ['X1', 'X2'] });
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'BLOQUEADA' WHERE material_id = ? AND numero = 'X2'", [m.id]);
    // Etapa 115 (C225): desligar a serie com series presentes passou a ser do Administrador — o estado de partida e o mesmo.
    await grava(ADM_PERFIL, m, { controle_serie: 0 }, { controle_serie: 0 });
    await grava(ALMOXARIFE, m, { controle_serie: 1 }, { controle_serie: 1 });
  });

  await test('[RN-06 F5] janela: sobra fracionaria 0.4 sem lote -> 403 E1 "ha 0.4" (a regua do UPDATE arredonda a 6 casas)', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_GUARDA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0.4 WHERE id = ?', [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, 'lote', 'há 0.4 sem lote atribuído', 'ALMOXARIFE'));
    assert.strictEqual((await linha(m.id)).controle_lote, 0);
  });

  await test('[RN-06 F5] janela serie: fisico 0.4 -> 403 E1 "o fisico e 0.4 e ha 0"', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_GUARDA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0.4 WHERE id = ?', [m.id]) }];
    const r = await put(ENGENHARIA, m.id, { controle_serie: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, 'serie', 'o físico é 0.4 e há 0 série(s) em estoque', 'ENGENHARIA'));
  });

  await test('[RN-06 F5] janela com os dois ligando: Entrada COM lote de 2 -> E1 so pela serie (as reguas se somam por AND)', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_GUARDA, depois: async () => {
      const l = (await dbRun(db, "INSERT INTO lotes_almoxarifado (material_id, codigo) VALUES (?, 'LJ')", [m.id])).lastID;
      await dbRun(db, 'INSERT INTO estoque_saldo_almoxarifado (material_id, lote_id, quantidade) VALUES (?, ?, 2)', [m.id, l]);
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { controle_lote: 1, controle_serie: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e1(m.codigo, 'ambos', 'o físico é 2 e há 0 série(s) em estoque', 'ALMOXARIFE'));
    const l = await linha(m.id);
    assert.strictEqual(l.controle_lote, 0);
    assert.strictEqual(l.controle_serie, 0);
  });

  await test('[RN-03 F5] residuo 1e-7 (arredonda a 0 em 6 casas): o Almoxarife liga o lote e a serie (200)', async () => {
    await grava(ALMOXARIFE, await material({ extra: { quantidade_atual: 1e-7 } }), { controle_lote: 1 }, { controle_lote: 1 });
    await grava(ALMOXARIFE, await material({ extra: { quantidade_atual: 1e-7 } }), { controle_serie: 1 }, { controle_serie: 1 });
  });

  await test('[RN-01 F5] serie com fisico 0.1 + 0.2: a mensagem diz "o fisico e 0.3"', async () => {
    const m = await material({ extra: { quantidade_atual: 0.1 + 0.2 } });
    await recusa(ALMOXARIFE, m, { controle_serie: 1 }, 'serie', 'o físico é 0.3 e há 0 série(s) em estoque', 'ALMOXARIFE');
  });

  await test('[RN-06 F5] troca de familia (ativa) mantendo o lote ligado, pelo Almoxarife: 200 e grava a familia', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('PF1', 'PF1', 1)")).lastID;
    const m = await comSaldo(5);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]);
    await grava(ALMOXARIFE, m, { familia_id: f, controle_lote: 1 }, { familia_id: f, controle_lote: 1 });
  });

  await test('[RN-06 F5] troca de familia (ativa) e liga o lote sem saldo, pela Engenharia: 200', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('PF2', 'PF2', 1)")).lastID;
    await grava(ENGENHARIA, await material(), { familia_id: f, controle_lote: 1 }, { familia_id: f, controle_lote: 1 });
  });

  // Etapa 115 (Fase 5, revisor 2; B750): este cenario dizia 'sem condicao -> 200, fica ligado' — o salvar do Administrador
  // religava calado o lote que outra aba acabou de desligar. Desde a 115 a condicao do controle lido vale para todos: 409 E4.
  await test('[RN-06 F5 / 115] o Administrador mantem ligado e outra aba desliga na janela: 409 E4, o desligar fica', async () => {
    const m = await material({ extra: { controle_lote: 1 } });
    injecoes = [{ sql: SQL_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m.id]) }];
    const r = await put(ADM_PERFIL, m.id, { nome: 'Adm grava', controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    assert.strictEqual((await linha(m.id)).controle_lote, 0);
  });

  await test('[RN-07 F5] o Administrador liga com saldo e a familia nova e inativada na janela -> 400 da familia, nunca E1', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('PF3', 'PF3', 1)")).lastID;
    const m = await comSaldo(5);
    injecoes = [{ sql: SQL_FAM,
      depois: () => dbRun(db, 'UPDATE familias_material_almoxarifado SET ativo = 0 WHERE id = ?', [f]) }];
    const r = await put(ADM_PERFIL, m.id, { familia_id: f, controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, 'Família inativa — não é possível vincular novos itens');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
