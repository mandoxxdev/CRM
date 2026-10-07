/**
 * Etapa 47, T3/T4 — regras de aprovação configuráveis, as N pendências, a segregação por
 * assinatura e o gate nas duas lanes de aprovação.
 *
 * Plano:  docs/superpowers/plans/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras.md
 * Design: docs/superpowers/specs/2026-09-30-almoxarifado-etapa47-aprovacoes-com-regras-design.md
 *         (seções 8, 9 e — principalmente — 9.7, que é o que a revisão da Fase 1-c mudou)
 *
 * Tudo entra PELA ROTA, com o `requirePermission` real do harness: a requisição nasce no
 * `POST /requisicoes` (o avaliador roda no envio), e as assinaturas e aprovações saem pelos PUTs.
 *
 * Os cenários que valem mais, e por quê:
 *  - (5) o /aprovar barrado NÃO deixa reserva — o C1 da revisão mediu reserva em dobro;
 *  - (9) o avaliador falhando FECHA a porta — o C2: antes, zero pendências = gate aberto;
 *  - (3) `valor_minimo` casa de verdade — o C3: `valor_total` ainda é 0 no ponto do avaliador;
 *  - (7) a mesma pessoa não satisfaz duas regras (RN-07), com a metade positiva: duas pessoas sim.
 *
 * Executar: cd server && node tests/api/regrasAprovacao.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const approvalRulesService = require('../../services/almoxarifado/approvalRulesService');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const SOLIC = { id: 10, nome: 'Solicitante', email: 'solic@test.com' }; // PRODUCAO (fallback)
const ANA = { id: 11, nome: 'Ana Gestora', email: 'ana@test.com', perfil_almoxarifado: 'GESTOR' };
const BIA = { id: 12, nome: 'Bia Gestora', email: 'bia@test.com', perfil_almoxarifado: 'GESTOR' };
const CAIO = { id: 13, nome: 'Caio Gestor', email: 'caio@test.com', perfil_almoxarifado: 'GESTOR' };

const MSG_GATE = /^Requisição tem aprovação de regra pendente: /;

(async () => {
  console.log('\n=== Etapa 47 T3/T4: regras de aprovacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  const como = (user) => { setUser(user); return request(app); };

  // `usuarios` é do núcleo e o harness não a cria (mesmo molde de requisicaoLembreteValor).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY, nome TEXT, email TEXT, ativo INTEGER DEFAULT 1)`);
  for (const u of [ADMIN, SOLIC, ANA, BIA, CAIO]) {
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [u.id, u.nome, u.email]);
  }
  await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (99, ?, ?, 0)', ['Inativo', 'x@test.com']);

  const fam = await como(ADMIN).post('/api/almoxarifado/familias').send({ codigo: 'FAME47', nome: 'Família E47' });
  assert.strictEqual(fam.status, 201, JSON.stringify(fam.body));
  let seqMat = 0;
  async function criarMaterial({ custo = 10, critico = 0, estoque = 100 } = {}) {
    seqMat += 1;
    const res = await como(ADMIN).post('/api/almoxarifado/materiais')
      .send({ codigo: `MATE47-${seqMat}`, nome: `Material E47 ${seqMat}`, familia_id: fam.body.id, unidade: 'UN' });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    await dbRun(db, `UPDATE materiais_almoxarifado SET quantidade_atual = ?, custo_unitario = ?, custo_medio = 0,
      material_critico = ? WHERE id = ?`, [estoque, custo, critico, res.body.id]);
    return res.body.id;
  }
  async function enviar(itens, extra = {}) {
    const res = await como(SOLIC).post('/api/almoxarifado/requisicoes')
      .send({ itens, urgencia: 'NORMAL', os_referencia: 'OS-INT', ...extra });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    return res.body;
  }
  const pendencias = (reqId) => dbAll(db,
    'SELECT * FROM requisicao_aprovacoes_regra WHERE requisicao_id = ? ORDER BY regra_id', [reqId]);
  const reservasAtivas = async (reqId) => (await dbGet(db,
    `SELECT COUNT(*) n, COALESCE(SUM(quantidade),0) q FROM reservas_material_almoxarifado
     WHERE requisicao_id = ? AND status = 'ATIVA'`, [reqId]));
  const setConfig = (chave, valor) => dbRun(db,
    `INSERT INTO configuracoes_almoxarifado (chave, valor) VALUES (?,?)
     ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`, [chave, valor]);

  // ── (1) contrato do POST: cada recusa, com a literal ───────────────────────────────────────
  await test('(1) POST /regras-aprovacao recusa cada caso com a literal congelada', async () => {
    const casos = [
      [{ valor_minimo: 1, aprovadores: [11] }, 'Regra precisa de um nome'],
      [{ nome: 'x', aprovadores: [11] }, 'Regra precisa de pelo menos um critério'],
      // material_critico 0 NÃO conta como critério (9.7/I3)
      [{ nome: 'x', material_critico: 0, aprovadores: [11] }, 'Regra precisa de pelo menos um critério'],
      [{ nome: 'x', valor_minimo: 1 }, 'Regra precisa de pelo menos um aprovador'],
      [{ nome: 'x', valor_minimo: 1, aprovadores: 'onze' }, 'Regra precisa de pelo menos um aprovador'],
      [{ nome: 'x', valor_minimo: 1, aprovadores: [11, 99, 555] }, 'Aprovador inexistente ou inativo: 99, 555'],
      [{ nome: 'x', tipo_requisicao: 'BANANA', aprovadores: [11] }, 'Tipo de requisição inválido: BANANA'],
      [{ nome: 'x', valor_minimo: -5, aprovadores: [11] }, 'valor_minimo deve ser um número maior que zero'],
      [{ nome: 'x', quantidade_minima: 0, aprovadores: [11] }, 'quantidade_minima deve ser um número maior que zero'],
      [{ nome: 'x', projeto_id: 2.5, aprovadores: [11] }, 'projeto_id deve ser um número maior que zero'],
    ];
    for (const [body, literal] of casos) {
      const res = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao').send(body);
      assert.strictEqual(res.status, 400, `${JSON.stringify(body)} -> ${res.status} ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.error, literal);
    }
    const semGate = await como(ANA).post('/api/almoxarifado/regras-aprovacao')
      .send({ nome: 'x', valor_minimo: 1, aprovadores: [11] });
    assert.strictEqual(semGate.status, 403, 'quem nao administra o modulo criou regra');
    const naoExiste = await como(ADMIN).put('/api/almoxarifado/regras-aprovacao/99999')
      .send({ nome: 'x', valor_minimo: 1, aprovadores: [11] });
    assert.strictEqual(naoExiste.status, 404);
    assert.strictEqual(naoExiste.body.error, 'Regra não encontrada');
  });

  // As duas regras da etapa: valor alto (Ana assina) e material crítico (Bia assina).
  const rValor = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao')
    .send({ nome: 'Valor alto', valor_minimo: 1000, aprovadores: [ANA.id] });
  const rCritico = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao')
    .send({ nome: 'Material crítico', material_critico: true, aprovadores: [BIA.id] });

  await test('(2) as regras criadas voltam com aprovadores como array e contagem zerada', async () => {
    assert.strictEqual(rValor.status, 201, JSON.stringify(rValor.body));
    assert.deepStrictEqual(rValor.body.aprovadores, [ANA.id]);
    const lista = await como(ADMIN).get('/api/almoxarifado/regras-aprovacao');
    assert.strictEqual(lista.status, 200);
    assert.strictEqual(lista.body.length, 2);
    assert.strictEqual(lista.body[0].pendencias_abertas, 0);
  });

  // ── (3) o avaliador, pela rota de criação ──────────────────────────────────────────────────
  const matCaro = await criarMaterial({ custo: 600 });
  const matCritico = await criarMaterial({ custo: 5, critico: 1 });
  const matBarato = await criarMaterial({ custo: 5 });
  let reqDuas;

  await test('(3) requisicao que casa DUAS regras nasce com duas pendencias — valor_minimo casa (C3)', async () => {
    // 2 x 600 = 1200 >= 1000: casa "Valor alto" SÓ se o avaliador calcular o valor — a coluna
    // valor_total ainda é 0 neste ponto do envio.
    reqDuas = await enviar([{ material_id: matCaro, quantidade: 2 }, { material_id: matCritico, quantidade: 1 }]);
    assert.strictEqual(reqDuas.status, 'PENDENTE');
    const p = await pendencias(reqDuas.id);
    assert.deepStrictEqual(p.map((x) => x.regra_nome), ['Valor alto', 'Material crítico']);
    assert.ok(p.every((x) => x.status === 'ABERTA'));
    const row = await dbGet(db, 'SELECT regras_avaliadas_em FROM requisicoes_almoxarifado WHERE id = ?', [reqDuas.id]);
    assert.ok(row.regras_avaliadas_em, 'o carimbo de avaliacao nao foi gravado');
  });

  await test('(4) requisicao que nao casa nenhuma regra nasce SEM pendencia (a metade positiva)', async () => {
    const r = await enviar([{ material_id: matBarato, quantidade: 3 }]);
    assert.strictEqual((await pendencias(r.id)).length, 0);
    setUser(CAIO);
    const ap = await request(app).put(`/api/almoxarifado/requisicoes/${r.id}/aprovar`);
    assert.strictEqual(ap.status, 200, `sem regra casada o /aprovar tinha de passar: ${JSON.stringify(ap.body)}`);
  });

  // ── (5) o gate em /aprovar, e a reserva que ele NÃO pode deixar ───────────────────────────
  await test('(5) /aprovar com pendencia aberta -> 400 com a literal, e NENHUMA reserva criada (C1)', async () => {
    const ap = await como(CAIO).put(`/api/almoxarifado/requisicoes/${reqDuas.id}/aprovar`);
    assert.strictEqual(ap.status, 400, JSON.stringify(ap.body));
    assert.strictEqual(ap.body.error, 'Requisição tem aprovação de regra pendente: Valor alto, Material crítico');
    const r = await reservasAtivas(reqDuas.id);
    assert.strictEqual(r.n, 0, `o /aprovar recusado deixou ${r.n} reserva(s) orfa(s)`);
    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [reqDuas.id]);
    assert.strictEqual(row.status, 'PENDENTE');
  });

  await test('(6) a tela sabe: GET /requisicoes e /:id trazem pendencias_regra_abertas', async () => {
    const lista = await como(ADMIN).get('/api/almoxarifado/requisicoes');
    const linha = lista.body.find((x) => x.id === reqDuas.id);
    assert.strictEqual(linha.pendencias_regra_abertas, 2);
    const det = await como(ADMIN).get(`/api/almoxarifado/requisicoes/${reqDuas.id}`);
    assert.strictEqual(det.body.pendencias_regra_abertas, 2, JSON.stringify(Object.keys(det.body)));
  });

  // ── (7) a assinatura: segregação em cada perna ────────────────────────────────────────────
  await test('(7) assinatura: solicitante, fora da lista, e a MESMA pessoa em duas regras sao recusados', async () => {
    const [pValor, pCritico] = await pendencias(reqDuas.id);
    const url = (p) => `/api/almoxarifado/requisicoes/${reqDuas.id}/aprovacoes-regra/${p.id}/aprovar`;

    const solic = await como(SOLIC).put(url(pValor));
    assert.strictEqual(solic.status, 403);
    assert.strictEqual(solic.body.error, 'Solicitante não pode aprovar a própria requisição');

    const fora = await como(CAIO).put(url(pValor));
    assert.strictEqual(fora.status, 403);
    assert.strictEqual(fora.body.error, 'Você não está entre os aprovadores desta regra');

    // Admin assina a do valor (admin vale como na liberação por valor)...
    const adm = await como(ADMIN).put(url(pValor));
    assert.strictEqual(adm.status, 200, JSON.stringify(adm.body));
    assert.strictEqual(adm.body.pendencias_abertas, 1);
    // ...e NÃO pode satisfazer a segunda regra também (RN-07).
    const adm2 = await como(ADMIN).put(url(pCritico));
    assert.strictEqual(adm2.status, 403);
    assert.strictEqual(adm2.body.error, 'Você já assinou outra aprovação de regra desta requisição');

    const deNovo = await como(ANA).put(url(pValor));
    assert.strictEqual(deNovo.status, 400);
    assert.strictEqual(deNovo.body.error, 'Esta aprovação de regra não está mais aberta');

    // A metade positiva: uma SEGUNDA pessoa, da lista, satisfaz a segunda regra.
    const bia = await como(BIA).put(url(pCritico));
    assert.strictEqual(bia.status, 200, JSON.stringify(bia.body));
    assert.strictEqual(bia.body.pendencias_abertas, 0);
  });

  await test('(8) sem pendencia aberta, o /aprovar passa e reserva', async () => {
    const ap = await como(CAIO).put(`/api/almoxarifado/requisicoes/${reqDuas.id}/aprovar`);
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    assert.ok((await reservasAtivas(reqDuas.id)).n > 0, 'aprovou sem reservar');
    const naoAguarda = await como(BIA).put(
      `/api/almoxarifado/requisicoes/${reqDuas.id}/aprovacoes-regra/999999/aprovar`);
    assert.strictEqual(naoAguarda.status, 404);
    assert.strictEqual(naoAguarda.body.error, 'Aprovação de regra não encontrada');
  });

  // ── (9) o avaliador falhando FECHA a porta (C2) ───────────────────────────────────────────
  await test('(9) avaliador falhou no envio: auto-aprovacao NAO passa, e o /aprovar reavalia e barra', async () => {
    await setConfig('aprovacao_automatica', '1');
    const original = approvalRulesService.avaliarRequisicao;
    approvalRulesService.avaliarRequisicao = async () => { throw new Error('falha proposital do avaliador'); };
    let r;
    try {
      r = await enviar([{ material_id: matCritico, quantidade: 1 }]);
    } finally {
      approvalRulesService.avaliarRequisicao = original;
    }
    assert.strictEqual(r.status, 'PENDENTE',
      `com o avaliador falhando a auto-aprovacao aprovou: ${JSON.stringify(r)}`);
    const row = await dbGet(db, 'SELECT regras_avaliadas_em FROM requisicoes_almoxarifado WHERE id = ?', [r.id]);
    // Etapa 73 (T2, B359): a aprovacao automatica agora faz a MESMA pre-checagem do /aprovar
    // (`exigirSemPendenciaAberta`), que reavalia as regras quando o avaliador falhou no envio — o
    // avaliador real roda (o monkeypatch ja foi desfeito), carimba e abre a pendencia. Ate a 72 a
    // porta automatica so olhava o GATE_SQL e deixava o carimbo NULL. A porta continua fechada
    // (PENDENTE, sem reserva) — o que mudou e QUEM reavalia primeiro.
    assert.ok(row.regras_avaliadas_em, 'a pre-checagem da aprovacao automatica reavaliou e carimbou');
    assert.deepStrictEqual((await pendencias(r.id)).map((p) => p.regra_nome), ['Material crítico']);

    const ap = await como(CAIO).put(`/api/almoxarifado/requisicoes/${r.id}/aprovar`);
    assert.strictEqual(ap.status, 400, `o /aprovar passou por vazio: ${JSON.stringify(ap.body)}`);
    assert.strictEqual(ap.body.error, 'Requisição tem aprovação de regra pendente: Material crítico');
    assert.strictEqual((await reservasAtivas(r.id)).n, 0);
  });

  await test('(10) auto-aprovacao: com regra casada fica PENDENTE; sem regra casada aprova (metade positiva)', async () => {
    const comRegra = await enviar([{ material_id: matCritico, quantidade: 1 }]);
    assert.strictEqual(comRegra.status, 'PENDENTE');
    assert.strictEqual(comRegra.aprovacao, undefined);
    const semRegra = await enviar([{ material_id: matBarato, quantidade: 1 }]);
    // Etapa 73 (D4/B360): status gravado — a aprovacao automatica reserva (C122), nao 'APROVADO' fixo.
    assert.strictEqual(semRegra.status, 'TOTALMENTE_RESERVADA', JSON.stringify(semRegra));
    assert.strictEqual(semRegra.aprovacao, 'automatica');
    await setConfig('aprovacao_automatica', '0');
  });

  // ── (11) o gate na lane de valor ──────────────────────────────────────────────────────────
  await test('(11) /aprovar-valor com pendencia aberta -> 400 e status intacto; depois de assinar, passa', async () => {
    await setConfig('liberacao_valor_ativo', '1');
    await setConfig('liberacao_valor_limite', '500');
    await setConfig('liberacao_valor_aprovadores', JSON.stringify([CAIO.id]));
    const r = await enviar([{ material_id: matCaro, quantidade: 2 }]); // 1200 > 500 e >= 1000
    assert.strictEqual(r.status, 'AGUARDANDO_APROVACAO_VALOR', JSON.stringify(r));
    const [p] = await pendencias(r.id);
    assert.strictEqual(p.regra_nome, 'Valor alto');

    const barrado = await como(CAIO).put(`/api/almoxarifado/requisicoes/${r.id}/aprovar-valor`);
    assert.strictEqual(barrado.status, 400, JSON.stringify(barrado.body));
    assert.strictEqual(barrado.body.error, 'Requisição tem aprovação de regra pendente: Valor alto');
    const row = await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [r.id]);
    assert.strictEqual(row.status, 'AGUARDANDO_APROVACAO_VALOR', 'a lane de valor contornou o gate');
    assert.strictEqual((await reservasAtivas(r.id)).n, 0);

    const ana = await como(ANA).put(`/api/almoxarifado/requisicoes/${r.id}/aprovacoes-regra/${p.id}/aprovar`);
    assert.strictEqual(ana.status, 200, JSON.stringify(ana.body));
    const libera = await como(CAIO).put(`/api/almoxarifado/requisicoes/${r.id}/aprovar-valor`);
    assert.strictEqual(libera.status, 200, JSON.stringify(libera.body));
    await setConfig('liberacao_valor_ativo', '0');
  });

  // ── (12) desativar a regra (9.2 + 9.7/I2) ─────────────────────────────────────────────────
  await test('(12) desativar a regra obsoleta a pendencia viva e NAO a de requisicao rejeitada', async () => {
    const viva = await enviar([{ material_id: matCritico, quantidade: 1 }]);
    const morta = await enviar([{ material_id: matCritico, quantidade: 1 }]);
    const rej = await como(SOLIC).put(`/api/almoxarifado/requisicoes/${morta.id}/rejeitar`).send({ motivo: 'desisti' });
    assert.strictEqual(rej.status, 200, JSON.stringify(rej.body));

    const antes = (await como(ADMIN).get('/api/almoxarifado/regras-aprovacao')).body
      .find((x) => x.id === rCritico.body.id);
    // Conta só requisição aguardando: a rejeitada fica de fora.
    const vivasAguardando = await dbGet(db, `SELECT COUNT(*) n FROM requisicao_aprovacoes_regra p
      JOIN requisicoes_almoxarifado q ON q.id = p.requisicao_id
      WHERE p.regra_id = ? AND p.status = 'ABERTA' AND q.status IN ('PENDENTE','AGUARDANDO_APROVACAO_VALOR')`,
    [rCritico.body.id]);
    assert.strictEqual(antes.pendencias_abertas, vivasAguardando.n);

    const put = await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${rCritico.body.id}`)
      .send({ nome: 'Material crítico', material_critico: true, aprovadores: [BIA.id], ativo: false });
    assert.strictEqual(put.status, 200, JSON.stringify(put.body));
    assert.strictEqual(put.body.pendencias_obsoletadas, vivasAguardando.n);
    assert.strictEqual(put.body.regra.ativo, 0);

    const [pViva] = await pendencias(viva.id);
    assert.strictEqual(pViva.status, 'OBSOLETA');
    assert.strictEqual(pViva.obsoleta_por_nome, 'Admin', 'a obsolescencia nao registrou QUEM desativou');
    const [pMorta] = await pendencias(morta.id);
    assert.strictEqual(pMorta.status, 'ABERTA', 'desativar reescreveu o historico da requisicao rejeitada');

    const ap = await como(CAIO).put(`/api/almoxarifado/requisicoes/${viva.id}/aprovar`);
    assert.strictEqual(ap.status, 200, `a pendencia obsoleta continuou bloqueando: ${JSON.stringify(ap.body)}`);

    // Regra desativada não gera pendência nova.
    const nova = await enviar([{ material_id: matCritico, quantidade: 1 }]);
    assert.strictEqual((await pendencias(nova.id)).length, 0);
  });

  // ── (13) a fila ───────────────────────────────────────────────────────────────────────────
  await test('(13) a fila lista so pendencia aberta de requisicao aguardando, com pode_assinar por identidade', async () => {
    const r = await enviar([{ material_id: matCaro, quantidade: 2 }]);
    setUser(ANA);
    const fila = await request(app).get('/api/almoxarifado/aprovacoes-regra/pendentes');
    assert.strictEqual(fila.status, 200);
    const minha = fila.body.find((x) => x.requisicao_id === r.id);
    assert.ok(minha, 'a pendencia nova nao apareceu na fila');
    assert.strictEqual(minha.pode_assinar, true);
    assert.strictEqual(minha.valor_total, 1200, 'a fila perdeu o valor da requisicao');
    assert.ok(!fila.body.some((x) => x.status !== 'ABERTA'));
    setUser(BIA);
    const daBia = (await request(app).get('/api/almoxarifado/aprovacoes-regra/pendentes')).body
      .find((x) => x.requisicao_id === r.id);
    // Fase 5 (M-3): quem nao pode assinar nao RECEBE a pendencia — o filtro e do servidor.
    assert.strictEqual(daBia, undefined, 'Bia nao esta na lista da regra de valor e recebeu a pendencia');
    setUser(SOLIC);
    const doSolic = (await request(app).get('/api/almoxarifado/aprovacoes-regra/pendentes')).body
      .find((x) => x.requisicao_id === r.id);
    assert.strictEqual(doSolic, undefined, 'o solicitante recebeu a pendencia da propria requisicao');

    const det = await como(ADMIN).get(`/api/almoxarifado/requisicoes/${r.id}/aprovacoes-regra`);
    assert.strictEqual(det.status, 200);
    assert.deepStrictEqual(det.body[0].aprovadores, [ANA.id]);
    const inexistente = await como(ADMIN).get('/api/almoxarifado/requisicoes/999999/aprovacoes-regra');
    assert.strictEqual(inexistente.status, 404);
    assert.strictEqual(inexistente.body.error, 'Requisição não encontrada');
  });

  // ── (14) a corrida: a GARANTIA mora no WHERE, não na pré-checagem ────────────────────────
  await test('(14) o mesmo usuario assinando as DUAS pendencias ao mesmo tempo: so uma passa', async () => {
    // Sequencialmente a pré-checagem já dá a mensagem certa, então só a corrida prova o
    // `NOT EXISTS` do claim (8.3): as duas requisições HTTP leem "nenhuma assinada" antes de
    // qualquer UPDATE, e sem a guarda no WHERE as duas gravariam.
    const rQtd = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao')
      .send({ nome: 'Quantidade grande', quantidade_minima: 50, aprovadores: [ANA.id] });
    assert.strictEqual(rQtd.status, 201, JSON.stringify(rQtd.body));
    const r = await enviar([{ material_id: matCaro, quantidade: 2 }, { material_id: matBarato, quantidade: 60 }]);
    const ps = await pendencias(r.id);
    assert.strictEqual(ps.length, 2, JSON.stringify(ps.map((p) => p.regra_nome)));
    setUser(ADMIN);
    const [a, b] = await Promise.all(ps.map((p) => request(app)
      .put(`/api/almoxarifado/requisicoes/${r.id}/aprovacoes-regra/${p.id}/aprovar`)));
    const codigos = [a.status, b.status].sort();
    assert.deepStrictEqual(codigos, [200, 403], `a corrida deu ${codigos} — ${JSON.stringify([a.body, b.body])}`);
    const assinadas = await dbGet(db, `SELECT COUNT(*) n FROM requisicao_aprovacoes_regra
      WHERE requisicao_id = ? AND aprovador_id = ? AND status = 'APROVADA'`, [r.id, ADMIN.id]);
    assert.strictEqual(assinadas.n, 1, 'uma pessoa carimbou as duas regras');
  });

  // ═══════════ Fase 5 — os cenários que os três revisores mostraram faltar ═══════════
  // Regras ativas neste ponto: "Valor alto" (>= 1000, Ana) e "Quantidade grande" (>= 50, Ana).

  await test('(15) quantidade somada POR MATERIAL: duas linhas de 30 casam a regra ">= 50" (regras, I1)', async () => {
    // O solicitante contornava a regra dividindo o item: duas linhas de 6 não casavam "≥ 10".
    const r = await enviar([{ material_id: matBarato, quantidade: 30 }, { material_id: matBarato, quantidade: 30 }]);
    const ps = await pendencias(r.id);
    assert.deepStrictEqual(ps.map((p) => p.regra_nome), ['Quantidade grande'],
      `a regra de quantidade foi contornada com linhas repetidas: ${JSON.stringify(ps.map((p) => p.regra_nome))}`);
    // Metade positiva: materiais DIFERENTES não se somam.
    const matOutro = await criarMaterial({ custo: 1 });
    const r2 = await enviar([{ material_id: matBarato, quantidade: 30 }, { material_id: matOutro, quantidade: 30 }]);
    assert.strictEqual((await pendencias(r2.id)).length, 0, 'somou materiais diferentes');
  });

  await test('(16) a fronteira e >=: valor exatamente 1000 e quantidade exatamente 50 casam', async () => {
    const mat500 = await criarMaterial({ custo: 500 });
    const rValorExato = await enviar([{ material_id: mat500, quantidade: 2 }]);
    assert.deepStrictEqual((await pendencias(rValorExato.id)).map((p) => p.regra_nome), ['Valor alto']);
    const rQtdExata = await enviar([{ material_id: matBarato, quantidade: 50 }]);
    assert.deepStrictEqual((await pendencias(rQtdExata.id)).map((p) => p.regra_nome), ['Quantidade grande']);
    const rAbaixo = await enviar([{ material_id: matBarato, quantidade: 49 }]);
    assert.strictEqual((await pendencias(rAbaixo.id)).length, 0);
  });

  await test('(17) criterios de TIPO e de CENTRO DE CUSTO: casam o que devem e so isso', async () => {
    const rTipo = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao')
      .send({ nome: 'Manutenção', tipo_requisicao: 'MANUTENCAO', aprovadores: [BIA.id] });
    const rCC = await como(ADMIN).post('/api/almoxarifado/regras-aprovacao')
      .send({ nome: 'CC 5', centro_custo_id: 5, aprovadores: [BIA.id] });
    assert.strictEqual(rTipo.status, 201); assert.strictEqual(rCC.status, 201);
    const nomes = async (extra) => (await pendencias((await enviar([{ material_id: matBarato, quantidade: 1 }], extra)).id))
      .map((p) => p.regra_nome);
    assert.deepStrictEqual(await nomes({ tipo_requisicao: 'MANUTENCAO' }), ['Manutenção']);
    assert.deepStrictEqual(await nomes({ tipo_requisicao: 'CONSUMO' }), []);
    assert.deepStrictEqual(await nomes({ centro_custo_id: 5 }), ['CC 5']);
    assert.deepStrictEqual(await nomes({ centro_custo_id: 6 }), []);
    assert.deepStrictEqual(await nomes({}), [], 'regra de tipo/CC casou requisicao sem o criterio');
    for (const r of [rTipo, rCC]) {
      await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${r.body.id}`)
        .send({ ...r.body, ativo: false });
    }
  });

  await test('(18) quem configura o modulo assina como admin mesmo sem role admin (autorizacao, I-1)', async () => {
    const SUPER = { id: 20, nome: 'Super', role: 'user', is_superadmin: 1, email: 'super@test.com' };
    await dbRun(db, 'INSERT OR REPLACE INTO usuarios (id, nome, email, ativo) VALUES (?,?,?,1)', [SUPER.id, SUPER.nome, SUPER.email]);
    const r = await enviar([{ material_id: matCaro, quantidade: 2 }]); // "Valor alto": só a Ana na lista
    const [p] = await pendencias(r.id);
    const fila = await como(SUPER).get('/api/almoxarifado/aprovacoes-regra/pendentes');
    assert.ok(fila.body.find((x) => x.id === p.id)?.pode_assinar, 'o superadmin nao aparece podendo assinar');
    const ass = await como(SUPER).put(`/api/almoxarifado/requisicoes/${r.id}/aprovacoes-regra/${p.id}/aprovar`);
    assert.strictEqual(ass.status, 200, JSON.stringify(ass.body));
  });

  await test('(19) a fila e filtrada NO SERVIDOR: quem nao pode assinar nao recebe a fila alheia (autorizacao, M-3)', async () => {
    await enviar([{ material_id: matCaro, quantidade: 2 }]);
    const doCaio = await como(CAIO).get('/api/almoxarifado/aprovacoes-regra/pendentes');
    assert.strictEqual(doCaio.status, 200);
    assert.deepStrictEqual(doCaio.body, [], `o Caio (fora de toda lista) recebeu ${doCaio.body.length} pendencia(s)`);
    const daAna = await como(ANA).get('/api/almoxarifado/aprovacoes-regra/pendentes');
    assert.ok(daAna.body.length > 0 && daAna.body.every((x) => x.pode_assinar), 'a Ana perdeu a propria fila');
  });

  await test('(20) usuario DESATIVADO nao assina, mesmo estando na lista (autorizacao, M-1)', async () => {
    const r = await enviar([{ material_id: matCaro, quantidade: 2 }]);
    const [p] = await pendencias(r.id);
    await dbRun(db, 'UPDATE usuarios SET ativo = 0 WHERE id = ?', [ANA.id]);
    try {
      const res = await como(ANA).put(`/api/almoxarifado/requisicoes/${r.id}/aprovacoes-regra/${p.id}/aprovar`);
      assert.strictEqual(res.status, 403);
      assert.strictEqual(res.body.error, 'Usuário inativo não pode assinar aprovação de regra');

      // E a regra dela CONTINUA desativável — é a saída para esse caso (regras, M3).
      const desativa = await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${rValor.body.id}`)
        .send({ nome: 'Valor alto', valor_minimo: 1000, aprovadores: [ANA.id], ativo: false });
      assert.strictEqual(desativa.status, 200, `desativar regra de aprovador inativo: ${JSON.stringify(desativa.body)}`);
      assert.ok(desativa.body.pendencias_obsoletadas >= 1);
      // Metade positiva: ACRESCENTAR um aprovador inativo novo continua recusado.
      const novoInativo = await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${rValor.body.id}`)
        .send({ nome: 'Valor alto', valor_minimo: 1000, aprovadores: [ANA.id, 99], ativo: false });
      assert.strictEqual(novoInativo.status, 400);
      assert.strictEqual(novoInativo.body.error, 'Aprovador inexistente ou inativo: 99');
    } finally {
      await dbRun(db, 'UPDATE usuarios SET ativo = 1 WHERE id = ?', [ANA.id]);
    }
  });

  await test('(21) contagem da tela nao conta requisicao morta (regras, M4)', async () => {
    const r = await enviar([{ material_id: matBarato, quantidade: 60 }]); // "Quantidade grande"
    assert.strictEqual((await como(ADMIN).get(`/api/almoxarifado/requisicoes/${r.id}`)).body.pendencias_regra_abertas, 1);
    await como(SOLIC).put(`/api/almoxarifado/requisicoes/${r.id}/rejeitar`).send({ motivo: 'desisti' });
    assert.strictEqual((await como(ADMIN).get(`/api/almoxarifado/requisicoes/${r.id}`)).body.pendencias_regra_abertas, 0);
    const linha = (await como(ADMIN).get('/api/almoxarifado/requisicoes')).body.find((x) => x.id === r.id);
    assert.strictEqual(linha.pendencias_regra_abertas, 0);
  });

  await test('(22) dois /aprovar simultaneos: um passa, o outro desfaz a reserva que criou (testes, 1)', async () => {
    // O rollback de /aprovar só roda quando o UPDATE perde — e só a CORRIDA faz isso com o código
    // real (a pré-checagem já barra o caso sequencial). Sem o rollback: duas reservas de 10.
    const r = await enviar([{ material_id: matBarato, quantidade: 10 }]);
    assert.strictEqual((await pendencias(r.id)).length, 0);
    setUser(CAIO);
    const respostas = await Promise.all([1, 2].map(() => request(app).put(`/api/almoxarifado/requisicoes/${r.id}/aprovar`)));
    assert.deepStrictEqual(respostas.map((x) => x.status).sort(), [200, 400], JSON.stringify(respostas.map((x) => x.body)));
    const ativas = await reservasAtivas(r.id);
    assert.strictEqual(ativas.n, 1, `ficaram ${ativas.n} reservas ativas`);
    assert.strictEqual(ativas.q, 10, `reservado ${ativas.q} para um item de 10`);
  });

  await test('(23) /enviar zera o carimbo: rascunho carimbado, avaliador falhando, o /aprovar NAO passa (regras, I2)', async () => {
    await como(ADMIN).put(`/api/almoxarifado/regras-aprovacao/${rValor.body.id}`)
      .send({ nome: 'Valor alto', valor_minimo: 1000, aprovadores: [ANA.id], ativo: true });
    const rasc = await como(SOLIC).post('/api/almoxarifado/requisicoes')
      .send({ itens: [{ material_id: matCaro, quantidade: 2 }], urgencia: 'NORMAL', os_referencia: 'OS-INT', salvar_rascunho: true });
    assert.strictEqual(rasc.body.status, 'RASCUNHO');
    await dbRun(db, 'UPDATE requisicoes_almoxarifado SET regras_avaliadas_em = CURRENT_TIMESTAMP WHERE id = ?', [rasc.body.id]);
    const original = approvalRulesService.avaliarRequisicao;
    approvalRulesService.avaliarRequisicao = async () => { throw new Error('falha proposital'); };
    try {
      const env = await como(SOLIC).post(`/api/almoxarifado/requisicoes/${rasc.body.id}/enviar`);
      assert.strictEqual(env.status, 200, JSON.stringify(env.body));
    } finally {
      approvalRulesService.avaliarRequisicao = original;
    }
    const ap = await como(CAIO).put(`/api/almoxarifado/requisicoes/${rasc.body.id}/aprovar`);
    assert.strictEqual(ap.status, 400, `o rascunho carimbado passou pelo gate vazio: ${JSON.stringify(ap.body)}`);
    assert.strictEqual(ap.body.error, 'Requisição tem aprovação de regra pendente: Valor alto');
  });

  await test('(24) migracao: a coluna nasce carimbando enviadas e NAO rascunhos; o boot seguinte nao carimba nada', async () => {
    const { initSchema } = require('../../services/almoxarifado/schema');
    await dbRun(db, 'ALTER TABLE requisicoes_almoxarifado DROP COLUMN regras_avaliadas_em');
    const ins = (status) => dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status)
      VALUES (?, 10, 'x', ?)`, [`REQ-MIG-${status}-${Date.now()}`, status]);
    const enviada = (await ins('PENDENTE')).lastID;
    const rascunho = (await ins('RASCUNHO')).lastID;
    await initSchema(db); // a coluna NASCE aqui
    const carimbo = async (id) => (await dbGet(db, 'SELECT regras_avaliadas_em c FROM requisicoes_almoxarifado WHERE id = ?', [id])).c;
    assert.ok(await carimbo(enviada), 'a requisicao ja enviada nao foi carimbada no nascimento da coluna');
    assert.strictEqual(await carimbo(rascunho), null, 'o rascunho foi carimbado');

    // Boot seguinte: uma requisição cujo avaliador falhou (carimbo NULL) tem de CONTINUAR NULL —
    // senão todo restart abriria em silêncio a porta que a 9.7/C2 fechou.
    const falhou = (await ins('PENDENTE')).lastID;
    await initSchema(db);
    assert.strictEqual(await carimbo(falhou), null, 'o boot seguinte carimbou uma requisicao nao avaliada');
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
