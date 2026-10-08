/**
 * Etapa 77 (T0, C137) — quem libera a reserva de uma REQUISICAO.
 *
 * Ate a 76, `POST /reservas/:id/liberar` so exigia `reservar` (ADMINISTRADOR, ENGENHARIA, PRODUCAO,
 * ALMOXARIFE) — e o fallback `getPerfilFromUser` cai em PRODUCAO, entao qualquer usuario sem perfil
 * soltava o material que o almoxarifado tinha prometido para a requisicao de OUTRA pessoa (sonda da
 * Fase 0: 200 para sem perfil, PRODUCAO e ENGENHARIA). Agora, para reserva de origem REQUISICAO, a rota
 * exige ser QUEM PEDIU a requisicao (`requisicoes_almoxarifado.solicitante_id` — NAO a coluna
 * `reservas.solicitante_id`, que e o aprovador) ou a acao `liberar_reserva_requisicao`
 * = [ADMINISTRADOR, ALMOXARIFE]. O gate `reservar` fica (duas camadas). A reserva MANUAL nao muda.
 *
 * O 403 sai SEM `perfil` (Fase 2 do plano, molde do /rejeitar): o interceptor do axios reescreve todo
 * 403 com `acao` E `perfil` para "Solicite acesso", e a regra aqui e de identidade, nao de acesso.
 *
 * Entra PELA ROTA, com o requirePermission real e usuarios por perfil.
 *
 * Plano: docs/superpowers/plans/2026-10-02-almoxarifado-etapa77-reserva-requisicao-so-pela-requisicao.md (T0)
 *
 * Executar: cd server && node tests/api/reservaLiberarSoQuemPode.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet, dbAll } = require('../../services/almoxarifado/db');
const { ACAO_PERFIS } = require('../../services/almoxarifado/permissions');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message.replace(/\s*\n\s*/g, ' ')}`); });
}

const ADMIN = { id: 1, nome: 'Adm 77L', role: 'admin', is_superadmin: 1, email: 'a77l@t.com' };
// SOL: sem perfil (role user) -> PRODUCAO pelo fallback. E quem PEDE as requisicoes deste arquivo.
const SOL = { id: 7701, nome: 'Sol 77L', role: 'user', email: 's77l@t.com' };
const SEM_PERFIL = { id: 7709, nome: 'Outro sem perfil 77L', role: 'user', email: 'o77l@t.com' };
const PRODUCAO = { id: 7702, nome: 'Prod 77L', role: 'user', perfil_almoxarifado: 'PRODUCAO', email: 'p77l@t.com' };
const ENGENHARIA = { id: 7703, nome: 'Eng 77L', role: 'user', perfil_almoxarifado: 'ENGENHARIA', email: 'e77l@t.com' };
const ALMOXARIFE = { id: 7704, nome: 'Almox 77L', role: 'user', perfil_almoxarifado: 'ALMOXARIFE', email: 'x77l@t.com' };
const ADM_PERFIL = { id: 7705, nome: 'AdmPerfil 77L', role: 'user', perfil_almoxarifado: 'ADMINISTRADOR', email: 'ap77l@t.com' };
const SEM_RESERVAR = {
  GESTOR: { id: 7706, nome: 'Ges 77L', role: 'user', perfil_almoxarifado: 'GESTOR' },
  COMPRAS: { id: 7707, nome: 'Com 77L', role: 'user', perfil_almoxarifado: 'COMPRAS' },
  CONSULTA: { id: 7708, nome: 'Con 77L', role: 'user', perfil_almoxarifado: 'CONSULTA' },
  QUALIDADE: { id: 7710, nome: 'Qua 77L', role: 'user', perfil_almoxarifado: 'QUALIDADE' },
};
// Fase 5: admin de SISTEMA sem perfil do modulo (nao e superadmin) — so o `can()` o promove a ADMINISTRADOR.
const ADMIN_SISTEMA = { id: 7711, nome: 'AdmSis 77L', role: 'admin', email: 'as77l@t.com' };
const GESTOR_T = SEM_RESERVAR.GESTOR; // tem `reservar_outra_os` (o gate do /transferir)
const API = '/api/almoxarifado';
const ACAO = 'liberar_reserva_requisicao';
const CHAVES_OK = ['quantidade_liberada', 'reserva_id', 'status', 'success'];
const M2 = (numero) => `Sem permissão para liberar a reserva da requisição ${numero}: só quem pediu a requisição, o almoxarife ou o administrador liberam`;
// Fase 5 (F1): o dono, depois que a separacao comecou.
const M3 = (numero) => `Sem permissão para liberar a reserva da requisição ${numero}: ela já está em separação — só o almoxarife ou o administrador liberam agora`;
let seq = 0;
let terminou = false;
process.on('exit', (code) => {
  if (!terminou && code === 0) { console.error('  ✗ o arquivo SAIU NO MEIO (event loop vazio)'); process.exitCode = 1; }
});

(async () => {
  console.log('\n=== Etapa 77 (T0): reserva de requisicao so e liberada por quem pediu ou por quem tem a acao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });
  setUser({ ...ADMIN });
  const as = async (u, fn) => { setUser({ ...u }); try { return await fn(); } finally { setUser({ ...ADMIN }); } };

  const material = async (q) => {
    const c = `E77L-${++seq}`;
    return (await dbRun(db, `INSERT INTO materiais_almoxarifado
      (codigo, nome, unidade, quantidade_atual, quantidade_minima, ativo, material_critico)
      VALUES (?, ?, 'PC', ?, 0, 1, 0)`, [c, `Mat ${c}`, q])).lastID;
  };
  // Requisicao pedida por `solicitante` (SOL por padrao) e aprovada pelo ADMIN (id 1) pela rota:
  // a reserva nasce com reservas.solicitante_id = 1 (o APROVADOR) — e e isso que separa as duas colunas.
  const reqAprovada = async (q = 4, solicitante = SOL) => {
    const m = await material(q);
    const numero = `REQ-E77L-${++seq}`;
    const R = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado
        (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, ?, ?, 'PENDENTE', 'NORMAL', '2026-09-01 10:00:00', 1)`, [numero, solicitante.id, solicitante.nome])).lastID;
    const itemId = (await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado
      (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
      VALUES (?,?,?,0,0,0)`, [R, m, q])).lastID;
    setUser({ ...ADMIN });
    const ap = await request(app).put(`${API}/requisicoes/${R}/aprovar`).send({});
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.body));
    const r = await dbGet(db, `SELECT * FROM reservas_material_almoxarifado WHERE requisicao_id = ? AND status = 'ATIVA'`, [R]);
    assert.ok(r, 'a aprovacao tinha de criar a reserva');
    assert.strictEqual(r.origem, 'REQUISICAO');
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    return { m, R, numero, r, itemId };
  };
  const st = async (id) => (await dbGet(db, 'SELECT status FROM requisicoes_almoxarifado WHERE id = ?', [id])).status;
  const reserva = (id) => dbGet(db, 'SELECT * FROM reservas_material_almoxarifado WHERE id = ?', [id]);
  const liberacoes = async (rid) => (await dbGet(db, `SELECT COUNT(*) n FROM movimentacoes_almoxarifado
    WHERE reserva_id = ? AND tipo = 'LIBERACAO_RESERVA'`, [rid])).n;
  const liberarComo = (u, id, body = {}) => as(u, () => request(app).post(`${API}/reservas/${id}/liberar`)
    .send({ motivo: 'teste 77', ...body }).then((x) => x));

  // O 403 da regra nova: corpo EXATO (sem `perfil` — Fase 2), reserva intacta, nada no livro.
  const assertBarrado = async (u, rotulo, alvo) => {
    const { R, numero, r } = alvo;
    const lib = await liberarComo(u, r.id);
    assert.strictEqual(lib.status, 403, `${rotulo} liberou sem ${ACAO}: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.deepStrictEqual(lib.body, { error: M2(numero), acao: ACAO }, `${rotulo}: corpo do 403`);
    const depois = await reserva(r.id);
    assert.strictEqual(depois.status, 'ATIVA');
    assert.strictEqual(Number(depois.quantidade), Number(r.quantidade));
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
    assert.strictEqual(await liberacoes(r.id), 0, 'nenhuma LIBERACAO_RESERVA no livro');
  };

  // ══════════════ RN-05 — a lista positiva ══════════════

  await test('[RN-05] (a) quem pediu, SEM perfil (-> PRODUCAO), libera tudo: 200 com as quatro chaves e R volta a APROVADO', async () => {
    const { R, r } = await reqAprovada();
    // Pre-condicao que da sentido ao teste: a coluna da reserva e o APROVADOR, nao quem pediu.
    assert.strictEqual(Number(r.solicitante_id), ADMIN.id);
    assert.notStrictEqual(Number(r.solicitante_id), SOL.id);
    const lib = await liberarComo(SOL, r.id);
    assert.strictEqual(lib.status, 200, `o solicitante foi barrado: ${JSON.stringify(lib.body)}`);
    assert.deepStrictEqual(Object.keys(lib.body).sort(), CHAVES_OK);
    assert.deepStrictEqual(lib.body, { success: true, reserva_id: r.id, quantidade_liberada: 4, status: 'LIBERADA' });
    assert.strictEqual((await reserva(r.id)).status, 'LIBERADA');
    assert.strictEqual(await st(R), 'APROVADO');
  });

  await test('[RN-05] (b) quem pediu libera PARTE (1 de 4): 200 e R fica PARCIALMENTE_RESERVADA', async () => {
    const { R, r } = await reqAprovada();
    const lib = await liberarComo(SOL, r.id, { quantidade: 1 });
    assert.strictEqual(lib.status, 200, `o solicitante foi barrado: ${JSON.stringify(lib.body)}`);
    const depois = await reserva(r.id);
    assert.deepStrictEqual([depois.status, Number(depois.quantidade)], ['ATIVA', 3]);
    assert.strictEqual(await st(R), 'PARCIALMENTE_RESERVADA');
  });

  await test('[RN-05] (c) ALMOXARIFE que nao pediu libera: 200', async () => {
    const { R, r } = await reqAprovada();
    const lib = await liberarComo(ALMOXARIFE, r.id);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.strictEqual((await reserva(r.id)).status, 'LIBERADA');
    assert.strictEqual(await st(R), 'APROVADO');
  });

  await test('[RN-05] (d) ADMINISTRADOR (perfil do modulo, nao admin de sistema) libera: 200', async () => {
    const { r } = await reqAprovada();
    const lib = await liberarComo(ADM_PERFIL, r.id);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.strictEqual((await reserva(r.id)).status, 'LIBERADA');
  });

  // Fase 5 (sobrevivente 3): o admin de SISTEMA (role admin, sem perfil do modulo) so passa porque o
  // `can()` consulta `getPerfilFromUser`, que o promove a ADMINISTRADOR. Trocar o `can()` por uma
  // lista literal de perfis (`['ADMINISTRADOR','ALMOXARIFE'].includes(user.perfil_almoxarifado)`)
  // passava em todo o resto do arquivo — este caso existe para isso cair.
  await test('[RN-05] (e) admin de SISTEMA (role admin, sem perfil do modulo) que nao pediu libera: 200', async () => {
    const { R, r } = await reqAprovada();
    assert.strictEqual(ADMIN_SISTEMA.perfil_almoxarifado, undefined);
    const lib = await liberarComo(ADMIN_SISTEMA, r.id);
    assert.strictEqual(lib.status, 200, `o admin de sistema foi barrado: ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.strictEqual((await reserva(r.id)).status, 'LIBERADA');
    assert.strictEqual(await st(R), 'APROVADO');
  });

  // ══════════════ Fase 5 — F1: o dono so libera enquanto o /cancelar ainda aceitaria ══════════════
  //
  // A excecao do dono existe porque liberar a reserva da propria requisicao e a desistencia PARCIAL que o
  // /cancelar ja lhe da inteira. Depois que a separacao comecou o /cancelar recusa (a maquina nao tem
  // EM_SEPARACAO -> CANCELADO) — e a liberacao continuava aceita: o material separado voltava ao
  // disponivel, outra reserva o prometia, e a entrega morria em "Maximo: 0" (sonda da revisao).
  const separar = (alvo, q) => as(ALMOXARIFE, () => request(app).put(`${API}/requisicoes/${alvo.R}/separacao`)
    .send({ itens_separados: [{ item_id: alvo.itemId, quantidade_separada: q }] }).then((x) => x));
  const entregar = (alvo, q) => as(ALMOXARIFE, () => request(app).put(`${API}/requisicoes/${alvo.R}/entregar`)
    .send({ itens_atendidos: [{ item_id: alvo.itemId, quantidade_atendida: q }] }).then((x) => x));
  const matR = (m) => dbGet(db, 'SELECT quantidade_atual AS atual, COALESCE(quantidade_reservada,0) AS reservada FROM materiais_almoxarifado WHERE id = ?', [m]);

  for (const [estado, prepara] of [
    ['EM_SEPARACAO', async () => {}],
    ['PRONTA_PARA_RETIRADA', async (alvo) => {
      const lr = await as(ALMOXARIFE, () => request(app).put(`${API}/requisicoes/${alvo.R}/liberar-retirada`).send({}).then((x) => x));
      assert.strictEqual(lr.status, 200, `liberar-retirada: ${JSON.stringify(lr.body)}`);
    }],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    await test(`[F1] o dono (sem a acao) com a requisicao ${estado}: 403 M3, reserva intacta, e a entrega ainda sai`, async () => {
      const alvo = await reqAprovada(6);
      const sep = await separar(alvo, 6);
      assert.strictEqual(sep.status, 200, `separacao: ${JSON.stringify(sep.body)}`);
      await prepara(alvo);
      assert.strictEqual(await st(alvo.R), estado);
      // A premissa da regra: o /cancelar do dono recusa neste status.
      const canc = await as(SOL, () => request(app).put(`${API}/requisicoes/${alvo.R}/cancelar`).send({ motivo: 'x' }).then((x) => x));
      assert.strictEqual(canc.status, 400, `o /cancelar aceitou em ${estado}: ${JSON.stringify(canc.body)}`);
      const lib = await liberarComo(SOL, alvo.r.id);
      assert.strictEqual(lib.status, 403, `o dono liberou com a requisicao ${estado}: ${lib.status} ${JSON.stringify(lib.body)}`);
      assert.deepStrictEqual(lib.body, { error: M3(alvo.numero), acao: ACAO });
      const depois = await reserva(alvo.r.id);
      assert.deepStrictEqual([depois.status, Number(depois.quantidade)], ['ATIVA', 6]);
      assert.deepStrictEqual(await matR(alvo.m), { atual: 6, reservada: 6 });
      assert.strictEqual(await st(alvo.R), estado);
      assert.strictEqual(await liberacoes(alvo.r.id), 0, 'nenhuma LIBERACAO_RESERVA no livro');
      // Outro PRODUCAO nao consegue prometer o separado de novo (o disponivel continua 0)...
      const man = await as(PRODUCAO, () => request(app).post(`${API}/reservas`).send({ material_id: alvo.m, quantidade: 6, projeto_id: 9 }).then((x) => x));
      assert.notStrictEqual(man.status, 201, `o separado foi reprometido: ${JSON.stringify(man.body)}`);
      // ...e a entrega da requisicao sai inteira.
      const ent = await entregar(alvo, 6);
      assert.strictEqual(ent.status, 200, `a entrega falhou: ${JSON.stringify(ent.body)}`);
      assert.strictEqual((await reserva(alvo.r.id)).status, 'CONSUMIDA');
    });
  }

  await test('[F1] metade positiva: com a requisicao EM_SEPARACAO o ALMOXARIFE e o ADMINISTRADOR (perfil) ainda liberam: 200', async () => {
    for (const u of [ALMOXARIFE, ADM_PERFIL]) {
      // eslint-disable-next-line no-await-in-loop
      const alvo = await reqAprovada(6);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await separar(alvo, 6)).status, 200);
      // eslint-disable-next-line no-await-in-loop
      const lib = await liberarComo(u, alvo.r.id);
      assert.strictEqual(lib.status, 200, `${u.perfil_almoxarifado} foi barrado em EM_SEPARACAO: ${JSON.stringify(lib.body)}`);
      // eslint-disable-next-line no-await-in-loop
      assert.strictEqual((await reserva(alvo.r.id)).status, 'LIBERADA');
    }
  });

  await test('[F1] nao-dono sem a acao com a requisicao EM_SEPARACAO: continua M2 (nao M3)', async () => {
    const alvo = await reqAprovada(6);
    assert.strictEqual((await separar(alvo, 6)).status, 200);
    const lib = await liberarComo(PRODUCAO, alvo.r.id);
    assert.strictEqual(lib.status, 403, JSON.stringify(lib.body));
    assert.deepStrictEqual(lib.body, { error: M2(alvo.numero), acao: ACAO });
  });

  // ══════════════ Fase 5 — F2: reserva de requisicao nao muda de dono ══════════════
  //
  // `PUT /reservas/:id/transferir` (gate `reservar_outra_os`: ADMINISTRADOR, GESTOR) re-apontava a reserva
  // da requisicao para outra OS/projeto: ela continuava origem REQUISICAO, presa a requisicao, mas dizendo
  // que o material era de outra obra (sonda da revisao: 200, `projeto_id = 999`). A reserva da requisicao
  // pertence a requisicao — mudar o destino e mudar a requisicao, nao a reserva.
  const transferirComo = (u, id, body) => as(u, () => request(app).put(`${API}/reservas/${id}/transferir`)
    .send({ motivo: 'teste 77', ...body }).then((x) => x));

  await test('[F2] GESTOR transferindo a reserva da requisicao para outra OS/projeto: 400, nada muda', async () => {
    const { r } = await reqAprovada();
    const t = await transferirComo(GESTOR_T, r.id, { projeto_id: 999, os_referencia: 'OS-OUTRA' });
    assert.strictEqual(t.status, 400, `transferiu a reserva da requisicao: ${t.status} ${JSON.stringify(t.body)}`);
    const q = await dbGet(db, 'SELECT numero FROM requisicoes_almoxarifado WHERE id = ?', [r.requisicao_id]);
    assert.deepStrictEqual(t.body, { error: `A reserva ${r.id} é da requisição ${q.numero} e não pode ser transferida para outra OS ou projeto` });
    const depois = await reserva(r.id);
    assert.deepStrictEqual(
      [depois.status, depois.projeto_id, depois.os_id, depois.os_referencia, depois.cliente_id],
      [r.status, r.projeto_id, r.os_id, r.os_referencia, r.cliente_id],
    );
  });

  await test('[F2] metade positiva: a reserva MANUAL continua transferivel pelo GESTOR (200)', async () => {
    const m = await material(10);
    const cria = await request(app).post(`${API}/reservas`).send({ material_id: m, quantidade: 2, projeto_id: 7 });
    assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
    const t = await transferirComo(GESTOR_T, cria.body.id, { projeto_id: 999 });
    assert.strictEqual(t.status, 200, JSON.stringify(t.body));
    assert.strictEqual(Number((await reserva(cria.body.id)).projeto_id), 999);
  });

  // ══════════════ RN-06 — a lista NEGATIVA ══════════════

  await test('[RN-06] (a) usuario SEM perfil (-> PRODUCAO) que nao pediu: 403 M2, reserva intacta', async () => {
    await assertBarrado(SEM_PERFIL, 'sem perfil (PRODUCAO)', await reqAprovada());
  });

  await test('[RN-06] (b) PRODUCAO que nao pediu: 403 M2, reserva intacta', async () => {
    await assertBarrado(PRODUCAO, 'PRODUCAO', await reqAprovada());
  });

  await test('[RN-06] (c) ENGENHARIA que nao pediu: 403 M2, reserva intacta', async () => {
    await assertBarrado(ENGENHARIA, 'ENGENHARIA', await reqAprovada());
  });

  await test('[RN-06] (d) GESTOR, COMPRAS, CONSULTA, QUALIDADE: 403 acao=reservar (o gate da rota, inalterado)', async () => {
    const { R, r } = await reqAprovada();
    for (const [perfil, u] of Object.entries(SEM_RESERVAR)) {
      // eslint-disable-next-line no-await-in-loop
      const lib = await liberarComo(u, r.id);
      assert.strictEqual(lib.status, 403, `${perfil}: ${lib.status}`);
      assert.strictEqual(lib.body.acao, 'reservar', `${perfil}: ${JSON.stringify(lib.body)}`);
      assert.strictEqual(lib.body.perfil, perfil);
    }
    assert.strictEqual((await reserva(r.id)).status, 'ATIVA');
    assert.strictEqual(await st(R), 'TOTALMENTE_RESERVADA');
  });

  await test('[RN-06] (e) o mapa: liberar_reserva_requisicao = [ADMINISTRADOR, ALMOXARIFE]', async () => {
    assert.deepStrictEqual(ACAO_PERFIS[ACAO], ['ADMINISTRADOR', 'ALMOXARIFE'],
      `o mapa de ${ACAO} mudou: ${JSON.stringify(ACAO_PERFIS[ACAO])}`);
  });

  await test('[RN-06] (f) o APROVADOR nao e o dono: PRODUCAO cujo id e reservas.solicitante_id (forjado) -> 403', async () => {
    const alvo = await reqAprovada();
    await dbRun(db, 'UPDATE reservas_material_almoxarifado SET solicitante_id = ? WHERE id = ?', [PRODUCAO.id, alvo.r.id]);
    assert.strictEqual(Number((await reserva(alvo.r.id)).solicitante_id), PRODUCAO.id);
    await assertBarrado(PRODUCAO, 'PRODUCAO dono da COLUNA da reserva (nao da requisicao)', alvo);
  });

  await test('[RN-06] (g) ordem: nao-dono sem a acao numa reserva ja LIBERADA -> 403 (permissao antes do estado); inexistente -> 404', async () => {
    const { numero, r } = await reqAprovada();
    assert.strictEqual((await liberarComo(ALMOXARIFE, r.id)).status, 200);
    const lib = await liberarComo(PRODUCAO, r.id);
    assert.strictEqual(lib.status, 403, `PRODUCAO liberou sem ${ACAO} (ou o estado veio antes): ${lib.status} ${JSON.stringify(lib.body)}`);
    assert.deepStrictEqual(lib.body, { error: M2(numero), acao: ACAO });
    const nada = await liberarComo(PRODUCAO, 99999999);
    assert.strictEqual(nada.status, 404, JSON.stringify(nada.body));
    assert.strictEqual(nada.body.error, 'Reserva não encontrada');
  });

  // ══════════════ RN-07 — reserva manual e o job, inalterados ══════════════

  await test('[RN-07] reserva MANUAL alheia: ENGENHARIA cria, OUTRO PRODUCAO libera -> 200 (declarado, C novo)', async () => {
    const m = await material(10);
    const cria = await as(ENGENHARIA, () => request(app).post(`${API}/reservas`).send({ material_id: m, quantidade: 4, projeto_id: 7 }).then((x) => x));
    assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
    const r = await reserva(cria.body.id);
    assert.strictEqual(r.origem, 'MANUAL');
    const lib = await liberarComo(PRODUCAO, r.id);
    assert.strictEqual(lib.status, 200, JSON.stringify(lib.body));
    assert.strictEqual((await reserva(r.id)).status, 'LIBERADA');
  });

  await test('[RN-07] o job de expiracao vence reserva de requisicao como hoje (a checagem e da rota de liberar)', async () => {
    const { r } = await reqAprovada();
    await dbRun(db, "UPDATE reservas_material_almoxarifado SET expira_em = '2026-01-01' WHERE id = ?", [r.id]);
    const job = await request(app).post(`${API}/reservas/processar-expiracao`).send({ referencia: '2026-06-01' });
    assert.strictEqual(job.status, 200, JSON.stringify(job.body));
    assert.strictEqual((await reserva(r.id)).status, 'EXPIRADA');
  });

  // ══════════════ RN-08 — a listagem diz de quem e ══════════════

  await test('[RN-08] GET /reservas: a de requisicao traz requisicao_numero e requisicao_solicitante_id; a manual, os dois null', async () => {
    // Fase 5 (sobrevivente 4): ate aqui cada requisicao do arquivo tinha UM item, entao o id da requisicao e
    // o do item andavam juntos e um JOIN por `r.item_requisicao_id` passava. Tres itens a mais numa
    // requisicao avulsa descolam os dois contadores antes da requisicao deste caso.
    const avulsa = (await dbRun(db, `INSERT INTO requisicoes_almoxarifado (numero, solicitante_id, solicitante_nome, status, urgencia, created_at, ativo)
      VALUES (?, ?, ?, 'RASCUNHO', 'NORMAL', '2026-09-01 10:00:00', 1)`, [`REQ-E77L-AV-${++seq}`, SOL.id, SOL.nome])).lastID;
    const mAv = await material(1);
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO itens_requisicao_almoxarifado (requisicao_id, material_id, quantidade_solicitada, quantidade_separada, quantidade_entregue, quantidade_atendida)
        VALUES (?,?,1,0,0,0)`, [avulsa, mAv]);
    }
    const { R, numero, r } = await reqAprovada();
    assert.ok(r.item_requisicao_id != null, 'a reserva da aprovacao tinha de citar o item');
    assert.notStrictEqual(Number(r.item_requisicao_id), Number(R), 'pre-condicao: id do item e da requisicao tinham de divergir');
    const m = await material(10);
    const cria = await request(app).post(`${API}/reservas`).send({ material_id: m, quantidade: 2, projeto_id: 7 });
    assert.strictEqual(cria.status, 201, JSON.stringify(cria.body));
    const lista = await as(PRODUCAO, () => request(app).get(`${API}/reservas`).then((x) => x));
    assert.strictEqual(lista.status, 200);
    const daReq = lista.body.find((x) => x.id === r.id);
    const manual = lista.body.find((x) => x.id === cria.body.id);
    assert.ok(daReq && manual, 'as duas reservas tinham de vir na lista');
    assert.strictEqual(daReq.requisicao_numero, numero);
    assert.strictEqual(Number(daReq.requisicao_solicitante_id), SOL.id);
    assert.strictEqual(manual.requisicao_numero, null);
    assert.strictEqual(manual.requisicao_solicitante_id, null);
    // Fase 5 (F1): o status da requisicao, para a tela saber se o dono ainda libera.
    assert.strictEqual(daReq.requisicao_status, 'TOTALMENTE_RESERVADA');
    assert.strictEqual(manual.requisicao_status, null);
    for (const k of ['id', 'material_id', 'status', 'origem', 'requisicao_id', 'solicitante_id', 'material_codigo', 'material_nome', 'material_unidade', 'saldo']) {
      assert.ok(k in daReq, `a chave de hoje ${k} sumiu`);
    }
    assert.strictEqual(Number(daReq.saldo), 4);
  });

  // ══════════════ RN-09 — minhas-permissoes ══════════════

  await test('[RN-09] minhas-permissoes: liberar_reserva_requisicao true para ALMOXARIFE, false para PRODUCAO e sem perfil', async () => {
    const ver = async (u) => {
      const r = await as(u, () => request(app).get(`${API}/minhas-permissoes`).then((x) => x));
      assert.strictEqual(r.status, 200);
      assert.ok(ACAO in r.body.acoes, `${ACAO} nao veio em acoes`);
      return r.body.acoes[ACAO];
    };
    assert.strictEqual(await ver(ALMOXARIFE), true, 'ALMOXARIFE');
    assert.strictEqual(await ver(PRODUCAO), false, `PRODUCAO tem ${ACAO}`);
    assert.strictEqual(await ver(SEM_PERFIL), false, `sem perfil tem ${ACAO}`);
  });

  terminou = true;
  await close();
  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
