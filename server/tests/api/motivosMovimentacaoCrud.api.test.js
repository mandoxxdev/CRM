/**
 * Etapa 66, Task 1 (tronco) — motivo de movimentacao vira CADASTRO.
 *
 * Plano: docs/superpowers/plans/2026-10-01-almoxarifado-etapa66-motivos-de-movimentacao.md
 * (o contrato que vale e o da secao "Fase 2 — revisao do plano", que prevalece sobre o texto
 * anterior: unicidade por `nome_normalizado`, duas mensagens de duplicado, `ativo` so 0|1,
 * `?tipo=` invalido com 400 e a lista dos tipos servida pelo servidor).
 *
 * Prova RN-01 (cada 400 com a mensagem LITERAL), RN-02 (matriz de perfis com os dois lados,
 * nomeando o perfil no vermelho), RN-03 (presenca antes da ausencia; `?todos=1`; reativar), RN-04
 * (trilha com de/para; segundo DELETE nao audita) e o `?tipo=` que filtra so ativos do tipo.
 *
 * Entra pela ROTA (o contrato que a tela consome) e pelo SERVICO (`motivoMovimentacao.js`), que e
 * onde a regra mora — a rota so traduz HTTP.
 *
 * Executar: cd server && node tests/api/motivosMovimentacaoCrud.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbAll, dbGet } = require('../../services/almoxarifado/db');
const motivoService = require('../../services/almoxarifado/motivoMovimentacao');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const ADMIN = { id: 66, nome: 'Admin Etapa66', role: 'admin', is_superadmin: 1, email: 'e66@test.com' };

const PERFIS_SEM_CONFIGURAR = [
  ['ALMOXARIFE', { id: 661, nome: 'Almoxarife', perfil_almoxarifado: 'ALMOXARIFE' }],
  ['GESTOR', { id: 662, nome: 'Gestor', perfil_almoxarifado: 'GESTOR' }],
  ['COMPRAS', { id: 663, nome: 'Compras', perfil_almoxarifado: 'COMPRAS' }],
  ['ENGENHARIA', { id: 664, nome: 'Engenharia', perfil_almoxarifado: 'ENGENHARIA' }],
  ['CONSULTA', { id: 665, nome: 'Consulta', perfil_almoxarifado: 'CONSULTA' }],
  ['QUALIDADE', { id: 666, nome: 'Qualidade', perfil_almoxarifado: 'QUALIDADE' }],
  ['PRODUCAO (sem perfil — fallback)', { id: 667, nome: 'Chao de Fabrica' }],
];

const URL = '/api/almoxarifado/motivos-movimentacao';
let seq = 0;
const uniq = (p) => `${p} ${Date.now() % 1000000}-${++seq}`;

(async () => {
  console.log('\n=== Etapa 66 Task 1: cadastro de motivos de movimentacao ===\n');
  const { app, db, close, setUser } = await createTestApp({ user: { ...ADMIN } });

  const listar = (query = {}) => request(app).get(URL).query(query);
  const criar = (body) => request(app).post(URL).send(body);
  const nomesDe = (res) => res.body.map((m) => m.nome);

  // ── RN-01: criar ───────────────────────────────────────────────────────────────────────────
  await test('(1) RN-01 criar: 201 com { id, nome, tipos[], ativo:1 } e aparece no GET (tipos como array)', async () => {
    const nome = uniq('Avaria no manuseio');
    const antes = await listar();
    assert.strictEqual(antes.status, 200, `GET antes falhou: ${antes.status} ${JSON.stringify(antes.body)}`);
    assert.ok(!nomesDe(antes).includes(nome), 'o motivo nao pode existir antes de ser criado');

    const res = await criar({ nome: `  ${nome}  `, tipos: ['AJUSTE', 'PERDA'] });
    assert.strictEqual(res.status, 201, `POST falhou: ${res.status} ${JSON.stringify(res.body)}`);
    assert.deepStrictEqual(Object.keys(res.body).sort(), ['ativo', 'id', 'nome', 'tipos'],
      `corpo do 201 fora do contrato: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.nome, nome, `nome sem trim: ${JSON.stringify(res.body.nome)}`);
    assert.deepStrictEqual(res.body.tipos, ['AJUSTE', 'PERDA']);
    assert.strictEqual(res.body.ativo, 1);

    const depois = await listar();
    const item = depois.body.find((m) => m.id === res.body.id);
    assert.ok(item, `o motivo criado nao aparece no GET: ${JSON.stringify(nomesDe(depois))}`);
    assert.ok(Array.isArray(item.tipos), `GET devolveu tipos como ${typeof item.tipos} (${JSON.stringify(item.tipos)}) — a string JSON crua vazou`);
    assert.deepStrictEqual(item.tipos, ['AJUSTE', 'PERDA']);
  });

  await test('(2) RN-01 nome: vazio, so espacos, ausente e nao-texto dao 400 "Nome é obrigatório"', async () => {
    for (const nome of ['', '   ', undefined, null, 42, { a: 1 }]) {
      const r = await criar({ nome, tipos: ['AJUSTE'] });
      assert.strictEqual(r.status, 400, `nome ${JSON.stringify(nome)} deveria dar 400, veio ${r.status}`);
      assert.strictEqual(r.body.error, 'Nome é obrigatório', `nome ${JSON.stringify(nome)}: ${JSON.stringify(r.body)}`);
    }
  });

  await test('(3) RN-01 tipos: ausente, nao-array e vazio dao 400 "Informe ao menos um tipo de movimentação"', async () => {
    for (const tipos of [undefined, null, 'AJUSTE', [], {}]) {
      const r = await criar({ nome: uniq('Sem tipos'), tipos });
      assert.strictEqual(r.status, 400, `tipos ${JSON.stringify(tipos)} deveria dar 400, veio ${r.status}`);
      assert.strictEqual(r.body.error, 'Informe ao menos um tipo de movimentação',
        `tipos ${JSON.stringify(tipos)}: ${JSON.stringify(r.body)}`);
    }
  });

  await test('(4) RN-01 tipos: o PRIMEIRO invalido e nomeado; ESTORNO, SUCATA e DESBLOQUEIO ficam fora', async () => {
    const r = await criar({ nome: uniq('Tipo ruim'), tipos: ['AJUSTE', 'SUCATA', 'XYZ'] });
    assert.strictEqual(r.status, 400, `veio ${r.status}`);
    assert.strictEqual(r.body.error, 'Tipo de movimentação inválido para motivo: SUCATA');
    for (const t of ['ESTORNO', 'DESBLOQUEIO', 'RESERVA', 'AJUSTE_INVENTARIO']) {
      const x = await criar({ nome: uniq('Tipo fora'), tipos: [t] });
      assert.strictEqual(x.status, 400, `${t} aceito (${x.status}) — o cadastro so serve aos tipos da rota generica`);
      assert.strictEqual(x.body.error, `Tipo de movimentação inválido para motivo: ${t}`);
    }
  });

  await test('(5) RN-01 tipos repetidos sao removidos em silencio, ordem preservada', async () => {
    const r = await criar({ nome: uniq('Repetido'), tipos: ['PERDA', 'AJUSTE', 'PERDA', 'AJUSTE'] });
    assert.strictEqual(r.status, 201, `${r.status} ${JSON.stringify(r.body)}`);
    assert.deepStrictEqual(r.body.tipos, ['PERDA', 'AJUSTE']);
    const gravado = await dbGet(db, 'SELECT tipos FROM motivos_movimentacao_almoxarifado WHERE id = ?', [r.body.id]);
    assert.deepStrictEqual(JSON.parse(gravado.tipos), ['PERDA', 'AJUSTE']);
  });

  // ── RN-01: unicidade sem diferenciar maiusculas, inclusive acentuadas ──────────────────────
  await test('(6) RN-01 duplicado: "avaria"/"Avaria" e "Manutenção"/"MANUTENÇÃO" colidem com a mensagem literal', async () => {
    const base = uniq('Avaria Dup');
    const a = await criar({ nome: base, tipos: ['AJUSTE'] });
    assert.strictEqual(a.status, 201, `a 1a criacao precisa passar: ${a.status}`);
    const b = await criar({ nome: base.toLowerCase(), tipos: ['PERDA'] });
    assert.strictEqual(b.status, 400,
      `"${base.toLowerCase()}" aceito ao lado de "${base}" (${b.status}) — o relatorio por motivo partiria em dois`);
    assert.strictEqual(b.body.error, 'Já existe um motivo com este nome');

    const sufixo = uniq('');
    const m1 = await criar({ nome: `Manutenção${sufixo}`, tipos: ['AJUSTE'] });
    assert.strictEqual(m1.status, 201, `${m1.status} ${JSON.stringify(m1.body)}`);
    const m2 = await criar({ nome: `MANUTENÇÃO${sufixo}`, tipos: ['AJUSTE'] });
    assert.strictEqual(m2.status, 400,
      `"MANUTENÇÃO" aceito ao lado de "Manutenção" (${m2.status}) — COLLATE NOCASE so dobra ASCII`);
    assert.strictEqual(m2.body.error, 'Já existe um motivo com este nome');
    // NFD (c + cedilha combinante) e o mesmo nome que NFC.
    const m3 = await criar({ nome: `Manutenção${sufixo}`.normalize('NFD'), tipos: ['AJUSTE'] });
    assert.strictEqual(m3.status, 400, `a forma NFD entrou como nome novo (${m3.status})`);
  });

  await test('(7) RN-01 duplicado de DESATIVADO: a mensagem manda reativar', async () => {
    const nome = uniq('Motivo Antigo');
    const c = await criar({ nome, tipos: ['AJUSTE'] });
    await request(app).delete(`${URL}/${c.body.id}`);
    const r = await criar({ nome: nome.toUpperCase(), tipos: ['AJUSTE'] });
    assert.strictEqual(r.status, 400, `veio ${r.status}`);
    assert.strictEqual(r.body.error, 'Já existe um motivo desativado com este nome — reative-o');
  });

  // ── PUT ────────────────────────────────────────────────────────────────────────────────────
  await test('(8) PUT preserve-when-omitted: so nome muda tipos/ativo nao; so tipos muda nome nao', async () => {
    const nome = uniq('Editavel');
    const c = await criar({ nome, tipos: ['AJUSTE', 'PERDA'] });
    const r1 = await request(app).put(`${URL}/${c.body.id}`).send({ nome: `${nome} v2` });
    assert.strictEqual(r1.status, 200, `${r1.status} ${JSON.stringify(r1.body)}`);
    assert.deepStrictEqual(r1.body, { id: c.body.id, nome: `${nome} v2`, tipos: ['AJUSTE', 'PERDA'], ativo: 1 });
    const r2 = await request(app).put(`${URL}/${c.body.id}`).send({ tipos: ['SAIDA'] });
    assert.strictEqual(r2.status, 200);
    assert.deepStrictEqual(r2.body, { id: c.body.id, nome: `${nome} v2`, tipos: ['SAIDA'], ativo: 1 });
  });

  await test('(9) PUT recusas: 404 literal, nome vazio, tipos vazio/invalido, duplicado, ativo fora de 0|1', async () => {
    const fant = await request(app).put(`${URL}/999888`).send({ nome: 'x' });
    assert.strictEqual(fant.status, 404);
    assert.strictEqual(fant.body.error, 'Motivo de movimentação não encontrado');

    const ocupado = uniq('Ocupado');
    await criar({ nome: ocupado, tipos: ['AJUSTE'] });
    const c = await criar({ nome: uniq('Alvo PUT'), tipos: ['AJUSTE'] });
    const casos = [
      [{ nome: '  ' }, 'Nome é obrigatório'],
      [{ tipos: [] }, 'Informe ao menos um tipo de movimentação'],
      [{ tipos: ['AJUSTE', 'ESTORNO'] }, 'Tipo de movimentação inválido para motivo: ESTORNO'],
      [{ nome: ocupado.toLowerCase() }, 'Já existe um motivo com este nome'],
      [{ ativo: '0' }, 'ativo deve ser 0 ou 1'],
      [{ ativo: 2 }, 'ativo deve ser 0 ou 1'],
      [{ ativo: null }, 'ativo deve ser 0 ou 1'],
    ];
    for (const [body, msg] of casos) {
      const r = await request(app).put(`${URL}/${c.body.id}`).send(body);
      assert.strictEqual(r.status, 400, `${JSON.stringify(body)} deveria dar 400, veio ${r.status} ${JSON.stringify(r.body)}`);
      assert.strictEqual(r.body.error, msg, `${JSON.stringify(body)}: ${JSON.stringify(r.body)}`);
    }
    const intacto = await dbGet(db, 'SELECT nome, tipos, ativo FROM motivos_movimentacao_almoxarifado WHERE id = ?', [c.body.id]);
    assert.strictEqual(intacto.nome, c.body.nome, 'uma recusa gravou o nome mesmo assim');
    assert.strictEqual(intacto.ativo, 1);
    // Renomear para o PROPRIO nome com outra caixa nao colide consigo mesmo.
    const proprio = await request(app).put(`${URL}/${c.body.id}`).send({ nome: c.body.nome.toUpperCase() });
    assert.strictEqual(proprio.status, 200, `renomear so a caixa colidiu consigo mesmo: ${JSON.stringify(proprio.body)}`);
    // `ativo` aceita booleano.
    const bool = await request(app).put(`${URL}/${c.body.id}`).send({ ativo: false });
    assert.strictEqual(bool.status, 200);
    assert.strictEqual(bool.body.ativo, 0);
  });

  // ── RN-03: desativar nao apaga ─────────────────────────────────────────────────────────────
  await test('(10) RN-03: desativado sai do GET padrao (presenca antes), fica no ?todos=1, e o PUT ativo:1 reativa', async () => {
    const nome = uniq('Desativavel');
    const c = await criar({ nome, tipos: ['PERDA'] });
    assert.ok(nomesDe(await listar()).includes(nome), 'guarda: o motivo tinha de estar no GET padrao antes');
    const del = await request(app).delete(`${URL}/${c.body.id}`);
    assert.strictEqual(del.status, 200);
    assert.deepStrictEqual(del.body, { success: true });
    assert.ok(!nomesDe(await listar()).includes(nome), 'o motivo desativado continua no GET padrao');
    const todos = await listar({ todos: '1' });
    const inativo = todos.body.find((m) => m.id === c.body.id);
    assert.ok(inativo, 'GET ?todos=1 nao traz o desativado — a tela nao consegue reativar');
    assert.strictEqual(inativo.ativo, 0);
    assert.ok(await dbGet(db, 'SELECT id FROM motivos_movimentacao_almoxarifado WHERE id = ?', [c.body.id]),
      'a linha foi APAGADA — o DELETE tinha de ser soft');
    const re = await request(app).put(`${URL}/${c.body.id}`).send({ ativo: 1 });
    assert.strictEqual(re.status, 200);
    assert.ok(nomesDe(await listar()).includes(nome), 'o reativado nao voltou ao GET padrao');
  });

  await test('(11) DELETE idempotente: 2a chamada 200 ja_inativo SEM 2a auditoria; inexistente 404 literal', async () => {
    const c = await criar({ nome: uniq('Idem'), tipos: ['AJUSTE'] });
    const contar = async () => (await dbAll(db,
      "SELECT id FROM auditoria_log_almoxarifado WHERE entidade = 'motivo_movimentacao' AND entidade_id = ? AND acao = 'EXCLUSAO'",
      [c.body.id])).length;
    await request(app).delete(`${URL}/${c.body.id}`);
    assert.strictEqual(await contar(), 1, 'o 1o DELETE tinha de deixar UMA linha — sem ela o cenario mede zero contra zero');
    const seg = await request(app).delete(`${URL}/${c.body.id}`);
    assert.strictEqual(seg.status, 200, `2o DELETE veio ${seg.status}`);
    assert.deepStrictEqual(seg.body, { success: true, ja_inativo: true },
      `2o DELETE sem ja_inativo: ${JSON.stringify(seg.body)} — sem o AND ativo = 1 o changes conta a linha que CASOU`);
    assert.strictEqual(await contar(), 1, 'a 2a desativacao virou linha na trilha sem ter mudado nada');
    const fant = await request(app).delete(`${URL}/999888`);
    assert.strictEqual(fant.status, 404);
    assert.strictEqual(fant.body.error, 'Motivo de movimentação não encontrado');
  });

  // ── ?tipo= ────────────────────────────────────────────────────────────────────────────────
  await test('(12) GET ?tipo=: so ATIVOS que servem ao tipo (ignora todos=1); tipo invalido 400 literal', async () => {
    const serve = await criar({ nome: uniq('Serve PERDA'), tipos: ['AJUSTE', 'PERDA'] });
    const naoServe = await criar({ nome: uniq('So AJUSTE'), tipos: ['AJUSTE'] });
    const inativo = await criar({ nome: uniq('PERDA inativo'), tipos: ['PERDA'] });
    // Presenca antes da ausencia: o inativo estava na lista do tipo enquanto ativo.
    const antes = await listar({ tipo: 'PERDA' });
    assert.ok(antes.body.some((m) => m.id === inativo.body.id), 'guarda: o motivo PERDA ativo tinha de aparecer em ?tipo=PERDA');
    await request(app).delete(`${URL}/${inativo.body.id}`);

    const r = await listar({ tipo: 'PERDA', todos: '1' });
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const ids = r.body.map((m) => m.id);
    assert.ok(ids.includes(serve.body.id), 'o motivo que serve a PERDA nao veio');
    assert.ok(!ids.includes(naoServe.body.id), 'veio motivo que so serve a AJUSTE');
    assert.ok(!ids.includes(inativo.body.id), '?tipo= trouxe motivo desativado (o todos=1 nao pode valer aqui)');
    assert.ok(r.body.every((m) => m.ativo === 1 && m.tipos.includes('PERDA')), JSON.stringify(r.body));

    // AJUSTE nao casa com AJUSTE_POSITIVO (D8): comparacao exata.
    const pos = await listar({ tipo: 'AJUSTE_POSITIVO' });
    assert.ok(!pos.body.some((m) => m.id === serve.body.id), 'AJUSTE casou com AJUSTE_POSITIVO');

    for (const t of ['SUCATA', 'xyz', 'ESTORNO']) {
      const bad = await listar({ tipo: t });
      assert.strictEqual(bad.status, 400, `?tipo=${t} deveria dar 400, veio ${bad.status}`);
      assert.strictEqual(bad.body.error, 'Tipo de movimento inválido');
    }
  });

  await test('(13) GET ordenado por nome sem diferenciar caixa nem acento', async () => {
    const s = uniq('');
    await criar({ nome: `zz Ordem${s}`, tipos: ['AJUSTE'] });
    await criar({ nome: `Éa Ordem${s}`, tipos: ['AJUSTE'] });
    await criar({ nome: `ab Ordem${s}`, tipos: ['AJUSTE'] });
    const nomes = nomesDe(await listar()).filter((n) => n.endsWith(`Ordem${s}`));
    assert.deepStrictEqual(nomes, [`ab Ordem${s}`, `Éa Ordem${s}`, `zz Ordem${s}`]);
  });

  await test('(14) GET /tipos devolve os 15 tipos da rota generica (fonte unica para a tela)', async () => {
    const r = await request(app).get(`${URL}/tipos`);
    assert.strictEqual(r.status, 200, `${r.status} ${JSON.stringify(r.body)}`);
    const { TIPOS_MOVIMENTO_ROTA } = require('../../services/almoxarifado/schemas');
    assert.deepStrictEqual(r.body, TIPOS_MOVIMENTO_ROTA);
    assert.strictEqual(r.body.length, 15);
    assert.ok(!r.body.includes('ESTORNO') && !r.body.includes('SUCATA'));
  });

  // ── RN-04: auditoria ───────────────────────────────────────────────────────────────────────
  await test('(15) RN-04: CRIACAO/EDICAO/EXCLUSAO com rotulo "Motivo de movimentação" e de/para simetrico', async () => {
    const nome = uniq('Auditado');
    const c = await criar({ nome, tipos: ['AJUSTE'] });
    await request(app).put(`${URL}/${c.body.id}`).send({ nome: `${nome} v2`, tipos: ['AJUSTE', 'PERDA'] });
    await request(app).delete(`${URL}/${c.body.id}`);

    const trilha = await request(app).get('/api/almoxarifado/auditoria')
      .query({ entidade: 'motivo_movimentacao', entidade_id: c.body.id });
    assert.strictEqual(trilha.status, 200, `${trilha.status} ${JSON.stringify(trilha.body)}`);
    const itens = trilha.body.itens || trilha.body;
    assert.deepStrictEqual(itens.map((i) => i.acao).sort(), ['CRIACAO', 'EDICAO', 'EXCLUSAO']);
    assert.strictEqual(itens[0].entidade_rotulo, 'Motivo de movimentação',
      `rotulo cru na tela de auditoria: ${JSON.stringify(itens[0].entidade_rotulo)}`);

    const crua = await dbAll(db,
      "SELECT acao, dados_anteriores, dados_novos FROM auditoria_log_almoxarifado WHERE entidade = 'motivo_movimentacao' AND entidade_id = ?",
      [c.body.id]);
    const por = Object.fromEntries(crua.map((l) => [l.acao, {
      ant: l.dados_anteriores ? JSON.parse(l.dados_anteriores) : null,
      nov: l.dados_novos ? JSON.parse(l.dados_novos) : null,
    }]));
    assert.deepStrictEqual(por.CRIACAO.nov, { nome, tipos: ['AJUSTE'], ativo: 1 });
    assert.deepStrictEqual(por.EDICAO.ant, { nome, tipos: ['AJUSTE'], ativo: 1 });
    assert.deepStrictEqual(por.EDICAO.nov, { nome: `${nome} v2`, tipos: ['AJUSTE', 'PERDA'], ativo: 1 });
    assert.deepStrictEqual(por.EXCLUSAO.ant, { nome: `${nome} v2`, tipos: ['AJUSTE', 'PERDA'], ativo: 1 });
    assert.deepStrictEqual(por.EXCLUSAO.nov, { nome: `${nome} v2`, tipos: ['AJUSTE', 'PERDA'], ativo: 0 });
  });

  // ── RN-02: matriz de perfis ────────────────────────────────────────────────────────────────
  await test('(16) RN-02 matriz: SO ADMINISTRADOR escreve; os sete outros tomam 403 literal e LEEM 200', async () => {
    setUser({ ...ADMIN });
    const alvo = await criar({ nome: uniq('Matriz'), tipos: ['AJUSTE'] });
    assert.strictEqual(alvo.status, 201,
      `o LADO POSITIVO caiu: ADMINISTRADOR nao criou (${alvo.status} ${JSON.stringify(alvo.body)})`);

    const passaram = [];
    for (const [rotulo, user] of PERFIS_SEM_CONFIGURAR) {
      setUser(user);
      const tentativas = [
        ['POST', await criar({ nome: uniq('Proibido'), tipos: ['AJUSTE'] })],
        ['PUT', await request(app).put(`${URL}/${alvo.body.id}`).send({ nome: uniq('Invadido') })],
        ['DELETE', await request(app).delete(`${URL}/${alvo.body.id}`)],
      ];
      for (const [verbo, res] of tentativas) {
        if (res.status !== 403) passaram.push(`${rotulo} passou no ${verbo} com ${res.status}`);
        else assert.strictEqual(res.body.error, 'Sem permissão para esta operação', `${rotulo} ${verbo}: ${JSON.stringify(res.body)}`);
      }
      const get = await listar({ tipo: 'AJUSTE' });
      assert.strictEqual(get.status, 200, `${rotulo} perdeu a LEITURA da lista: ${get.status}`);
      assert.ok(get.body.some((m) => m.id === alvo.body.id), `${rotulo} nao ve o motivo na lista`);
      const tipos = await request(app).get(`${URL}/tipos`);
      assert.strictEqual(tipos.status, 200, `${rotulo} perdeu a leitura dos tipos: ${tipos.status}`);
    }
    assert.deepStrictEqual(passaram, [], `perfis SEM \`configurar\` escreveram motivo: ${JSON.stringify(passaram)}`);
    setUser({ ...ADMIN });
    const ainda = await dbGet(db, 'SELECT nome, ativo FROM motivos_movimentacao_almoxarifado WHERE id = ?', [alvo.body.id]);
    assert.strictEqual(ainda.nome, alvo.body.nome);
    assert.strictEqual(ainda.ativo, 1);
  });

  // ── Pelo SERVICO ───────────────────────────────────────────────────────────────────────────
  await test('(17) servico: criar/listar/atualizar/desativar com as mesmas regras e .status 400/404', async () => {
    const autor = { usuario_id: ADMIN.id, usuario_nome: ADMIN.nome };
    const c = await motivoService.criarMotivo(db, { nome: uniq('Via servico'), tipos: ['SAIDA', 'SAIDA'] }, autor);
    assert.deepStrictEqual(c.tipos, ['SAIDA']);
    const lista = await motivoService.listarMotivos(db, { tipo: 'SAIDA' });
    assert.ok(lista.some((m) => m.id === c.id));
    await assert.rejects(() => motivoService.criarMotivo(db, { nome: c.nome.toUpperCase(), tipos: ['SAIDA'] }, autor),
      (e) => e.status === 400 && e.message === 'Já existe um motivo com este nome');
    await assert.rejects(() => motivoService.atualizarMotivo(db, 999777, { nome: 'x' }, autor),
      (e) => e.status === 404 && e.message === 'Motivo de movimentação não encontrado');
    await assert.rejects(() => motivoService.listarMotivos(db, { tipo: 'NADA' }),
      (e) => e.status === 400 && e.message === 'Tipo de movimento inválido');
    const d = await motivoService.desativarMotivo(db, c.id, autor);
    assert.deepStrictEqual(d, { success: true });
    assert.deepStrictEqual(await motivoService.desativarMotivo(db, c.id, autor), { success: true, ja_inativo: true });
  });

  await test('(18) Fase 5 (M1): espacos internos, espaco nao-quebravel e caracteres invisiveis nao criam outro motivo; so invisivel = sem nome', async () => {
    setUser({ ...ADMIN });
    const base = uniq('Avaria manuseio');
    const r = await criar({ nome: `  ${base}  `, tipos: ['PERDA'] });
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    assert.strictEqual(r.body.nome, base);
    for (const igual of [base.replace(' ', '  '), base.replace(' ', ' '), `${base}​`, `﻿${base.toUpperCase()}`]) {
      const d = await criar({ nome: igual, tipos: ['PERDA'] });
      assert.strictEqual(d.status, 400, `${JSON.stringify(igual)} entrou: ${JSON.stringify(d.body)}`);
      assert.strictEqual(d.body.error, 'Já existe um motivo com este nome');
    }
    for (const vazio of ['​', '   ', '⁠﻿']) {
      const v = await criar({ nome: vazio, tipos: ['PERDA'] });
      assert.strictEqual(v.status, 400, JSON.stringify(vazio));
      assert.strictEqual(v.body.error, 'Nome é obrigatório');
    }
    // O nome gravado tambem sai limpo (a lista nao mostra dois "iguais").
    const e = await request(app).put(`${URL}/${r.body.id}`).send({ nome: `${base}​  x` });
    assert.strictEqual(e.status, 200, JSON.stringify(e.body));
    assert.strictEqual(e.body.nome, `${base} x`);
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
