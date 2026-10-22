/**
 * Etapa 178 (T1) — entrega de EPI ao colaborador com assinatura na tela (NR-6): as regras RN-178.01..11 e as emendas da
 * Revisao da Fase 2 (C1, C2, I2, I3, I4, I5, menores). Integridade (hash, triggers, verificar, ficha): epiIntegridade.
 *
 * Plano: docs/superpowers/plans/2026-10-22-almoxarifado-etapa178-entrega-de-epi-com-assinatura.md
 *
 * A conexao do harness e embrulhada com `wrapDatabase` (sqliteConcurrency) — a de producao —, para a gravacao passar pelo
 * `db.execEmTransacao` de verdade (C1), e nao pelo fallback do servico.
 *
 * Executar: cd server && node tests/api/epiEntrega.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const epiService = require('../../services/almoxarifado/epiService');
const diaLocal = require('../../services/diaLocal');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
let antesDeCada = async () => {};
async function test(name, fn) {
  try { await antesDeCada(); await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 5, nome: 'Prod Teste', role: 'user', email: 'prod@test.com' }; // sem perfil = PRODUCAO (fallback)

let seq = 0;
const diaMais = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
const br = (iso) => iso.split('-').reverse().join('/');

async function criarEpi(db, { qtd = 10, ca = 'CA-12345', validade = diaMais(diaLocal.hojeLocalISO(), 365), marca = 'categoria',
  serie = 0, lote = 0, codigo } = {}) {
  seq += 1;
  const cod = codigo || `EPI-T-${seq}`;
  let tipoId = null;
  if (marca === 'tipo_id') {
    tipoId = (await dbRun(db, 'INSERT INTO tipos_material_almoxarifado (nome, is_epi) VALUES (?, 1)', [`Tipo EPI ${seq}`])).lastID;
  }
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, categoria, tipo_material, tipo_material_id, quantidade_atual, ativo, ca_numero, ca_validade, controle_serie, controle_lote)
    VALUES (?,?,?,?,?,0,1,?,?,?,?)`,
  [cod, `Luva ${cod}`, marca === 'categoria' ? 'EPIs' : 'OUTROS', marca === 'tipo_material' ? 'epi' : null, tipoId,
    ca, validade, serie, lote]);
  if (qtd > 0) {
    await stockService.registrarMovimentacao(db, ADMIN, { material_id: r.lastID, tipo: 'ENTRADA', quantidade: qtd, justificativa: 'carga' });
  }
  return { id: r.lastID, codigo: cod };
}

async function criarColaborador(db, { nome, matricula, cpf = null, status = 'ativo', setor = 'Caldeiraria' } = {}) {
  seq += 1;
  const r = await dbRun(db, `INSERT INTO colaboradores (nome, matricula, cpf, status, setor, salario_base) VALUES (?,?,?,?,?,?)`,
    [nome || `COLABORADOR ${seq}`, matricula === undefined ? `M${seq}` : matricula, cpf, status, setor, 3000]);
  return { id: r.lastID, nome: nome || `COLABORADOR ${seq}`, matricula: matricula === undefined ? `M${seq}` : matricula };
}

function postEntrega(app, campos, { png = PNG_1PX, tipo = 'image/png', semArquivo = false } = {}) {
  let r = request(app).post('/api/almoxarifado/epi/entregas');
  for (const [k, v] of Object.entries(campos)) if (v !== undefined) r = r.field(k, String(v));
  if (!semArquivo) r = r.attach('assinatura', png, { filename: 'assinatura.png', contentType: tipo });
  return r;
}

const arquivosEpi = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.startsWith('assinatura-epi-')) : []);
const contar = async (db, sql, p = []) => (await dbGet(db, sql, p)).n;

(async () => {
  const t = await createTestApp({ user: ADMIN });
  const { app, db, setUser, uploadsAlmoxDir } = t;
  wrapDatabase(db);

  /** Nada gravado: nem entrega, nem evidencia, nem saida, nem arquivo — e o saldo intacto. */
  async function nadaGravado(material, saldoAntes) {
    assert.strictEqual(await contar(db, 'SELECT COUNT(*) n FROM entregas_epi_almoxarifado WHERE material_id = ?', [material.id]), 0);
    assert.strictEqual(await contar(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado WHERE material_id = ? AND tipo = 'SAIDA'`,
      [material.id]), 0, 'houve saida');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [material.id])).q, saldoAntes);
    assert.deepStrictEqual(arquivosEpi(uploadsAlmoxDir), [], 'upload orfao no disco');
  }
  const limparDisco = () => { for (const f of arquivosEpi(uploadsAlmoxDir)) fs.unlinkSync(path.join(uploadsAlmoxDir, f)); };
  // Cada cenario comeca com o disco limpo (as entregas que deram certo deixam o arquivo delas) e com o ADMIN.
  antesDeCada = async () => { limparDisco(); setUser(ADMIN); epiService.ganchos.antesDaGravacao = null; };

  // ── RN-178.06 + C1: o caminho feliz ─────────────────────────────────────────────────────────
  await test('[RN-178.06, C1] 201 com o contrato congelado; SAIDA pelo motor com o numero EPI- e a justificativa; entrega e evidencia', async () => {
    const mat = await criarEpi(db, { qtd: 10 });
    const col = await criarColaborador(db, { nome: 'JOAO DA SILVA', matricula: 'M-778', cpf: '123.456.789-01' });
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 2, tamanho: 'G',
      motivo: 'PRIMEIRA_ENTREGA', observacao: 'luva de raspa' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.deepStrictEqual(Object.keys(res.body).sort(), ['evidencia', 'id', 'movimentacao_id', 'numero']);
    assert.deepStrictEqual(Object.keys(res.body.evidencia).sort(),
      ['arquivo_sha256', 'arquivo_url', 'criado_em', 'id', 'registro_sha256']);
    assert.match(res.body.numero, /^EPI-[0-9A-Z]{16,}$/);
    assert.strictEqual(res.body.evidencia.arquivo_sha256, crypto.createHash('sha256').update(PNG_1PX).digest('hex'));
    assert.match(res.body.evidencia.registro_sha256, /^[0-9a-f]{64}$/);
    assert.match(res.body.evidencia.criado_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.match(res.body.evidencia.arquivo_url, /^\/api\/uploads\/almoxarifado\/assinatura-epi-.*\.png\?.*sig=/);

    const mov = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [res.body.movimentacao_id]);
    assert.strictEqual(mov.tipo, 'SAIDA');
    assert.strictEqual(mov.quantidade, 2);
    assert.strictEqual(mov.documento_vinculado, res.body.numero);
    assert.strictEqual(mov.justificativa, 'Entrega de EPI a JOAO DA SILVA (M-778)');
    assert.strictEqual(Number(mov.cancelado || 0), 0);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mat.id])).q, 8);

    const e = await dbGet(db, 'SELECT * FROM entregas_epi_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(e.numero, res.body.numero);
    assert.strictEqual(e.movimentacao_id, res.body.movimentacao_id);
    assert.strictEqual(e.colaborador_nome, 'JOAO DA SILVA');
    assert.strictEqual(e.ca_numero, 'CA-12345');
    assert.strictEqual(e.tamanho, 'G');
    assert.strictEqual(e.motivo, 'PRIMEIRA_ENTREGA');
    assert.strictEqual(e.observacao, 'luva de raspa');
    assert.strictEqual(e.entregue_por, 1);
    assert.strictEqual(e.criado_em, res.body.evidencia.criado_em);
    const v = await dbGet(db, 'SELECT * FROM evidencias_assinatura_almoxarifado WHERE id = ?', [res.body.evidencia.id]);
    assert.strictEqual(v.contexto, 'ENTREGA_EPI');
    assert.strictEqual(v.contexto_id, e.id);
    assert.strictEqual(v.cpf, '123.456.789-01', 'o snapshot do CPF fica na evidencia');
    assert.strictEqual(v.registro_sha256, res.body.evidencia.registro_sha256);
    assert.ok(fs.existsSync(path.join(uploadsAlmoxDir, v.arquivo)));
    const aud = await dbGet(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'entrega_epi' AND entidade_id = ?`, [e.id]);
    assert.ok(aud && aud.acao === 'ENTREGA_EPI', 'sem auditoria ENTREGA_EPI');
  });

  await test('[RN-178.06] matricula vazia: a justificativa sem os parenteses', async () => {
    const mat = await criarEpi(db);
    const col = await criarColaborador(db, { nome: 'SEM MATRICULA', matricula: null });
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const mov = await dbGet(db, 'SELECT justificativa FROM movimentacoes_almoxarifado WHERE id = ?', [res.body.movimentacao_id]);
    assert.strictEqual(mov.justificativa, 'Entrega de EPI a SEM MATRICULA');
  });

  // ── RN-178.01: as tres marcas ───────────────────────────────────────────────────────────────
  for (const marca of ['categoria', 'tipo_material', 'tipo_id']) {
    await test(`[RN-178.01] EPI pela marca "${marca}" entrega (201) e a lista de materiais diz is_epi = true`, async () => {
      const mat = await criarEpi(db, { marca });
      const col = await criarColaborador(db);
      const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
      assert.strictEqual(res.status, 201, JSON.stringify(res.body));
      const lista = await request(app).get(`/api/almoxarifado/materiais?search=${encodeURIComponent(mat.codigo)}`);
      const linha = lista.body.find((m) => m.id === mat.id);
      assert.ok(linha, 'material fora da busca');
      assert.strictEqual(linha.is_epi, true);
      const det = await request(app).get(`/api/almoxarifado/materiais/${mat.id}`);
      assert.strictEqual(det.body.is_epi, true);
    });
  }

  await test('[RN-178.01, RN-178.04] material que nao e EPI -> 400 literal e is_epi = false na lista; nada gravado', async () => {
    const mat = await criarEpi(db, { marca: 'nenhuma' });
    const col = await criarColaborador(db);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, `Material ${mat.codigo} não é EPI`);
    await nadaGravado(mat, 10);
    const lista = await request(app).get(`/api/almoxarifado/materiais?search=${encodeURIComponent(mat.codigo)}`);
    assert.strictEqual(lista.body.find((m) => m.id === mat.id).is_epi, false);
  });

  // ── RN-178.04: CA ───────────────────────────────────────────────────────────────────────────
  await test('[RN-178.04] EPI sem CA -> 400 literal; nada gravado', async () => {
    const mat = await criarEpi(db, { ca: '   ' });
    const col = await criarColaborador(db);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, `EPI ${mat.codigo} sem número de CA cadastrado`);
    await nadaGravado(mat, 10);
  });

  await test('[RN-178.04] CA vencido ontem (dia de Brasilia) -> 400 com dd/mm/aaaa; vence hoje -> 201', async () => {
    const ontem = diaMais(diaLocal.hojeLocalISO(), -1);
    const mat = await criarEpi(db, { ca: 'CA-999', validade: ontem });
    const col = await criarColaborador(db);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, `O CA CA-999 do EPI ${mat.codigo} venceu em ${br(ontem)}`);
    await nadaGravado(mat, 10);
    const hoje = await criarEpi(db, { validade: diaLocal.hojeLocalISO() });
    const ok = await postEntrega(app, { colaborador_id: col.id, material_id: hoje.id, quantidade: 1 });
    assert.strictEqual(ok.status, 201, JSON.stringify(ok.body));
  });

  // ── I3: serie/lote ─────────────────────────────────────────────────────────────────────────
  for (const [nome, flags] of [['serie', { serie: 1 }], ['lote', { lote: 1 }]]) {
    await test(`[I3] EPI com controle de ${nome} -> 400 literal; nada gravado`, async () => {
      const mat = await criarEpi(db, { qtd: 0, ...flags });
      const col = await criarColaborador(db);
      const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, `EPI ${mat.codigo} com controle de série/lote não é suportado nesta etapa`);
      await nadaGravado(mat, 0);
    });
  }

  // ── RN-178.03: colaborador ──────────────────────────────────────────────────────────────────
  await test('[RN-178.03] colaborador inexistente -> 400 literal; inativo -> 400 literal; nada gravado', async () => {
    const mat = await criarEpi(db);
    const r1 = await postEntrega(app, { colaborador_id: 987654, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(r1.status, 400);
    assert.strictEqual(r1.body.error, 'Colaborador #987654 não encontrado');
    const inativo = await criarColaborador(db, { nome: 'FULANO DESLIGADO', status: 'inativo' });
    const r2 = await postEntrega(app, { colaborador_id: inativo.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, 'Colaborador FULANO DESLIGADO não está ativo');
    // status com caixa/espacos diferentes continua ativo (LOWER(TRIM(status)))
    const ativo2 = await criarColaborador(db, { status: '  Ativo ' });
    const r3 = await postEntrega(app, { colaborador_id: ativo2.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(r3.status, 201, JSON.stringify(r3.body));
  });

  // ── RN-178.05 + I5: assinatura ──────────────────────────────────────────────────────────────
  await test('[RN-178.05] sem a imagem -> 400 literal; nada gravado', async () => {
    const mat = await criarEpi(db);
    const col = await criarColaborador(db);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 }, { semArquivo: true });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'A assinatura do colaborador é obrigatória');
    await nadaGravado(mat, 10);
  });

  await test('[I5] MIME nao PNG -> 400 literal (multer); bytes que nao sao PNG com MIME png -> 400 literal e orfao apagado', async () => {
    const mat = await criarEpi(db);
    const col = await criarColaborador(db);
    const r1 = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 }, { tipo: 'image/jpeg' });
    assert.strictEqual(r1.status, 400);
    assert.strictEqual(r1.body.error, 'A assinatura deve ser uma imagem PNG');
    const r2 = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 },
      { png: Buffer.from('GIF89a-isto-nao-e-png') });
    assert.strictEqual(r2.status, 400);
    assert.strictEqual(r2.body.error, 'A assinatura deve ser uma imagem PNG');
    await nadaGravado(mat, 10);
  });

  await test('[RN-178.05] imagem acima de 2 MB -> 413 do modulo; nada gravado', async () => {
    const mat = await criarEpi(db);
    const col = await criarColaborador(db);
    const grande = Buffer.concat([PNG_1PX, Buffer.alloc(2 * 1024 * 1024 + 10)]);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 }, { png: grande });
    assert.strictEqual(res.status, 413, JSON.stringify(res.body));
    await nadaGravado(mat, 10);
  });

  // ── Menores + RN-178.11 ─────────────────────────────────────────────────────────────────────
  for (const q of ['1.5', '0', '-1', 'abc', '']) {
    await test(`[menores] quantidade "${q}" -> 400 'Quantidade de EPI deve ser inteira'; nada gravado`, async () => {
      const mat = await criarEpi(db);
      const col = await criarColaborador(db);
      const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: q });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.body.error, 'Quantidade de EPI deve ser inteira');
      await nadaGravado(mat, 10);
    });
  }

  await test('[RN-178.11] motivo invalido, tamanho > 20 e observacao > 500 -> 400 literais; os quatro motivos validos passam', async () => {
    const mat = await criarEpi(db, { qtd: 10 });
    const col = await criarColaborador(db);
    const base = { colaborador_id: col.id, material_id: mat.id, quantidade: 1 };
    const r1 = await postEntrega(app, { ...base, motivo: 'PRESENTE' });
    assert.strictEqual(r1.status, 400); assert.strictEqual(r1.body.error, 'Motivo inválido');
    const r2 = await postEntrega(app, { ...base, tamanho: 'x'.repeat(21) });
    assert.strictEqual(r2.status, 400); assert.strictEqual(r2.body.error, 'Tamanho deve ter no máximo 20 caracteres');
    const r3 = await postEntrega(app, { ...base, observacao: 'o'.repeat(501) });
    assert.strictEqual(r3.status, 400); assert.strictEqual(r3.body.error, 'Observação deve ter no máximo 500 caracteres');
    await nadaGravado(mat, 10);
    for (const motivo of ['PRIMEIRA_ENTREGA', 'TROCA', 'PERDA', 'DANO']) {
      const ok = await postEntrega(app, { ...base, motivo, tamanho: 'x'.repeat(20), observacao: "d'agua ".repeat(70).slice(0, 500) });
      assert.strictEqual(ok.status, 201, `${motivo}: ${JSON.stringify(ok.body)}`);
    }
    const linha = await dbGet(db, 'SELECT observacao FROM entregas_epi_almoxarifado WHERE material_id = ? LIMIT 1', [mat.id]);
    assert.ok(linha.observacao.includes("d'agua"), 'o texto com aspa simples atravessa o exec escapado');
  });

  // ── RN-178.06: saldo ────────────────────────────────────────────────────────────────────────
  await test('[RN-178.06] saldo insuficiente -> a recusa do motor; nada gravado', async () => {
    const mat = await criarEpi(db, { qtd: 1 });
    const col = await criarColaborador(db);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 2 });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /insuficiente|dispon/i);
    await nadaGravado(mat, 1);
  });

  // ── RN-178.02: perfil ───────────────────────────────────────────────────────────────────────
  await test('[RN-178.02] PRODUCAO -> 403 antes do multer (sem arquivo); ALMOXARIFE -> 201', async () => {
    const mat = await criarEpi(db);
    const col = await criarColaborador(db);
    setUser(PRODUCAO);
    const r1 = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(r1.status, 403);
    assert.deepStrictEqual(arquivosEpi(uploadsAlmoxDir), []);
    // a leitura e do portao do modulo: PRODUCAO le a lista
    assert.strictEqual((await request(app).get('/api/almoxarifado/epi/entregas')).status, 200);
    setUser(ALMOXARIFE);
    const r2 = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
    setUser(ADMIN);
    const perms = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.ok(JSON.stringify(perms.body).includes('entregar_epi'), 'a acao nova nao aparece em minhas-permissoes');
  });

  // ── C2: estorno e devolucao ─────────────────────────────────────────────────────────────────
  await test('[C2] estorno da saida pelo livro -> 400 literal e a saida fica de pe; a devolucao que a cite -> 400 literal', async () => {
    limparDisco();
    const mat = await criarEpi(db, { qtd: 5 });
    const col = await criarColaborador(db);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 2 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const est = await request(app).post(`/api/almoxarifado/movimentacoes/${res.body.movimentacao_id}/cancelar`)
      .send({ motivo: 'engano' });
    assert.strictEqual(est.status, 400);
    assert.strictEqual(est.body.error,
      'Saída de entrega de EPI não pode ser estornada pelo livro — a ficha do colaborador continuaria dizendo que recebeu');
    const mov = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [res.body.movimentacao_id]);
    assert.strictEqual(Number(mov.cancelado || 0), 0);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mat.id])).q, 3);

    const dev = await request(app).post('/api/almoxarifado/devolucoes').send({
      material_id: mat.id, quantidade: 1, motivo: 'SOBRA', destino: 'ESTOQUE', movimentacao_saida_id: res.body.movimentacao_id,
    });
    assert.strictEqual(dev.status, 400, JSON.stringify(dev.body));
    assert.strictEqual(dev.body.error,
      'Saída de entrega de EPI não pode ser devolvida — a ficha do colaborador continuaria dizendo que recebeu');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mat.id])).q, 3);
    const eleg = await request(app).get(`/api/almoxarifado/devolucoes/saidas-elegiveis?material_id=${mat.id}`);
    assert.strictEqual(eleg.status, 200, JSON.stringify(eleg.body));
    assert.ok(!eleg.body.some((s) => s.id === res.body.movimentacao_id), 'a saida de EPI aparece como devolvivel');
  });

  await test('[C2] o claim do estorno tambem recusa: a guarda de leitura "nao viu" a entrega (gravada depois dela) -> 400 literal', async () => {
    const mat = await criarEpi(db, { qtd: 5 });
    const col = await criarColaborador(db);
    const res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 1 });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    // A janela, deterministica: a PRIMEIRA leitura da guarda responde "sem entrega" (como se tivesse lido antes de a
    // transacao da entrega gravar). So o NOT EXISTS do claim pode recusar agora.
    const origGet = db.get;
    let pulou = false;
    db.get = function getComJanela(sql, ...rest) {
      if (!pulou && /SELECT 1 AS v FROM entregas_epi_almoxarifado WHERE movimentacao_id = \?/.test(String(sql))) {
        pulou = true;
        const cb = rest.find((x) => typeof x === 'function');
        process.nextTick(() => cb(null, undefined));
        return this;
      }
      return origGet.call(this, sql, ...rest);
    };
    let est;
    try {
      est = await request(app).post(`/api/almoxarifado/movimentacoes/${res.body.movimentacao_id}/cancelar`).send({ motivo: 'engano' });
    } finally { db.get = origGet; }
    assert.ok(pulou, 'a guarda de leitura nao rodou');
    assert.strictEqual(est.status, 400, JSON.stringify(est.body));
    assert.strictEqual(est.body.error,
      'Saída de entrega de EPI não pode ser estornada pelo livro — a ficha do colaborador continuaria dizendo que recebeu');
    const mov = await dbGet(db, 'SELECT cancelado FROM movimentacoes_almoxarifado WHERE id = ?', [res.body.movimentacao_id]);
    assert.strictEqual(Number(mov.cancelado || 0), 0, 'o claim estornou a saida da entrega');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mat.id])).q, 4);
  });

  await test('[C1/C2] o estorno pelo livro que ganha a corrida ANTES da transacao: 409 literal, nenhuma entrega/evidencia, sem orfao', async () => {
    limparDisco();
    const mat = await criarEpi(db, { qtd: 5 });
    const col = await criarColaborador(db);
    let numero = null;
    // O gancho roda depois de a saida voltar do motor (fora da secao da trava) — o estorno dispara dali e conclui.
    epiService.ganchos.antesDaGravacao = async (info) => {
      numero = info.numero;
      await stockService.cancelarMovimentacao(db, ADMIN, info.movimentacaoId, 'estorno no meio');
    };
    let res;
    try {
      res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 2 });
    } finally { epiService.ganchos.antesDaGravacao = null; }
    assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    assert.strictEqual(res.body.error,
      `A saída da entrega ${numero} foi estornada enquanto a entrega era gravada — nada foi gravado. Faça a entrega de novo.`);
    assert.strictEqual(await contar(db, 'SELECT COUNT(*) n FROM entregas_epi_almoxarifado WHERE numero = ?', [numero]), 0);
    assert.strictEqual(await contar(db, `SELECT COUNT(*) n FROM entregas_epi_almoxarifado WHERE material_id = ?`, [mat.id]), 0);
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mat.id])).q, 5);
    assert.deepStrictEqual(arquivosEpi(uploadsAlmoxDir), []);
  });

  // ── C1: compensacao ─────────────────────────────────────────────────────────────────────────
  await test('[C1] a transacao falha depois da saida -> 500, a saida estornada pela compensacao, nenhuma entrega/evidencia, sem orfao', async () => {
    limparDisco();
    const mat = await criarEpi(db, { qtd: 5 });
    const col = await criarColaborador(db);
    const antesEnt = await contar(db, 'SELECT COUNT(*) n FROM entregas_epi_almoxarifado');
    const antesEv = await contar(db, 'SELECT COUNT(*) n FROM evidencias_assinatura_almoxarifado');
    let movDoGancho = null;
    let renomeou = false;
    // A segunda tabela some: o INSERT da entrega roda dentro da transacao e o da evidencia falha -> ROLLBACK das duas.
    epiService.ganchos.antesDaGravacao = async ({ movimentacaoId }) => {
      movDoGancho = movimentacaoId;
      await dbRun(db, 'ALTER TABLE evidencias_assinatura_almoxarifado RENAME TO evidencias_epi_sumida');
      renomeou = true;
    };
    let res;
    try {
      res = await postEntrega(app, { colaborador_id: col.id, material_id: mat.id, quantidade: 2 });
    } finally {
      epiService.ganchos.antesDaGravacao = null;
      if (renomeou) await dbRun(db, 'ALTER TABLE evidencias_epi_sumida RENAME TO evidencias_assinatura_almoxarifado');
    }
    assert.strictEqual(res.status, 500, JSON.stringify(res.body));
    assert.match(res.body.error, /^Não foi possível gravar a entrega de EPI — a saída do estoque foi desfeita\./);
    assert.ok(movDoGancho, 'o gancho nao rodou');
    const mov = await dbGet(db, 'SELECT cancelado, movimento_estorno_id FROM movimentacoes_almoxarifado WHERE id = ?', [movDoGancho]);
    assert.strictEqual(Number(mov.cancelado), 1, 'a saida nao foi estornada');
    assert.ok(mov.movimento_estorno_id, 'o estorno nao concluiu');
    assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mat.id])).q, 5);
    assert.strictEqual(await contar(db, 'SELECT COUNT(*) n FROM entregas_epi_almoxarifado'), antesEnt, 'entrega orfa');
    assert.strictEqual(await contar(db, 'SELECT COUNT(*) n FROM evidencias_assinatura_almoxarifado'), antesEv, 'evidencia orfa');
    assert.deepStrictEqual(arquivosEpi(uploadsAlmoxDir), [], 'arquivo orfao');
    // a tabela voltou com os triggers (o RENAME os leva junto)
    await assert.rejects(dbRun(db, 'DELETE FROM evidencias_assinatura_almoxarifado'), /evidencia de assinatura nao pode ser alterada/);
  });

  // ── Corrida: o motor decide ─────────────────────────────────────────────────────────────────
  await test('[corrida] duas entregas do ultimo item em paralelo (10 rodadas): uma 201, outra recusa de saldo, nada orfao', async () => {
    limparDisco();
    for (let rodada = 0; rodada < 10; rodada += 1) {
      const mat = await criarEpi(db, { qtd: 1 });
      const c1 = await criarColaborador(db);
      const c2 = await criarColaborador(db);
      const [a, b] = await Promise.all([
        postEntrega(app, { colaborador_id: c1.id, material_id: mat.id, quantidade: 1 }),
        postEntrega(app, { colaborador_id: c2.id, material_id: mat.id, quantidade: 1 }),
      ]);
      const status = [a.status, b.status].sort();
      assert.deepStrictEqual(status, [201, 400], `rodada ${rodada}: ${a.status} ${JSON.stringify(a.body)} / ${b.status} ${JSON.stringify(b.body)}`);
      const perdedor = a.status === 400 ? a : b;
      assert.match(perdedor.body.error, /insuficiente|dispon/i);
      assert.strictEqual(await contar(db, 'SELECT COUNT(*) n FROM entregas_epi_almoxarifado WHERE material_id = ?', [mat.id]), 1);
      assert.strictEqual(await contar(db, `SELECT COUNT(*) n FROM evidencias_assinatura_almoxarifado v
        JOIN entregas_epi_almoxarifado e ON e.id = v.contexto_id WHERE e.material_id = ?`, [mat.id]), 1);
      assert.strictEqual(await contar(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado
        WHERE material_id = ? AND tipo = 'SAIDA' AND COALESCE(cancelado, 0) = 0`, [mat.id]), 1);
      assert.strictEqual((await dbGet(db, 'SELECT quantidade_atual q FROM materiais_almoxarifado WHERE id = ?', [mat.id])).q, 0);
    }
    assert.strictEqual(arquivosEpi(uploadsAlmoxDir).length, 10, 'arquivo do perdedor ficou no disco (ou o do vencedor sumiu)');
  });

  // ── RN-178.10: aux/colaboradores ────────────────────────────────────────────────────────────
  await test('[RN-178.10] /aux/colaboradores: so os ativos, por nome, so id/nome/matricula/setor (sem CPF, sem salario)', async () => {
    await criarColaborador(db, { nome: 'AAA PRIMEIRO', cpf: '000.000.000-11' });
    await criarColaborador(db, { nome: 'AAA DESLIGADO', status: 'inativo' });
    const res = await request(app).get('/api/almoxarifado/aux/colaboradores');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.length > 0);
    for (const c of res.body) assert.deepStrictEqual(Object.keys(c).sort(), ['id', 'matricula', 'nome', 'setor']);
    assert.ok(res.body.some((c) => c.nome === 'AAA PRIMEIRO'));
    assert.ok(!res.body.some((c) => c.nome === 'AAA DESLIGADO'));
    const nomes = res.body.map((c) => c.nome);
    assert.deepStrictEqual(nomes, [...nomes].sort((x, y) => x.localeCompare(y, 'en', { sensitivity: 'base' })));
  });

  // ── I4: cadastro do material ────────────────────────────────────────────────────────────────
  await test('[I4] POST/PUT /materiais gravam ca_numero/ca_validade; validade invalida -> 400 literal; omitido preserva; vazio limpa', async () => {
    const fam = await dbGet(db, 'SELECT id FROM familias_material_almoxarifado WHERE parent_id IS NULL AND ativo = 1 ORDER BY id LIMIT 1');
    const ruim = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'CA-MAT-RUIM', nome: 'Capacete', familia_id: fam.id, ca_numero: 'CA-1', ca_validade: '2026-02-30' });
    assert.strictEqual(ruim.status, 400, JSON.stringify(ruim.body));
    assert.strictEqual(ruim.body.error, 'Validade do CA inválida');
    assert.ok(!(await dbGet(db, "SELECT id FROM materiais_almoxarifado WHERE codigo = 'CA-MAT-RUIM'")));
    const cri = await request(app).post('/api/almoxarifado/materiais').send({
      codigo: 'CA-MAT-1', nome: 'Capacete', familia_id: fam.id, categoria: 'EPIs', ca_numero: ' CA-4321 ', ca_validade: '2030-01-31' });
    assert.strictEqual(cri.status, 201, JSON.stringify(cri.body));
    let m = await dbGet(db, "SELECT * FROM materiais_almoxarifado WHERE codigo = 'CA-MAT-1'");
    assert.strictEqual(m.ca_numero, 'CA-4321');
    assert.strictEqual(m.ca_validade, '2030-01-31');
    const get = await request(app).get(`/api/almoxarifado/materiais/${m.id}`);
    assert.strictEqual(get.body.ca_numero, 'CA-4321');
    assert.strictEqual(get.body.ca_validade, '2030-01-31');
    for (const invalida of ['31/01/2030', '2030-13-01', 'amanha']) {
      const r = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ca_validade: invalida });
      assert.strictEqual(r.status, 400, `${invalida}: ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, 'Validade do CA inválida');
    }
    const pre = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ nome: 'Capacete aba' });
    assert.strictEqual(pre.status, 200, JSON.stringify(pre.body));
    m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(m.ca_validade, '2030-01-31', 'omitido nao preservou');
    const lim = await request(app).put(`/api/almoxarifado/materiais/${m.id}`).send({ ca_numero: 'CA-5', ca_validade: '' });
    assert.strictEqual(lim.status, 200, JSON.stringify(lim.body));
    m = await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [m.id]);
    assert.strictEqual(m.ca_numero, 'CA-5');
    assert.strictEqual(m.ca_validade, null);
    // campos_lidos (camposLidos.js): o formulario que leu o CA antigo nao desfaz o CA que outra pessoa mudou -> 409
    const velho = await request(app).put(`/api/almoxarifado/materiais/${m.id}`)
      .send({ nome: 'Capacete X', ca_numero: 'CA-4321', campos_lidos: { ca_numero: 'CA-4321', ca_validade: '2030-01-31' } });
    assert.strictEqual(velho.status, 409, JSON.stringify(velho.body));
    assert.ok(velho.body.error.includes('O campo "Número do CA"'), velho.body.error);
    assert.strictEqual((await dbGet(db, 'SELECT ca_numero FROM materiais_almoxarifado WHERE id = ?', [m.id])).ca_numero, 'CA-5');
  });

  await t.close();
  console.log(`\nepiEntrega: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
