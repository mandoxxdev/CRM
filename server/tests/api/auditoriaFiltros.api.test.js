/**
 * Etapa 22, Task 2 — filtros, validacao de data, janela de fuso e rota de opcoes.
 * Plano: docs/superpowers/plans/2026-08-28-almoxarifado-etapa22-tela-de-auditoria.md (C1, C2)
 * Design: docs/superpowers/specs/2026-08-28-almoxarifado-etapa22-tela-de-auditoria-design.md
 *         (RN-01 a RN-05)
 *
 * ── POR QUE TODO `created_at` DO ARRANJO E EXPLICITO ────────────────────────────────────────
 *
 * Nenhuma linha deste arquivo e gravada por `CURRENT_TIMESTAMP` (achado A4). O cenario da RN-04
 * compara um instante UTC contra uma janela recortada em hora LOCAL: se o arranjo usasse o
 * relogio, o teste ficaria verde durante o dia e vermelho entre 21h e meia-noite de Brasilia — e
 * a proxima sessao iria depurar o SQL em vez do fuso. Datas fixas: o cenario vale as 3h e as 23h.
 *
 * ── OS DOIS MODOS DE FALHA SILENCIOSA QUE ESTE ARQUIVO GUARDA ───────────────────────────────
 *
 *  1. `WHERE acao IN (?)` com o parametro `'CRIACAO,CRIAR'` devolve ZERO LINHAS SEM ERRO. Numa
 *     auditoria, zero em silencio e o pior resultado possivel: parece prova de que nada
 *     aconteceu. Por isso o cenario de sinonimo afirma os DOIS ids, nao so "veio alguma coisa".
 *  2. `Date.parse('2026-02-30')` e VALIDO em JS (rola para 02/03) e o SQLite tambem rola
 *     (`date('2026-02-30','+1 day')` = `'2026-03-03'`). Sem o ida-e-volta, uma consulta de
 *     fevereiro devolveria dias de marco — janela ALARGADA em silencio, nao lista vazia.
 *
 * Executar: cd server && node tests/api/auditoriaFiltros.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbAll } = require('../../services/almoxarifado/db');
const filtros = require('../../services/almoxarifado/auditFiltros');
const labels = require('../../services/almoxarifado/auditLabels');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const MSG_DATA = 'Data inválida: use uma data real no formato AAAA-MM-DD';

// role 'admin' => getPerfilFromUser devolve ADMINISTRADOR (permissions.js:93) => passa em
// `configurar`. O negado usa role 'usuario' SEM perfil: cai no fallback PRODUCAO, que e o caso
// real de chao de fabrica — nao um usuario inexistente.
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
const SEM_GATE = { id: 63, nome: 'Producao', role: 'usuario', email: 'prod@test.com' };

/**
 * O arranjo inteiro, com `created_at` em UTC (e como a coluna e gravada em producao:
 * `CURRENT_TIMESTAMP` do SQLite e UTC).
 *
 * Os dois instantes que decidem a RN-04, lidos em Brasilia (UTC-3):
 *   '2026-08-29 00:30:00' UTC = 28/08 21:30 LOCAL -> TEM de aparecer no filtro do dia 28.
 *   '2026-08-29 03:30:00' UTC = 29/08 00:30 LOCAL -> NAO pode aparecer no filtro do dia 28.
 * Sem a conversao de fuso, o primeiro some (tres horas de todo fim de expediente invisiveis) e
 * o segundo entra.
 */
