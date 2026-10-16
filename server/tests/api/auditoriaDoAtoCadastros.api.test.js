/**
 * Etapa 121 (C252; B784) — RN-12: a Auditoria de um ato ja gravado nao derruba o ato, nos cadastros (ferramenta, serie,
 * lote, material) e no desfazer das series.
 *
 * Em cada porta, a Auditoria daquela `entidade`/`acao` e forcada a falhar UMA vez (gancho no `db.run`, molde
 * `auditoriaDoAto.api.test.js`). A resposta tem de ser a de sempre (o status de sucesso), o ato gravado UMA vez e o que vem
 * depois tem de rodar. Medido antes (e121m-B): 500 com o ato gravado — repetir duplicava (calibracao, material com codigo
 * automatico), recusava ("nao esta disponivel", "transicao invalida") ou apagava o arquivo (o catch da rota de calibracao e
 * de ocorrencia limpa o upload — Fase 2, I2). No desfazer das series (COMPENSACAO), a falha parava a compensacao no meio:
 * 500 no lugar da recusa de negocio e uma serie presente sem fisico.
 *
 * Executar: cd server && node tests/api/auditoriaDoAtoCadastros.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ').slice(0, 500)}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const PNG = Buffer.from('89504E470D0A1A0A0000000D4948445200000001000000010806000000', 'hex');

(async () => {
  const { app, db, close, uploadsAlmoxDir } = await createTestApp({ user: SUPER });
  fs.mkdirSync(uploadsAlmoxDir, { recursive: true });

  /** O INSERT da Auditoria com `entidade`/`acao` falha uma vez. */
  async function comAuditoriaFalhando(entidade, acao, fn) {
    const original = db.run;
    let disparou = false;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!disparou && typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado')
        && Array.isArray(params) && params[0] === entidade && params[2] === acao) {
        disparou = true;
        setImmediate(() => cb.call({}, new Error(`falha forcada da auditoria ${entidade}/${acao} (teste)`)));
        return this;
      }
      return original.call(db, sql, params, cb);
    };
    // O helper avisa no log; aqui o aviso e esperado e so polui a saida.
    const warn = console.warn; console.warn = () => {};
    let res;
    try { res = await fn(); } finally { db.run = original; console.warn = warn; }
    assert.ok(disparou, `gancho da auditoria ${entidade}/${acao} nao disparou`);
    return res;
  }
  const corpo = (r) => `${r.status} ${JSON.stringify(r.body)}`;
  const api = '/api/almoxarifado';
  const v2 = (body) => request(app).post(`${api}/movimentacoes/v2`).send({ motivo: 'ada121c', justificativa: 'ada121c just',
    documento_vinculado: 'NF-ADA121C', ...body });
  let seq = 0;
  async function material(extra = {}) {
    seq += 1;
    const codigo = `ADA121C-${seq}`;
    const id = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, quantidade_minima,
      custo_unitario, ativo) VALUES (?, ?, 'PC', 0, 0, 10, 1)`, [codigo, codigo])).lastID;
    for (const [k, v] of Object.entries(extra)) await dbRun(db, `UPDATE materiais_almoxarifado SET ${k} = ? WHERE id = ?`, [v, id]);
    return id;
  }
  const ferramenta = async (pat) => {
    const r = await request(app).post(`${api}/ferramentas`).send({ codigo_patrimonio: pat, nome: pat });
    assert.strictEqual(r.status, 201, corpo(r));
    return r.body.id;
  };
  const statusFerr = async (id) => (await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [id])).status;
  const fisico = async (m) => (await dbGet(db, 'SELECT quantidade_atual f FROM materiais_almoxarifado WHERE id = ?', [m])).f;
  const presentes = async (m) => (await dbGet(db, `SELECT COUNT(*) n FROM series_almoxarifado WHERE material_id = ?
    AND status IN ('EM_ESTOQUE','BLOQUEADA')`, [m])).n;
  const statusSerie = async (m, numero) => (await dbGet(db, 'SELECT status FROM series_almoxarifado WHERE material_id = ? AND numero = ?',
    [m, numero]) || {}).status;
  const noDisco = (nome) => !!nome && fs.existsSync(path.join(uploadsAlmoxDir, path.basename(nome)));

  console.log('\n=== Etapa 121: a Auditoria do ato (C252) — cadastros e desfazer de series (RN-12) ===\n');

  await test('[RN-12a] ferramenta: criar, editar, emprestar, devolver, bloquear e desbloquear com a Auditoria falhando -> o status de sempre, o ato uma vez', async () => {
    const r1 = await comAuditoriaFalhando('ferramenta', 'CRIACAO',
      () => request(app).post(`${api}/ferramentas`).send({ codigo_patrimonio: 'PAT-ADA-1', nome: 'Furadeira' }));
    assert.strictEqual(r1.status, 201, `criar: ${corpo(r1)}`);
    assert.strictEqual((await dbGet(db, "SELECT COUNT(*) n FROM ferramentas_almoxarifado WHERE codigo_patrimonio = 'PAT-ADA-1'")).n, 1);
    const f = r1.body.id;

    const r2 = await comAuditoriaFalhando('ferramenta', 'EDICAO',
      () => request(app).put(`${api}/ferramentas/${f}`).send({ nome: 'Furadeira de bancada' }));
    assert.strictEqual(r2.status, 200, `editar: ${corpo(r2)}`);
    assert.strictEqual((await dbGet(db, 'SELECT nome FROM ferramentas_almoxarifado WHERE id = ?', [f])).nome, 'Furadeira de bancada');

    const r3 = await comAuditoriaFalhando('ferramenta', 'EMPRESTIMO',
      () => request(app).post(`${api}/ferramentas/${f}/emprestar`).send({ colaborador_nome: 'Joao' }));
    assert.strictEqual(r3.status, 201, `emprestar: ${corpo(r3)}`);
    assert.strictEqual(await statusFerr(f), 'EMPRESTADA');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM emprestimos_ferramenta_almoxarifado WHERE ferramenta_id = ?', [f])).n, 1);

    const r4 = await comAuditoriaFalhando('ferramenta', 'DEVOLUCAO',
      () => request(app).post(`${api}/emprestimos/${r3.body.id}/devolver`).send({}));
    assert.strictEqual(r4.status, 200, `devolver: ${corpo(r4)}`);
    assert.strictEqual(await statusFerr(f), 'DISPONIVEL');
    assert.strictEqual((await dbGet(db, 'SELECT status FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [r3.body.id])).status, 'DEVOLVIDA');

    const r5 = await comAuditoriaFalhando('ferramenta', 'BLOQUEIO',
      () => request(app).post(`${api}/ferramentas/${f}/bloquear`).send({ justificativa: 'avaria no cabo' }));
    assert.strictEqual(r5.status, 200, `bloquear: ${corpo(r5)}`);
    assert.strictEqual(await statusFerr(f), 'BLOQUEADA');

    const r6 = await comAuditoriaFalhando('ferramenta', 'DESBLOQUEIO',
      () => request(app).post(`${api}/ferramentas/${f}/desbloquear`).send({ justificativa: 'cabo trocado' }));
    assert.strictEqual(r6.status, 200, `desbloquear: ${corpo(r6)}`);
    assert.strictEqual(await statusFerr(f), 'DISPONIVEL');
  });

  await test('[RN-12b] ferramenta: manutencao (inicio, fim, fim com anomalia -> o 400 com o status real) e reencontro com a Auditoria falhando', async () => {
    const f = await ferramenta('PAT-ADA-2');
    const r1 = await comAuditoriaFalhando('ferramenta', 'MANUTENCAO_INICIO',
      () => request(app).post(`${api}/ferramentas/${f}/manutencoes`).send({ descricao: 'troca de escova' }));
    assert.strictEqual(r1.status, 201, `iniciar: ${corpo(r1)}`);
    assert.strictEqual(await statusFerr(f), 'EM_MANUTENCAO');
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM manutencoes_ferramenta_almoxarifado WHERE ferramenta_id = ? AND data_fim IS NULL', [f])).n, 1);

    const r2 = await comAuditoriaFalhando('ferramenta', 'MANUTENCAO_FIM',
      () => request(app).put(`${api}/manutencoes/${r1.body.id}/concluir`).send({}));
    assert.strictEqual(r2.status, 200, `concluir: ${corpo(r2)}`);
    assert.strictEqual(await statusFerr(f), 'DISPONIVEL');

    // Anomalia: a ferramenta saiu de EM_MANUTENCAO por fora antes da conclusao — a funcao lanca o 400 com o status real.
    const r3 = await request(app).post(`${api}/ferramentas/${f}/manutencoes`).send({ descricao: 'aferir' });
    assert.strictEqual(r3.status, 201, corpo(r3));
    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'BLOQUEADA' WHERE id = ?", [f]);
    const r4 = await comAuditoriaFalhando('ferramenta', 'MANUTENCAO_FIM',
      () => request(app).put(`${api}/manutencoes/${r3.body.id}/concluir`).send({}));
    assert.strictEqual(r4.status, 400, `concluir com anomalia: ${corpo(r4)}`);
    assert.ok(/status atual: BLOQUEADA/.test(r4.body.error), corpo(r4));
    assert.ok((await dbGet(db, 'SELECT data_fim FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [r3.body.id])).data_fim);

    await dbRun(db, "UPDATE ferramentas_almoxarifado SET status = 'PERDIDA' WHERE id = ?", [f]);
    const r5 = await comAuditoriaFalhando('ferramenta', 'REENCONTRO',
      () => request(app).post(`${api}/ferramentas/${f}/reencontrar`).send({ justificativa: 'achada no galpao' }));
    assert.strictEqual(r5.status, 200, `reencontrar: ${corpo(r5)}`);
    assert.strictEqual(await statusFerr(f), 'DISPONIVEL');
  });

  for (const falha of [false, true]) {
    await test(`[RN-12c] ocorrencia com foto${falha ? ' e a Auditoria falhando' : ' (controle, sem falha)'} -> 201, uma ocorrencia e a foto NO DISCO`, async () => {
      const f = await ferramenta(`PAT-ADA-OC-${falha ? 1 : 0}`);
      const chamar = () => request(app).post(`${api}/ferramentas/${f}/ocorrencias`)
        .field('tipo', 'AVARIA').field('descricao', 'quebrou o mandril')
        .attach('foto', PNG, { filename: 'f.png', contentType: 'image/png' });
      const r = falha ? await comAuditoriaFalhando('ferramenta', 'OCORRENCIA', chamar) : await chamar();
      assert.strictEqual(r.status, 201, `ocorrencia: ${corpo(r)}`);
      const linhas = await dbAll(db, 'SELECT foto_path FROM ocorrencias_ferramenta_almoxarifado WHERE ferramenta_id = ?', [f]);
      assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));
      assert.ok(linhas[0].foto_path, 'a ocorrencia sem foto_path');
      assert.ok(noDisco(linhas[0].foto_path), `a foto ${linhas[0].foto_path} nao esta no disco`);
      assert.strictEqual(await statusFerr(f), 'AVARIADA');
    });
  }

  for (const falha of [false, true]) {
    await test(`[RN-12d] calibracao com certificado${falha ? ' e a Auditoria falhando' : ' (controle, sem falha)'} -> 201, UMA calibracao e o certificado NO DISCO`, async () => {
      const f = await ferramenta(`PAT-ADA-CA-${falha ? 1 : 0}`);
      const chamar = () => request(app).post(`${api}/ferramentas/${f}/calibracoes`)
        .field('data_calibracao', '2026-10-01').field('data_validade', '2027-10-01')
        .attach('certificado', PNG, { filename: 'c.png', contentType: 'image/png' });
      const r = falha ? await comAuditoriaFalhando('ferramenta', 'CALIBRACAO', chamar) : await chamar();
      assert.strictEqual(r.status, 201, `calibracao: ${corpo(r)}`);
      const linhas = await dbAll(db, 'SELECT certificado_path FROM calibracoes_ferramenta_almoxarifado WHERE ferramenta_id = ?', [f]);
      assert.strictEqual(linhas.length, 1, `calibracoes: ${JSON.stringify(linhas)}`);
      assert.ok(noDisco(linhas[0].certificado_path), `o certificado ${linhas[0].certificado_path} nao esta no disco`);
    });
  }

  await test('[RN-12e] serie: mudar o status com a Auditoria falhando -> 200 e a serie BLOQUEADA', async () => {
    const m = await material({ controle_serie: 1 });
    const e = await v2({ material_id: m, tipo: 'ENTRADA', quantidade: 1, series: ['U-A'] });
    assert.strictEqual(e.status, 201, corpo(e));
    const s = await dbGet(db, "SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = 'U-A'", [m]);
    const r = await comAuditoriaFalhando('serie', 'MUDANCA_STATUS',
      () => request(app).put(`${api}/series/${s.id}/status`).send({ status: 'BLOQUEADA', justificativa: 'avaria' }));
    assert.strictEqual(r.status, 200, `status da serie: ${corpo(r)}`);
    assert.strictEqual(await statusSerie(m, 'U-A'), 'BLOQUEADA');
  });

  await test('[RN-12f] serie: regularizar com a Auditoria da primeira falhando -> 200 com a contagem, e a da segunda gravada', async () => {
    const m = await material({ controle_serie: 1, quantidade_atual: 2 });
    const r = await comAuditoriaFalhando('serie', 'REGULARIZACAO_SERIES',
      () => request(app).post(`${api}/materiais/${m}/series/regularizar`).send({ cadastrar: ['R-1', 'R-2'], justificativa: 'regularizar legado' }));
    assert.strictEqual(r.status, 200, `regularizar: ${corpo(r)}`);
    assert.strictEqual(r.body.cadastradas, 2, corpo(r));
    assert.strictEqual(await presentes(m), 2);
    const aud = (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado a JOIN series_almoxarifado s ON s.id = a.entidade_id
      WHERE a.entidade = 'serie' AND a.acao = 'REGULARIZACAO_SERIES' AND s.material_id = ?`, [m])).n;
    assert.strictEqual(aud, 1, 'o laco parou na primeira Auditoria');
  });

  await test('[RN-12g] lote: mudar o status, anexar o certificado e liberar o vencimento com a Auditoria falhando -> 200 e o ato gravado', async () => {
    const m = await material({ controle_lote: 1 });
    const lote = (await dbRun(db, `INSERT INTO lotes_almoxarifado (material_id, codigo, data_validade, status) VALUES (?, 'LADA-1', '2020-01-01', 'ATIVO')`, [m])).lastID;
    const r1 = await comAuditoriaFalhando('lote', 'MUDANCA_STATUS',
      () => request(app).put(`${api}/lotes/${lote}/status`).send({ status: 'BLOQUEADO', justificativa: 'suspeita' }));
    assert.strictEqual(r1.status, 200, `status do lote: ${corpo(r1)}`);
    assert.strictEqual((await dbGet(db, 'SELECT status FROM lotes_almoxarifado WHERE id = ?', [lote])).status, 'BLOQUEADO');

    await dbRun(db, "UPDATE lotes_almoxarifado SET status_motivo = 'aguardando certificado do fornecedor' WHERE id = ?", [lote]);
    const r2 = await comAuditoriaFalhando('lote', 'MUDANCA_STATUS',
      () => request(app).post(`${api}/lotes/${lote}/certificado`).attach('certificado', PNG, { filename: 'c.png', contentType: 'image/png' }));
    assert.strictEqual(r2.status, 200, `certificado do lote: ${corpo(r2)}`);
    const l2 = await dbGet(db, 'SELECT status, certificado_arquivo FROM lotes_almoxarifado WHERE id = ?', [lote]);
    assert.strictEqual(l2.status, 'ATIVO');
    assert.ok(noDisco(l2.certificado_arquivo), `o certificado do lote ${l2.certificado_arquivo} nao esta no disco`);

    const r3 = await comAuditoriaFalhando('lote', 'LIBERACAO_VENCIMENTO',
      () => request(app).put(`${api}/lotes/${lote}/liberar-vencimento`).send({ justificativa: 'ensaio refeito ok' }));
    assert.strictEqual(r3.status, 200, `liberar vencimento: ${corpo(r3)}`);
    assert.ok((await dbGet(db, 'SELECT vencimento_liberado_em v FROM lotes_almoxarifado WHERE id = ?', [lote])).v);
  });

  await test('[RN-12h] material com codigo_auto e saldo inicial, a Auditoria CRIACAO falhando -> 201, UM material e UMA Entrada de saldo inicial', async () => {
    const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo, parent_id) VALUES ('FADA','Fam ADA',1,NULL)")).lastID;
    const r = await comAuditoriaFalhando('material', 'CRIACAO', () => request(app).post(`${api}/materiais`).send({
      codigo: 'FADA-001', nome: 'Material ADA121', unidade: 'PC', categoria: 'OUTROS', familia_id: fam, codigo_auto: true, quantidade_atual: 5 }));
    assert.strictEqual(r.status, 201, `criar material: ${corpo(r)}`);
    const mats = await dbAll(db, "SELECT id, quantidade_atual FROM materiais_almoxarifado WHERE nome = 'Material ADA121'");
    assert.strictEqual(mats.length, 1, JSON.stringify(mats));
    assert.strictEqual(mats[0].quantidade_atual, 5);
    const entradas = (await dbGet(db, "SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'ENTRADA'", [mats[0].id])).n;
    assert.strictEqual(entradas, 1);
  });

  await test('[RN-12i] desfazer da Entrada (apaga a criada), a Auditoria COMPENSACAO falhando -> o 400 de sempre e fisico = series presentes', async () => {
    const m = await material({ controle_serie: 1 });
    assert.strictEqual((await v2({ material_id: m, tipo: 'ENTRADA', quantidade: 1, series: ['S-C'] })).status, 201);
    const r = await comAuditoriaFalhando('serie', 'COMPENSACAO',
      () => v2({ material_id: m, tipo: 'ENTRADA', quantidade: 3, series: ['S-A', 'S-B', 'S-C'] }));
    assert.strictEqual(r.status, 400, `entrada: ${corpo(r)}`);
    assert.ok(/serie S-C ja esta em estoque/.test(r.body.error), corpo(r));
    assert.strictEqual(await fisico(m), 1);
    assert.strictEqual(await presentes(m), 1, 'uma serie criada ficou presente sem fisico');
  });

  await test('[RN-12j] desfazer da Entrada (restaura a reativada), a Auditoria COMPENSACAO falhando -> o 400 de sempre e a serie volta a Entregue', async () => {
    const m = await material({ controle_serie: 1 });
    assert.strictEqual((await v2({ material_id: m, tipo: 'ENTRADA', quantidade: 2, series: ['Q-A', 'Q-B'] })).status, 201);
    const qa = await dbGet(db, "SELECT id FROM series_almoxarifado WHERE material_id = ? AND numero = 'Q-A'", [m]);
    const s = await v2({ material_id: m, tipo: 'SAIDA', quantidade: 1, serie_ids: [qa.id] });
    assert.strictEqual(s.status, 201, corpo(s));
    assert.strictEqual(await statusSerie(m, 'Q-A'), 'ENTREGUE');
    const r = await comAuditoriaFalhando('serie', 'COMPENSACAO',
      () => v2({ material_id: m, tipo: 'ENTRADA', quantidade: 2, series: ['Q-A', 'Q-B'] }));
    assert.strictEqual(r.status, 400, `entrada: ${corpo(r)}`);
    assert.ok(/serie Q-B ja esta em estoque/.test(r.body.error), corpo(r));
    assert.strictEqual(await statusSerie(m, 'Q-A'), 'ENTREGUE');
    assert.strictEqual(await fisico(m), 1);
    assert.strictEqual(await presentes(m), 1);
  });

  await test('[RN-12k] desfazer da Saida, a Auditoria COMPENSACAO falhando -> o 400 de sempre e as series de volta ao estoque', async () => {
    const m = await material({ controle_serie: 1 });
    assert.strictEqual((await v2({ material_id: m, tipo: 'ENTRADA', quantidade: 3, series: ['T-A', 'T-B', 'T-C'] })).status, 201);
    const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m])).map((x) => x.id);
    const r = await comAuditoriaFalhando('serie', 'COMPENSACAO',
      () => v2({ material_id: m, tipo: 'SAIDA', quantidade: 3, serie_ids: [ids[0], ids[1], 999999] }));
    assert.strictEqual(r.status, 400, `saida: ${corpo(r)}`);
    assert.ok(/serie id 999999 nao existe/.test(r.body.error), corpo(r));
    assert.strictEqual(await fisico(m), 3);
    assert.strictEqual(await presentes(m), 3, 'uma serie ficou Entregue sem saida no livro');
  });

  /**
   * Fase 5 da 121 (r1, #1): o desfazer do ESTORNO pelo livro (`desfazerReverterSaida`/`desfazerReverterEntrada`, Etapa 118)
   * com a Auditoria da COMPENSACAO falhando sempre (o INSERT de Auditoria quebrado) e o livro do estorno falhando uma vez.
   * Antes: o desfazer parava na 1a serie, o catch de fora na 2a, e o claim e o saldo nunca voltavam — a movimentacao ficava
   * "cancelada" sem estorno (repetir: "Movimentação já cancelada") e as series sem bater com o fisico.
   */
  async function estornoComDesfazerFalhando(tipo) {
    const m = await material({ controle_serie: 1 });
    assert.strictEqual((await v2({ material_id: m, tipo: 'ENTRADA', quantidade: 2, series: [`D${tipo}-A`, `D${tipo}-B`] })).status, 201);
    let alvo = (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [m])).id;
    if (tipo === 'SAIDA') {
      const ids = (await dbAll(db, 'SELECT id FROM series_almoxarifado WHERE material_id = ? ORDER BY numero', [m])).map((x) => x.id);
      assert.strictEqual((await v2({ material_id: m, tipo: 'SAIDA', quantidade: 2, serie_ids: ids })).status, 201);
      alvo = (await dbGet(db, 'SELECT id FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id DESC LIMIT 1', [m])).id;
    }
    const original = db.run; let livroFalhou = false; let compFalhas = 0;
    db.run = function (sql, params, cb) {
      if (typeof params === 'function') { cb = params; params = []; }
      if (!livroFalhou && typeof sql === 'string' && /INSERT INTO movimentacoes_almoxarifado/.test(sql)
        && /ESTORNO/.test(JSON.stringify(params || []) + sql)) {
        livroFalhou = true; setImmediate(() => cb.call({}, new Error('livro do estorno falhou (teste)'))); return this;
      }
      if (typeof sql === 'string' && sql.includes('INSERT INTO auditoria_log_almoxarifado') && Array.isArray(params)
        && params[0] === 'serie' && params[2] === 'COMPENSACAO') {
        compFalhas += 1; setImmediate(() => cb.call({}, new Error('falha forcada da auditoria serie/COMPENSACAO (teste)'))); return this;
      }
      return original.call(db, sql, params, cb);
    };
    const warn = console.warn; console.warn = () => {};
    let r;
    try { r = await request(app).post(`${api}/movimentacoes/${alvo}/cancelar`).send({ motivo: 'ada121c' }); } finally { db.run = original; console.warn = warn; }
    assert.ok(livroFalhou && compFalhas > 0, `ganchos: livro=${livroFalhou} comp=${compFalhas}`);
    return { m, alvo, r };
  }

  await test('[RN-12l] (Fase 5, r1) estorno de Saida com o livro falhando e a Auditoria do desfazer falhando: desfaz tudo, repetir estorna', async () => {
    const { m, alvo, r } = await estornoComDesfazerFalhando('SAIDA');
    assert.strictEqual(r.status, 500, corpo(r));
    assert.ok(/livro do estorno falhou/.test(r.body.error), `o erro original sumiu: ${corpo(r)}`);
    const mv = await dbGet(db, 'SELECT COALESCE(cancelado, 0) c, movimento_estorno_id e FROM movimentacoes_almoxarifado WHERE id = ?', [alvo]);
    assert.deepStrictEqual({ ...mv }, { c: 0, e: null }, 'a movimentacao ficou presa como cancelada sem estorno');
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual(await presentes(m), 0);
    const r2 = await request(app).post(`${api}/movimentacoes/${alvo}/cancelar`).send({ motivo: 'ada121c' });
    assert.strictEqual(r2.status, 200, corpo(r2));
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await presentes(m), 2);
  });

  await test('[RN-12m] (Fase 5, r1) estorno de Entrada com o livro falhando e a Auditoria do desfazer falhando: desfaz tudo, repetir estorna', async () => {
    const { m, alvo, r } = await estornoComDesfazerFalhando('ENTRADA');
    assert.strictEqual(r.status, 500, corpo(r));
    assert.ok(/livro do estorno falhou/.test(r.body.error), `o erro original sumiu: ${corpo(r)}`);
    const mv = await dbGet(db, 'SELECT COALESCE(cancelado, 0) c, movimento_estorno_id e FROM movimentacoes_almoxarifado WHERE id = ?', [alvo]);
    assert.deepStrictEqual({ ...mv }, { c: 0, e: null }, 'a movimentacao ficou presa como cancelada sem estorno');
    assert.strictEqual(await fisico(m), 2);
    assert.strictEqual(await presentes(m), 2);
    const r2 = await request(app).post(`${api}/movimentacoes/${alvo}/cancelar`).send({ motivo: 'ada121c' });
    assert.strictEqual(r2.status, 200, corpo(r2));
    assert.strictEqual(await fisico(m), 0);
    assert.strictEqual(await presentes(m), 0);
  });

  await test('[RN-12n] (Fase 5, r1) estoques minimos em lote: a Auditoria do 1o material falhando nao perde a dos seguintes', async () => {
    const ids = [await material(), await material(), await material()];
    const conta = async () => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado WHERE entidade = 'material'
      AND acao = 'ATUALIZACAO' AND entidade_id IN (${ids.join(',')})`)).n;
    const err = console.error; console.error = () => {};
    let r;
    try {
      r = await comAuditoriaFalhando('material', 'ATUALIZACAO', () => request(app).put(`${api}/configuracoes/estoques-minimos`)
        .send({ materiais: ids.map((id) => ({ id, quantidade_minima: 7 })) }));
    } finally { console.error = err; }
    assert.strictEqual(r.status, 200, corpo(r));
    for (const id of ids) assert.strictEqual((await dbGet(db, 'SELECT quantidade_minima q FROM materiais_almoxarifado WHERE id = ?', [id])).q, 7);
    assert.strictEqual(await conta(), 2, 'a falha do 1o material perdeu a trilha dos seguintes');
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  await close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
