/**
 * Etapa 15, Task 1 — assinatura digital na entrega de requisição (contratos C1/C2 do plano
 * 2026-08-28-almoxarifado-etapa15-mobilidade.md).
 *
 * RN-03: assinatura só em requisição ENTREGUE/PARCIALMENTE_ATENDIDA/ENCERRADA (409 literal fora
 * disso, órfão apagado). RN-04: append-only e auditada (ASSINATURA_ENTREGA). RN-05: escrita
 * gateada por separar_emitir (ADMINISTRADOR, ALMOXARIFE); leitura junto do detalhe, sem gate novo.
 *
 * ARMADILHA da matriz de perfis (achado da revisão do plano): os usuários NÃO podem carregar
 * role:'admin' — getPerfilFromUser resolve role admin ANTES de perfil_almoxarifado
 * (permissions.js:87) e a matriz passaria vazia (falso verde). Molde: permissoesRotas.api.test.js.
 *
 * Executar: cd server && node tests/api/requisicaoAssinaturaEntrega.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');

// PNG 1x1 válido para anexar sem depender de arquivo em disco
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

let seq = 0;
function numero() {
  seq += 1;
  return `REQ-ASSIN-${seq}`;
}

async function criarMaterial(db, codigo, overrides = {}) {
  const { qtd = 50 } = overrides;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
    (codigo, nome, quantidade_atual, ativo) VALUES (?,?,?,1)`,
    [codigo, `Material ${codigo}`, qtd]);
  return r.lastID;
}

async function criarRequisicao(db, { status, itens, solicitanteId = 1 }) {
  const reqRes = await dbRun(db, `INSERT INTO requisicoes_almoxarifado
    (numero, solicitante_id, solicitante_nome, status) VALUES (?, ?, 'Solicitante Teste', ?)`,
    [numero(), solicitanteId, status]);
  const reqId = reqRes.lastID;
  const itemIds = [];
  for (const item of itens) {
    const r = await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [reqId, item.material_id, item.quantidade ?? 1,
        item.quantidade_separada ?? 0, item.quantidade_entregue ?? 0, item.quantidade_entregue ?? 0]);
    itemIds.push(r.lastID);
  }
  return { id: reqId, itemIds };
}

function postAssinatura(app, reqId, recebedor = 'José da Silva') {
  return request(app).post(`/api/almoxarifado/requisicoes/${reqId}/assinatura-entrega`)
    .field('recebedor_nome', recebedor)
    .attach('assinatura', PNG_1PX, 'assinatura.png');
}

// Só os arquivos desta feature: outros testes/rotas não gravam `assinatura-*`, então a
// contagem é imune a vizinhos e prova o órfão apagado.
function contarAssinaturasDisco(uploadsAlmoxDir) {
  return fs.readdirSync(uploadsAlmoxDir).filter((f) => f.startsWith('assinatura-')).length;
}

(async () => {
  const ADMIN_USER = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
  const { app, db, close, setUser, uploadsAlmoxDir } = await createTestApp({ user: ADMIN_USER });
  const matId = await criarMaterial(db, 'ASSIN-MAT-1');

  // ── 1. feliz: ENTREGUE → 201, arquivo em disco, linha na tabela, auditoria ──
  await test('[POST] requisição ENTREGUE → 201 com arquivo em disco, linha e auditoria ASSINATURA_ENTREGA', async () => {
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 5, quantidade_entregue: 5 }],
    });

    const res = await postAssinatura(app, reqId, 'José da Silva');
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.success, true);
    const a = res.body.assinatura;
    assert.ok(a.id, 'esperava assinatura.id no 201');
    assert.strictEqual(a.recebedor_nome, 'José da Silva');
    assert.ok(a.arquivo_url.startsWith('/api/uploads/almoxarifado/assinatura-'),
      `arquivo_url fora do padrão: ${a.arquivo_url}`);
    assert.ok(a.criado_em, 'criado_em ausente');
    assert.strictEqual(a.criado_por_nome, 'Admin Teste');

    const filename = a.arquivo_url.split('/').pop();
    assert.ok(fs.existsSync(path.join(uploadsAlmoxDir, filename)),
      `arquivo não encontrado em ${path.join(uploadsAlmoxDir, filename)}`);

    const linha = await dbGet(db, 'SELECT * FROM assinaturas_entrega_almoxarifado WHERE id = ?', [a.id]);
    assert.strictEqual(linha.requisicao_id, reqId);
    assert.strictEqual(linha.recebedor_nome, 'José da Silva');
    assert.strictEqual(linha.arquivo, filename);
    assert.strictEqual(linha.criado_por, 1);

    const audit = await dbGet(db,
      `SELECT * FROM auditoria_log_almoxarifado
       WHERE entidade = 'requisicao' AND entidade_id = ? AND acao = 'ASSINATURA_ENTREGA'`, [reqId]);
    assert.ok(audit, 'sem auditoria ASSINATURA_ENTREGA');
    assert.ok(/José da Silva/.test(audit.dados_novos), `recebedor ausente em dados_novos: ${audit.dados_novos}`);
  });

  // ── 2. RN-03: APROVADA → 409 literal, zero linhas, órfão apagado ──
  await test('[RN-03] status APROVADA → 409 com mensagem literal, tabela vazia e órfão apagado', async () => {
    const { id: reqId } = await criarRequisicao(db, {
      status: 'APROVADA', itens: [{ material_id: matId, quantidade: 5 }],
    });
    const antes = contarAssinaturasDisco(uploadsAlmoxDir);

    const res = await postAssinatura(app, reqId);
    assert.strictEqual(res.status, 409, JSON.stringify(res.body));
    assert.strictEqual(res.body.error,
      'Só é possível registrar assinatura de entrega em requisição entregue (total ou parcialmente). Status atual: APROVADA.');

    const linhas = await dbAll(db, 'SELECT * FROM assinaturas_entrega_almoxarifado WHERE requisicao_id = ?', [reqId]);
    assert.strictEqual(linhas.length, 0, 'nenhuma linha deveria ter sido criada');
    assert.strictEqual(contarAssinaturasDisco(uploadsAlmoxDir), antes,
      'arquivo assinatura-* ficou órfão em disco depois do 409 — limparUploadOrfao não rodou');
  });

  // ── 3. RN-03: PARCIALMENTE_ATENDIDA e ENCERRADA também assinam ──
  await test('[RN-03] PARCIALMENTE_ATENDIDA e ENCERRADA → 201 (os dois aceitos)', async () => {
    for (const status of ['PARCIALMENTE_ATENDIDA', 'ENCERRADA']) {
      const { id: reqId } = await criarRequisicao(db, {
        status, itens: [{ material_id: matId, quantidade: 5, quantidade_entregue: 2 }],
      });
      const res = await postAssinatura(app, reqId);
      assert.strictEqual(res.status, 201, `${status}: ${JSON.stringify(res.body)}`);
    }
  });

  // ── 4. sem arquivo → 400 literal ──
  await test('[POST] sem arquivo → 400 com mensagem literal do contrato', async () => {
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 5, quantidade_entregue: 5 }],
    });
    const res = await request(app).post(`/api/almoxarifado/requisicoes/${reqId}/assinatura-entrega`)
      .field('recebedor_nome', 'José da Silva');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, "Assinatura é obrigatória — envie a imagem no campo 'assinatura'.");
  });

  // ── 5. recebedor_nome vazio → 400 do Zod e órfão apagado ──
  await test('[POST] recebedor_nome vazio → 400 "Dados inválidos — ..." e órfão apagado', async () => {
    const { id: reqId } = await criarRequisicao(db, {
      status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 5, quantidade_entregue: 5 }],
    });
    const antes = contarAssinaturasDisco(uploadsAlmoxDir);

    const res = await postAssinatura(app, reqId, '');
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.ok(/^Dados inválidos — /.test(res.body.error), `mensagem fora do padrão: ${res.body.error}`);
    assert.strictEqual(contarAssinaturasDisco(uploadsAlmoxDir), antes,
      'arquivo assinatura-* ficou órfão em disco depois do 400 do Zod');
  });

  // ── 6. id inexistente → 404 sem ponto (padrão da casa, almoxarifado.js:2147) ──
  await test('[POST] requisição inexistente → 404 "Requisição não encontrada" e órfão apagado', async () => {
    const antes = contarAssinaturasDisco(uploadsAlmoxDir);
    const res = await postAssinatura(app, 999999);
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.strictEqual(res.body.error, 'Requisição não encontrada');
    assert.strictEqual(contarAssinaturasDisco(uploadsAlmoxDir), antes,
      'arquivo assinatura-* ficou órfão em disco depois do 404');
  });

  // ── 7. RN-05: matriz dos 8 perfis no POST ──
  await test('[RN-05] matriz de perfis: só ADMINISTRADOR e ALMOXARIFE assinam; 403 sem órfão', async () => {
    const MATRIZ = [
      ['ADMINISTRADOR', 201],
      ['ALMOXARIFE', 201],
      ['COMPRAS', 403],
      ['PRODUCAO', 403],
      ['ENGENHARIA', 403],
      ['GESTOR', 403],
      ['CONSULTA', 403],
      [null, 403], // sem perfil → fallback PRODUCAO (permissions.js:89)
    ];
    for (let i = 0; i < MATRIZ.length; i++) {
      const [perfil, esperado] = MATRIZ[i];
      const { id: reqId } = await criarRequisicao(db, {
        status: 'ENTREGUE', itens: [{ material_id: matId, quantidade: 5, quantidade_entregue: 5 }],
      });
      // NUNCA role:'admin' aqui — resolveria ADMINISTRADOR antes do perfil e a matriz seria falso verde.
      const user = {
        id: 60 + i, nome: `Perfil ${perfil || 'SEM-PERFIL'}`, role: 'usuario',
        email: `perfil${i}@test.com`,
      };
      if (perfil) user.perfil_almoxarifado = perfil;
      setUser(user);

      const antes = contarAssinaturasDisco(uploadsAlmoxDir);
      const res = await postAssinatura(app, reqId);
      assert.strictEqual(res.status, esperado,
        `perfil ${perfil || 'sem-perfil'}: esperado ${esperado}, veio ${res.status} ${JSON.stringify(res.body)}`);
      if (esperado === 403) {
        assert.strictEqual(res.body.acao, 'separar_emitir', JSON.stringify(res.body));
        assert.strictEqual(contarAssinaturasDisco(uploadsAlmoxDir), antes,
          `perfil ${perfil || 'sem-perfil'}: multer gravou arquivo antes do 403 — requirePermission deve vir ANTES do multer`);
      }
    }
    setUser(ADMIN_USER);
  });

  // ── 8. RN-04: segunda assinatura → append, detalhe traz as duas em ordem ──
  await test('[RN-04] segunda assinatura na mesma requisição → 201 e detalhe traz as DUAS em ordem', async () => {
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PARCIALMENTE_ATENDIDA', itens: [{ material_id: matId, quantidade: 10, quantidade_entregue: 4 }],
    });
    const r1 = await postAssinatura(app, reqId, 'Maria Recebedora');
    assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
    const r2 = await postAssinatura(app, reqId, 'João Turno 2');
    assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));

    const det = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(det.status, 200, JSON.stringify(det.body));
    const lista = det.body.assinaturas_entrega;
    assert.ok(Array.isArray(lista), 'assinaturas_entrega deveria ser array no detalhe');
    assert.strictEqual(lista.length, 2, `esperava 2 assinaturas, veio ${lista.length}`);
    assert.strictEqual(lista[0].recebedor_nome, 'Maria Recebedora', 'ordem deveria ser criado_em ASC, id ASC');
    assert.strictEqual(lista[1].recebedor_nome, 'João Turno 2');
    for (const item of lista) {
      assert.ok('id' in item && 'recebedor_nome' in item && 'arquivo_url' in item
        && 'criado_em' in item && 'criado_por_nome' in item,
        `campos do contrato C2 ausentes: ${JSON.stringify(item)}`);
    }
  });

  // ── 9. C2: detalhe sempre expõe assinaturas_entrega ([] quando não há) ──
  await test('[C2] GET /requisicoes/:id sem assinaturas → assinaturas_entrega === []', async () => {
    const { id: reqId } = await criarRequisicao(db, {
      status: 'PENDENTE', itens: [{ material_id: matId, quantidade: 3 }],
    });
    const res = await request(app).get(`/api/almoxarifado/requisicoes/${reqId}`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(Array.isArray(res.body.assinaturas_entrega),
      `assinaturas_entrega ausente ou não-array: ${JSON.stringify(res.body.assinaturas_entrega)}`);
    assert.strictEqual(res.body.assinaturas_entrega.length, 0);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
