/**
 * Frota Etapa 6 — T3: integracao do "tratar a pendencia", cruzando o portal, a foto, o alerta, o painel (com o cache), a lista do
 * gestor e do Consulta, o "Meus registros", a planilha e o desfazer.
 *
 *   (a) PELA ROTA — a Ana sai com o carro marcando Falha nos freios e uma avaria pelo portal, manda a foto; o alerta aparece em
 *       /alertas e no /dashboard (que fica no cache); o gestor abre uma manutencao e trata pela rota; o alerta some de /alertas e do
 *       /dashboard SEM refresh; a lista do gestor e do Consulta mostram tratada (com a foto e a manutencao), o "Meus registros" da Ana
 *       mostra o tratamento, o Bruno nao ve; a planilha traz as 3 colunas; o desfazer devolve o alerta; tratar de novo funciona.
 *   (b) PELO SERVICO — pendenciaService.tratar/desfazer + frotasService.getAlertas/listChecklists direto, no mesmo cenario.
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa6-tratar-pendencia.md
 * Executar: cd server && node tests/api/frotasPendenciaIntegracao.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const pendenciaService = require('../../services/frotas/pendenciaService');
const frotasService = require('../../services/frotas/frotasService');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]), Buffer.alloc(200, 3)]);

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}

async function montar() {
  const ctx = await createFrotasTestApp();
  const gestor = ctx.como(ADMIN);
  const car = (await gestor('post', '/api/frotas/veiculos', { placa: 'TRA0001', km_atual: 1000 })).body;
  await gestor('post', '/api/frotas/motoristas', { nome: 'Ana', usuario_id: 2 });
  await gestor('post', '/api/frotas/motoristas', { nome: 'Bruno', usuario_id: 4 });
  const itens = Object.fromEntries((await gestor('get', '/api/frotas/portal/inicio')).body.itens.map((i) => [i.chave, 'OK']));
  const ana = ctx.como(MOTORISTA);
  const saida = await ana('post', '/api/frotas/portal/registros', {
    tipo: 'saida', veiculo_id: car.id, km: 1050, itens: { ...itens, freios: 'FALHA' },
    avarias: [{ vista: 'frente', tipo: 'A', descricao: 'para-choque' }],
  });
  assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
  return { ctx, gestor, ana, car, registro: saida.body.registro };
}

const alertaDo = (lista, id) => lista.find((a) => a.tipo === 'checklist' && a.referencia_id === id);

test('(a) pela rota: falha + foto no portal -> alerta e painel -> gestor trata -> some (sem refresh) -> listas, Meus registros, planilha -> desfazer', async () => {
  const { ctx, gestor, ana, car, registro } = await montar();
  assert.strictEqual(registro.status_geral, 'PENDENCIA');
  const foto = await ctx.como(MOTORISTA)('post', '/api/frotas/anexos')
    .field('entidade', 'registro').field('entidade_id', String(registro.id)).attach('foto', JPEG, { filename: 'freio.jpg', contentType: 'image/jpeg' });
  assert.strictEqual(foto.status, 201, JSON.stringify(foto.body));

  // o alerta, nas duas portas do gestor; o painel fica no cache
  const a1 = alertaDo((await gestor('get', '/api/frotas/alertas')).body, registro.id);
  assert(a1, 'alerta em /alertas');
  assert.strictEqual(a1.placa, 'TRA0001');
  assert(a1.descricao.includes('Freios'), a1.descricao);
  ctx.limparCacheDashboard();
  assert(alertaDo((await ctx.como(CONSULTA)('get', '/api/frotas/dashboard')).body.alertas, registro.id), 'no painel (agora em cache)');

  // o gestor abre a manutencao do conserto e trata; o motorista e o Consulta nao conseguem
  const man = (await gestor('post', '/api/frotas/manutencoes', { veiculo_id: car.id, tipo: 'corretiva', descricao: 'Pastilhas novas' })).body;
  assert.strictEqual((await ana('post', `/api/frotas/checklists/${registro.id}/tratar-pendencia`, { tratamento: 'eu mesma' })).status, 403);
  assert.strictEqual((await ctx.como(CONSULTA)('post', `/api/frotas/checklists/${registro.id}/tratar-pendencia`, { tratamento: 'x' })).status, 403);
  const t = await gestor('post', `/api/frotas/checklists/${registro.id}/tratar-pendencia`, {
    tratamento: 'Pastilhas trocadas na oficina', manutencao_id: String(man.id), // o <select> da tela manda texto
  });
  assert.strictEqual(t.status, 200, JSON.stringify(t.body));

  // some das duas portas — o painel SEM refresh (o cache foi limpo)
  assert(!alertaDo((await gestor('get', '/api/frotas/alertas')).body, registro.id), 'saiu de /alertas');
  const painel = await ctx.como(CONSULTA)('get', '/api/frotas/dashboard');
  assert(!alertaDo(painel.body.alertas, registro.id), 'saiu do painel sem refresh');

  // lista do gestor e do Consulta: tratada, com a foto e a manutencao; a situacao continua PENDENCIA
  for (const quem of [ADMIN, CONSULTA]) {
    const l = (await ctx.como(quem)('get', '/api/frotas/checklists')).body.find((x) => x.id === registro.id);
    assert.strictEqual(l.status_geral, 'PENDENCIA', quem.nome);
    assert.strictEqual(l.pendencia_tratamento, 'Pastilhas trocadas na oficina');
    assert.strictEqual(l.pendencia_tratada_por_nome, 'Gestor');
    assert.strictEqual(l.pendencia_manutencao_descricao, 'Pastilhas novas');
    assert.strictEqual(l.anexos.length, 1, 'a foto continua');
  }
  // Meus registros da Ana: o tratamento; o Bruno nao ve o registro
  const meus = (await ana('get', '/api/frotas/portal/meus-registros')).body.registros.find((x) => x.id === registro.id);
  assert.strictEqual(meus.pendencia_tratamento, 'Pastilhas trocadas na oficina');
  assert.match(meus.pendencia_tratada_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.strictEqual(meus.anexos.length, 1);
  const bruno = await ctx.como(MOTORISTA2)('get', '/api/frotas/portal/meus-registros');
  assert(!bruno.body.registros.some((x) => x.id === registro.id));
  assert(!(await ctx.como(MOTORISTA2)('get', '/api/frotas/checklists')).body.some((x) => x.id === registro.id));

  // planilha
  const r = await gestor('get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  const [cab, ...linhas] = XLSX.utils.sheet_to_json(XLSX.read(r.body, { type: 'buffer' }).Sheets.Checklist, { header: 1, defval: '' });
  const lp = linhas.find((l) => l[cab.indexOf('Status Geral')] === 'PENDÊNCIA');
  assert.strictEqual(lp[cab.indexOf('O que foi feito')], 'Pastilhas trocadas na oficina');
  assert.strictEqual(lp[cab.indexOf('Tratada por')], 'Gestor');
  assert.strictEqual(lp[cab.indexOf('Pendência tratada em')], meus.pendencia_tratada_em.replace('T', ' '));

  // desfazer: o alerta volta (painel sem refresh), o Meus registros perde o tratamento; tratar de novo funciona
  assert.strictEqual((await gestor('delete', `/api/frotas/checklists/${registro.id}/tratar-pendencia`)).status, 200);
  assert(alertaDo((await ctx.como(CONSULTA)('get', '/api/frotas/dashboard')).body.alertas, registro.id), 'voltou ao painel');
  const meus2 = (await ana('get', '/api/frotas/portal/meus-registros')).body.registros.find((x) => x.id === registro.id);
  assert.strictEqual(meus2.pendencia_tratada_em, null);
  assert.strictEqual((await gestor('post', `/api/frotas/checklists/${registro.id}/tratar-pendencia`, { tratamento: 'de novo' })).status, 200);

  // excluir o registro tratado leva tudo junto (nada de alerta orfao)
  assert.strictEqual((await gestor('delete', `/api/frotas/checklists/${registro.id}`)).status, 200);
  assert.strictEqual((await gestor('post', `/api/frotas/checklists/${registro.id}/tratar-pendencia`, { tratamento: 'x' })).status, 404);
});

test('(b) pelo servico: pendenciaService.tratar/desfazer com getAlertas e listChecklists direto', async () => {
  const { ctx, registro } = await montar();
  const ids = async () => (await frotasService.getAlertas(ctx.db)).filter((a) => a.tipo === 'checklist').map((a) => a.referencia_id);
  assert((await ids()).includes(registro.id));
  const t = await pendenciaService.tratar(ctx.db, ADMIN, registro.id, { tratamento: ' pelo servico ' });
  assert.strictEqual(t.pendencia_tratamento, 'pelo servico');
  assert.strictEqual(t.status_geral, 'PENDENCIA');
  assert(!(await ids()).includes(registro.id));
  const doGestor = (await frotasService.listChecklists(ctx.db, {}, ADMIN)).find((x) => x.id === registro.id);
  assert.strictEqual(doGestor.pendencia_tratamento, 'pelo servico');
  await assert.rejects(pendenciaService.tratar(ctx.db, ADMIN, registro.id, { tratamento: 'de novo' }), (e) => e.status === 409 && e.code === 'PENDENCIA_JA_TRATADA');
  await pendenciaService.desfazer(ctx.db, ADMIN, registro.id);
  assert((await ids()).includes(registro.id));
  await assert.rejects(pendenciaService.desfazer(ctx.db, ADMIN, registro.id), (e) => e.status === 409 && e.code === 'PENDENCIA_NAO_TRATADA');
});

(async () => {
  console.log('\nFrota Etapa 6 — T3 (integracao: tratar a pendencia)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