const LINHAS = [
  { chave: 'criacao_ana', entidade: 'material', entidade_id: 101, acao: 'CRIACAO', usuario_id: 7, usuario_nome: 'Ana Auditora',
    created_at: '2026-08-28 12:00:00', dados_anteriores: null, dados_novos: '{"nome":"Parafuso M8","codigo":"P-8"}' },
  { chave: 'criar_bruno', entidade: 'material', entidade_id: 102, acao: 'CRIAR', usuario_id: 8, usuario_nome: 'Bruno Barros',
    created_at: '2026-08-28 13:00:00', dados_anteriores: null, dados_novos: '{"nome":"Arruela"}' },
  { chave: 'exclusao_ana_ontem', entidade: 'requisicao', entidade_id: 103, acao: 'EXCLUSAO', usuario_id: 7, usuario_nome: 'Ana Auditora',
    created_at: '2026-08-27 12:00:00', dados_anteriores: '{"status":"PENDENTE"}', dados_novos: '{"numero":"REQ-1"}' },
  { chave: 'fim_de_expediente', entidade: 'material', entidade_id: 104, acao: 'EDICAO', usuario_id: 9, usuario_nome: 'Carla Costa',
    created_at: '2026-08-29 00:30:00', dados_anteriores: '{"nome":"Parafuso"}', dados_novos: '{"nome":"Parafuso M8"}' },
  { chave: 'madrugada_do_dia_seguinte', entidade: 'material', entidade_id: 105, acao: 'EDICAO', usuario_id: 9, usuario_nome: 'Carla Costa',
    created_at: '2026-08-29 03:30:00', dados_anteriores: null, dados_novos: '{"nome":"Bucha"}' },
  // Verbo que NENHUM grupo rotula: a rota de opcoes tem de devolve-lo com o proprio nome. Sumir
  // com ele esconderia atos — e o motivo de `rotularAcao` nunca devolver '' nem undefined.
  { chave: 'verbo_sem_rotulo', entidade: 'material', entidade_id: 106, acao: 'VERBO_INEXISTENTE_XYZ', usuario_id: 7, usuario_nome: 'Ana Auditora',
    created_at: '2026-08-28 14:00:00', dados_anteriores: null, dados_novos: null },
  // Linha de ator anonimo (`usuario_id` da tabela e NULL-avel e ha call sites sem `req.user`):
  // nao pode virar uma opcao `{ id: null }` no select de usuario.
  { chave: 'sem_usuario', entidade: 'conferencia', entidade_id: 107, acao: 'CONTAGEM', usuario_id: null, usuario_nome: null,
    created_at: '2026-08-28 15:00:00', dados_anteriores: null, dados_novos: null },
];

const ids = {}; // chave -> id gravado

async function arranjar(db) {
  for (const l of LINHAS) {
    const r = await dbRun(db, `INSERT INTO auditoria_log_almoxarifado
      (entidade, entidade_id, acao, usuario_id, usuario_nome, dados_anteriores, dados_novos, justificativa, created_at)
      VALUES (?,?,?,?,?,?,?,NULL,?)`,
      [l.entidade, l.entidade_id, l.acao, l.usuario_id, l.usuario_nome, l.dados_anteriores, l.dados_novos, l.created_at]);
    ids[l.chave] = r.lastID;
  }
  // Guarda contra teste vazio: se o `created_at` explicito nao tivesse chegado ao banco (coluna
  // com DEFAULT CURRENT_TIMESTAMP engole um INSERT mal montado sem reclamar), todo cenario de
  // data passaria a medir o RELOGIO — verde de dia, vermelho as 22h. Confere no banco.
  const gravadas = await dbAll(db, 'SELECT id, created_at FROM auditoria_log_almoxarifado ORDER BY id');
  assert.strictEqual(gravadas.length, LINHAS.length, 'arranjo nao gravou todas as linhas');
  const esperadas = LINHAS.map((l) => l.created_at);
  assert.deepStrictEqual(gravadas.map((g) => g.created_at), esperadas,
    'o created_at do arranjo veio do relogio, nao do valor explicito');
}

/** ids retornados pela rota, na ordem em que vieram. */
function idsDe(res) {
  assert.ok(Array.isArray(res.body.itens), `resposta sem itens: ${JSON.stringify(res.body)}`);
  return res.body.itens.map((i) => i.id);
}

