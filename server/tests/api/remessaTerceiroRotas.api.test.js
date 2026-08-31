/**
 * Etapa 8b, Task 8 — as rotas da remessa a terceiros.
 *
 * O ciclo ja tem teste de servico (remessaTerceiroCiclo.api.test.js). Aqui o alvo e o que SO a rota
 * pode errar:
 *
 *  1. o gate de permissao (requirePermission roda o codigo REAL no harness) — e ele precisa estar
 *     nas SETE rotas certas, nao so na primeira;
 *  2. a validacao Zod, e a armadilha de chave nao declarada: `validate()` troca req.body pelo
 *     parsed e z.object DESCARTA chave nao declarada EM SILENCIO, entao o servico simplesmente
 *     nunca ve o campo, sem erro nenhum. Ja mordeu esta base TRES vezes (reserva_id na Etapa 4,
 *     lote_id na Etapa 6, justificativa/motivo do cancelamento na Etapa 8). Por isso cada campo
 *     declarado tem AQUI um teste que so passa se o campo ATRAVESSAR o schema — a maioria relendo
 *     do banco, e os que nao tem coluna (material_id do retorno) pela recusa especifica que eles
 *     disparam;
 *  3. a propagacao do erro do servico: 400 de regra de negocio nao pode virar 500, e a MENSAGEM
 *     tem de chegar intacta ao cliente — as mensagens desta etapa dizem os numeros de proposito, e
 *     um catch generico as apagaria.
 *
 * Executar: cd server && node tests/api/remessaTerceiroRotas.api.test.js
 */
const assert = require('assert');
const request = require('supertest');
const { createTestApp } = require('../helpers/testApp');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const lotService = require('../../services/almoxarifado/lotService');
const { carimboTempo } = require('../../services/almoxarifado/numeroDoc');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}
const ADMIN = { id: 1, nome: 'Admin Teste', role: 'admin', is_superadmin: 1, email: 'admin@test.com' };
// Perfil EXPLICITO, nunca "usuario sem perfil": getPerfilFromUser faz fallback para PRODUCAO, entao
// um usuario sem perfil nao e "sem acesso" — e chao de fabrica. Um teste montado com usuario vazio
// passaria pelo motivo errado.
const PRODUCAO = { id: 3, nome: 'Chao de fabrica', email: 'prod@test.com', perfil_almoxarifado: 'PRODUCAO' };
const BASE = '/api/almoxarifado/remessas-terceiros';

let seq = 0;
async function novoMaterial(db, atual = 100) {
  seq += 1;
  const r = await dbRun(db,
    "INSERT INTO materiais_almoxarifado (codigo, nome, unidade, quantidade_atual, ativo) VALUES (?,?,'UN',?,1)",
    [`ROT-${seq}`, `Material rota ${seq}`, atual]);
  return r.lastID;
}
const emTerceiros = async (db, id) => (await dbGet(db,
  'SELECT COALESCE(quantidade_em_terceiros,0) AS q FROM materiais_almoxarifado WHERE id = ?', [id])).q;

