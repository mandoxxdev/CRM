/**
 * Etapa 13, Task 2 — RN-04: indicadores gerenciais (giro, cobertura, rupturas, valor por grupo,
 * atendimento de requisicoes).
 *
 * Plano: docs/superpowers/plans/2026-08-24-almoxarifado-etapa13-relatorios.md, Task 2.
 * Design: docs/superpowers/specs/2026-08-24-almoxarifado-etapa13-relatorios-design.md, RN-04.
 *
 * SHAPE CONGELADO: { janela_dias, giro: { valor_consumido, valor_estoque_atual, indice },
 * cobertura: { mediana_dias, materiais_sem_consumo }, rupturas: { total, materiais:
 * [{codigo,nome,data}] }, valor_por_grupo: [{categoria,valor}], atendimento_requisicoes:
 * { media_horas, total_consideradas } }.
 *
 * Cada bloco tem seu proprio cenario ISOLADO (createTestApp proprio) de proposito: os cinco
 * numeros sao agregados GLOBAIS sobre a tabela inteira (sem filtro de lista de materiais) — um
 * unico banco compartilhado para os cinco obrigaria calcular a interacao de TODAS as fixtures
 * juntas a mao, o que e exatamente o tipo de conta que erra em silencio. Isolar por bloco deixa
 * cada numero esperado conferivel por soma direta.
 *
 * Executar: cd server && node tests/api/relatoriosIndicadores.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const stockService = require('../../services/almoxarifado/stockService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const LITERAL_400 = 'Parâmetro "janela_dias" deve ser um número inteiro maior que zero';

let seq = 0;
/**
 * INSERT direto (nao pelo motor) — o mesmo padrao de custoUnitarioFonteUnica.api.test.js:
 * `categoria`/`custo_medio`/`proprietario_cliente_id` so entram no INSERT quando EXPLICITAMENTE
 * passados em `over` (o `'x' in over`), para poder testar tanto "coluna omitida" (custo_medio
 * cai no DEFAULT 0 do schema, categoria cai em 'OUTROS') quanto "coluna gravada como NULL"
 * (categoria: null -> grupo 'Sem categoria').
 */
async function criarMaterial(db, over = {}) {
  seq += 1;
  const codigo = over.codigo || `IND-${seq}`;
  const cols = ['codigo', 'nome', 'unidade', 'quantidade_atual', 'custo_unitario', 'ativo'];
  const vals = [codigo, over.nome || `Material ${codigo}`, over.unidade || 'UN',
    over.quantidade_atual ?? 0, over.custo_unitario ?? 0, over.ativo ?? 1];
  if ('categoria' in over) { cols.push('categoria'); vals.push(over.categoria); }
  if ('custo_medio' in over) { cols.push('custo_medio'); vals.push(over.custo_medio); }
  if ('proprietario_cliente_id' in over) { cols.push('proprietario_cliente_id'); vals.push(over.proprietario_cliente_id); }
  const r = await dbRun(db, `INSERT INTO materiais_almoxarifado (${cols.join(',')})
    VALUES (${cols.map(() => '?').join(',')})`, vals);
  return r.lastID;
}

/** SAIDA/AJUSTE/LIBERACAO_RESERVA etc pelo MOTOR REAL (stockService.registrarMovimentacao). */
async function movimentar(db, params) {
  return stockService.registrarMovimentacao(db, ADMIN, { justificativa: 'teste indicadores', ...params });
}

async function backdatar(db, movimentacaoId, dias) {
  await dbRun(db, `UPDATE movimentacoes_almoxarifado SET created_at = datetime('now', '-' || ? || ' days') WHERE id = ?`,
    [dias, movimentacaoId]);
}

async function getIndicadores(app, query) {
  return request(app).get('/api/almoxarifado/relatorios/indicadores').query(query || {});
}

