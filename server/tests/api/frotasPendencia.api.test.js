/**
 * Frota Etapa 6 — T1: tratar a pendencia do registro (POST/DELETE /api/frotas/checklists/:id/tratar-pendencia).
 *
 *   RN-F6.01  colunas novas; a situacao gravada nao muda (continua PENDENCIA)
 *   RN-F6.02  tratar: perfil gerenciar_veiculos, recusas na ordem do contrato, "ja tratada" no WHERE (concorrencia), manutencao do mesmo
 *             veiculo
 *   RN-F6.03  desfazer: limpa as colunas; "nao foi tratada" no WHERE
 *   RN-F6.04  o alerta sai para PENDENCIA nao tratada, sem janela de 7 dias; tratada nao gera alerta
 *   RN-F6.05  leituras: GET /checklists (+ descricao da manutencao), meus-registros, planilha (3 colunas no fim)
 *   RN-F6.09  tratar e desfazer limpam o cache do painel
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa6-tratar-pendencia.md
 * Executar: cd server && node tests/api/frotasPendencia.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const { hojeLocalISO } = require('../../services/diaLocal');
const { dbRun, dbGet } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const CHAVES = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga'];
const todosOk = () => Object.fromEntries(CHAVES.map((k) => [k, 'OK']));
const somaDias = (dia, n) => { const [a, m, d] = dia.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10); };
const HOJE = hojeLocalISO();
const SEM_PERMISSAO = 'Sem permissão para esta operação';

let ctx;
const S = {};

const como = (user, metodo, url, corpo) => ctx.como(user)(metodo, url, corpo);
const urlTratar = (id) => `/api/frotas/checklists/${id}/tratar-pendencia`;
const tratar = (id, corpo, user = ADMIN) => como(user, 'post', urlTratar(id), corpo);
const desfazer = (id, user = ADMIN) => como(user, 'delete', urlTratar(id));
const linha = (id) => dbGet(ctx.db, 'SELECT * FROM frotas_checklists WHERE id = ?', [id]);

async function registrarFalha(user = MOTORISTA, extra = {}) {
  const r = await como(user, 'post', '/api/frotas/portal/registros', {
    tipo: 'inspecao', veiculo_id: S.v1.id, km: 1000, itens: { ...todosOk(), freios: 'FALHA' }, ...extra,
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.body));
  return r.body.registro;
}

async function cenario() {
  S.v1 = (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'PEN0001', km_atual: 1000 })).body;
  S.v2 = (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'PEN0002', km_atual: 1000 })).body;
  S.ma = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista', usuario_id: 2 })).body;
  S.mb = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Bruno Motorista', usuario_id: 4 })).body;
  S.man1 = (await como(ADMIN, 'post', '/api/frotas/manutencoes', {
    veiculo_id: S.v1.id, tipo: 'corretiva', descricao: 'Troca da pastilha de freio', data_manutencao: HOJE,
  })).body;
  S.manOutro = (await como(ADMIN, 'post', '/api/frotas/manutencoes', { veiculo_id: S.v2.id, descricao: 'Outro carro' })).body;
  assert(S.v1.id && S.ma.id && S.mb.id && S.man1.id && S.manOutro.id);
  S.ok = (await como(MOTORISTA, 'post', '/api/frotas/portal/registros', {
    tipo: 'inspecao', veiculo_id: S.v1.id, km: 1000, itens: todosOk(),
  })).body.registro;
  assert.strictEqual(S.ok.status_geral, 'OK');
}

// ── RN-F6.02 — perfil ───────────────────────────────────────────────────────────────────────
test('RN-F6.02 MOTORISTA e CONSULTA -> 403 ao tratar e ao desfazer (antes de qualquer validacao)', async () => {
  const p = await registrarFalha();
  for (const u of [MOTORISTA, CONSULTA, MOTORISTA2]) {
    const a = await tratar(p.id, { tratamento: 'x' }, u);
    assert.strictEqual(a.status, 403, `tratar ${u.nome}`);
    assert.strictEqual(a.body.error, SEM_PERMISSAO);
    assert.strictEqual(a.body.acao, 'gerenciar_veiculos');
    const b = await desfazer(p.id, u);
    assert.strictEqual(b.status, 403, `desfazer ${u.nome}`);
    const c = await tratar(999999, {}, u);
    assert.strictEqual(c.status, 403, 'o 403 vem antes do 400/404');
  }
  assert.strictEqual((await linha(p.id)).pendencia_tratada_em, null);
});

// ── RN-F6.02 — recusas na ordem ─────────────────────────────────────────────────────────────
test('RN-F6.02 texto: ausente, nao-texto, vazio e so espacos -> 400 "Descreva o que foi feito"; > 1000 -> 400', async () => {
  const p = await registrarFalha();
  for (const corpo of [{}, { tratamento: null }, { tratamento: 12 }, { tratamento: ['a'] }, { tratamento: '' }, { tratamento: '   \n ' }]) {
    const r = await tratar(p.id, corpo);
    assert.strictEqual(r.status, 400, JSON.stringify(corpo));
    assert.strictEqual(r.body.error, 'Descreva o que foi feito', JSON.stringify(corpo));
  }
  const longo = await tratar(p.id, { tratamento: 'a'.repeat(1001) });
  assert.strictEqual(longo.status, 400);
  assert.strictEqual(longo.body.error, 'O texto passou de 1000 caracteres');
  const mil = await tratar(p.id, { tratamento: `  ${'b'.repeat(1000)}  ` });
  assert.strictEqual(mil.status, 200, '1000 depois de tirar as pontas passa');
  assert.strictEqual((await linha(p.id)).pendencia_tratamento, 'b'.repeat(1000));
});

test('RN-F6.02 manutencao_id torto -> 400 "Manutenção inválida"; null, "" e ausente valem "sem manutencao"', async () => {
  const p = await registrarFalha();
  for (const m of ['abc', 0, -1, 1.5, true, '1.5', ' 2', [1], {}]) {
    const r = await tratar(p.id, { tratamento: 'ok', manutencao_id: m });
    assert.strictEqual(r.status, 400, JSON.stringify(m));
    assert.strictEqual(r.body.error, 'Manutenção inválida', JSON.stringify(m));
  }
  const vazio = await tratar(p.id, { tratamento: 'ok', manutencao_id: '' });
  assert.strictEqual(vazio.status, 200);
  assert.strictEqual(vazio.body.pendencia_manutencao_id, null);
  const p2 = await registrarFalha();
  const nulo = await tratar(p2.id, { tratamento: 'ok', manutencao_id: null });
  assert.strictEqual(nulo.status, 200);
  const p3 = await registrarFalha();
  const texto = await tratar(p3.id, { tratamento: 'ok', manutencao_id: String(S.man1.id) });
  assert.strictEqual(texto.status, 200, 'id como texto de digitos vale');
  assert.strictEqual(texto.body.pendencia_manutencao_id, S.man1.id);
});

test('RN-F6.02 o 400 do corpo vem antes do 404 (id inexistente) e do 409 (sem pendencia)', async () => {
  const a = await tratar(999999, { tratamento: '' });
  assert.strictEqual(a.status, 400);
  const b = await tratar(S.ok.id, { tratamento: 'x', manutencao_id: 'abc' });
  assert.strictEqual(b.status, 400);
  assert.strictEqual(b.body.error, 'Manutenção inválida');
});

test('RN-F6.02 id inexistente ou torto -> 404 "Registro não encontrado"', async () => {
  for (const id of ['999999', 'abc', '0', '-1', '1.5', '1e0']) {
    const r = await tratar(id, { tratamento: 'x' });
    assert.strictEqual(r.status, 404, id);
    assert.strictEqual(r.body.error, 'Registro não encontrado', id);
    const d = await desfazer(id);
    assert.strictEqual(d.status, 404, `desfazer ${id}`);
    assert.strictEqual(d.body.error, 'Registro não encontrado');
  }
});

test('RN-F6.02 registro OK, INCOMPLETO ou sem situacao (linha antiga) -> 409 SEM_PENDENCIA', async () => {
  const r = await tratar(S.ok.id, { tratamento: 'x' });
  assert.strictEqual(r.status, 409);
  assert.deepStrictEqual(r.body, { error: 'Este registro não tem pendência', code: 'SEM_PENDENCIA' });
  const inc = (await como(MOTORISTA, 'post', '/api/frotas/portal/registros', {
    tipo: 'inspecao', veiculo_id: S.v1.id, km: 1000, itens: { freios: 'OK' },
  })).body.registro;
  assert.strictEqual(inc.status_geral, 'INCOMPLETO');
  assert.strictEqual((await tratar(inc.id, { tratamento: 'x' })).body.code, 'SEM_PENDENCIA');
  const antigo = await dbRun(ctx.db, "INSERT INTO frotas_checklists (veiculo_id, data_checklist, aprovado, status_geral) VALUES (?, '2025-01-01', 0, NULL)", [S.v1.id]);
  const a = await tratar(antigo.lastID, { tratamento: 'x' });
  assert.strictEqual(a.status, 409);
  assert.strictEqual(a.body.code, 'SEM_PENDENCIA');
  assert.strictEqual((await linha(S.ok.id)).pendencia_tratada_em, null);
});

test('RN-F6.02 manutencao inexistente -> 400 "Manutenção não encontrada"; de outro veiculo -> 400; nada gravado', async () => {
  const p = await registrarFalha();
  const a = await tratar(p.id, { tratamento: 'x', manutencao_id: 999999 });
  assert.strictEqual(a.status, 400);
  assert.strictEqual(a.body.error, 'Manutenção não encontrada');
  const b = await tratar(p.id, { tratamento: 'x', manutencao_id: S.manOutro.id });
  assert.strictEqual(b.status, 400);
  assert.strictEqual(b.body.error, 'Esta manutenção é de outro veículo');
  assert.strictEqual((await linha(p.id)).pendencia_tratada_em, null);
});

// ── RN-F6.01/02 — o caminho feliz ───────────────────────────────────────────────────────────
test('RN-F6.01/02 tratar grava as 5 colunas (instante de Brasilia AAAA-MM-DDTHH:MM), a situacao continua PENDENCIA, 200 com o registro', async () => {
  const p = await registrarFalha();
  const r = await tratar(p.id, { tratamento: '  Pastilha trocada  ', manutencao_id: S.man1.id });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.id, p.id);
  assert.strictEqual(r.body.status_geral, 'PENDENCIA');
  assert.strictEqual(r.body.pendencia_tratamento, 'Pastilha trocada');
  assert.strictEqual(r.body.pendencia_tratada_por_id, 1);
  assert.strictEqual(r.body.pendencia_tratada_por_nome, 'Gestor');
  assert.strictEqual(r.body.pendencia_manutencao_id, S.man1.id);
  assert.match(r.body.pendencia_tratada_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.strictEqual(r.body.pendencia_tratada_em.slice(0, 10), hojeLocalISO(), 'o dia de Brasilia');
  assert.strictEqual(typeof r.body.itens, 'object', 'formato de registroComItens');
  assert(Array.isArray(r.body.avarias));
  assert.strictEqual(r.body.itens_json, undefined);
  const l = await linha(p.id);
  assert.strictEqual(l.status_geral, 'PENDENCIA');
  assert.strictEqual(l.aprovado, 0);
  S.tratado = p;
});

test('RN-F6.01 o instante e o relogio de Brasilia, nao o UTC: 01:30 UTC do dia 24 = 23/10 22:30', async () => {
  const { instanteLocal } = require('../../services/frotas/pendenciaService');
  assert.strictEqual(instanteLocal(new Date('2026-10-24T01:30:00Z')), '2026-10-23T22:30');
  assert.strictEqual(instanteLocal(new Date('2026-10-23T15:05:00Z')), '2026-10-23T12:05');
});

test('RN-F6.02 tratar de novo -> 409 PENDENCIA_JA_TRATADA e o texto nao muda', async () => {
  const r = await tratar(S.tratado.id, { tratamento: 'outro texto' });
  assert.strictEqual(r.status, 409);
  assert.deepStrictEqual(r.body, { error: 'Esta pendência já foi tratada', code: 'PENDENCIA_JA_TRATADA' });
  assert.strictEqual((await linha(S.tratado.id)).pendencia_tratamento, 'Pastilha trocada');
});

test('RN-F6.02 dois gestores tratam ao mesmo tempo -> um 200 e os outros 409; o texto gravado e o do vencedor', async () => {
  const p = await registrarFalha();
  const rs = await Promise.all([1, 2, 3, 4].map((n) => tratar(p.id, { tratamento: `texto ${n}` })));
  const ok = rs.filter((r) => r.status === 200);
  assert.strictEqual(ok.length, 1, rs.map((r) => r.status).join(','));
  assert(rs.filter((r) => r.status === 409).every((r) => r.body.code === 'PENDENCIA_JA_TRATADA'));
  assert.strictEqual(rs.filter((r) => r.status === 409).length, 3);
  assert.strictEqual((await linha(p.id)).pendencia_tratamento, ok[0].body.pendencia_tratamento);
});

test('RN-F6.02 a manutencao conferida no WHERE: excluida entre a conferencia e a gravacao nao fica ligada', async () => {
  // Sem gancho de corrida: prova que a gravacao, sozinha, recusa a manutencao que nao existe (o servico relê e responde 400).
  const p = await registrarFalha();
  const m = (await como(ADMIN, 'post', '/api/frotas/manutencoes', { veiculo_id: S.v1.id, descricao: 'some' })).body;
  const pendenciaService = require('../../services/frotas/pendenciaService');
  const gravou = await pendenciaService.gravarTratamento(ctx.db, ADMIN, p.id, { tratamento: 'x', manutencaoId: m.id + 1000 });
  assert.strictEqual(gravou, 0, 'o UPDATE nao casa com manutencao inexistente');
  assert.strictEqual((await linha(p.id)).pendencia_tratada_em, null);
});

// ── RN-F6.03 — desfazer ─────────────────────────────────────────────────────────────────────
test('RN-F6.03 desfazer limpa as 5 colunas; desfazer de novo -> 409 PENDENCIA_NAO_TRATADA; registro sem pendencia -> 409', async () => {
  const p = await registrarFalha();
  await tratar(p.id, { tratamento: 'feito', manutencao_id: S.man1.id });
  const r = await desfazer(p.id);
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  for (const c of ['pendencia_tratada_em', 'pendencia_tratada_por_id', 'pendencia_tratada_por_nome', 'pendencia_tratamento', 'pendencia_manutencao_id']) {
    assert.strictEqual(r.body[c], null, c);
  }
  assert.strictEqual(r.body.status_geral, 'PENDENCIA');
  const de = await desfazer(p.id);
  assert.strictEqual(de.status, 409);
  assert.deepStrictEqual(de.body, { error: 'Esta pendência não foi tratada', code: 'PENDENCIA_NAO_TRATADA' });
  const ok = await desfazer(S.ok.id);
  assert.strictEqual(ok.status, 409);
  assert.strictEqual(ok.body.code, 'PENDENCIA_NAO_TRATADA');
  const de2 = await tratar(p.id, { tratamento: 'de novo' });
  assert.strictEqual(de2.status, 200, 'depois de desfeito, trata de novo');
});

test('RN-F6.03 dois desfazer ao mesmo tempo -> um 200 e um 409', async () => {
  const p = await registrarFalha();
  await tratar(p.id, { tratamento: 'feito' });
  const rs = await Promise.all([desfazer(p.id), desfazer(p.id)]);
  assert.deepStrictEqual(rs.map((r) => r.status).sort(), [200, 409]);
});

// ── RN-F6.04 — o alerta ─────────────────────────────────────────────────────────────────────
test('RN-F6.04 nao tratada fica no alerta mesmo com 8 e 60 dias; tratada sai; desfeita volta', async () => {
  const velha = await registrarFalha(MOTORISTA, { data: somaDias(HOJE, -8) });
  const muitoVelha = await registrarFalha(MOTORISTA, { data: somaDias(HOJE, -60) });
  const hoje = await registrarFalha();
  const ids = async () => (await como(ADMIN, 'get', '/api/frotas/alertas')).body.filter((a) => a.tipo === 'checklist').map((a) => a.referencia_id);
  let antes = await ids();
  assert(antes.includes(velha.id), '8 dias: continua (a janela de 7 dias caiu)');
  assert(antes.includes(muitoVelha.id), '60 dias: continua');
  assert(antes.includes(hoje.id));
  assert(!antes.includes(S.tratado.id), 'tratada nao gera alerta');
  assert(!antes.includes(S.ok.id), 'OK nao gera alerta');
  await tratar(velha.id, { tratamento: 'resolvido' });
  antes = await ids();
  assert(!antes.includes(velha.id), 'tratou -> saiu');
  assert(antes.includes(hoje.id), 'a outra continua');
  await desfazer(velha.id);
  assert((await ids()).includes(velha.id), 'desfez -> voltou');
  const consulta = await como(CONSULTA, 'get', '/api/frotas/alertas');
  assert.strictEqual(consulta.status, 200);
  assert(consulta.body.some((a) => a.referencia_id === velha.id && a.tipo === 'checklist'), 'o Consulta ve o mesmo alerta');
});

test('RN-F6.04 (Fase 2, 8 e T-3) o alerta traz a placa; veiculo excluido nao gera alerta (e o ativo, no mesmo cenario, gera)', async () => {
  const v = (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'PEN0099', km_atual: 10 })).body;
  const r = (await como(MOTORISTA, 'post', '/api/frotas/portal/registros', {
    tipo: 'inspecao', veiculo_id: v.id, km: 10, itens: { ...todosOk(), freios: 'FALHA' },
  })).body.registro;
  const alerta = async () => (await como(ADMIN, 'get', '/api/frotas/alertas')).body.find((a) => a.tipo === 'checklist' && a.referencia_id === r.id);
  const a = await alerta();
  assert(a, 'veiculo ativo: o alerta existe');
  assert.strictEqual(a.placa, 'PEN0099');
  assert.strictEqual(a.veiculo_id, v.id);
  await como(ADMIN, 'delete', `/api/frotas/veiculos/${v.id}`);
  assert.strictEqual(await alerta(), undefined, 'veiculo excluido: sem alerta');
  const lista = (await como(ADMIN, 'get', '/api/frotas/checklists')).body.find((x) => x.id === r.id);
  assert(lista, 'mas o registro continua na lista Checklist (e la pode ser tratado)');
  assert.strictEqual((await tratar(r.id, { tratamento: 'veiculo vendido' })).status, 200);
});

// ── RN-F6.09 — cache do painel ──────────────────────────────────────────────────────────────
test('RN-F6.09 (Fase 2, T-1) a contagem do painel que ja estava em andamento quando o gestor tratou NAO grava o painel velho no cache', async () => {
  const p = await registrarFalha();
  ctx.limparCacheDashboard();
  const frotasService = require('../../services/frotas/frotasService');
  const original = frotasService.getDashboard;
  let soltar; const portao = new Promise((r) => { soltar = r; });
  let avisar; const comecou = new Promise((r) => { avisar = r; });
  // O gancho so segura a contagem DEPOIS de ela ler o banco (o painel velho, com o alerta); o tratar sai do contexto do teste.
  frotasService.getDashboard = async (...args) => { const d = await original(...args); avisar(); await portao; return d; };
  let velho;
  try {
    velho = como(CONSULTA, 'get', '/api/frotas/dashboard').then((r) => r);
    await comecou;
  } finally {
    frotasService.getDashboard = original;
  }
  const t = await tratar(p.id, { tratamento: 'tratada no meio da contagem' });
  assert.strictEqual(t.status, 200);
  soltar();
  const rv = await velho;
  assert(rv.body.alertas.some((a) => a.referencia_id === p.id), 'a contagem velha viu o alerta (o cenario de corrida aconteceu)');
  const depois = await como(CONSULTA, 'get', '/api/frotas/dashboard');
  assert(!depois.body.alertas.some((a) => a.tipo === 'checklist' && a.referencia_id === p.id), 'o painel seguinte (sem refresh) nao traz o alerta tratado');
});


test('RN-F6.09 tratar e desfazer limpam o cache do painel (sem refresh, o painel ja reflete)', async () => {
  const p = await registrarFalha();
  ctx.limparCacheDashboard();
  const tem = async () => (await como(ADMIN, 'get', '/api/frotas/dashboard')).body.alertas.some((a) => a.tipo === 'checklist' && a.referencia_id === p.id);
  // muitos alertas de checklist no cenario: o painel corta em 15 — trata os outros para este caber
  const todos = (await como(ADMIN, 'get', '/api/frotas/alertas')).body.filter((a) => a.tipo === 'checklist' && a.referencia_id !== p.id);
  for (const a of todos) await tratar(a.referencia_id, { tratamento: 'limpeza do cenario' });
  ctx.limparCacheDashboard();
  assert(await tem(), 'antes: no painel (e agora no cache)');
  const t = await tratar(p.id, { tratamento: 'feito' });
  assert.strictEqual(t.status, 200);
  assert(!(await tem()), 'depois de tratar, o painel (sem refresh) ja nao mostra');
  await desfazer(p.id);
  assert(await tem(), 'depois de desfazer, volta sem refresh');
});

// ── RN-F6.05 — leituras ─────────────────────────────────────────────────────────────────────
test('RN-F6.05 GET /checklists: colunas do tratamento + descricao da manutencao (null se excluida); Consulta le; Bruno nao ve o da Ana', async () => {
  const p = await registrarFalha();
  const m = (await como(ADMIN, 'post', '/api/frotas/manutencoes', { veiculo_id: S.v1.id, descricao: 'Vai ser excluida' })).body;
  await tratar(p.id, { tratamento: 'Com manutencao', manutencao_id: m.id });
  for (const u of [ADMIN, CONSULTA]) {
    const r = await como(u, 'get', '/api/frotas/checklists');
    const l = r.body.find((x) => x.id === p.id);
    assert(l, u.nome);
    assert.strictEqual(l.pendencia_tratamento, 'Com manutencao');
    assert.strictEqual(l.pendencia_tratada_por_nome, 'Gestor');
    assert.strictEqual(l.pendencia_manutencao_id, m.id);
    assert.strictEqual(l.pendencia_manutencao_descricao, 'Vai ser excluida');
    assert(r.body.filter((x) => x.pendencia_tratada_em == null).every((x) => x.pendencia_manutencao_descricao === null), 'nao tratada: null');
  }
  // B63 (Fase 2, 6): a dona le o tratamento pela lista, mas sem a descricao da manutencao (ela so ve as que lancou)
  const anaAntes = (await como(MOTORISTA, 'get', '/api/frotas/checklists')).body.find((x) => x.id === p.id);
  assert.strictEqual(anaAntes.pendencia_tratamento, 'Com manutencao');
  assert.strictEqual(anaAntes.pendencia_manutencao_descricao, null, 'motorista: sem a descricao da manutencao');
  await como(ADMIN, 'delete', `/api/frotas/manutencoes/${m.id}`);
  const depois = (await como(ADMIN, 'get', '/api/frotas/checklists')).body.find((x) => x.id === p.id);
  assert.strictEqual(depois.pendencia_manutencao_id, m.id, 'o id fica');
  assert.strictEqual(depois.pendencia_manutencao_descricao, null, 'a descricao some com a manutencao');
  const ana = (await como(MOTORISTA, 'get', '/api/frotas/checklists')).body.find((x) => x.id === p.id);
  assert.strictEqual(ana.pendencia_tratamento, 'Com manutencao', 'a dona le pela lista tambem');
  const bruno = await como(MOTORISTA2, 'get', '/api/frotas/checklists');
  assert(!bruno.body.some((x) => x.id === p.id), 'Bruno nao ve o registro da Ana');
  S.comManutencao = p;
});

test('RN-F6.05 meus-registros: a Ana ve o tratamento do registro dela; Bruno nao recebe o dela', async () => {
  const r = await como(MOTORISTA, 'get', '/api/frotas/portal/meus-registros?limite=200');
  const l = r.body.registros.find((x) => x.id === S.comManutencao.id);
  assert(l);
  assert.strictEqual(l.pendencia_tratamento, 'Com manutencao');
  assert.match(l.pendencia_tratada_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  const naoTratado = r.body.registros.find((x) => x.status_geral === 'OK');
  assert(naoTratado && naoTratado.pendencia_tratada_em === null, 'nao tratado: null (a chave existe)');
  const b = await como(MOTORISTA2, 'get', '/api/frotas/portal/meus-registros?limite=200');
  assert(!b.body.registros.some((x) => x.id === S.comManutencao.id));
});

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}

test('RN-F6.05 planilha: aba Checklist com Pendência tratada em / Tratada por / O que foi feito no fim', async () => {
  const r = await ctx.como(ADMIN)('get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  assert.strictEqual(r.status, 200);
  const wb = XLSX.read(r.body, { type: 'buffer' });
  const [cab, ...linhas] = XLSX.utils.sheet_to_json(wb.Sheets.Checklist, { header: 1, defval: '' });
  assert.deepStrictEqual(cab.slice(-4), ['Horímetro', 'Pendência tratada em', 'Tratada por', 'O que foi feito']);
  const tratadas = linhas.filter((l) => l[cab.length - 1] === 'Com manutencao');
  assert.strictEqual(tratadas.length, 1);
  const t = tratadas[0];
  assert.match(t[cab.length - 3], /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, 'dia e hora com espaco');
  assert.strictEqual(t[cab.length - 2], 'Gestor');
  const ok = linhas.find((l) => l[cab.indexOf('Status Geral')] === 'OK');
  assert.deepStrictEqual(ok.slice(-3), ['', '', ''], 'nao tratado: vazias');
});

(async () => {
  ctx = await createFrotasTestApp();
  await cenario();
  console.log('\nFrota Etapa 6 — T1 (tratar a pendencia do registro)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
