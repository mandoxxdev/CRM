/**
 * Etapa 9, Task 6 — sucateamento: SOLICITAR, CANCELAR, LISTAR e os schemas.
 *
 * A dupla aprovacao e a baixa pelo motor moram no arquivo irmao
 * (`sucateamentoAprovacao.api.test.js`). Aqui fica a PORTA DE ENTRADA do processo, e ela e onde
 * quase toda recusa acontece: o design (decisao 9) manda o sucateamento recusar JA NA SOLICITACAO
 * o que a baixa recusaria so na segunda assinatura — porque descobrir na aprovacao final que o
 * material era de um cliente e faltava a OS dele significa ter juntado duas assinaturas para
 * nada, e uma delas ja consumida (a perna assinada nao pode ser "des-assinada" sem compensacao).
 *
 * ── O QUE ESTE ARQUIVO PROVA QUE LEITURA NAO PROVA ───────────────────────────────────────────
 *
 * 1. Que a pre-checagem do dono usa a GUARDA DE VERDADE (ownerRules.assertSaidaPermitida), e nao
 *    uma segunda copia da regra escrita aqui: os testes conferem a MENSAGEM da guarda (nomeia os
 *    dois clientes) e o caso do projeto interno (cliente_id NULL nao e coringa).
 * 2. Que o disponivel checado e o DISPONIVEL (com retencao), nao `quantidade_atual` — o teste da
 *    quantidade reservada cai se alguem trocar a formula por um SELECT ingenuo.
 * 3. Que solicitar NAO MOVE ESTOQUE. E metade do "sucatear sem aprovacao falha" da spec 15: a
 *    outra metade (uma perna so nao baixa) esta no arquivo irmao.
 *
 * Executar: cd server && node tests/api/sucateamento.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const scrapDisposalService = require('../../services/almoxarifado/scrapDisposalService');
const { SucateamentoCreateSchema, SucateamentoDestinoSchema } = require('../../services/almoxarifado/schemas');
const { ACAO_PERFIS, can } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const ALMOXARIFE = { id: 2, nome: 'Ana Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' };
const GESTOR = { id: 3, nome: 'Gil Gestor', perfil_almoxarifado: 'GESTOR' };
const PRODUCAO = { id: 4, nome: 'Pedro Producao', perfil_almoxarifado: 'PRODUCAO' };

let seq = 0;
async function novoMaterial(db, {
  atual = 100, reservada = 0, controle_lote = 0, controle_serie = 0, dono = null, ativo = 1,
} = {}) {
  seq += 1;
  const codigo = `SUC-${seq}`;
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_reservada, controle_lote,
       controle_serie, proprietario_cliente_id, tipo_material, ativo)
    VALUES (?,?,'UN',?,?,?,?,?,'ACO',?)`,
  [codigo, `Material sucateavel ${seq}`, atual, reservada, controle_lote, controle_serie, dono, ativo]);
  return { id: r.lastID, codigo };
}

const est = async (db, id) => dbGet(db,
  'SELECT quantidade_atual, quantidade_reservada FROM materiais_almoxarifado WHERE id = ?', [id]);

const movsDe = async (db, materialId) => dbAll(db,
  'SELECT * FROM movimentacoes_almoxarifado WHERE material_id = ? ORDER BY id', [materialId]);

const linha = async (db, id) => dbGet(db, 'SELECT * FROM sucateamentos_almoxarifado WHERE id = ?', [id]);

const logDe = async (db, id) => dbAll(db,
  "SELECT * FROM auditoria_log_almoxarifado WHERE entidade='sucateamento' AND entidade_id=? ORDER BY id", [id]);

const BASE = { quantidade: 10, justificativa: 'chapa oxidada, sem recuperacao possivel' };

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  // `projetos` e `ordens_servico` sao tabelas CORE (criadas por server/index.js no boot), fora do
  // initSchema do almoxarifado — o harness nao as monta. Mesmo precedente de
  // materialClienteGuardaSaida.api.test.js: subconjunto minimo do que a guarda do dono le.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS projetos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, nome TEXT, status TEXT)`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
    id INTEGER PRIMARY KEY AUTOINCREMENT, numero_os TEXT, cliente_id INTEGER,
    projeto_id INTEGER, status TEXT)`);

  const cliA = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Alfa LTDA'])).lastID;
  const cliB = (await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Beta SA'])).lastID;
  const projA = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?,?)', [cliA, 'Projeto Alfa'])).lastID;
  const projB = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (?,?)', [cliB, 'Projeto Beta'])).lastID;
  const projInterno = (await dbRun(db, 'INSERT INTO projetos (cliente_id, nome) VALUES (NULL,?)', ['Projeto Interno'])).lastID;
  const osA = (await dbRun(db, 'INSERT INTO ordens_servico (numero_os, cliente_id, projeto_id) VALUES (?,?,?)',
    ['OS-ALFA-9', cliA, projA])).lastID;

  // ── A tabela ────────────────────────────────────────────────────────────────────────────────
  await test('[schema] a tabela sucateamentos_almoxarifado nasce com as colunas do design', async () => {
    const cols = (await dbAll(db, 'PRAGMA table_info(sucateamentos_almoxarifado)')).map((c) => c.name);
    for (const c of ['id', 'material_id', 'lote_id', 'sobra_id', 'quantidade', 'classificacao',
      'peso_estimado', 'projeto_origem_id', 'os_origem_id', 'justificativa', 'status',
      'solicitante_id', 'solicitante_nome',
      'aprovador_almox_id', 'aprovador_almox_nome', 'aprovado_almox_em',
      'aprovador_gestao_id', 'aprovador_gestao_nome', 'aprovado_gestao_em',
      'rejeitado_por_id', 'rejeitado_por_nome', 'motivo_rejeicao', 'rejeitado_em',
      'movimentacao_sucata_id', 'valor_venda', 'comprovante_arquivo',
      'destino_registrado_por_id', 'destino_registrado_por_nome', 'destino_registrado_em',
      'observacoes', 'created_at', 'updated_at']) {
      assert.ok(cols.includes(c), `coluna ausente na tabela de sucateamento: ${c}`);
    }
  });

  // ── Solicitar: o caminho feliz, e o que ele NAO faz ─────────────────────────────────────────
  await test('solicitar cria a linha em SOLICITADO e NAO move estoque nenhum', async () => {
    const m = await novoMaterial(db, { atual: 100 });
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, {
      material_id: m.id, quantidade: 12, justificativa: 'sobras de corte sem reaproveitamento',
      classificacao: 'aco carbono', peso_estimado: 34.5, observacoes: 'caçamba 3',
    });

    assert.ok(s && s.id, 'solicitar nao devolveu a linha criada');
    const row = await linha(db, s.id);
    assert.strictEqual(row.status, 'SOLICITADO');
    assert.strictEqual(row.material_id, m.id);
    assert.strictEqual(row.quantidade, 12);
    assert.strictEqual(row.justificativa, 'sobras de corte sem reaproveitamento');
    assert.strictEqual(row.classificacao, 'aco carbono');
    assert.strictEqual(row.peso_estimado, 34.5);
    assert.strictEqual(row.solicitante_id, PRODUCAO.id, 'nao gravou quem solicitou');
    assert.strictEqual(row.solicitante_nome, PRODUCAO.nome);
    assert.strictEqual(row.aprovador_almox_id, null);
    assert.strictEqual(row.aprovador_gestao_id, null);
    assert.strictEqual(row.movimentacao_sucata_id, null, 'a solicitacao ja nasceu com baixa emitida');

    // METADE do "sucatear sem aprovacao falha" (spec 15): solicitar nao e sucatear.
    assert.strictEqual((await est(db, m.id)).quantidade_atual, 100, 'a solicitacao baixou o estoque');
    assert.strictEqual((await movsDe(db, m.id)).length, 0, 'a solicitacao lancou movimentacao no livro');
  });

  await test('solicitar audita (entidade sucateamento, acao solicitar)', async () => {
    const m = await novoMaterial(db, { atual: 50 });
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id });
    const log = await logDe(db, s.id);
    assert.strictEqual(log.length, 1, `esperava 1 linha de auditoria, achou ${log.length}`);
    assert.strictEqual(log[0].acao, 'solicitar');
    assert.strictEqual(log[0].usuario_id, PRODUCAO.id);
    assert.ok(log[0].justificativa, 'a auditoria da solicitacao nao guardou a justificativa');
    const novos = JSON.parse(log[0].dados_novos);
    assert.strictEqual(novos.material_id, m.id);
    assert.strictEqual(novos.quantidade, BASE.quantidade);
  });

  // ── Justificativa: o motor exige na baixa; aqui ela nasce obrigatoria ────────────────────────
  await test('solicitar sem justificativa e recusado (o motor exigiria so na 2a assinatura)', async () => {
    const m = await novoMaterial(db, { atual: 50 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { material_id: m.id, quantidade: 5 }),
      /justificativa/i,
      'aceitou sucateamento sem justificativa — a baixa quebraria so na aprovacao final');
    assert.strictEqual((await dbAll(db, 'SELECT id FROM sucateamentos_almoxarifado WHERE material_id = ?', [m.id])).length, 0,
      'gravou a linha mesmo recusando');
  });

  await test('[schema] SucateamentoCreateSchema exige material, quantidade e justificativa', async () => {
    assert.ok(!SucateamentoCreateSchema.safeParse({ quantidade: 1, justificativa: 'x' }).success,
      'aceitou payload sem material_id');
    assert.ok(!SucateamentoCreateSchema.safeParse({ material_id: 1, justificativa: 'x' }).success,
      'aceitou payload sem quantidade');
    assert.ok(!SucateamentoCreateSchema.safeParse({ material_id: 1, quantidade: 1 }).success,
      'aceitou payload sem justificativa');
    assert.ok(!SucateamentoCreateSchema.safeParse({ material_id: 1, quantidade: 1, justificativa: '   ' }).success,
      'aceitou justificativa em branco');
    assert.ok(!SucateamentoCreateSchema.safeParse({ material_id: 1, quantidade: 0, justificativa: 'x' }).success,
      'aceitou quantidade zero');
  });

  await test('[schema] SucateamentoCreateSchema preserva os campos que o servico usa', async () => {
    // z.object DESCARTA chave nao declarada em silencio: campo do design que falte aqui chega como
    // `undefined` no servico e some sem erro nenhum (molde do teste da 8c/Task 3).
    const r = SucateamentoCreateSchema.safeParse({
      material_id: 1, quantidade: 3, justificativa: 'refugo',
      lote_id: 7, sobra_id: 8, classificacao: 'inox', peso_estimado: 12.5,
      projeto_origem_id: 9, os_origem_id: 10, observacoes: 'caçamba 2',
    });
    assert.ok(r.success, JSON.stringify(r.error && r.error.issues));
    for (const k of ['lote_id', 'sobra_id', 'classificacao', 'peso_estimado', 'projeto_origem_id',
      'os_origem_id', 'observacoes']) {
      assert.ok(k in r.data, `o schema descartou o campo ${k} — ele nunca chegaria ao servico`);
    }
  });

  await test('[schema] SucateamentoDestinoSchema: VENDIDA exige valor_venda > 0, DESCARTADA nao', async () => {
    assert.ok(!SucateamentoDestinoSchema.safeParse({ destino: 'VENDIDA' }).success,
      'aceitou venda sem valor');
    assert.ok(!SucateamentoDestinoSchema.safeParse({ destino: 'VENDIDA', valor_venda: 0 }).success,
      'aceitou venda com valor zero');
    assert.ok(SucateamentoDestinoSchema.safeParse({ destino: 'VENDIDA', valor_venda: 120.5 }).success,
      'recusou venda com valor valido');
    assert.ok(SucateamentoDestinoSchema.safeParse({ destino: 'DESCARTADA' }).success,
      'recusou descarte sem valor de venda');
    assert.ok(!SucateamentoDestinoSchema.safeParse({ destino: 'APROVADO' }).success,
      'aceitou destino que nao e final');
    const comArquivo = SucateamentoDestinoSchema.safeParse({
      destino: 'DESCARTADA', comprovante_arquivo: 'uploads/x.pdf' });
    assert.ok(comArquivo.success && 'comprovante_arquivo' in comArquivo.data,
      'o schema descartou comprovante_arquivo');
  });

  // ── Lote ────────────────────────────────────────────────────────────────────────────────────
  await test('material com controle_lote exige lote na solicitacao', async () => {
    const m = await novoMaterial(db, { atual: 50, controle_lote: 1 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id }),
      /lote/i,
      'material com controle de lote foi solicitado sem lote — a baixa quebraria na 2a assinatura');
  });

  await test('[CONTROLE POSITIVO] material SEM controle_lote e solicitado sem lote', async () => {
    // Sem este controle, uma exigencia escrita larga demais (para todo material) passaria no teste
    // acima e travaria a operacao normal, que e o material sem controle de lote.
    const m = await novoMaterial(db, { atual: 50 });
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id });
    assert.strictEqual((await linha(db, s.id)).lote_id, null);
  });

  await test('lote de OUTRO material e recusado', async () => {
    const m = await novoMaterial(db, { atual: 50, controle_lote: 1 });
    const outro = await novoMaterial(db, { atual: 50, controle_lote: 1 });
    const loteDoOutro = (await dbRun(db,
      "INSERT INTO lotes_almoxarifado (material_id, codigo, status) VALUES (?,?,'ATIVO')",
      [outro.id, `LOTE-OUTRO-${seq}`])).lastID;
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, lote_id: loteDoOutro }),
      /outro material/i);
  });

  // ── Disponivel ──────────────────────────────────────────────────────────────────────────────
  await test('material sucateado fora do disponivel e recusado (o teste nomeado da spec 15)', async () => {
    const m = await novoMaterial(db, { atual: 8 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, quantidade: 20 }),
      (e) => {
        assert.ok(/dispon/i.test(e.message), `a recusa nao fala de disponivel: ${e.message}`);
        // O codigo do material sai da mensagem antes de procurar o numero: `SUC-8` faria esta
        // assercao passar sem a recusa ter dito quanto ha disponivel de verdade.
        const semCodigo = e.message.split(m.codigo).join('');
        assert.ok(/\b8\b/.test(semCodigo), `a recusa nao diz QUANTO ha disponivel: ${e.message}`);
        assert.ok(/\b20\b/.test(semCodigo), `a recusa nao diz quanto foi pedido: ${e.message}`);
        return true;
      });
    assert.strictEqual((await dbAll(db, 'SELECT id FROM sucateamentos_almoxarifado WHERE material_id = ?', [m.id])).length, 0);
  });

  await test('a conta e o DISPONIVEL (com retencao), nao quantidade_atual', async () => {
    // Cai se alguem trocar `disponivelSql` por um SELECT ingenuo de quantidade_atual: 100 na
    // prateleira, 95 reservados para outra OS — sucatear 20 tiraria material comprometido.
    const m = await novoMaterial(db, { atual: 100, reservada: 95 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, quantidade: 20 }),
      /dispon/i,
      'sucateou material reservado — a pre-checagem esta olhando quantidade_atual');
    // CONTROLE POSITIVO: dentro do disponivel (5) passa.
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, quantidade: 5 });
    assert.strictEqual((await linha(db, s.id)).status, 'SOLICITADO');
  });

  // ── Material de cliente: a guarda do dono, ANTES de juntar assinaturas ───────────────────────
  await test('material de cliente sem projeto/OS e recusado com a mensagem da guarda do dono', async () => {
    // SUCATA esta em ownerRules.TIPOS_SAIDA_COM_DONO: a baixa exigiria OS/projeto DO DONO. Recusar
    // so na 2a assinatura significaria ter juntado duas assinaturas para nada.
    const m = await novoMaterial(db, { atual: 50, dono: cliA });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id }),
      (e) => {
        assert.ok(/Alfa/.test(e.message), `a recusa nao nomeia o cliente dono: ${e.message}`);
        assert.ok(e.message.includes(m.codigo), `a recusa nao cita o codigo do material: ${e.message}`);
        assert.ok(/OS ou projeto/i.test(e.message), `a recusa nao ensina o caminho: ${e.message}`);
        return true;
      });
    assert.strictEqual((await dbAll(db, 'SELECT id FROM sucateamentos_almoxarifado WHERE material_id = ?', [m.id])).length, 0);
  });

  await test('material de cliente com projeto de OUTRO cliente e recusado nomeando os dois', async () => {
    const m = await novoMaterial(db, { atual: 50, dono: cliA });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, projeto_origem_id: projB }),
      (e) => {
        assert.ok(/Alfa/.test(e.message) && /Beta/.test(e.message),
          `a recusa nao nomeia os dois clientes: ${e.message}`);
        return true;
      });
  });

  await test('material de cliente com projeto INTERNO (cliente_id NULL) e recusado — NULL nao e coringa', async () => {
    const m = await novoMaterial(db, { atual: 50, dono: cliA });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, projeto_origem_id: projInterno }),
      /Alfa/);
  });

  await test('[CONTROLE POSITIVO] material de cliente COM projeto (e com OS) do dono passa', async () => {
    // Sem este controle, uma guarda escrita ao contrario (recusar sempre que houver dono) passaria
    // nos tres testes acima e tornaria impossivel sucatear material de cliente — que e caso real
    // (a chapa do cliente enferrujou no patio) e o que a guarda existe para VINCULAR, nao proibir.
    const m = await novoMaterial(db, { atual: 50, dono: cliA });
    const comProjeto = await scrapDisposalService.solicitar(db, PRODUCAO, {
      ...BASE, material_id: m.id, projeto_origem_id: projA });
    assert.strictEqual((await linha(db, comProjeto.id)).projeto_origem_id, projA);
    const comOs = await scrapDisposalService.solicitar(db, PRODUCAO, {
      ...BASE, material_id: m.id, os_origem_id: osA });
    assert.strictEqual((await linha(db, comOs.id)).os_origem_id, osA);
  });

  // ── controle_serie: recusa que ENSINA o caminho ──────────────────────────────────────────────
  await test('material com controle_serie e recusado, ensinando a tela que tem seletor de serie', async () => {
    // O processo nao tem campo de serie. A baixa sairia sem reivindicar serie e quebraria na hora
    // o invariante da Etapa 6b (COUNT(series presentes) == quantidade_atual) — e ela aconteceria
    // na 2a assinatura, com duas assinaturas ja gastas. Precedentes: scrapService.gerarRetalho e
    // returnService (devolucao com serie em destino nao suportado).
    const m = await novoMaterial(db, { atual: 50, controle_serie: 1 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id }),
      (e) => {
        assert.ok(/serie/i.test(e.message), `a recusa nao fala de serie: ${e.message}`);
        assert.ok(/Movimenta/i.test(e.message), `a recusa nao ensina o caminho alternativo: ${e.message}`);
        return true;
      });
  });

  // ── Cadastros que nao existem ───────────────────────────────────────────────────────────────
  await test('material inexistente e material inativo sao recusados', async () => {
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: 999999 }),
      /material/i);
    const inativo = await novoMaterial(db, { atual: 50, ativo: 0 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: inativo.id }),
      /inativ/i);
  });

  await test('sobra_id inexistente e recusado (vinculo que aponta para o nada e pior que vinculo nenhum)', async () => {
    const m = await novoMaterial(db, { atual: 50 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, sobra_id: 999999 }),
      /sobra/i);
  });

  await test('[CONTROLE POSITIVO] sobra existente e gravada no vinculo', async () => {
    const m = await novoMaterial(db, { atual: 50 });
    const sobraId = (await dbRun(db,
      "INSERT INTO sobras_material_almoxarifado (material_id, status) VALUES (?, 'DISPONIVEL')", [m.id])).lastID;
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id, sobra_id: sobraId });
    assert.strictEqual((await linha(db, s.id)).sobra_id, sobraId);
  });

  await test('usuario sem id e recusado (nao ha solicitante para segregar depois)', async () => {
    const m = await novoMaterial(db, { atual: 50 });
    await assert.rejects(
      () => scrapDisposalService.solicitar(db, {}, { ...BASE, material_id: m.id }),
      /usuario/i);
  });

  // ── Cancelar ────────────────────────────────────────────────────────────────────────────────
  await test('cancelar pelo solicitante leva a CANCELADO e audita', async () => {
    const m = await novoMaterial(db, { atual: 50 });
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id });
    await scrapDisposalService.cancelar(db, PRODUCAO, s.id);
    assert.strictEqual((await linha(db, s.id)).status, 'CANCELADO');
    assert.strictEqual((await est(db, m.id)).quantidade_atual, 50, 'cancelar mexeu em saldo');
    const log = await logDe(db, s.id);
    assert.ok(log.some((l) => l.acao === 'cancelar'), 'nao auditou o cancelamento');
  });

  await test('cancelar por OUTRO usuario e recusado — mesmo por ADMINISTRADOR', async () => {
    // Cancelar nao e rejeitar: rejeitar e ato de quem aprova (e exige motivo, e fica no historico
    // como REJEITADO). Deixar qualquer um cancelar apagaria a solicitacao alheia da fila sem
    // motivo registrado.
    const m = await novoMaterial(db, { atual: 50 });
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id });
    await assert.rejects(() => scrapDisposalService.cancelar(db, ALMOXARIFE, s.id), /solicitante/i);
    await assert.rejects(() => scrapDisposalService.cancelar(db, ADMIN, s.id), /solicitante/i);
    assert.strictEqual((await linha(db, s.id)).status, 'SOLICITADO', 'cancelou mesmo recusando');
  });

  await test('cancelar duas vezes: a segunda cai na maquina de estados, nomeando o estado atual', async () => {
    const m = await novoMaterial(db, { atual: 50 });
    const s = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: m.id });
    await scrapDisposalService.cancelar(db, PRODUCAO, s.id);
    await assert.rejects(() => scrapDisposalService.cancelar(db, PRODUCAO, s.id), (e) => {
      assert.ok(/CANCELADO/.test(e.message), `a recusa nao nomeia o estado atual: ${e.message}`);
      return true;
    });
  });

  await test('sucateamento inexistente devolve 404 em cancelar', async () => {
    await assert.rejects(() => scrapDisposalService.cancelar(db, PRODUCAO, 999999), (e) => {
      assert.strictEqual(e.status, 404);
      return true;
    });
  });

  // ── Listar ──────────────────────────────────────────────────────────────────────────────────
  await test('listar traz nome do material e os dados do SeloProprietario, e filtra', async () => {
    const meu = await novoMaterial(db, { atual: 50 });
    const doCliente = await novoMaterial(db, { atual: 50, dono: cliA });
    const a = await scrapDisposalService.solicitar(db, PRODUCAO, { ...BASE, material_id: meu.id });
    const b = await scrapDisposalService.solicitar(db, PRODUCAO, {
      ...BASE, material_id: doCliente.id, projeto_origem_id: projA });
    await scrapDisposalService.cancelar(db, PRODUCAO, a.id);

    const doMaterial = await scrapDisposalService.listar(db, { material_id: doCliente.id });
    assert.strictEqual(doMaterial.length, 1, 'o filtro por material nao filtrou');
    assert.strictEqual(doMaterial[0].id, b.id);
    assert.strictEqual(doMaterial[0].material_codigo, doCliente.codigo, 'listar nao trouxe o codigo do material');
    assert.ok(doMaterial[0].material_nome, 'listar nao trouxe o nome do material');
    // SeloProprietario (Etapa 8): sem `proprietario_cliente_id` a tela mistura material de cliente
    // com material nosso e nao diz de quem e.
    assert.strictEqual(doMaterial[0].proprietario_cliente_id, cliA, 'listar nao publicou o dono');
    assert.strictEqual(doMaterial[0].proprietario_cliente_nome, 'Cliente Alfa LTDA',
      'listar nao resolveu o nome do cliente dono (LEFT JOIN clientes)');

    const cancelados = await scrapDisposalService.listar(db, { status: 'CANCELADO' });
    assert.ok(cancelados.some((r) => r.id === a.id), 'o filtro por status perdeu o cancelado');
    assert.ok(!cancelados.some((r) => r.id === b.id), 'o filtro por status trouxe status errado');
  });

  // ── As duas acoes de perfil (a rota so chega na Task 7; a DECLARACAO e desta) ────────────────
  await test('[permissao] as duas acoes existem com os perfis do design', async () => {
    assert.ok(ACAO_PERFIS.aprovar_sucateamento, 'acao aprovar_sucateamento ausente de ACAO_PERFIS');
    assert.ok(ACAO_PERFIS.aprovar_sucateamento_gestao, 'acao aprovar_sucateamento_gestao ausente de ACAO_PERFIS');
    assert.deepStrictEqual([...ACAO_PERFIS.aprovar_sucateamento].sort(), ['ADMINISTRADOR', 'ALMOXARIFE']);
    assert.deepStrictEqual([...ACAO_PERFIS.aprovar_sucateamento_gestao].sort(), ['ADMINISTRADOR', 'GESTOR']);
  });

  await test('[permissao] as duas pernas sao SEGREGADAS por perfil: ALMOXARIFE nao e gestao e vice-versa', async () => {
    // Se as duas listas fossem iguais, "dupla aprovacao" seria duas assinaturas do mesmo balcao.
    assert.strictEqual(can(ALMOXARIFE, 'aprovar_sucateamento'), true);
    assert.strictEqual(can(ALMOXARIFE, 'aprovar_sucateamento_gestao'), false,
      'ALMOXARIFE assina a perna de gestao — as duas pernas viraram uma so');
    assert.strictEqual(can(GESTOR, 'aprovar_sucateamento_gestao'), true);
    assert.strictEqual(can(GESTOR, 'aprovar_sucateamento'), false);
    assert.strictEqual(can(PRODUCAO, 'aprovar_sucateamento'), false);
    assert.strictEqual(can(PRODUCAO, 'aprovar_sucateamento_gestao'), false);
    assert.strictEqual(can({ ...PRODUCAO, perfil_almoxarifado: 'CONSULTA' }, 'aprovar_sucateamento'), false);
    assert.strictEqual(can({ ...PRODUCAO, perfil_almoxarifado: 'ENGENHARIA' }, 'aprovar_sucateamento_gestao'), false);
    // ADMINISTRADOR pode as duas — mas nunca as duas NA MESMA solicitacao (segregacao por
    // usuario, testada em sucateamentoAprovacao.api.test.js).
    assert.strictEqual(can(ADMIN, 'aprovar_sucateamento'), true);
    assert.strictEqual(can(ADMIN, 'aprovar_sucateamento_gestao'), true);
  });

  await test('[permissao] GET /minhas-permissoes expoe as duas acoes novas', async () => {
    setUser(ALMOXARIFE);
    const res = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.acoes.aprovar_sucateamento, true);
    assert.strictEqual(res.body.acoes.aprovar_sucateamento_gestao, false);
    setUser(GESTOR);
    const res2 = await request(app).get('/api/almoxarifado/minhas-permissoes');
    assert.strictEqual(res2.body.acoes.aprovar_sucateamento, false);
    assert.strictEqual(res2.body.acoes.aprovar_sucateamento_gestao, true);
    setUser(ADMIN);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
