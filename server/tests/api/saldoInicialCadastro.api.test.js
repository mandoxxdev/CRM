/**
 * Etapa 110 (C215) — o Saldo Inicial do cadastro de material passa pelo motor de estoque.
 *
 * Ate a 110 `materialService.createMaterial` gravava a linha 'Saldo inicial de cadastro' com um INSERT direto no livro,
 * sem `registrarMovimentacao`: a Engenharia (criar_material, SEM movimentar) criava material com saldo; material com
 * lote, serie, inspecao obrigatoria ou de cliente nascia com saldo disponivel sem lote, sem serie, sem inspecao e sem
 * documento; a linha nao tinha trava, nem origem (ip/navegador). RN-01..RN-05 do plano da Etapa 110.
 *
 * Perfis EXPLICITOS em toda negativa: usuario sem perfil cai em PRODUCAO, nao em "sem acesso".
 *
 * Executar: cd server && node tests/api/saldoInicialCadastro.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
// Etapa 193 Fase 5 (R3b): o POST /api/almoxarifado/materiais so aceita, por padrao, o formato da sobra e da remessa (codigo,
// nome, unidade, familia/subfamilia, categoria, proprietario) — o resto do cadastro e no Compras. Este arquivo cria material
// com o cadastro completo (controles, saldo inicial, campos tecnicos) pela porta do almoxarifado para provar o handler, com a
// chave de reversao ligada (`ALMOX_CADASTRO_MATERIAL=liberado`, services/compras/cadastroDeMaterial.js). A recusa:
// cadastroSoNoCompras.
process.env.ALMOX_CADASTRO_MATERIAL = 'liberado';
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const materialService = require('../../services/almoxarifado/materialService');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const SUPER = { id: 1, nome: 'Super Teste', role: 'admin', is_superadmin: 1, email: 'super@test.com' };
const ADM_PERFIL = { id: 4, nome: 'Adm Perfil', role: 'user', email: 'adm@test.com', perfil_almoxarifado: 'ADMINISTRADOR' };
const ALMOXARIFE = { id: 3, nome: 'Almox Teste', role: 'user', email: 'almox@test.com', perfil_almoxarifado: 'ALMOXARIFE' };
const ENGENHARIA = { id: 6, nome: 'Eng Teste', role: 'user', email: 'eng@test.com', perfil_almoxarifado: 'ENGENHARIA' };

const E1 = (perfil) => `Cadastrar material com saldo inicial exige a permissão "movimentar" (seu perfil: ${perfil}) — `
  + 'o saldo inicial é uma entrada no estoque. Cadastre com saldo 0 e peça a quem movimenta o estoque para lançar a '
  + 'Entrada em Movimentações.';
const E2 = (codigo, motivos) => `O material ${codigo} não pode nascer com saldo inicial: ${motivos.join(', ')}. `
  + 'Cadastre com saldo 0 e lance a entrada depois — em Movimentações (Entrada, com o lote e as séries) ou pelo '
  + 'Recebimento (inspeção e material de cliente).';
const M_LOTE = 'tem controle por lote';
const M_SERIE = 'tem controle por número de série';
const M_INSP = 'exige inspeção';
const M_CLI = 'é de cliente';

(async () => {
  console.log('\n═══ Saldo inicial do cadastro pelo motor (Etapa 110, C215) ═══\n');
  const { app, db, setUser, close } = await createTestApp({ user: SUPER });
  const fam = (await dbRun(db, "INSERT INTO familias_material_almoxarifado (codigo, nome, ativo) VALUES ('E110', 'Familia E110', 1)")).lastID;
  const cli = (await dbRun(db, "INSERT INTO clientes (razao_social) VALUES ('Metalurgica Alfa LTDA')")).lastID;
  const loc = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, descricao, ativo) VALUES ('E110-L1', 'Prateleira 1', 1)")).lastID;

  let seq = 0;
  const novoCodigo = () => { seq += 1; return `E110-${seq}`; };
  const as = async (u, fn) => { setUser(u); try { return await fn(); } finally { setUser(SUPER); } };
  const post = (u, body) => as(u, () => request(app).post('/api/almoxarifado/materiais')
    .send({ nome: `Chapa ${seq}`, unidade: 'PC', categoria: 'OUTROS', familia_id: fam, custo_unitario: 10, ...body }));
  const materiaisCom = async (codigo) => (await dbGet(db, 'SELECT COUNT(*) n FROM materiais_almoxarifado WHERE codigo = ?', [codigo])).n;
  const criacoes = async (codigo) => (await dbGet(db, `SELECT COUNT(*) n FROM auditoria_log_almoxarifado
    WHERE entidade = 'material' AND acao = 'CRIACAO' AND json_extract(dados_novos, '$.codigo') = ?`, [codigo])).n;
  const livro = (id) => dbAll(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [id]);

  /* ── RN-01 ─────────────────────────────────────────────────────────────────────────────── */
  await test('[RN-01] Engenharia cadastra com saldo 5: 403 E1 e nada gravado (material, livro, auditoria)', async () => {
    const codigo = novoCodigo();
    const movsAntes = (await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado')).n;
    const r = await post(ENGENHARIA, { codigo, quantidade_atual: 5 });
    assert.strictEqual(r.status, 403, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, E1('ENGENHARIA'));
    assert.strictEqual(await materiaisCom(codigo), 0);
    assert.strictEqual(await criacoes(codigo), 0);
    assert.strictEqual((await dbGet(db, 'SELECT COUNT(*) n FROM movimentacoes_almoxarifado')).n, movsAntes);
  });

  await test('[RN-01] a recusa de permissao vem antes das outras: Engenharia com saldo, lote e familia inexistente -> 403 E1', async () => {
    const codigo = novoCodigo();
    const r = await post(ENGENHARIA, { codigo, quantidade_atual: 5, controle_lote: true, familia_id: 987654 });
    assert.strictEqual(r.status, 403, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, E1('ENGENHARIA'));
  });

  await test('[RN-01/RN-05] Engenharia sem saldo (0, omitido) continua cadastrando: 201 e livro vazio', async () => {
    for (const extra of [{ quantidade_atual: 0 }, {}]) {
      const codigo = novoCodigo();
      const r = await post(ENGENHARIA, { codigo, ...extra });
      assert.strictEqual(r.status, 201, `${JSON.stringify(extra)}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(Number(r.body.quantidade_atual), 0);
      assert.strictEqual((await livro(r.body.id)).length, 0);
    }
  });

  await test('[RN-01] Administrador por perfil e superadmin cadastram com saldo (201)', async () => {
    for (const u of [ADM_PERFIL, SUPER]) {
      const codigo = novoCodigo();
      const r = await post(u, { codigo, quantidade_atual: 3 });
      assert.strictEqual(r.status, 201, `${u.nome}: ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(Number(r.body.quantidade_atual), 3);
    }
  });

  /* ── RN-02 ─────────────────────────────────────────────────────────────────────────────── */
  const RECUSAS = [
    ['lote', { controle_lote: true }, [M_LOTE]],
    ['serie', { controle_serie: true }, [M_SERIE]],
    ['inspecao', { requer_inspecao: true }, [M_INSP]],
    ['cliente', { proprietario_cliente_id: cli }, [M_CLI]],
    ['lote + cliente', { controle_lote: true, proprietario_cliente_id: cli }, [M_LOTE, M_CLI]],
    ['os quatro', { requer_inspecao: 1, proprietario_cliente_id: cli, controle_serie: 1, controle_lote: 1 }, [M_LOTE, M_SERIE, M_INSP, M_CLI]],
  ];
  for (const [nome, flags, motivos] of RECUSAS) {
    await test(`[RN-02] Almoxarife cadastra com saldo material com ${nome}: 400 E2 nomeando ${motivos.length} motivo(s), nada gravado`, async () => {
      const codigo = novoCodigo();
      const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 4, ...flags });
      assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, E2(codigo, motivos));
      assert.strictEqual(await materiaisCom(codigo), 0);
      assert.strictEqual(await criacoes(codigo), 0);
    });
  }

  await test('[RN-02] a recusa do saldo vem antes da familia: lote + familia inexistente -> 400 E2 (nao "Família não encontrada")', async () => {
    const codigo = novoCodigo();
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 4, controle_lote: true, familia_id: 987654 });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.body.error, E2(codigo, [M_LOTE]));
  });

  await test('[RN-02/RN-05] com saldo 0 os quatro controles cadastram (201) e o livro fica vazio', async () => {
    const codigo = novoCodigo();
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 0, controle_lote: true, controle_serie: true,
      requer_inspecao: true, proprietario_cliente_id: cli });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((await livro(r.body.id)).length, 0);
  });

  await test('[RN-02] controle de validade, corrida e certificado nao recusam (a Entrada do motor nao os cobra)', async () => {
    const codigo = novoCodigo();
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 2, controle_validade: true, controle_corrida: true, controle_certificado: true });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(Number(r.body.quantidade_atual), 2);
  });

  /* ── RN-03 ─────────────────────────────────────────────────────────────────────────────── */
  await test('[RN-03] Almoxarife com saldo 5, sem localizacao: uma ENTRADA do motor (0 -> 5), com auditoria de movimentacao e origem', async () => {
    const codigo = novoCodigo();
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 5 });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(Number(r.body.quantidade_atual), 5);
    const linhas = await livro(r.body.id);
    assert.strictEqual(linhas.length, 1, JSON.stringify(linhas));
    const l = linhas[0];
    assert.strictEqual(l.tipo, 'ENTRADA');
    assert.strictEqual(Number(l.quantidade), 5);
    assert.strictEqual(Number(l.saldo_anterior), 0);
    assert.strictEqual(Number(l.saldo_posterior), 5);
    assert.strictEqual(l.motivo, 'Saldo inicial de cadastro');
    assert.strictEqual(Number(l.usuario_id), ALMOXARIFE.id);
    assert.strictEqual(l.localizacao_destino_id, null, 'sem padrao, sem destino');
    assert.strictEqual(l.unidade, 'PC', 'a linha do motor grava a unidade (o INSERT direto nao gravava)');
    const aud = await dbGet(db, `SELECT * FROM auditoria_log_almoxarifado WHERE entidade = 'movimentacao' AND entidade_id = ?`, [l.id]);
    assert.ok(aud, 'sem auditoria da movimentacao: a linha nao veio do motor');
    assert.strictEqual(aud.acao, 'ENTRADA');
    const dn = JSON.parse(aud.dados_novos);
    assert.ok(dn.ip || dn.user_agent, `sem origem na auditoria: ${aud.dados_novos}`);
    const saldo = await dbAll(db, 'SELECT localizacao_id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ?', [r.body.id]);
    assert.deepStrictEqual(saldo.map((s) => [s.localizacao_id, Number(s.quantidade)]), [[null, 5]]);
    assert.strictEqual(await criacoes(codigo), 1);
  });

  await test('[RN-03] com localizacao padrao o saldo cai nela; 2,5 em PC passa (como na Entrada); o custo do cadastro nao muda', async () => {
    const codigo = novoCodigo();
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 2.5, localizacao_padrao_id: loc, custo_unitario: 12.5 });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(Number(r.body.quantidade_atual), 2.5);
    const saldo = await dbAll(db, 'SELECT localizacao_id, quantidade FROM estoque_saldo_almoxarifado WHERE material_id = ? AND quantidade <> 0', [r.body.id]);
    assert.deepStrictEqual(saldo.map((s) => [s.localizacao_id, Number(s.quantidade)]), [[loc, 2.5]]);
    const m = await dbGet(db, 'SELECT custo_unitario, quantidade_atual FROM materiais_almoxarifado WHERE id = ?', [r.body.id]);
    assert.strictEqual(Number(m.custo_unitario), 12.5);
    const linhas = await livro(r.body.id);
    assert.strictEqual(linhas.length, 1);
    assert.strictEqual(linhas[0].localizacao_destino_id, loc, 'o livro diz onde o saldo inicial entrou (Fase 2, achado 1)');
  });

  await test('[RN-03] quantidade que arredonda a zero (1e-7) e saldo zero: nenhuma linha no livro, 201', async () => {
    const codigo = novoCodigo();
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 0.0000001 });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(Number(r.body.quantidade_atual), 0);
    assert.strictEqual((await livro(r.body.id)).length, 0);
  });

  await test('[RN-03/RN-04] padrao bloqueada: a recusa do motor (400) sobe e o material e desfeito; sem saldo, cadastra (201)', async () => {
    const lb = (await dbRun(db, "INSERT INTO localizacoes_almoxarifado (codigo, ativo, bloqueada) VALUES ('E110-LB', 1, 1)")).lastID;
    const codigo = novoCodigo();
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 2, localizacao_padrao_id: lb });
    assert.strictEqual(r.status, 400, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(r.body.error, 'Localização E110-LB está bloqueada');
    assert.strictEqual(await materiaisCom(codigo), 0);
    const r0 = await post(ALMOXARIFE, { codigo, localizacao_padrao_id: lb });
    assert.strictEqual(r0.status, 201, `${r0.status} ${JSON.stringify(r0.body)}`);
  });

  /* ── RN-04 ─────────────────────────────────────────────────────────────────────────────── */
  await test('[RN-04] o motor recusa depois do INSERT: o material e apagado, nenhuma CRIACAO, e o mesmo codigo cadastra depois', async () => {
    const codigo = novoCodigo();
    const original = stockService.registrarMovimentacao;
    stockService.registrarMovimentacao = async () => { throw Object.assign(new Error('falha injetada do motor'), { status: 422 }); };
    let erro = null;
    try {
      await materialService.createMaterial(db, ALMOXARIFE, { codigo, nome: 'Injetado', unidade: 'PC', familia_id: fam, quantidade_atual: 3 });
    } catch (e) { erro = e; } finally { stockService.registrarMovimentacao = original; }
    assert.ok(erro, 'createMaterial nao lancou');
    assert.strictEqual(erro.message, 'falha injetada do motor');
    assert.strictEqual(erro.status, 422);
    assert.strictEqual(await materiaisCom(codigo), 0, 'material ficou pela metade');
    assert.strictEqual(await criacoes(codigo), 0);
    const r = await post(ALMOXARIFE, { codigo, quantidade_atual: 3 });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual(Number(r.body.quantidade_atual), 3);
  });

  /* ── RN-05 ─────────────────────────────────────────────────────────────────────────────── */
  await test('[RN-05] o corpo que Remessas/Sobras mandam (sem quantidade_atual, com controles) cadastra pela Engenharia: 201', async () => {
    const codigo = novoCodigo();
    const r = await post(ENGENHARIA, { codigo, controle_lote: true, requer_inspecao: true, proprietario_cliente_id: cli });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.strictEqual((await livro(r.body.id)).length, 0);
  });

  await test('[contrato] motivosSaldoInicialRecusado e SALDO_INICIAL_MOTIVO exportados', async () => {
    assert.deepStrictEqual(materialService.motivosSaldoInicialRecusado({}), []);
    assert.deepStrictEqual(materialService.motivosSaldoInicialRecusado({ controle_lote: 0, proprietario_cliente_id: '' }), []);
    assert.deepStrictEqual(materialService.motivosSaldoInicialRecusado({ proprietario_cliente_id: 7, controle_lote: 1 }), [M_LOTE, M_CLI]);
    assert.strictEqual(materialService.SALDO_INICIAL_MOTIVO, 'Saldo inicial de cadastro');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
