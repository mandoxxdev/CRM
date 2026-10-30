/**
 * Etapa 115 (C226, C225) — ligar e desligar o controle por lote/serie com saldo, sob a trava do material.
 *
 * C226: o `PUT /materiais/:id` que liga o controle gravava fora da trava do material; o motor le o controle e grava o
 * saldo DENTRO da trava (Etapa 97), entao uma Entrada sem lote que ja tinha lido "controle 0" gravava depois do ligar e o
 * saldo ficava sem lote com o controle ligado — por baixo da regua da 112. Agora o salvar que muda controle espera a
 * trava (RN-01/RN-02).
 * C225: o Almoxarife desligava a serie com series Em estoque, e a Saida seguinte (sem serie) deixava as series orfas.
 * Agora desligar a serie com series presentes exige `ajustar_estoque` (RN-03..RN-07 do plano da Etapa 115).
 *
 * Perfis EXPLICITOS em toda negativa: usuario sem perfil cai em PRODUCAO, nao em "sem acesso".
 *
 * Executar: cd server && node tests/api/controleSobATrava.api.test.js
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
const trava = require('../../services/almoxarifado/travaPorMaterial');

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
const e112 = (codigo, qual, partes, perfil) => `Ligar o controle ${NOMES[qual]} no material ${codigo} exige a permissão `
  + `"ajustar_estoque" (seu perfil: ${perfil}): ${partes}. Depois de ligar, a saída desse saldo é recusada até ele ser `
  + 'regularizado, e regularizar é do Administrador do almoxarifado. Peça a ele para ligar o controle e regularizar o saldo.';
const E1 = (codigo, n, perfil) => `Desligar o controle por número de série no material ${codigo} exige a permissão `
  + `"ajustar_estoque" (seu perfil: ${perfil}): há ${n} série(s) em estoque. Depois de desligar, a saída não baixa essas `
  + 'séries, e elas continuam "Em estoque" depois que o material sai. Peça ao Administrador do almoxarifado para desligar '
  + 'o controle.';
// Fase 2 (R1): mais series que fisico — as que sobram ja sao orfas e o caminho e a regularizacao.
const E1b = (codigo, n, fisico, perfil) => `Desligar o controle por número de série no material ${codigo} exige a `
  + `permissão "ajustar_estoque" (seu perfil: ${perfil}): há ${n} série(s) em estoque e o físico é ${fisico}. Peça ao `
  + 'Administrador do almoxarifado para baixá-las em Lotes e Séries → Séries → Regularizar séries; sem série em estoque, o '
  + 'controle pode ser desligado.';
const E1c = (codigo, n, fisico, k, perfil) => `Desligar o controle por número de série no material ${codigo} exige a `
  + `permissão "ajustar_estoque" (seu perfil: ${perfil}): há ${n} série(s) em estoque e o físico é ${fisico}. Peça ao `
  + `Administrador do almoxarifado para baixar as ${k} que não estão mais no estoque (Lotes e Séries → Séries → `
  + 'Regularizar séries) e para desligar o controle.';
const E4 = (codigo) => `O cadastro do material ${codigo} mudou enquanto era salvo — nada foi gravado. Recarregue o material `
  + 'e salve de novo.';

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  let seq = 0;
  async function material({ extra = {} } = {}) {
    seq += 1;
    const codigo = `E115-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, custo_unitario, ativo)
      VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, `Peca ${seq}`])).lastID;
    for (const [k, v] of Object.entries(extra)) {
      await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    }
    return { id, codigo, nome: `Peca ${seq}` };
  }
  const lancar = async (m, body) => {
    const r = await request(app).post('/api/almoxarifado/movimentacoes/v2').send({ material_id: m.id, motivo: 'e115',
      justificativa: 'preparo e115', documento_vinculado: 'NF-115', ...body });
    assert.strictEqual(r.status, 201, `preparo ${body.tipo}: ${JSON.stringify(r.body)}`);
  };
  // material com serie ligada e `numeros` em estoque
  const comSeries = async (numeros) => {
    const m = await material({ extra: { controle_serie: 1 } });
    if (numeros.length) await lancar(m, { tipo: 'ENTRADA', quantidade: numeros.length, series: numeros });
    return m;
  };
  const put = (u, id, body) => as(u, () => request(app).put(`/api/almoxarifado/materiais/${id}`).send(body));
  const linha = (id) => dbGet(db, `SELECT nome, controle_lote, controle_serie, familia_id, quantidade_atual, updated_at
    FROM materiais_almoxarifado WHERE id = ?`, [id]);
  const auditorias = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'material' AND entidade_id = ?`, [id])).n;
  const presentes = async (id) => (await dbGet(db, `SELECT COUNT(*) n FROM series_almoxarifado
    WHERE material_id = ? AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [id])).n;
  const recusaE1 = async (u, m, body, n, perfil, msg) => {
    const antes = await linha(m.id);
    const aud = await auditorias(m.id);
    const r = await put(u, m.id, { nome: 'Nome novo', ...body });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, msg || E1(m.codigo, n, perfil));
    assert.deepStrictEqual(await linha(m.id), antes, 'o cadastro foi tocado');
    assert.strictEqual(await auditorias(m.id), aud, 'a recusa gravou auditoria');
  };
  const grava = async (u, m, body, confere) => {
    const r = await put(u, m.id, body);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    for (const [k, v] of Object.entries(confere)) assert.strictEqual(l[k], v, `${k}: ${l[k]}`);
  };
  // Segura a trava do material ate `soltar()`. Devolve depois que a secao foi de fato aberta.
  const segurarTrava = async (id) => {
    let soltar;
    let aberta;
    const abriu = new Promise((r) => { aberta = r; });
    const secao = trava.comLockDoMaterial(id, () => new Promise((r) => { soltar = r; aberta(); }));
    await abriu;
    return { soltar: async () => { soltar(); await secao; } };
  };
  // Dispara um PUT como `u` e devolve { feito, resposta } sem esperar; o usuario e copiado pelo middleware na entrada.
  const putSolto = async (u, id, body) => {
    setUser(u);
    const estado = { feito: false, resposta: null };
    estado.promessa = request(app).put(`/api/almoxarifado/materiais/${id}`).send(body)
      .then((r) => { estado.feito = true; estado.resposta = r; return r; });
    await espera(40); // o middleware ja copiou o usuario
    setUser(SUPER);
    return estado;
  };

  // ── RN-01: o salvar que muda o controle espera a trava ─────────────────────────────────────────────────────────────
  await test('[RN-01] trava segura: o PUT que liga o lote nao responde enquanto ela esta presa; solta -> 200', async () => {
    const m = await material();
    const t = await segurarTrava(m.id);
    const p = await putSolto(ALMOXARIFE, m.id, { controle_lote: 1 });
    await espera(150);
    const feitoComATrava = p.feito;
    await t.soltar();
    const r = await p.promessa;
    assert.strictEqual(feitoComATrava, false, 'o PUT respondeu com a trava presa');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_lote, 1);
  });

  await test('[RN-01] trava segura: o PUT que desliga a serie (sem series) tambem espera', async () => {
    const m = await comSeries([]);
    const t = await segurarTrava(m.id);
    const p = await putSolto(ALMOXARIFE, m.id, { controle_serie: 0 });
    await espera(150);
    const feitoComATrava = p.feito;
    await t.soltar();
    const r = await p.promessa;
    assert.strictEqual(feitoComATrava, false, 'o PUT respondeu com a trava presa');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
  });

  await test('[RN-01] trava segura: o PUT que desliga o lote tambem espera', async () => {
    const m = await material({ extra: { controle_lote: 1 } });
    const t = await segurarTrava(m.id);
    const p = await putSolto(ENGENHARIA, m.id, { controle_lote: 0 });
    await espera(150);
    const feitoComATrava = p.feito;
    await t.soltar();
    const r = await p.promessa;
    assert.strictEqual(feitoComATrava, false, 'o PUT respondeu com a trava presa');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  });

  await test('[RN-01] trava segura: o PUT que so renomeia (o formulario manda as chaves iguais) responde com ela presa', async () => {
    const m = await material({ extra: { controle_lote: 1 } });
    const t = await segurarTrava(m.id);
    try {
      const p = await putSolto(ALMOXARIFE, m.id, { nome: 'Renomeado', controle_lote: true, controle_serie: 0 });
      await espera(150);
      assert.strictEqual(p.feito, true, 'o renomear esperou a trava');
      assert.strictEqual(p.resposta.status, 200, JSON.stringify(p.resposta.body));
      assert.strictEqual((await linha(m.id)).nome, 'Renomeado');
    } finally {
      await t.soltar();
    }
  });

  // ── RN-02: a Entrada que segurava a trava e vista ──────────────────────────────────────────────────────────────────
  for (const [nomeU, u, perfil] of [['Almoxarife', ALMOXARIFE, 'ALMOXARIFE'], ['Engenharia', ENGENHARIA, 'ENGENHARIA']]) {
    await test(`[RN-02] ${nomeU} liga o lote enquanto uma "Entrada" sem lote de 5 grava sob a trava: 403 da 112, lote 0`, async () => {
      const m = await material();
      const t = await segurarTrava(m.id);
      const p = await putSolto(u, m.id, { controle_lote: 1 });
      await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5 WHERE id = ?', [m.id]); // a Entrada, dentro
      await t.soltar();
      const r = await p.promessa;
      assert.strictEqual(r.status, 403, JSON.stringify(r.body));
      assert.strictEqual(r.body.error, e112(m.codigo, 'lote', 'há 5 sem lote atribuído', perfil));
      assert.strictEqual((await linha(m.id)).controle_lote, 0);
    });
  }

  await test('[RN-02] a serie: "Entrada" de 2 sem serie sob a trava -> 403 da 112 "o fisico e 2 e ha 0"', async () => {
    const m = await material();
    const t = await segurarTrava(m.id);
    const p = await putSolto(ALMOXARIFE, m.id, { controle_serie: 1 });
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 2 WHERE id = ?', [m.id]);
    await t.soltar();
    const r = await p.promessa;
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e112(m.codigo, 'serie', 'o físico é 2 e há 0 série(s) em estoque', 'ALMOXARIFE'));
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
  });

  await test('[RN-02] o Administrador liga depois da "Entrada": 200, o saldo dela fica sem lote (estado da C224)', async () => {
    const m = await material();
    const t = await segurarTrava(m.id);
    const p = await putSolto(ADM_PERFIL, m.id, { controle_lote: 1 });
    await espera(60);
    const feitoComATrava = p.feito;
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 5 WHERE id = ?', [m.id]);
    await t.soltar();
    const r = await p.promessa;
    assert.strictEqual(feitoComATrava, false, 'o Administrador nao esperou a trava');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const l = await linha(m.id);
    assert.strictEqual(l.controle_lote, 1);
    assert.strictEqual(l.quantidade_atual, 5);
  });

  // ── RN-03: desligar a serie com series presentes exige ajustar_estoque ────────────────────────────────────────────
  for (const [nomeU, u, perfil] of [['Almoxarife', ALMOXARIFE, 'ALMOXARIFE'], ['Engenharia', ENGENHARIA, 'ENGENHARIA']]) {
    await test(`[RN-03] ${nomeU} desliga a serie com 2 Em estoque: 403 E1 "ha 2", nada gravado`, async () => {
      const m = await comSeries(['A1', 'A2']);
      await recusaE1(u, m, { controle_serie: 0 }, 2, perfil);
      assert.strictEqual(await presentes(m.id), 2);
    });
  }

  await test('[RN-03] 1 Em estoque + 1 Bloqueada: E1 "ha 2" (bloqueada conta como presente)', async () => {
    const m = await comSeries(['B1', 'B2']);
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'BLOQUEADA' WHERE material_id = ? AND numero = 'B2'", [m.id]);
    await recusaE1(ALMOXARIFE, m, { controle_serie: false }, 2, 'ALMOXARIFE');
  });

  await test('[RN-03 R1] fisico 0 com 2 presentes (orfas de legado, controle ligado): E1b "baixa-las ... Regularizar series"', async () => {
    const m = await comSeries(['C1', 'C2']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0 WHERE id = ?', [m.id]);
    await recusaE1(ENGENHARIA, m, { controle_serie: 0 }, 2, 'ENGENHARIA', E1b(m.codigo, 2, 0, 'ENGENHARIA'));
  });

  await test('[RN-03 R1] fisico negativo (-1) com 1 presente: E1b "o fisico e -1"', async () => {
    const m = await comSeries(['C9']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = -1 WHERE id = ?', [m.id]);
    await recusaE1(ALMOXARIFE, m, { controle_serie: 0 }, 1, 'ALMOXARIFE', E1b(m.codigo, 1, -1, 'ALMOXARIFE'));
  });

  await test('[RN-03 R1] fisico 1 com 3 presentes: E1c "baixar as 2 ... e para desligar"', async () => {
    const m = await comSeries(['C3', 'C4', 'C5']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 1 WHERE id = ?', [m.id]);
    await recusaE1(ALMOXARIFE, m, { controle_serie: 0 }, 3, 'ALMOXARIFE', E1c(m.codigo, 3, 1, 2, 'ALMOXARIFE'));
  });

  await test('[RN-03 R1] fisico 0.5 com 1 presente (nenhuma inteira a baixar): E1a, a de pedir o desligar', async () => {
    const m = await comSeries(['C6']);
    await dbRun(db, 'UPDATE materiais_almoxarifado SET quantidade_atual = 0.5 WHERE id = ?', [m.id]);
    await recusaE1(ALMOXARIFE, m, { controle_serie: 0 }, 1, 'ALMOXARIFE');
  });

  await test('[RN-03] so series ENTREGUE/BAIXADA (nenhuma presente): o Almoxarife desliga (200)', async () => {
    const m = await comSeries(['D1', 'D2']);
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'ENTREGUE' WHERE material_id = ? AND numero = 'D1'", [m.id]);
    await dbRun(db, "UPDATE series_almoxarifado SET status = 'BAIXADA' WHERE material_id = ? AND numero = 'D2'", [m.id]);
    await grava(ALMOXARIFE, m, { controle_serie: 0 }, { controle_serie: 0 });
  });

  await test('[RN-03] cliente sem perfil (PRODUCAO) nao chega a esta regra: 403 do editar_material', async () => {
    const m = await comSeries(['P1']);
    const r = await put({ id: 99, nome: 'Sem perfil', role: 'user', email: 'sp@test.com' }, m.id, { controle_serie: 0 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.acao, 'editar_material');
    assert.strictEqual((await linha(m.id)).controle_serie, 1);
  });

  // ── RN-04: o Administrador desliga ────────────────────────────────────────────────────────────────────────────────
  for (const [nomeU, u] of [['Administrador por perfil', ADM_PERFIL], ['superadmin', SUPER]]) {
    await test(`[RN-04] ${nomeU} desliga a serie com 2 Em estoque: 200 e as series ficam como estao`, async () => {
      const m = await comSeries(['E1', 'E2']);
      await grava(u, m, { controle_serie: 0 }, { controle_serie: 0 });
      assert.strictEqual(await presentes(m.id), 2);
    });
  }

  // ── RN-05: sem serie presente, desligar e livre; desligar o lote continua livre ───────────────────────────────────
  await test('[RN-05] fisico 5 sem nenhuma serie (legado): o Almoxarife desliga a serie (200)', async () => {
    const m = await material({ extra: { controle_serie: 1, quantidade_atual: 5 } });
    await grava(ALMOXARIFE, m, { controle_serie: 0 }, { controle_serie: 0 });
  });

  await test('[RN-05] lote ligado com saldo em lote: o Almoxarife desliga o lote (200, B731)', async () => {
    const m = await material({ extra: { controle_lote: 1 } });
    await lancar(m, { tipo: 'ENTRADA', quantidade: 5, lote: 'L115' });
    await grava(ALMOXARIFE, m, { controle_lote: 0 }, { controle_lote: 0 });
  });

  await test('[RN-05] manter a serie ligada com series presentes (renomear): 200, nao e desligar', async () => {
    const m = await comSeries(['F1']);
    await grava(ENGENHARIA, m, { nome: 'So o nome', controle_serie: true }, { nome: 'So o nome', controle_serie: 1 });
  });

  // ── RN-06: a conferencia vai no UPDATE ────────────────────────────────────────────────────────────────────────────
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
  const SQL_PRESENTES = /^SELECT quantidade_atual AS fisico, \(SELECT COUNT\(\*\) FROM series_almoxarifado sr WHERE/;
  const SQL_LEITURA = /^SELECT \* FROM materiais_almoxarifado WHERE id = \?$/;

  await test('[RN-06] 2 series cadastradas na janela entre a guarda e o UPDATE: 403 E1 "ha 2", a serie continua ligada', async () => {
    const m = await material({ extra: { controle_serie: 1, quantidade_atual: 2 } });
    injecoes = [{ sql: SQL_PRESENTES, depois: async () => {
      await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, 'J1', 'EM_ESTOQUE'), (?, 'J2', 'EM_ESTOQUE')",
        [m.id, m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(m.codigo, 2, 'ALMOXARIFE'));
    assert.strictEqual((await linha(m.id)).controle_serie, 1);
  });

  await test('[RN-06] o Administrador nao leva a condicao: series que caem na janela nao recusam (200)', async () => {
    const m = await material({ extra: { controle_serie: 1, quantidade_atual: 1 } });
    injecoes = [{ sql: SQL_LEITURA, depois: async () => {
      await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, 'K1', 'EM_ESTOQUE')", [m.id]);
    } }];
    const r = await put(ADM_PERFIL, m.id, { controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_serie, 0);
  });

  await test('[RN-06] nao gravou por outro motivo (o nome mudou nao conta; outra aba religou o lote): E4, nao E1', async () => {
    // desligar a serie sem series presentes, com o lote mantido ligado e desligado por outra aba na janela
    const m = await material({ extra: { controle_serie: 1, controle_lote: 1 } });
    injecoes = [{ sql: SQL_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 0 WHERE id = ?', [m.id]) }];
    const r = await put(ALMOXARIFE, m.id, { controle_serie: 0, controle_lote: 1 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    assert.strictEqual((await linha(m.id)).controle_serie, 1);
  });

  await test('[RN-06 R4] o Almoxarife renomeia (le a serie desligada) e outra aba liga a serie com series na janela: 409 E4', async () => {
    const m = await material({ extra: { quantidade_atual: 1 } });
    injecoes = [{ sql: SQL_LEITURA, depois: async () => {
      await dbRun(db, 'UPDATE materiais_almoxarifado SET controle_serie = 1 WHERE id = ?', [m.id]);
      await dbRun(db, "INSERT INTO series_almoxarifado (material_id, numero, status) VALUES (?, 'R4', 'EM_ESTOQUE')", [m.id]);
    } }];
    const r = await put(ALMOXARIFE, m.id, { nome: 'Renomeado', controle_lote: 0, controle_serie: 0 });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E4(m.codigo));
    const l = await linha(m.id);
    assert.strictEqual(l.controle_serie, 1, 'o renomear apagou o ligar da outra aba');
    assert.strictEqual(l.nome, m.nome);
  });

  await test('[RN-06 R4] o mesmo com o lote: outra aba liga o lote na janela de um renomear da Engenharia -> 409 E4', async () => {
    const m = await material();
    injecoes = [{ sql: SQL_LEITURA,
      depois: () => dbRun(db, 'UPDATE materiais_almoxarifado SET controle_lote = 1 WHERE id = ?', [m.id]) }];
    const r = await put(ENGENHARIA, m.id, { nome: 'Renomeado', controle_lote: false });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(r.status, 409, JSON.stringify(r.body));
    assert.strictEqual((await linha(m.id)).controle_lote, 1);
  });

  // ── R2 (Fase 2): a regularizacao de series sob a trava ──────────────────────────────────────────────────────────
  await test('[R2] trava segura: a regularizacao de series nao responde enquanto ela esta presa', async () => {
    const m = await material({ extra: { controle_serie: 1, quantidade_atual: 1 } });
    const t = await segurarTrava(m.id);
    const estado = { feito: false };
    const p = request(app).post(`/api/almoxarifado/materiais/${m.id}/series/regularizar`)
      .send({ cadastrar: ['RG1'], justificativa: 'regularizacao e115' }).then((r) => { estado.feito = true; return r; });
    await espera(150);
    const feitoComATrava = estado.feito;
    await t.soltar();
    const r = await p;
    assert.strictEqual(feitoComATrava, false, 'a regularizacao respondeu com a trava presa');
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    assert.strictEqual(await presentes(m.id), 1);
  });

  await test('[R2] o Almoxarife desliga no meio da regularizacao que cadastra 2: o desligar espera e recusa E1 "ha 2"', async () => {
    const m = await material({ extra: { controle_serie: 1, quantidade_atual: 2 } });
    const estado = {};
    injecoes = [{ sql: /^SELECT id, codigo, quantidade_atual, controle_serie FROM materiais_almoxarifado WHERE id = \?$/,
      depois: async () => {
        estado.put = await putSolto(ALMOXARIFE, m.id, { controle_serie: 0 });
        await espera(60);
        estado.feitoNoMeio = estado.put.feito;
      } }];
    const reg = await request(app).post(`/api/almoxarifado/materiais/${m.id}/series/regularizar`)
      .send({ cadastrar: ['RG2', 'RG3'], justificativa: 'regularizacao e115' });
    assert.strictEqual(injecoes.length, 0, 'injecao nao consumida');
    assert.strictEqual(reg.status, 200, JSON.stringify(reg.body));
    const r = await estado.put.promessa;
    assert.strictEqual(estado.feitoNoMeio, false, 'o desligar terminou no meio da regularizacao');
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, E1(m.codigo, 2, 'ALMOXARIFE'));
    assert.strictEqual((await linha(m.id)).controle_serie, 1);
  });

  // ── RN-07: a ordem das recusas ────────────────────────────────────────────────────────────────────────────────────
  await test('[RN-07] liga o lote com 2 sem lote E desliga a serie com 2 presentes: a 403 da 112 vem antes', async () => {
    const m = await material({ extra: { controle_serie: 1 } });
    await lancar(m, { tipo: 'ENTRADA', quantidade: 2, series: ['G1', 'G2'] });
    const r = await put(ALMOXARIFE, m.id, { controle_lote: 1, controle_serie: 0 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.body));
    assert.strictEqual(r.body.error, e112(m.codigo, 'lote', 'há 2 sem lote atribuído', 'ALMOXARIFE'));
    const l = await linha(m.id);
    assert.strictEqual(l.controle_lote, 0);
    assert.strictEqual(l.controle_serie, 1);
  });

  await test('[RN-07] desliga a serie com series presentes E manda familia inativa: E1 vem antes da familia', async () => {
    const f = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('F115', 'Fam 115', 0)")).lastID;
    const m = await comSeries(['H1']);
    await recusaE1(ALMOXARIFE, m, { familia_id: f, controle_serie: 0 }, 1, 'ALMOXARIFE');
  });

  await test('[RN-07] inativar com saldo E desligar a serie: a 400 de inativar vem antes', async () => {
    const m = await comSeries(['I1']);
    const r = await put(ALMOXARIFE, m.id, { ativo: 0, controle_serie: 0 });
    assert.strictEqual(r.status, 400, JSON.stringify(r.body));
    assert.ok(/^Não é possível inativar o material/.test(r.body.error), r.body.error);
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