(async () => {
  // ── [1] Validacao de janela_dias: 400 literal (isolado, sem fixture) ────────────────────────
  await test('[400] janela_dias invalido (0, negativo, texto, decimal) — literal congelado', async () => {
    const { app, close } = await createTestApp({ user: ADMIN });
    try {
      for (const valor of ['0', '-3', 'abc', '1.5']) {
        const res = await getIndicadores(app, { janela_dias: valor });
        assert.strictEqual(res.status, 400, `janela_dias=${valor}: esperava 400, veio ${res.status} — ${JSON.stringify(res.body)}`);
        assert.strictEqual(res.body.error, LITERAL_400, `janela_dias=${valor}: ${JSON.stringify(res.body)}`);
      }
    } finally { await close(); }
  });

  // ── [2] Janela default: fallback 90 sem config; config muda a janela EFETIVA (I4); ──────────
  // janela=1 exclui movimento antigo.
  await test('[I4] janela_dias omitido usa fallback 90; janela_dias=1 exclui movimento de 10 dias; config muda o default', async () => {
    const { app, db, close } = await createTestApp({ user: ADMIN });
    try {
      const matId = await criarMaterial(db, { custo_unitario: 2, quantidade_atual: 100 });
      await movimentar(db, { material_id: matId, tipo: 'SAIDA', quantidade: 5 }); // recente
      const antigo = await movimentar(db, { material_id: matId, tipo: 'SAIDA', quantidade: 7 });
      await backdatar(db, antigo.id, 10); // 10 dias atras

      // (a) sem janela_dias: config vem SEMEADA em '90' pelo schema.js — os dois eventos
      // contam (10 dias < 90).
      let res = await getIndicadores(app, {});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.janela_dias, 90, JSON.stringify(res.body));
      assert.strictEqual(res.body.giro.valor_consumido, 24, JSON.stringify(res.body.giro)); // (5+7)*2
      assert.strictEqual(res.body.giro.valor_estoque_atual, 176, JSON.stringify(res.body.giro)); // 88*2
      assert.strictEqual(res.body.giro.indice, 0.14, JSON.stringify(res.body.giro)); // 24/176

      // (b) janela_dias=1 explicito: so o evento recente conta.
      res = await getIndicadores(app, { janela_dias: 1 });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.janela_dias, 1, JSON.stringify(res.body));
      assert.strictEqual(res.body.giro.valor_consumido, 10, JSON.stringify(res.body.giro)); // 5*2
      assert.strictEqual(res.body.giro.indice, 0.06, JSON.stringify(res.body.giro)); // 10/176

      // (c) config 'reposicao_janela_consumo_dias'=5: default passa a ser 5, NAO 90 — o evento
      // de 10 dias atras volta a ficar de fora do default (prova que o default LE a config).
      // A chave ja vem SEMEADA em '90' pelo schema.js (initSchema) — UPDATE, nunca INSERT.
      await dbRun(db, `UPDATE configuracoes_almoxarifado SET valor = '5' WHERE chave = 'reposicao_janela_consumo_dias'`);
      res = await getIndicadores(app, {});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.janela_dias, 5, JSON.stringify(res.body));
      assert.strictEqual(res.body.giro.valor_consumido, 10, JSON.stringify(res.body.giro));
    } finally { await close(); }
  });

  // ── [3][I2] FIXTURE OBRIGATORIA: custo_medio manda sobre custo_unitario (custo puro cai) ────
  await test('[I2] giro usa custoUnitarioSql (custo_medio manda quando > 0) — nao custo_unitario puro', async () => {
    const { app, db, close } = await createTestApp({ user: ADMIN });
    try {
      // Material do dia a dia: custo_medio no DEFAULT 0 do schema (coluna OMITIDA do INSERT).
      const matA = await criarMaterial(db, { custo_unitario: 10, quantidade_atual: 20 });
      await movimentar(db, { material_id: matA, tipo: 'SAIDA', quantidade: 6 }); // 6 * 10 = 60

      // Material com media ponderada JA gravada (12), custo_unitario continua 10 no cadastro —
      // se o codigo lesse custo_unitario puro (a varredura NAO pega isso, Global Constraints),
      // a conta daria 4*10=40 em vez de 4*12=48.
      const matB = await criarMaterial(db, { custo_unitario: 10, custo_medio: 12, quantidade_atual: 30 });
      await movimentar(db, { material_id: matB, tipo: 'SAIDA', quantidade: 4 }); // 4 * 12 = 48

      const res = await getIndicadores(app, { janela_dias: 30 });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.giro.valor_consumido, 108, JSON.stringify(res.body.giro)); // 60 + 48
      assert.strictEqual(res.body.giro.valor_estoque_atual, 452, JSON.stringify(res.body.giro)); // 14*10 + 26*12
      assert.strictEqual(res.body.giro.indice, 0.24, JSON.stringify(res.body.giro)); // 108/452
    } finally { await close(); }
  });

  // ── [4] Cobertura por MEDIANA (nao media) — materiais sem consumo ficam de fora, contados ──
  // a parte.
  await test('[RN-04] cobertura: mediana (nao media) de disponivel/consumo-diario; sem-consumo a parte', async () => {
    const { app, db, close } = await createTestApp({ user: ADMIN });
    try {
      const mat1 = await criarMaterial(db, { custo_unitario: 1, quantidade_atual: 20 });
      await movimentar(db, { material_id: mat1, tipo: 'SAIDA', quantidade: 6 }); // disp 14, consumo 6 -> 14/(6/30)=70

      const mat2 = await criarMaterial(db, { custo_unitario: 1, quantidade_atual: 30 });
      await movimentar(db, { material_id: mat2, tipo: 'SAIDA', quantidade: 4 }); // disp 26, consumo 4 -> 26/(4/30)=195

      const mat3 = await criarMaterial(db, { custo_unitario: 1, quantidade_atual: 100 });
      await movimentar(db, { material_id: mat3, tipo: 'SAIDA', quantidade: 10 }); // disp 90, consumo 10 -> 90/(10/30)=270

      // Sem consumo na janela: fica FORA da mediana, contado a parte.
      await criarMaterial(db, { custo_unitario: 1, quantidade_atual: 10 });

      const res = await getIndicadores(app, { janela_dias: 30 });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      // Mediana de [70,195,270] = 195 — a MEDIA seria 178.33: se alguem trocar mediana por
      // media (controle positivo iii), este numero cai.
      assert.strictEqual(res.body.cobertura.mediana_dias, 195, JSON.stringify(res.body.cobertura));
      assert.strictEqual(res.body.cobertura.materiais_sem_consumo, 1, JSON.stringify(res.body.cobertura));
    } finally { await close(); }
  });

  // ── [5] Rupturas: regua CORRIGIDA (saldo FISICO <= 0, tipo em TIPOS_SAIDA/AJUSTE_INVENTARIO), ──
  // material de cliente fica fora (par com o mesmo material como proprio).
  await test('[RN-04][C5] rupturas: fisico<=0 + tipo SAIDA/AJUSTE_INVENTARIO; neutro e reservado ficam fora; cliente fica fora', async () => {
    const { app, db, close } = await createTestApp({ user: ADMIN });
    try {
      const cliente = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Ruptura LTDA']);
      const clienteId = cliente.lastID;

      // Positivo 1: SAIDA zera -> ruptura.
      const matSaida = await criarMaterial(db, { codigo: 'RUP-SAIDA', quantidade_atual: 8 });
      await movimentar(db, { material_id: matSaida, tipo: 'SAIDA', quantidade: 8 });

      // Positivo 2: AJUSTE_INVENTARIO zera por CONTAGEM -> ruptura (tipo tambem conta, decisao).
      const matAjuste = await criarMaterial(db, { codigo: 'RUP-AJUSTE', quantidade_atual: 5 });
      await movimentar(db, { material_id: matAjuste, tipo: 'AJUSTE_INVENTARIO', quantidade: 0 });

      // Negativo (iii-a): material JA zerado (sem evento de saida/ajuste na janela) recebe SO
      // uma LIBERACAO_RESERVA (tipo neutro, saldo_posterior = saldo_anterior = 0) -> NAO entra.
      const matNeutro = await criarMaterial(db, { codigo: 'RUP-NEUTRO', quantidade_atual: 0 });
      await movimentar(db, { material_id: matNeutro, tipo: 'LIBERACAO_RESERVA', quantidade: 1 });

      // Negativo (iii-b): a SAIDA deixa saldo_posterior=8 (fisico > 0 -> NAO ruptura), e SO
      // DEPOIS o material fica 100% reservado (disponivel 0 no ESTADO atual). Isola de proposito
      // "olha o EVENTO (saldo_posterior)" de "olha o ESTADO atual (disponivel)": se a regua
      // trocasse saldo_posterior por disponivel, esta MESMA SAIDA (tipo qualifica) passaria a
      // contar so por causa da reserva posterior, sem nunca ter zerado nada — par negativo da
      // aproximacao declarada.
      const matReservado = await criarMaterial(db, { codigo: 'RUP-RESERVADO', quantidade_atual: 10 });
      await movimentar(db, { material_id: matReservado, tipo: 'SAIDA', quantidade: 2 }); // saldo_posterior=8
      await stockService.criarReserva(db, ADMIN, { material_id: matReservado, quantidade: 8 }); // disponivel vira 0

      // Par cliente x proprio: MESMO evento (AJUSTE_NEGATIVO zera), so o proprio aparece.
      const matCliente = await criarMaterial(db, {
        codigo: 'RUP-CLIENTE', quantidade_atual: 2, proprietario_cliente_id: clienteId,
      });
      await movimentar(db, { material_id: matCliente, tipo: 'AJUSTE_NEGATIVO', quantidade: 2 });
      const matProprio = await criarMaterial(db, { codigo: 'RUP-PROPRIO', quantidade_atual: 2 });
      await movimentar(db, { material_id: matProprio, tipo: 'AJUSTE_NEGATIVO', quantidade: 2 });

      const res = await getIndicadores(app, { janela_dias: 30 });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      const codigos = res.body.rupturas.materiais.map((m) => m.codigo).sort();
      assert.deepStrictEqual(codigos, ['RUP-AJUSTE', 'RUP-PROPRIO', 'RUP-SAIDA'], JSON.stringify(res.body.rupturas));
      assert.strictEqual(res.body.rupturas.total, 3, JSON.stringify(res.body.rupturas));
      for (const m of res.body.rupturas.materiais) {
        assert.ok(m.data, `${m.codigo}: data da 1a ruptura ausente`);
        assert.ok(m.nome, `${m.codigo}: nome ausente`);
      }
    } finally { await close(); }
  });

  // ── [6] Valor por grupo: COALESCE(categoria,'Sem categoria'), so materiais PROPRIOS. ────────
  await test('[RN-04] valor_por_grupo: agrupa por categoria (Sem categoria p/ NULL), material de cliente fica fora', async () => {
    const { app, db, close } = await createTestApp({ user: ADMIN });
    try {
      const cliente = await dbRun(db, 'INSERT INTO clientes (razao_social) VALUES (?)', ['Cliente Grupo LTDA']);
      const clienteId = cliente.lastID;

      await criarMaterial(db, { categoria: 'ACO', custo_unitario: 10, quantidade_atual: 5 }); // 50
      await criarMaterial(db, { categoria: 'ACO', custo_unitario: 4, quantidade_atual: 10 }); // 40
      await criarMaterial(db, { categoria: null, custo_unitario: 7, quantidade_atual: 2 }); // 14 -> Sem categoria
      // Cliente na MESMA categoria — se vazar, ACO viraria 190 em vez de 90.
      await criarMaterial(db, { categoria: 'ACO', custo_unitario: 100, quantidade_atual: 1, proprietario_cliente_id: clienteId });

      const res = await getIndicadores(app, {});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.valor_por_grupo.length, 2, JSON.stringify(res.body.valor_por_grupo));
      const aco = res.body.valor_por_grupo.find((g) => g.categoria === 'ACO');
      const semCategoria = res.body.valor_por_grupo.find((g) => g.categoria === 'Sem categoria');
      assert.ok(aco, JSON.stringify(res.body.valor_por_grupo));
      assert.ok(semCategoria, JSON.stringify(res.body.valor_por_grupo));
      assert.strictEqual(aco.valor, 90, JSON.stringify(aco));
      assert.strictEqual(semCategoria.valor, 14, JSON.stringify(semCategoria));
    } finally { await close(); }
  });

  // ── [7][I7] Atendimento de requisicoes: so ENTREGA COMPLETA (3 vs 2), media arredondada (I8) ─
  await test('[I7][I8] atendimento_requisicoes: total_consideradas DENTRO do WHERE data_entrega, media arredondada', async () => {
    const { app, db, close } = await createTestApp({ user: ADMIN });
    try {
      await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, created_at, data_entrega)
        VALUES ('IND-REQ-1', 1, 'Solicitante', 'ENCERRADA', '2026-01-01 08:00:00', '2026-01-01 14:30:00')`); // 6.5h
      await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, created_at, data_entrega)
        VALUES ('IND-REQ-2', 1, 'Solicitante', 'ENCERRADA', '2026-01-02 08:00:00', '2026-01-02 11:30:00')`); // 3.5h
      // NAO entregue — se o COUNT nao estiver DENTRO do WHERE data_entrega IS NOT NULL,
      // total_consideradas sai 3 em vez de 2 (medido, I7).
      await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, created_at, data_entrega)
        VALUES ('IND-REQ-3', 1, 'Solicitante', 'PENDENTE', '2026-01-03 08:00:00', NULL)`);

      const res = await getIndicadores(app, {});
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.strictEqual(res.body.atendimento_requisicoes.total_consideradas, 2,
        JSON.stringify(res.body.atendimento_requisicoes));
      // (6.5 + 3.5) / 2 = 5.0 — julianday tem residuo de float (6.499999992549419 para 6h30,
      // medido/I8): sem o arredondamento Number(x.toFixed(2)) o assert exato quebraria.
      assert.strictEqual(res.body.atendimento_requisicoes.media_horas, 5,
        JSON.stringify(res.body.atendimento_requisicoes));
    } finally { await close(); }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
