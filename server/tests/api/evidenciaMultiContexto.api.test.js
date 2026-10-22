/**
 * Etapa 180 — T1 (RN-180.01, I2 e I4 da revisao da Fase 2): a cadeia de evidencias e MULTI-CONTEXTO.
 *
 * Ate a 180, `epiService.verificarCadeia` montava o registro so para o contexto ENTREGA_EPI e devolvia null para qualquer outro
 * — uma evidencia de termo de ferramenta gravada na mesma cadeia faria o EPI acusar "registro alterado". Agora cada contexto se
 * registra (`evidencia.registrarContexto(ctx, { montador, extras })`); a cadeia usa o montador do contexto da linha; contexto sem
 * montador -> 'contexto desconhecido'; os `extras` de cada contexto entram no fim. A rota e `GET /evidencias/cadeia/verificar`
 * (`entregar_epi` OU `gerenciar_ferramentas`); `/epi/cadeia/verificar` continua como apelido.
 *
 * Executar: cd server && node tests/api/evidenciaMultiContexto.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const { wrapDatabase } = require('../../services/sqliteConcurrency');
const stockService = require('../../services/almoxarifado/stockService');
const evidencia = require('../../services/almoxarifado/evidenciaAssinaturaService');
const permissions = require('../../services/almoxarifado/permissions');
require('../../services/almoxarifado/epiService');

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) {
    failed++; console.error(`  ✗ ${name}: ${String(e && e.message).replace(/\s*\n\s*/g, ' ').slice(0, 800)}`);
  }
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Almox', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const PRODUCAO = { id: 3, nome: 'Chao', email: 'chao@test.com' };
const ALHEIO = 'TESTE_ALHEIO';
const SEGREDO = () => process.env.EVIDENCIA_ASSINATURA_SECRET;

/** O montador do contexto alheio: so os campos da propria evidencia (o "registro" do contexto e a linha dela). */
const camposAlheios = (ev) => ({
  contexto: evidencia.texto(ev.contexto), contexto_id: evidencia.numero(ev.contexto_id),
  arquivo: evidencia.texto(ev.arquivo), arquivo_sha256: evidencia.texto(ev.arquivo_sha256),
  criado_em: evidencia.texto(ev.criado_em), sequencia: evidencia.numero(ev.sequencia), hash_anterior: evidencia.texto(ev.hash_anterior),
});
const registrarAlheio = (extras = null) => evidencia.registrarContexto(ALHEIO, { montador: async () => async (ev) => camposAlheios(ev), extras });

(async () => {
  const t = await createTestApp({ user: ADMIN });
  wrapDatabase(t.db);
  const { app, db, uploadsAlmoxDir } = t;
  fs.mkdirSync(uploadsAlmoxDir, { recursive: true });

  const mat = (await dbRun(db, `INSERT INTO materiais_almoxarifado (codigo, nome, categoria, quantidade_atual, ativo, ca_numero, ca_validade)
    VALUES ('EPI-MC-1', 'Luva', 'EPIs', 0, 1, 'CA-1', '2099-12-31')`)).lastID;
  await stockService.registrarMovimentacao(db, ADMIN, { material_id: mat, tipo: 'ENTRADA', quantidade: 20, justificativa: 'carga' });
  const col = (await dbRun(db, "INSERT INTO colaboradores (nome, matricula, cpf, status, setor) VALUES ('ANA', 'M1', '1', 'ativo', 'Solda')")).lastID;
  const entregar = async () => {
    const r = await request(app).post('/api/almoxarifado/epi/entregas')
      .field('colaborador_id', String(col)).field('material_id', String(mat)).field('quantidade', '1')
      .field('confirmacao_matricula', 'M1')
      .attach('assinatura', PNG_1PX, { filename: 'a.png', contentType: 'image/png' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    return r.body;
  };
  /** Uma evidencia de OUTRO contexto, gravada na mesma cadeia (fila, cabeca, elo, HMAC com o montador alheio). */
  let alheioId = 100;
  const gravarAlheia = async () => {
    alheioId += 1;
    const arquivo = `alheio-${alheioId}.png`;
    fs.writeFileSync(path.join(uploadsAlmoxDir, arquivo), PNG_1PX);
    await evidencia.naFilaDaCadeia(async () => {
      const cabeca = await evidencia.cabecaDaCadeia(db);
      const ev = { contexto: ALHEIO, contexto_id: alheioId, colaborador_id: col, colaborador_nome: 'ANA', arquivo,
        arquivo_sha256: evidencia.sha256(PNG_1PX), criado_em: new Date().toISOString(),
        sequencia: cabeca ? cabeca.sequencia + 1 : 1, hash_anterior: cabeca ? cabeca.registro_sha256 : null };
      ev.registro_sha256 = evidencia.registroHmac(camposAlheios(ev), SEGREDO());
      const cols = Object.keys(ev);
      await dbRun(db, `INSERT INTO evidencias_assinatura_almoxarifado (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
        cols.map((c) => ev[c]));
    });
  };
  const cadeia = async (caminho = '/api/almoxarifado/evidencias/cadeia/verificar') => {
    const r = await request(app).get(caminho);
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };

  registrarAlheio();
  const e1 = await entregar();
  await gravarAlheia();
  const e2 = await entregar();

  await test('[RN-180.01] o EPI e o contexto alheio registrados: a cadeia mista (EPI, alheio, EPI) e integra, pelas duas rotas', async () => {
    const c = await cadeia();
    assert.deepStrictEqual(c.problemas, []);
    assert.strictEqual(c.integra, true);
    assert.strictEqual(c.total, 3);
    const apelido = await cadeia('/api/almoxarifado/epi/cadeia/verificar');
    assert.deepStrictEqual(apelido, c, 'o apelido /epi/cadeia/verificar responde diferente');
  });

  await test('[RN-180.01] a entrega de EPI depois da evidencia alheia continua integra no /verificar (o elo com a alheia bate)', async () => {
    for (const e of [e1, e2]) {
      const r = await request(app).get(`/api/almoxarifado/epi/entregas/${e.id}/verificar`);
      assert.deepStrictEqual(r.body, { integro: true }, `entrega ${e.id}`);
    }
  });

  await test('[RN-180.01] contexto SEM montador -> "contexto desconhecido" (e nao "registro alterado"); o EPI nao acusa nada', async () => {
    evidencia.removerContexto(ALHEIO);
    try {
      const c = await cadeia();
      const ev = await dbGet(db, 'SELECT id, sequencia FROM evidencias_assinatura_almoxarifado WHERE contexto = ?', [ALHEIO]);
      assert.deepStrictEqual(c.problemas, [{ sequencia: Number(ev.sequencia), evidencia_id: ev.id, numero: null, motivo: 'contexto desconhecido' }]);
      assert.strictEqual(c.integra, false);
    } finally { registrarAlheio(); }
  });

  await test('[I2] os extras de cada contexto entram no fim da cadeia (e derrubam o "integra")', async () => {
    registrarAlheio(async () => [{ sequencia: null, evidencia_id: null, numero: 'ALH-1', motivo: 'termo sem evidência' }]);
    try {
      const c = await cadeia();
      assert.deepStrictEqual(c.problemas, [{ sequencia: null, evidencia_id: null, numero: 'ALH-1', motivo: 'termo sem evidência' }]);
      assert.strictEqual(c.integra, false);
    } finally { registrarAlheio(); }
    assert.strictEqual((await cadeia()).integra, true);
  });

  await test('[RN-180.01] controle: a evidencia alheia adulterada (o arquivo) e acusada pelo montador DELA', async () => {
    const ev = await dbGet(db, 'SELECT arquivo FROM evidencias_assinatura_almoxarifado WHERE contexto = ?', [ALHEIO]);
    const caminho = path.join(uploadsAlmoxDir, ev.arquivo);
    const original = fs.readFileSync(caminho);
    const trocado = Buffer.from(original); trocado[trocado.length - 1] ^= 0xff;
    fs.writeFileSync(caminho, trocado);
    try {
      const c = await cadeia();
      assert.deepStrictEqual(c.problemas.map((p) => p.motivo), ['arquivo alterado']);
    } finally { fs.writeFileSync(caminho, original); }
  });

  await test('[I4] porta: PRODUCAO -> 403 nas duas rotas; a resposta lista as acoes aceitas', async () => {
    t.setUser(PRODUCAO);
    try {
      for (const caminho of ['/api/almoxarifado/evidencias/cadeia/verificar', '/api/almoxarifado/epi/cadeia/verificar']) {
        const r = await request(app).get(caminho);
        assert.strictEqual(r.status, 403, caminho);
        assert.deepStrictEqual(r.body.acoes, ['entregar_epi', 'gerenciar_ferramentas']);
      }
    } finally { t.setUser(ADMIN); }
  });

  await test('[I4] porta: "entregar_epi OU gerenciar_ferramentas" — so com gerenciar_ferramentas passa; sem as duas, 403', async () => {
    const original = permissions.ACAO_PERFIS.entregar_epi;
    const originalFerr = permissions.ACAO_PERFIS.gerenciar_ferramentas;
    t.setUser(ALMOXARIFE);
    try {
      permissions.ACAO_PERFIS.entregar_epi = ['ADMINISTRADOR'];
      assert.strictEqual((await request(app).get('/api/almoxarifado/evidencias/cadeia/verificar')).status, 200);
      permissions.ACAO_PERFIS.gerenciar_ferramentas = ['ADMINISTRADOR'];
      assert.strictEqual((await request(app).get('/api/almoxarifado/evidencias/cadeia/verificar')).status, 403);
      permissions.ACAO_PERFIS.entregar_epi = original;
      assert.strictEqual((await request(app).get('/api/almoxarifado/evidencias/cadeia/verificar')).status, 200);
    } finally {
      permissions.ACAO_PERFIS.entregar_epi = original;
      permissions.ACAO_PERFIS.gerenciar_ferramentas = originalFerr;
      t.setUser(ADMIN);
    }
  });

  await test('[T1] a extracao: identificacaoColaborador exporta a regua e o epiService nao a redefine', async () => {
    const ident = require('../../services/almoxarifado/identificacaoColaborador');
    for (const f of ['colaboradorAtivo', 'conferirMatricula', 'conferirPng', 'chaveIdempotencia']) {
      assert.strictEqual(typeof ident[f], 'function', f);
    }
    const fonte = fs.readFileSync(path.join(__dirname, '../../services/almoxarifado/epiService.js'), 'utf8');
    assert.ok(!/function (colaboradorAtivo|conferirMatricula|conferirPng|chaveIdempotencia)\b/.test(fonte), 'o epiService ainda define a regua');
    assert.throws(() => ident.chaveIdempotencia('x y'), /Chave de idempotência inválida/);
    assert.throws(() => ident.conferirMatricula({ nome: 'ANA', matricula: 'M1' }, 'M2'), /não confere/);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