(async () => {
  const { app, db, setUser, close } = await createTestApp({ user: ADMIN });
  await arranjar(db);

  console.log('\n── auditFiltros (funcao pura) ──');

  // DOIS cenarios, nao um: o controle positivo do Step 4 mostrou que, num `test()` unico, a
  // primeira assercao a cair engole a mensagem das outras — com `validarData` reduzida ao
  // `Date.parse`, o vermelho nomeava '2026-8-28' (formato) e o 30 de FEVEREIRO, que e o achado
  // que a RN-03 guarda, nunca aparecia no relatorio. Separados, cada defeito se nomeia.
  await test('validarData recusa o que nao esta no formato AAAA-MM-DD', () => {
    for (const v of ['ontem', '28/08/2026', '2026-8-28', '2026-08-28T10:00:00Z', '', '  ', null, undefined, 20260828]) {
      assert.strictEqual(filtros.validarData(v).ok, false, `deveria recusar ${JSON.stringify(v)}`);
    }
    // Array e o que o Express entrega quando alguem manda `data_inicio=a&data_inicio=b`.
    assert.strictEqual(filtros.validarData(['2026-08-28']).ok, false, 'array deveria ser recusado');
  });

  await test('validarData recusa data no formato certo que NAO EXISTE no calendario', () => {
    // O coracao da RN-03: `2026-02-30` passa no `Date.parse` (rola para 02/03) e o SQLite rola
    // igual, entao aceitar nao daria lista vazia — daria a janela ALARGADA em silencio.
    assert.strictEqual(filtros.validarData('2026-02-30').ok, false,
      '30 de fevereiro passou — o Date.parse sozinho aceita e o SQLite rola para 03/03');
    assert.strictEqual(filtros.validarData('2026-04-31').ok, false, '31 de abril passou');
    assert.strictEqual(filtros.validarData('2026-13-45').ok, false, 'mes 13 / dia 45 passou');
    assert.strictEqual(filtros.validarData('2026-00-10').ok, false, 'mes 00 passou');
    assert.strictEqual(filtros.validarData('2026-08-00').ok, false, 'dia 00 passou');
  });

  await test('validarData aceita data real, inclusive 29/02 de ano bissexto', () => {
    assert.strictEqual(filtros.validarData('2026-08-28').ok, true);
    assert.strictEqual(filtros.validarData('2024-02-29').ok, true, '2024 e bissexto — recusar seria falso positivo');
    assert.strictEqual(filtros.validarData('2026-02-28').ok, true);
  });

  await test('janelaUtc recorta o DIA DE BRASILIA e devolve os limites em UTC', () => {
    const { de, ate } = filtros.janelaUtc('2026-08-28', '2026-08-28');
    const FORMATO = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
    assert.ok(FORMATO.test(de), `de fora do formato do SQLite: ${de}`);
    assert.ok(FORMATO.test(ate), `ate fora do formato do SQLite: ${ate}`);
    // 00:00 local de 28/08 = 03:00 UTC; 00:00 local de 29/08 = 03:00 UTC do dia 29.
    assert.strictEqual(de, '2026-08-28 03:00:00', `limite inferior errado: ${de}`);
    assert.strictEqual(ate, '2026-08-29 03:00:00', `limite superior errado: ${ate}`);
  });

  await test('janelaUtc CONTEM o ato das 21:30 locais e EXCLUI o das 00:30 do dia seguinte', () => {
    const { de, ate } = filtros.janelaUtc('2026-08-28', '2026-08-28');
    const dentro = '2026-08-29 00:30:00'; // 28/08 21:30 local
    const fora = '2026-08-29 03:30:00';   // 29/08 00:30 local
    assert.ok(de <= dentro && dentro < ate,
      `o ato das 21:30 de 28/08 ficou FORA da janela [${de}, ${ate}) — tres horas de fim de expediente sumiriam`);
    assert.ok(!(de <= fora && fora < ate),
      `o ato das 00:30 de 29/08 entrou na janela [${de}, ${ate}) — o dia recortado e o dia UTC, nao o local`);
  });

  await test('janelaUtc aceita so um dos lados e nenhum', () => {
    assert.deepStrictEqual(filtros.janelaUtc('2026-08-28', null), { de: '2026-08-28 03:00:00', ate: null });
    assert.deepStrictEqual(filtros.janelaUtc(null, '2026-08-28'), { de: null, ate: '2026-08-29 03:00:00' });
    assert.deepStrictEqual(filtros.janelaUtc(null, null), { de: null, ate: null });
  });

  await test('janelaUtc NAO depende do TZ do processo (servidor em UTC continua recortando Brasilia)', () => {
    // Divergencia deliberada do plano, que so exigia o cenario "com TZ=America/Sao_Paulo".
    // Se a conversao usasse o fuso do PROCESSO, um deploy com TZ=UTC — o default da maioria dos
    // conteineres — devolveria a janela crua e o defeito da RN-04 voltaria em producao com o
    // teste verde na maquina do dev. O fuso do negocio e do cliente (site unico), nao do host.
    const original = process.env.TZ;
    try {
      process.env.TZ = 'UTC';
      assert.deepStrictEqual(filtros.janelaUtc('2026-08-28', '2026-08-28'),
        { de: '2026-08-28 03:00:00', ate: '2026-08-29 03:00:00' },
        'a janela mudou junto com o TZ do processo');
      process.env.TZ = 'Asia/Tokyo';
      assert.deepStrictEqual(filtros.janelaUtc('2026-08-28', '2026-08-28'),
        { de: '2026-08-28 03:00:00', ate: '2026-08-29 03:00:00' },
        'a janela mudou junto com o TZ do processo');
    } finally {
      if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
    }
  });

  console.log('\n── GET /auditoria: os quatro filtros novos (RN-02) ──');

  await test('sem filtro nenhum a rota devolve as 7 linhas do arranjo', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.total, LINHAS.length, `total veio ${res.body.total}`);
  });

  await test('filtro usuario_id isolado', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?usuario_id=9');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(idsDe(res).sort((a, b) => a - b),
      [ids.fim_de_expediente, ids.madrugada_do_dia_seguinte].sort((a, b) => a - b));
  });

  await test('filtro acao isolado (um verbo so)', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?acao=EXCLUSAO');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(idsDe(res), [ids.exclusao_ana_ontem]);
  });

  await test('filtro data_inicio isolado corta o que e anterior ao dia', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?data_inicio=2026-08-28');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(!idsDe(res).includes(ids.exclusao_ana_ontem), 'a linha do dia 27 passou pelo data_inicio=28');
    assert.ok(idsDe(res).includes(ids.criacao_ana), 'a linha do dia 28 sumiu');
  });

  await test('filtro data_fim isolado corta o que e posterior ao dia', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?data_fim=2026-08-27');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.deepStrictEqual(idsDe(res), [ids.exclusao_ana_ontem]);
  });

  await test('usuario_id + data_inicio combinados por AND', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?usuario_id=7&data_inicio=2026-08-28');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const vieram = idsDe(res).sort((a, b) => a - b);
    // Ana tem 3 linhas, mas a do dia 27 esta fora da janela.
    assert.deepStrictEqual(vieram, [ids.criacao_ana, ids.verbo_sem_rotulo].sort((a, b) => a - b),
      'a combinacao nao esta por AND (ou o corte de data nao se aplicou ao filtro de usuario)');
  });

  console.log('\n── RN-06 no SQL: o `IN` com um placeholder por valor ──');

  await test('acao=CRIACAO,CRIAR traz AS DUAS linhas (o `IN (?)` daria zero em silencio)', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?acao=CRIACAO,CRIAR');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const vieram = idsDe(res).sort((a, b) => a - b);
    assert.deepStrictEqual(vieram, [ids.criacao_ana, ids.criar_bruno].sort((a, b) => a - b),
      `sinonimo perdido: esperado os dois ids, veio ${JSON.stringify(vieram)}`);
  });

  await test('acao com espacos e valor vazio no meio nao quebra nem alarga a lista', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?acao=' + encodeURIComponent(' CRIACAO , , CRIAR '));
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.total, 2, `esperado 2, veio ${res.body.total}`);
  });

  await test('acao mandada como ARRAY (acao[]=A&acao[]=B) responde 200, nao 500', async () => {
    // O axios do client nao tem paramsSerializer; se um dia alguem mandar array, o parser
    // `extended` do Express entrega array e um `.split(',')` cru estouraria TypeError -> 500.
    const res = await request(app).get('/api/almoxarifado/auditoria?acao[]=CRIACAO&acao[]=CRIAR');
    assert.strictEqual(res.status, 200, `array em acao derrubou a rota: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.total, 2, `esperado 2, veio ${res.body.total}`);
  });

  console.log('\n── RN-03: data invalida e 400, nunca 200 vazio ──');

  for (const ruim of ['ontem', '2026-13-45', '2026-02-30', '2026-04-31']) {
    await test(`data_inicio=${ruim} => 400 com a mensagem literal`, async () => {
      const res = await request(app).get(`/api/almoxarifado/auditoria?data_inicio=${ruim}`);
      assert.strictEqual(res.status, 400, `status ${res.status} — 200 vazio numa auditoria parece prova de que nada aconteceu`);
      assert.strictEqual(res.body.error, MSG_DATA, `mensagem: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.itens, undefined, 'veio corpo de listagem junto do erro');
    });
  }

  await test('data_fim=2026-02-30 => 400 (o lado que alargava a janela em silencio)', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?data_fim=2026-02-30');
    assert.strictEqual(res.status, 400, `status ${res.status}`);
    assert.strictEqual(res.body.error, MSG_DATA);
  });

  // Achado A3 da revisao adversarial: as duas datas VALIDAS com intervalo impossivel devolviam
  // 200 com `itens: []`. Mesmo modo de falha da RN-03 pela outra porta — e a tela nao impede
  // (os `input type=date` nao tem min/max cruzados), entao o usuario chega la sozinho.
  await test('intervalo INVERTIDO => 400, nao 200 com lista vazia', async () => {
    const res = await request(app)
      .get('/api/almoxarifado/auditoria?data_inicio=2026-08-20&data_fim=2026-08-01');
    assert.strictEqual(res.status, 400,
      `status ${res.status} — lista vazia por intervalo impossivel parece prova de que nada aconteceu`);
    assert.strictEqual(res.body.error, 'Período inválido: a data inicial é posterior à data final',
      `mensagem: ${JSON.stringify(res.body)}`);
    assert.strictEqual(res.body.itens, undefined, 'veio corpo de listagem junto do erro');
  });

  await test('intervalo de UM dia so (inicio == fim) continua valendo', async () => {
    // A guarda acima usa `>`, nao `>=` — o filtro de um unico dia e o caso mais comum da tela.
    const res = await request(app)
      .get('/api/almoxarifado/auditoria?data_inicio=2026-08-28&data_fim=2026-08-28');
    assert.strictEqual(res.status, 200, `a guarda do intervalo invertido barrou o dia unico: ${JSON.stringify(res.body)}`);
    assert.ok(idsDe(res).includes(ids.fim_de_expediente), 'o filtro de um dia parou de trazer o dia');
  });

  console.log('\n── RN-04: o dia e o de Brasilia, nao o UTC ──');

  await test('o ato das 21:30 de 28/08 APARECE no filtro do dia 28', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?data_inicio=2026-08-28&data_fim=2026-08-28');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(idsDe(res).includes(ids.fim_de_expediente),
      'o ato das 21:30 sumiu do filtro do proprio dia — todo fim de expediente fica invisivel');
  });

  await test('o ato das 00:30 de 29/08 NAO aparece no filtro do dia 28', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?data_inicio=2026-08-28&data_fim=2026-08-28');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(!idsDe(res).includes(ids.madrugada_do_dia_seguinte),
      'a madrugada do dia 29 entrou no filtro do dia 28 — a janela esta em UTC');
  });

  await test('o dia 28 inteiro sao exatamente as 5 linhas locais do arranjo', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?data_inicio=2026-08-28&data_fim=2026-08-28');
    const esperado = [ids.criacao_ana, ids.criar_bruno, ids.verbo_sem_rotulo, ids.sem_usuario, ids.fim_de_expediente]
      .sort((a, b) => a - b);
    assert.deepStrictEqual(idsDe(res).sort((a, b) => a - b), esperado,
      'a janela do dia local nao bate com o arranjo');
  });

  console.log('\n── C1: os tres campos derivados ──');

  await test('cada item traz acao_rotulo, entidade_rotulo e alteracoes prontos', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?acao=EXCLUSAO');
    const item = res.body.itens[0];
    assert.strictEqual(item.acao_rotulo, 'Exclusão', `acao_rotulo: ${item.acao_rotulo}`);
    assert.strictEqual(item.entidade_rotulo, 'Requisição', `entidade_rotulo: ${item.entidade_rotulo}`);
    // Uniao das chaves: o `status` de `dados_anteriores` — que o `calcularDiff` perdia — TEM de
    // estar aqui (RN-07). Conjunto INTEIRO, nao "contem": conferir so um campo deixaria passar
    // alteracao fabricada.
    assert.deepStrictEqual(item.alteracoes, [
      { campo: 'status', de: 'PENDENTE', para: null },
      { campo: 'numero', de: null, para: 'REQ-1' },
    ], `alteracoes: ${JSON.stringify(item.alteracoes)}`);
    assert.strictEqual(typeof item.dados_novos, 'string',
      'dados_novos deixou de ser a string crua do banco — a forma do item esta congelada desde a Etapa 18');
  });

  await test('sinonimos diferentes colapsam no MESMO acao_rotulo', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?acao=CRIACAO,CRIAR');
    const rotulos = new Set(res.body.itens.map((i) => i.acao_rotulo));
    assert.deepStrictEqual([...rotulos], ['Criação'], `rotulos: ${JSON.stringify([...rotulos])}`);
  });

  await test('linha sem dados dos dois lados sai com alteracoes: []', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?acao=VERBO_INEXISTENTE_XYZ');
    assert.deepStrictEqual(res.body.itens[0].alteracoes, []);
    assert.strictEqual(res.body.itens[0].acao_rotulo, 'VERBO_INEXISTENTE_XYZ',
      'verbo sem rotulo tem de sair com o proprio nome, nunca vazio');
  });

  await test('regressao: a forma da resposta continua a da Etapa 18', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria?limite=2');
    assert.deepStrictEqual(Object.keys(res.body).sort(),
      ['itens', 'limite', 'offset', 'total', 'truncado'], `chaves: ${JSON.stringify(Object.keys(res.body))}`);
    assert.strictEqual(res.body.limite, 2);
    assert.strictEqual(res.body.truncado, true, 'com 7 linhas e limite 2 o corte tem de ser declarado');
  });

  console.log('\n── RN-05: GET /auditoria/opcoes ──');

  await test('opcoes traz so entidades REALMENTE presentes, ja rotuladas', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const valores = res.body.entidades.map((e) => e.valor).sort();
    assert.deepStrictEqual(valores, ['conferencia', 'material', 'requisicao'],
      `entidades: ${JSON.stringify(valores)}`);
    const material = res.body.entidades.find((e) => e.valor === 'material');
    assert.strictEqual(material.rotulo, 'Material');
  });

  await test('opcoes agrupa sinonimo numa opcao so, com os dois verbos', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    const criacao = res.body.acoes.filter((a) => a.rotulo === 'Criação');
    assert.strictEqual(criacao.length, 1, `CRIACAO e CRIAR viraram ${criacao.length} opcoes — a lista se dividiu`);
    assert.deepStrictEqual([...criacao[0].verbos].sort(), ['CRIACAO', 'CRIAR']);
    assert.strictEqual(res.body.acoes.length, 5,
      `esperado 5 grupos (Criação, Edição, Exclusão, Contagem e o sem rotulo), veio ${res.body.acoes.length}`);
  });

  await test('verbo sem rotulo entra nas opcoes com o proprio nome (nunca some)', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    const orfao = res.body.acoes.find((a) => a.verbos.includes('VERBO_INEXISTENTE_XYZ'));
    assert.ok(orfao, 'o verbo sem rotulo sumiu das opcoes — sumir esconde atos');
    assert.strictEqual(orfao.rotulo, 'VERBO_INEXISTENTE_XYZ');
  });

  await test('opcoes lista os usuarios do arranjo e descarta a linha sem usuario_id', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    assert.deepStrictEqual(res.body.usuarios, [
      { id: 7, nome: 'Ana Auditora' },
      { id: 8, nome: 'Bruno Barros' },
      { id: 9, nome: 'Carla Costa' },
    ], `usuarios: ${JSON.stringify(res.body.usuarios)}`);
  });

  await test('opcoes NAO inventa valor que nao esta no banco', async () => {
    const res = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    const todosVerbos = res.body.acoes.flatMap((a) => a.verbos);
    const gravados = new Set(LINHAS.map((l) => l.acao));
    for (const v of todosVerbos) {
      assert.ok(gravados.has(v), `verbo ${v} apareceu nas opcoes sem existir no banco — lista hardcoded envelhece`);
    }
    // Sanidade do proprio arranjo: `ENTRADA` existe no vocabulario e NAO foi gravado aqui.
    assert.ok(labels.rotularAcao('ENTRADA') === 'Entrada' && !todosVerbos.includes('ENTRADA'));
  });

  console.log('\n── RN-01: o gate `configurar` nas DUAS rotas ──');

  await test('sem `configurar`: 403 na listagem', async () => {
    setUser(SEM_GATE);
    const res = await request(app).get('/api/almoxarifado/auditoria');
    setUser(ADMIN);
    assert.strictEqual(res.status, 403, `status ${res.status}: ${JSON.stringify(res.body)}`);
  });

  await test('sem `configurar`: 403 tambem em /opcoes (a rota nova)', async () => {
    setUser(SEM_GATE);
    const res = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    setUser(ADMIN);
    assert.strictEqual(res.status, 403,
      `a rota de opcoes ficou aberta (status ${res.status}) — ela expoe quem mexeu no modulo e em que`);
  });

  await test('sem `configurar`: nem a lista de usuarios vaza pelo corpo do 403', async () => {
    setUser(SEM_GATE);
    const res = await request(app).get('/api/almoxarifado/auditoria/opcoes');
    setUser(ADMIN);
    assert.ok(!JSON.stringify(res.body).includes('Ana Auditora'), 'o 403 devolveu dado da trilha');
  });

  await close();
  console.log(`\n${passed} passaram, ${failed} falharam`);
  process.exit(failed > 0 ? 1 : 0);
})();