(async () => {
  const { app, db, close, setUser } = await createTestApp({ user: ADMIN });

  const criar = (body) => request(app).post(BASE).send(body);
  const corpoValido = async (extra = {}) => {
    const mat = await novoMaterial(db);
    return { mat, body: { fornecedor_nome: 'Galvanizadora Sul LTDA', tipo_servico: 'Galvanizacao',
      prazo_previsto: '2026-09-30', itens: [{ material_id: mat, quantidade: 30 }], ...extra } };
  };
  /** Cria + envia, e devolve { mat, id, itemId } — atalho para os testes de retorno/encerramento. */
  const enviada = async (quantidade = 30, atual = 100) => {
    const mat = await novoMaterial(db, atual);
    const c = await criar({ fornecedor_nome: 'Galvanizadora Sul LTDA', tipo_servico: 'Galvanizacao',
      itens: [{ material_id: mat, quantidade }] });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const env = await request(app).post(`${BASE}/${c.body.id}/enviar`).send({});
    assert.strictEqual(env.status, 200, JSON.stringify(env.body));
    const cheia = await request(app).get(`${BASE}/${c.body.id}`);
    return { mat, id: c.body.id, itemId: cheia.body.itens[0].id };
  };

  // ── Permissao ────────────────────────────────────────────────────────────────────────────────
  await test('POST sem a acao remessar_terceiro devolve 403 e nao cria nada', async () => {
    const { body } = await corpoValido();
    setUser(PRODUCAO);
    const res = await criar(body);
    setUser(ADMIN);
    assert.strictEqual(res.status, 403, JSON.stringify(res.body));
    // O CAMPO `acao`, e nao so o status: hoje remessar_terceiro e movimentar tem os MESMOS perfis,
    // entao trocar um gate pelo outro nao mudaria nenhum status e a regressao passaria batida.
    assert.strictEqual(res.body.acao, 'remessar_terceiro');
    const n = await dbGet(db, 'SELECT COUNT(*) AS n FROM remessas_terceiro_almoxarifado');
    assert.strictEqual(n.n, 0, 'a remessa foi gravada apesar do 403');
  });

  await test('[CONTROLE POSITIVO] POST com a acao cria e devolve 201', async () => {
    const { body } = await corpoValido();
    const res = await criar(body);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.strictEqual(res.body.status, 'ABERTA');
    assert.ok(res.body.numero);
  });

  await test('as QUATRO rotas de acao (enviar/retornos/encerrar/cancelar) tambem exigem remessar_terceiro', async () => {
    // Sem este teste, esquecer o gate em UMA das seis rotas de acao passaria despercebido — o teste
    // do POST sozinho aprova um modulo onde so o POST esta protegido.
    const { id, itemId } = await enviada();
    setUser(PRODUCAO);
    const respostas = {
      enviar: await request(app).post(`${BASE}/${id}/enviar`).send({}),
      retornos: await request(app).post(`${BASE}/${id}/retornos`)
        .send({ itens: [{ item_remessa_id: itemId, quantidade: 1 }] }),
      encerrar: await request(app).put(`${BASE}/${id}/encerrar`)
        .send({ destino: 'PERDA_NO_TERCEIRO', justificativa: 'x' }),
      cancelar: await request(app).put(`${BASE}/${id}/cancelar`).send({ motivo: 'x' }),
    };
    setUser(ADMIN);
    for (const [nome, res] of Object.entries(respostas)) {
      assert.strictEqual(res.status, 403, `${nome} devia 403, veio ${res.status}: ${JSON.stringify(res.body)}`);
      assert.strictEqual(res.body.acao, 'remessar_terceiro', `${nome} barrou pela acao errada`);
    }
    assert.strictEqual((await dbGet(db, 'SELECT status FROM remessas_terceiro_almoxarifado WHERE id = ?', [id])).status,
      'ENVIADA', 'alguma das rotas barradas mexeu na remessa mesmo assim');
  });

  await test('[CONTROLE POSITIVO] as mesmas quatro rotas respondem para quem TEM a acao', async () => {
    // Sem isto, `return 403 sempre` em todas elas passaria no teste acima.
    const { id, itemId } = await enviada();
    const ret = await request(app).post(`${BASE}/${id}/retornos`)
      .send({ itens: [{ item_remessa_id: itemId, quantidade: 1 }] });
    assert.strictEqual(ret.status, 200, JSON.stringify(ret.body));
    const enc = await request(app).put(`${BASE}/${id}/encerrar`)
      .send({ destino: 'PERDA_NO_TERCEIRO', justificativa: 'perdido' });
    assert.strictEqual(enc.status, 200, JSON.stringify(enc.body));
  });

  await test('GET da listagem NAO exige remessar_terceiro — quem consulta pode ver', async () => {
    setUser(PRODUCAO);
    const lista = await request(app).get(BASE);
    const vencidas = await request(app).get(`${BASE}/vencidas`);
    setUser(ADMIN);
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body));
    assert.ok(Array.isArray(lista.body));
    assert.strictEqual(vencidas.status, 200, JSON.stringify(vencidas.body));
  });

  await test('GET de UMA remessa tambem e leitura — PRODUCAO abre sem 403', async () => {
    const { id } = await enviada();
    setUser(PRODUCAO);
    const res = await request(app).get(`${BASE}/${id}`);
    setUser(ADMIN);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.id, id);
  });

  // ── Validacao Zod: RemessaTerceiroSchema ─────────────────────────────────────────────────────
  await test('POST sem itens e recusado com 400 pelo schema', async () => {
    const res = await criar({ fornecedor_nome: 'X', itens: [] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('POST sem o campo itens e recusado com 400', async () => {
    const res = await criar({ fornecedor_nome: 'X' });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('POST com quantidade zero e recusado com 400', async () => {
    const mat = await novoMaterial(db);
    const res = await criar({ fornecedor_nome: 'X', itens: [{ material_id: mat, quantidade: 0 }] });
    assert.strictEqual(res.status, 400);
  });

  await test('POST sem material_id no item e recusado com 400', async () => {
    const res = await criar({ fornecedor_nome: 'X', itens: [{ quantidade: 5 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('POST sem fornecedor nenhum e recusado pelo refine do schema', async () => {
    const mat = await novoMaterial(db);
    const res = await criar({ itens: [{ material_id: mat, quantidade: 5 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /fornecedor/i);
  });

  await test('fornecedor_id atravessa o schema e e RESOLVIDO no cadastro de fornecedores', async () => {
    // Prova bilateral do `fornecedor_id`: se o schema o descartasse, o refine cairia no ramo do
    // nome e a remessa nasceria com fornecedor_id NULL — 201, sem erro nenhum, com o vinculo
    // perdido em silencio.
    const f = await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Galvanoplastia Alfa SA')");
    const mat = await novoMaterial(db);
    const res = await criar({ fornecedor_id: f.lastID, itens: [{ material_id: mat, quantidade: 5 }] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const row = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(row.fornecedor_id, f.lastID, 'fornecedor_id foi descartado pelo schema');
    assert.strictEqual(row.fornecedor_nome, 'Galvanoplastia Alfa SA');
  });

  await test('fornecedor_id inexistente devolve 400 do servico, nao 500', async () => {
    const mat = await novoMaterial(db);
    const res = await criar({ fornecedor_id: 987654, itens: [{ material_id: mat, quantidade: 5 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /987654/);
  });

  await test('todos os campos do corpo chegam ao servico (nenhum e descartado em silencio)', async () => {
    // A armadilha: z.object descarta chave nao declarada e o servico nunca ve o campo. Aconteceu
    // com reserva_id (Etapa 4) e lote_id (Etapa 6). Aqui a checagem e campo a campo, relendo do
    // banco: `peso` e `observacoes` do item sao os candidatos obvios a serem esquecidos.
    const mat = await novoMaterial(db);
    // `ordens_servico` e tabela CORE (criada por server/index.js no boot), fora do initSchema do
    // almoxarifado e FORA do harness — cada teste que precisa dela a cria a mao. Precedente:
    // livroExtrato.api.test.js e materialClienteGuardaSaida.api.test.js. Subconjunto minimo.
    await dbRun(db, `CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY, numero_os TEXT, status TEXT, cliente_id INTEGER)`);
    const os = await dbRun(db, "INSERT INTO ordens_servico (numero_os, status) VALUES ('OS-REM-1','ABERTA')");
    const res = await criar({
      fornecedor_nome: 'Galvanizadora Sul LTDA', tipo_servico: 'Galvanizacao',
      os_id: os.lastID, projeto_id: 77, pedido_compra_id: 88,
      prazo_previsto: '2026-12-01', observacoes: 'carga fechada',
      itens: [{ material_id: mat, quantidade: 30, lote_id: 55, peso: 12.5, observacoes: 'chapa 3mm' }],
    });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const row = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(row.fornecedor_nome, 'Galvanizadora Sul LTDA', 'fornecedor_nome foi descartado pelo schema');
    assert.strictEqual(row.tipo_servico, 'Galvanizacao', 'tipo_servico foi descartado pelo schema');
    assert.strictEqual(row.os_id, os.lastID, 'os_id foi descartado pelo schema');
    assert.strictEqual(row.projeto_id, 77, 'projeto_id foi descartado pelo schema');
    assert.strictEqual(row.pedido_compra_id, 88, 'pedido_compra_id foi descartado pelo schema');
    assert.strictEqual(row.prazo_previsto, '2026-12-01', 'prazo_previsto foi descartado pelo schema');
    assert.strictEqual(row.observacoes, 'carga fechada', 'observacoes do cabecalho foi descartada pelo schema');
    const item = await dbGet(db, 'SELECT * FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?', [res.body.id]);
    assert.strictEqual(item.material_id, mat, 'material_id do item foi descartado pelo schema');
    assert.strictEqual(item.quantidade, 30, 'quantidade do item foi descartada pelo schema');
    assert.strictEqual(item.lote_id, 55, 'lote_id do item foi descartado pelo schema');
    assert.strictEqual(item.peso, 12.5, 'peso foi descartado pelo schema');
    assert.strictEqual(item.observacoes, 'chapa 3mm', 'observacoes do item foi descartada pelo schema');
  });

  // ── Validacao Zod: RetornoRemessaSchema ──────────────────────────────────────────────────────
  await test('retorno sem itens e recusado com 400 pelo schema', async () => {
    const { id } = await enviada();
    const res = await request(app).post(`${BASE}/${id}/retornos`).send({ itens: [] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('retorno sem item_remessa_id e recusado com 400', async () => {
    const { id } = await enviada();
    const res = await request(app).post(`${BASE}/${id}/retornos`).send({ itens: [{ quantidade: 5 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('retorno com quantidade zero e recusado com 400', async () => {
    const { id, itemId } = await enviada();
    const res = await request(app).post(`${BASE}/${id}/retornos`)
      .send({ itens: [{ item_remessa_id: itemId, quantidade: 0 }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
  });

  await test('nota_fiscal, lote_id e observacoes do retorno chegam ao banco', async () => {
    const { id, itemId, mat } = await enviada();
    // Lote REAL, e nao um id inventado: o `lote_id` do retorno nao para no serviço — ele desce ao
    // motor, que resolve o lote e recusa `Lote nao encontrado` (stockService:544). Um id fictício
    // aqui faria este teste falhar por 400, escondendo o que ele quer provar.
    const lote = await lotService.criarOuObterLote(db, ADMIN, { material_id: mat, codigo: 'LOTE-RET-1' });
    const res = await request(app).post(`${BASE}/${id}/retornos`)
      .send({ nota_fiscal: 'NF-9911', itens: [{ item_remessa_id: itemId, quantidade: 10,
        lote_id: lote.id, observacoes: 'voltou com rebarba' }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const r = await dbGet(db, 'SELECT * FROM retornos_remessa_item_almoxarifado WHERE remessa_id = ?', [id]);
    assert.strictEqual(r.nota_fiscal, 'NF-9911', 'nota_fiscal foi descartada pelo schema');
    assert.strictEqual(r.lote_id, lote.id, 'lote_id do retorno foi descartado pelo schema');
    assert.strictEqual(r.observacoes, 'voltou com rebarba', 'observacoes do retorno foi descartada pelo schema');
    assert.strictEqual(r.quantidade, 10);
  });

  await test('material_id DIFERENTE no retorno e recusado apontando a Etapa 8c', async () => {
    // Prova do `material_id` do retorno: ele nao tem coluna propria para reler (o servico grava o
    // material do ITEM), entao a prova de que atravessa o schema e a RECUSA que ele dispara. Se o
    // schema o descartasse, este POST voltaria 200 e a regra da 8c nunca dispararia.
    const { id, itemId } = await enviada();
    const outro = await novoMaterial(db);
    const res = await request(app).post(`${BASE}/${id}/retornos`)
      .send({ itens: [{ item_remessa_id: itemId, quantidade: 5, material_id: outro }] });
    assert.strictEqual(res.status, 400, JSON.stringify(res.body));
    assert.match(res.body.error, /8c/);
  });

  await test('[CONTROLE POSITIVO] material_id IGUAL ao enviado passa normalmente', async () => {
    // Sem isto, "recusar todo retorno que traz material_id" passaria no teste acima.
    const { id, itemId, mat } = await enviada();
    const res = await request(app).post(`${BASE}/${id}/retornos`)
      .send({ itens: [{ item_remessa_id: itemId, quantidade: 5, material_id: mat }] });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  });

  // ── Validacao Zod: EncerramentoRemessaSchema ─────────────────────────────────────────────────
  await test('encerrar com pendencia sem destino devolve 400 com a mensagem do servico', async () => {
    const { id } = await enviada(30);
    const enc = await request(app).put(`${BASE}/${id}/encerrar`).send({});
    assert.strictEqual(enc.status, 400, JSON.stringify(enc.body));
    // A mensagem do servico chega INTACTA, com os numeros: um catch generico ("erro ao encerrar")
    // deixaria o operador sem saber quanto esta em jogo nem o que digitar.
    assert.match(enc.body.error, /PERDA_NO_TERCEIRO/);
    assert.match(enc.body.error, /30/);
  });

  await test('destino fora do enum e recusado com 400 pelo schema', async () => {
    const { id } = await enviada();
    const enc = await request(app).put(`${BASE}/${id}/encerrar`)
      .send({ destino: 'SUMIU', justificativa: 'sei la' });
    assert.strictEqual(enc.status, 400, JSON.stringify(enc.body));
  });

  await test('encerrar com destino e SEM justificativa e recusado pelo servico', async () => {
    const { id } = await enviada();
    const enc = await request(app).put(`${BASE}/${id}/encerrar`).send({ destino: 'PERDA_NO_TERCEIRO' });
    assert.strictEqual(enc.status, 400, JSON.stringify(enc.body));
    assert.match(enc.body.error, /justificativa/i);
  });

  await test('destino e justificativa atravessam o schema e ficam gravados no cabecalho', async () => {
    // Bilateral do par destino/justificativa: se `justificativa` nao estivesse declarada, o teste
    // acima continuaria passando (o campo sumiria e o servico recusaria SEMPRE) — e encerrar viraria
    // impossivel. E' este teste que prova que ela chega.
    const { id, mat } = await enviada(30);
    const enc = await request(app).put(`${BASE}/${id}/encerrar`)
      .send({ destino: 'CONSUMIDO_NO_PROCESSO', justificativa: 'virou cavaco na usinagem' });
    assert.strictEqual(enc.status, 200, JSON.stringify(enc.body));
    const row = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(row.status, 'ENCERRADA');
    assert.strictEqual(row.encerramento_destino, 'CONSUMIDO_NO_PROCESSO', 'destino foi descartado pelo schema');
    assert.strictEqual(row.encerramento_justificativa, 'virou cavaco na usinagem',
      'justificativa foi descartada pelo schema');
    assert.strictEqual(await emTerceiros(db, mat), 0, 'a retencao ficou presa apos o encerramento');
  });

  // ── Validacao Zod: CancelamentoRemessaSchema ─────────────────────────────────────────────────
  await test('cancelar pela rota exige motivo e estorna', async () => {
    const { mat, id } = await enviada(30);
    const semMotivo = await request(app).put(`${BASE}/${id}/cancelar`).send({});
    assert.strictEqual(semMotivo.status, 400, JSON.stringify(semMotivo.body));
    assert.strictEqual(await emTerceiros(db, mat), 30, 'o cancelamento recusado mexeu no saldo');
    const ok = await request(app).put(`${BASE}/${id}/cancelar`).send({ motivo: 'terceiro recusou' });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.strictEqual(await emTerceiros(db, mat), 0);
    // `motivo` atravessou o schema: se tivesse sido descartado, o min(1) do Zod recusaria e nunca
    // chegariamos aqui — mas a leitura do banco fecha o par (o texto e o que foi digitado).
    const row = await dbGet(db, 'SELECT cancelamento_motivo FROM remessas_terceiro_almoxarifado WHERE id = ?', [id]);
    assert.strictEqual(row.cancelamento_motivo, 'terceiro recusou', 'motivo foi descartado pelo schema');
  });

  await test('motivo vazio e recusado com 400 (min(1) no schema, trim no servico)', async () => {
    const { id } = await enviada();
    const vazio = await request(app).put(`${BASE}/${id}/cancelar`).send({ motivo: '' });
    assert.strictEqual(vazio.status, 400, JSON.stringify(vazio.body));
    const soEspaco = await request(app).put(`${BASE}/${id}/cancelar`).send({ motivo: '   ' });
    assert.strictEqual(soEspaco.status, 400, JSON.stringify(soEspaco.body));
    assert.strictEqual((await dbGet(db, 'SELECT status FROM remessas_terceiro_almoxarifado WHERE id = ?', [id])).status,
      'ENVIADA', 'a remessa foi cancelada apesar do motivo vazio');
  });

  // ── Ciclo e propagacao de erro ───────────────────────────────────────────────────────────────
  await test('o ciclo inteiro funciona pelas rotas: criar -> enviar -> retornar -> encerrar', async () => {
    const { mat, body } = await corpoValido();
    const criada = await criar(body);
    const id = criada.body.id;

    const env = await request(app).post(`${BASE}/${id}/enviar`).send({});
    assert.strictEqual(env.status, 200, JSON.stringify(env.body));
    assert.strictEqual(await emTerceiros(db, mat), 30);

    const cheia = await request(app).get(`${BASE}/${id}`);
    assert.strictEqual(cheia.status, 200);
    const itemId = cheia.body.itens[0].id;

    const ret = await request(app).post(`${BASE}/${id}/retornos`)
      .send({ nota_fiscal: 'NF-R-1', itens: [{ item_remessa_id: itemId, quantidade: 20 }] });
    assert.strictEqual(ret.status, 200, JSON.stringify(ret.body));
    assert.strictEqual(ret.body.status, 'RETORNO_PARCIAL');
    assert.strictEqual(await emTerceiros(db, mat), 10);

    const enc = await request(app).put(`${BASE}/${id}/encerrar`)
      .send({ destino: 'PERDA_NO_TERCEIRO', justificativa: 'perdido no banho' });
    assert.strictEqual(enc.status, 200, JSON.stringify(enc.body));
    assert.strictEqual(await emTerceiros(db, mat), 0);
  });

  await test('regra de negocio do servico chega como 400 com a mensagem e os NUMEROS intactos', async () => {
    // 400 de regra de negocio nao pode virar 500, e a mensagem nao pode ser trocada por um texto
    // generico: ela existe para dizer quanto ha e quanto foi pedido.
    const mat = await novoMaterial(db, 10);
    const c = await criar({ fornecedor_nome: 'F', itens: [{ material_id: mat, quantidade: 30 }] });
    const env = await request(app).post(`${BASE}/${c.body.id}/enviar`).send({});
    assert.strictEqual(env.status, 400, JSON.stringify(env.body));
    assert.match(env.body.error, /disponivel 10/);
    assert.match(env.body.error, /pede 30/);
    assert.strictEqual(await emTerceiros(db, mat), 0, 'a remessa recusada reteve saldo mesmo assim');
  });

  await test('transicao invalida pela rota devolve 400 com a mensagem da maquina de estados', async () => {
    const { id } = await enviada();
    const de_novo = await request(app).post(`${BASE}/${id}/enviar`).send({});
    assert.strictEqual(de_novo.status, 400, JSON.stringify(de_novo.body));
    assert.match(de_novo.body.error, /Transicao invalida/);
  });

  await test('GET de remessa inexistente devolve 404 DA ROTA, nao 500 nem o 404 do Express', async () => {
    const res = await request(app).get(`${BASE}/999999`);
    assert.strictEqual(res.status, 404);
    // O corpo importa: o 404 padrao do Express (rota nao registrada) vem sem JSON nenhum, e sem
    // esta assercao este teste passaria com as rotas INEXISTENTES — teste vazio.
    assert.match(res.body.error || '', /[Rr]emessa/, `sem corpo de erro da rota: ${JSON.stringify(res.body)}`);
  });

  await test('acao sobre remessa inexistente devolve 404 DA ROTA, nao 500', async () => {
    const res = await request(app).post(`${BASE}/999999/enviar`).send({});
    assert.strictEqual(res.status, 404, JSON.stringify(res.body));
    assert.match(res.body.error || '', /[Rr]emessa/, `sem corpo de erro da rota: ${JSON.stringify(res.body)}`);
  });

  // ── Filtros da listagem ──────────────────────────────────────────────────────────────────────
  await test('a listagem filtra por status e por fornecedor_id', async () => {
    const f = await dbRun(db, "INSERT INTO fornecedores (razao_social) VALUES ('Terceiro do Filtro')");
    const mat = await novoMaterial(db);
    const c = await criar({ fornecedor_id: f.lastID, itens: [{ material_id: mat, quantidade: 5 }] });
    const porFornecedor = await request(app).get(`${BASE}?fornecedor_id=${f.lastID}`);
    assert.deepStrictEqual(porFornecedor.body.map((r) => r.id), [c.body.id]);
    const abertas = await request(app).get(`${BASE}?status=ABERTA`);
    assert.ok(abertas.body.every((r) => r.status === 'ABERTA'), 'o filtro de status deixou passar outro status');
    assert.ok(abertas.body.some((r) => r.id === c.body.id));
    // Controle positivo do filtro: sem ele a mesma remessa aparece numa lista maior.
    const todas = await request(app).get(BASE);
    assert.ok(todas.body.length > porFornecedor.body.length,
      'a lista sem filtro tem o mesmo tamanho da filtrada — o filtro pode nao estar filtrando nada');
  });

  // ── Varredura de prazo ───────────────────────────────────────────────────────────────────────
  await test('GET /vencidas lista so as atrasadas com material ainda la fora', async () => {
    // A rota tem de ser registrada ANTES de /:id, senao o Express casa "vencidas" como :id e
    // devolve 404 (ou 500 no parseInt).
    const m1 = await novoMaterial(db);
    const m2 = await novoMaterial(db);
    const m3 = await novoMaterial(db);
    const atrasada = await criar({ fornecedor_nome: 'F', prazo_previsto: '2020-01-01',
      itens: [{ material_id: m1, quantidade: 10 }] });
    const noPrazo = await criar({ fornecedor_nome: 'F', prazo_previsto: '2099-01-01',
      itens: [{ material_id: m2, quantidade: 10 }] });
    const atrasadaEncerrada = await criar({ fornecedor_nome: 'F', prazo_previsto: '2020-01-01',
      itens: [{ material_id: m3, quantidade: 10 }] });
    for (const c of [atrasada, noPrazo, atrasadaEncerrada]) {
      const env = await request(app).post(`${BASE}/${c.body.id}/enviar`).send({});
      assert.strictEqual(env.status, 200, JSON.stringify(env.body));
    }
    await request(app).put(`${BASE}/${atrasadaEncerrada.body.id}/encerrar`)
      .send({ destino: 'PERDA_NO_TERCEIRO', justificativa: 'perdida' });

    const res = await request(app).get(`${BASE}/vencidas`);
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const ids = res.body.remessas.map((r) => r.id);
    assert.ok(ids.includes(atrasada.body.id), 'a remessa atrasada nao apareceu');
    assert.ok(!ids.includes(noPrazo.body.id), 'remessa no prazo apareceu como vencida');
    assert.ok(!ids.includes(atrasadaEncerrada.body.id),
      'remessa ENCERRADA apareceu como vencida — encerrada nao atrasa, nao ha nada la fora');
    assert.strictEqual(res.body.total, res.body.remessas.length, 'o total nao bate com a lista');
  });

  await test('GET /vencidas aceita data de referencia (o que torna o cron testavel)', async () => {
    const mat = await novoMaterial(db);
    const c = await criar({ fornecedor_nome: 'F', prazo_previsto: '2026-08-20',
      itens: [{ material_id: mat, quantidade: 10 }] });
    await request(app).post(`${BASE}/${c.body.id}/enviar`).send({});
    const antes = await request(app).get(`${BASE}/vencidas?referencia=2026-08-15`);
    assert.strictEqual(antes.status, 200, JSON.stringify(antes.body));
    assert.ok(!antes.body.remessas.map((r) => r.id).includes(c.body.id));
    assert.strictEqual(antes.body.referencia, '2026-08-15', 'a referencia usada nao volta na resposta');
    const depois = await request(app).get(`${BASE}/vencidas?referencia=2026-09-01`);
    assert.ok(depois.body.remessas.map((r) => r.id).includes(c.body.id));
  });

  await test('a listagem tambem aceita vencidas=1, com o MESMO criterio de /vencidas', async () => {
    // Duas contas diferentes dariam telas que discordam — o filtro da lista e a leitura do cron tem
    // de sair do mesmo SQL.
    const daLista = await request(app).get(`${BASE}?vencidas=1&referencia=2026-09-01`);
    const daRota = await request(app).get(`${BASE}/vencidas?referencia=2026-09-01`);
    assert.deepStrictEqual(daLista.body.map((r) => r.id), daRota.body.remessas.map((r) => r.id));
    assert.ok(daRota.body.remessas.length > 0, 'nenhuma vencida — o teste nao provaria nada');
  });

  // ── Etapa 31, Task 2 — o numero da remessa sai do gerador UNICO (numeroDoc.js) ─────────────
  //
  // Ate a Etapa 31, `thirdPartyService.gerarNumero()` era `Date.now().toString().slice(-8)` + um
  // sorteio de 0..99: o carimbo repetia a cada 27,78 horas e, no mesmo offset de ms, duas remessas
  // disputavam 100 sufixos — e o UNIQUE de `numero` devolvia o `SQLITE_CONSTRAINT` CRU ao
  // operador. A assercao e a FORMA COMPLETA e nao `assert.ok(res.body.numero)` (que e o que o
  // [CONTROLE POSITIVO] do POST la em cima faz): so a regex distingue o gerador novo do velho.
  // NOTA (revisao adversarial da Etapa 31): esta regex prova a RN-01 (a forma), NAO a RN-02 (o
  // carimbo nao dar a volta). Medido: trocar `carimboTempo` por um decimal fatiado do MESMO
  // comprimento reintroduz a colisao e deixa este cenario VERDE. Quem prova a RN-02 sao os
  // cenarios (2) e (2b) de `numeroDocumento.api.test.js` — o (2b) e um invariante de
  // reversibilidade, impossivel de satisfazer por acidente. Nao afrouxe aqueles dois.
  await test('Etapa 31 RN-01: o numero da remessa tem a forma REM-<8 tempo><8 aleatorio>, e e o mesmo da linha', async () => {
    const { body } = await corpoValido();
    const res = await criar(body);
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.numero, /^REM-[0-9A-Z]{16}$/,
      `numero fora do formato do gerador unico: ${JSON.stringify(res.body.numero)} — o formato ANTIGO `
      + 'era REM- + 8..10 digitos, sem letra nenhuma');
    // RN-07 nas TRES pontas: resposta, linha do banco e AUDITORIA. A remessa e o unico dos quatro
    // que carimba o numero em `dados_novos` — se o chamador devolvesse o numero da 1a tentativa
    // enquanto o retry gravou o da 3a, a trilha apontaria para um documento que nao existe.
    const linha = await dbGet(db, 'SELECT numero FROM remessas_terceiro_almoxarifado WHERE id = ?', [res.body.id]);
    assert.strictEqual(linha.numero, res.body.numero,
      `a rota devolveu ${res.body.numero} e o banco guardou ${linha.numero}`);
    const trilha = await dbGet(db,
      `SELECT dados_novos FROM auditoria_log_almoxarifado
       WHERE entidade = 'remessa_terceiro' AND entidade_id = ? AND acao = 'CRIACAO'`, [res.body.id]);
    assert.ok(trilha, 'a criacao da remessa nao deixou rastro — sem ele a assercao abaixo passaria vazia');
    assert.strictEqual(JSON.parse(trilha.dados_novos).numero, res.body.numero,
      `a auditoria guardou ${trilha.dados_novos} para a remessa ${res.body.numero}`);
  });

  await test('Etapa 31 RN-05: remessa gravada no formato ANTIGO continua sendo lida pela rota', async () => {
    // Regressao, nao descoberta: nada valida/parseia/ordena/fatia o numero da remessa.
    const ins = await dbRun(db, `INSERT INTO remessas_terceiro_almoxarifado
        (numero, fornecedor_nome, status, criado_por, criado_por_nome)
       VALUES ('REM-885484687', 'Galvanizadora Legado', 'ABERTA', 1, 'Legado E31')`);
    const det = await request(app).get(`${BASE}/${ins.lastID}`);
    assert.strictEqual(det.status, 200, `a rota recusou o numero antigo: ${det.status} ${JSON.stringify(det.body)}`);
    assert.strictEqual(det.body.numero, 'REM-885484687', JSON.stringify(det.body).slice(0, 300));

    const lista = await request(app).get(BASE);
    assert.strictEqual(lista.status, 200, JSON.stringify(lista.body).slice(0, 200));
    const linhas = Array.isArray(lista.body) ? lista.body : (lista.body.remessas || []);
    assert.ok(linhas.some((r) => r.id === ins.lastID && r.numero === 'REM-885484687'),
      'a remessa de numero antigo sumiu da listagem');
  });

  // ── Etapa 31, Task 3 — a COLISAO FORCADA prova o retry da RN-04, pela rota ─────────────────
  //
  // Com a entropia da Etapa 31 (8 caracteres base36 = ~2,8x10^12 sufixos por milissegundo) o retry
  // de `inserirComNumeroUnico` NUNCA deve disparar em uso real. Codigo que nunca roda e codigo que
  // ninguem sabe se funciona: aqui a colisao e FABRICADA de proposito, para provar que a 2a
  // tentativa SALVA a criacao em vez de devolver `SQLITE_CONSTRAINT` cru ao operador — que e
  // exatamente o que ele via antes desta etapa.
  //
  // COMO A COLISAO E FORCADA, e por que a receita obvia NAO funciona: prender `Math.random` num
  // valor fixo faria as CINCO tentativas gerarem o MESMO numero, todas colidiriam e o fluxo
  // terminaria no erro traduzido da RN-04 — o OPOSTO do que este cenario quer provar. A receita
  // certa e:
  //   1. congelar `Date.now` (as duas remessas nascem com o MESMO carimbo de tempo);
  //   2. substituir `Math.random` por um roteiro de EXATAMENTE 8 valores — os 8 sorteios que
  //      reproduzem o sufixo da remessa 1 —, delegando ao `Math.random` REAL da 9a chamada em
  //      diante. Assim a 1a tentativa da remessa 2 colide e a 2a vence, com aleatorio de verdade.
  // O sufixo NAO e lido por posicao fixa (Global Constraint 9 do plano): o corte sai de
  // `carimboTempo(T_FIXO)`, que o modulo exporta justamente para o teste nao re-congelar "8".
  //
  // E o cenario NAO se contenta com "as duas deram 201 com numeros distintos": isso passaria
  // verde ate se o retry nunca tivesse disparado (bastaria o stub ser consumido por outro
  // chamador de `Math.random`). Um espiao no `db.run` grava os numeros de CADA tentativa de
  // INSERT, e o teste afirma que foram DUAS, que a 1a foi o numero da remessa 1 e que a 2a e o
  // numero que a rota devolveu, que o banco guardou e que a auditoria registrou (RN-07).
  await test('Etapa 31 RN-04+RN-07: colisao FORCADA na 1a tentativa — a 2a vence e a rota devolve o numero VENCEDOR', async () => {
    const T_FIXO = 1788134400000; // 2026-08-31, epoch realista: carimbo de 8 chars, como em producao
    const realNow = Date.now;
    const realRandom = Math.random;
    const realRun = db.run;
    /** Numero de CADA tentativa de INSERT do cabecalho da remessa, na ordem. */
    const tentativas = [];
    let consumidos = 0;
    try {
      db.run = function espiaoDeInsert(...args) {
        const [sql, params] = args;
        if (typeof sql === 'string' && /INSERT INTO remessas_terceiro_almoxarifado/i.test(sql)
            && Array.isArray(params)) tentativas.push(params[0]);
        return realRun.apply(this, args);
      };
      Date.now = () => T_FIXO;

      // Os materiais nascem ANTES de armar o roteiro do aleatorio: `novoMaterial` escreve no banco,
      // e uma escrita entre a arma e o disparo gastaria os valores do roteiro no lugar errado.
      const um = await corpoValido();
      const dois = await corpoValido();

      const r1 = await criar(um.body);
      assert.strictEqual(r1.status, 201, JSON.stringify(r1.body));
      const numero1 = r1.body.numero;
      const prefixoTempo = `REM-${carimboTempo(T_FIXO)}`;
      assert.ok(numero1.startsWith(prefixoTempo),
        `o relogio congelado nao pegou: ${numero1} nao comeca por ${prefixoTempo}`);
      const aleatorio1 = numero1.slice(prefixoTempo.length);
      assert.strictEqual(aleatorio1.length, 8, `sufixo aleatorio inesperado: ${aleatorio1}`);

      // (digito + 0,5) / 36 cai no MEIO da faixa do digito, entao `Math.floor(v * 36)` devolve
      // exatamente ele — sem depender de arredondamento de borda.
      const roteiro = [...aleatorio1].map((c) => (parseInt(c, 36) + 0.5) / 36);
      Math.random = () => (consumidos < roteiro.length ? roteiro[consumidos++] : realRandom());

      const r2 = await criar(dois.body);
      assert.strictEqual(consumidos, roteiro.length,
        `o roteiro do aleatorio nao foi consumido (${consumidos}/8) — a colisao nao chegou a ser forcada`);

      // 1. As DUAS criacoes tem sucesso, e nenhuma vaza erro de SQLite para o cliente.
      assert.strictEqual(r2.status, 201, JSON.stringify(r2.body));
      for (const [nome, res] of [['remessa 1', r1], ['remessa 2', r2]]) {
        assert.doesNotMatch(JSON.stringify(res.body), /UNIQUE constraint|SQLITE_/i,
          `${nome} devolveu erro cru de SQLite ao cliente: ${JSON.stringify(res.body).slice(0, 300)}`);
      }
      assert.notStrictEqual(r2.body.numero, numero1, 'as duas remessas ficaram com o MESMO numero');

      // 2. O retry DISPAROU mesmo: duas tentativas de INSERT para a remessa 2, a primeira com o
      //    numero ja gravado pela remessa 1. Sem isto o cenario passaria verde com o retry morto.
      assert.deepStrictEqual(tentativas, [numero1, numero1, r2.body.numero],
        `tentativas de INSERT fora do esperado: ${JSON.stringify(tentativas)} — esperado `
        + '[remessa 1, colisao da remessa 2, vencedor da remessa 2]');

      // 3. RN-07 nas tres pontas do numero VENCEDOR: resposta, linha do banco e auditoria.
      const linha = await dbGet(db, 'SELECT numero FROM remessas_terceiro_almoxarifado WHERE id = ?', [r2.body.id]);
      assert.ok(linha, `a remessa ${r2.body.id} nao existe no banco`);
      assert.strictEqual(r2.body.numero, linha.numero,
        `a rota devolveu ${r2.body.numero} e o banco guardou ${linha.numero} — o papel impresso nao bate com a linha`);
      const trilha = await dbGet(db,
        `SELECT dados_novos FROM auditoria_log_almoxarifado
         WHERE entidade = 'remessa_terceiro' AND entidade_id = ? AND acao = 'CRIACAO'`, [r2.body.id]);
      assert.ok(trilha, 'a criacao da remessa 2 nao deixou rastro — sem a guarda a assercao abaixo passaria vazia');
      assert.strictEqual(JSON.parse(trilha.dados_novos).numero, r2.body.numero,
        `a auditoria guardou ${trilha.dados_novos} para a remessa ${r2.body.numero}`);

      // 4. A remessa 1 continua com o numero dela: o retry da 2 nao pode ter sobrescrito nada.
      const linha1 = await dbGet(db, 'SELECT numero FROM remessas_terceiro_almoxarifado WHERE id = ?', [r1.body.id]);
      assert.strictEqual(linha1.numero, numero1, 'a remessa 1 mudou de numero por causa do retry da 2');
    } finally {
      Date.now = realNow;
      Math.random = realRandom;
      db.run = realRun;
    }
  });

  await close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
