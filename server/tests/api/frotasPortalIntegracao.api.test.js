/**
 * Frotas Etapa 1 — T8: integracao do portal do motorista, ponta a ponta.
 *
 *   Pela rota: o gestor liga a Ana ao usuario -> Ana faz saida -> retorno -> dois abastecimentos (o segundo retroativo) -> o gestor
 *   exporta e a planilha tem as linhas (viagem, saida/retorno no Checklist, km/L recalculado). O Bruno (outro motorista) nao ve nem
 *   altera nada da Ana. E o MESMO fluxo entrando pelo servico (portalService/exportacaoService, sem HTTP) da o mesmo resultado.
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md
 * Executar: cd server && node tests/api/frotasPortalIntegracao.api.test.js
 */
const assert = require('assert');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const portalService = require('../../services/frotas/portalService');
const exportacaoService = require('../../services/frotas/exportacaoService');
const frotasService = require('../../services/frotas/frotasService');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const CHAVES = ['pneus_estepe', 'farois_lanternas', 'setas_luz_freio', 'parabrisa_vidros', 'espelhos_retrovisores',
  'limpadores_agua', 'oleo_motor', 'arrefecimento', 'freios', 'buzina_cintos', 'documentos_equipamentos', 'carroceria_carga'];
const todosOk = () => Object.fromEntries(CHAVES.map((k) => [k, 'OK']));

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}
function planilha(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' })]));
}

/** O que as duas entradas (rota e servico) tem de produzir igual. */
function conferirPlanilha(p, placa) {
  const viagens = p['Viagens e KM'].slice(1).filter((l) => l[1] === placa);
  assert.strictEqual(viagens.length, 1);
  assert.deepStrictEqual(viagens[0].slice(0, 12),
    ['2026-10-22', placa, 'Ana Motorista', 'Entrega', 'GMP', 'Cliente Z', '07:15', '16:40', 20000, 20180, 180, 'Concluída']);
  const regs = p.Checklist.slice(1).filter((l) => l[3] === placa);
  assert.deepStrictEqual(regs.map((l) => l[2]), ['Saída', 'Retorno']);
  assert.deepStrictEqual(regs.map((l) => l[20]), ['PENDÊNCIA', 'OK']);
  assert.strictEqual(regs[0][19], 'Lateral direita: amassado — porta');
  const abs = p.Abastecimentos.slice(1).filter((l) => l[1] === placa);
  assert.strictEqual(abs.length, 2);
  const porKm = Object.fromEntries(abs.map((l) => [l[3], l]));
  // o retroativo (km 20100, lancado depois) virou o anterior do de km 20180
  assert.strictEqual(porKm[20100][7], '', 'o primeiro em km nao tem anterior');
  assert.strictEqual(porKm[20180][7], 80);
  assert.strictEqual(porKm[20180][8], 2, '80 km / 40 L');
  const cad = p['Cadastro Frota'].slice(1).find((l) => l[0] === placa);
  assert.strictEqual(cad[5], 20180, 'km do veiculo = o maior lancado');
}

test('T8 pela rota: saida -> retorno -> 2 abastecimentos (um retroativo) -> o gestor exporta; o Bruno nao ve nem altera', async () => {
  const ctx = await createFrotasTestApp();
  const como = (u, m, url, corpo) => { ctx.setUser(u); return ctx.req(m, url, corpo); };
  const v = (await como(ADMIN, 'post', '/api/frotas/veiculos', { placa: 'INT0001', km_atual: 20000 })).body;
  const ana = (await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Ana Motorista' })).body;
  // ainda sem vinculo: o portal recusa
  const antes = await como(MOTORISTA, 'post', '/api/frotas/portal/registros', { tipo: 'inspecao', veiculo_id: v.id, km: 20000 });
  assert.strictEqual(antes.status, 409);
  // o gestor escolhe o usuario no seletor e liga
  const usuarios = (await como(ADMIN, 'get', '/api/frotas/usuarios-vinculaveis')).body;
  const uAna = usuarios.find((u) => u.nome === 'Ana');
  assert.strictEqual(uAna.motorista, null);
  assert.strictEqual((await como(ADMIN, 'put', `/api/frotas/motoristas/${ana.id}`, { usuario_id: uAna.id })).status, 200);
  await como(ADMIN, 'post', '/api/frotas/motoristas', { nome: 'Bruno Motorista', usuario_id: 4 });

  const ini = (await como(MOTORISTA, 'get', '/api/frotas/portal/inicio')).body;
  assert.strictEqual(ini.motorista.id, ana.id);
  const saida = await como(MOTORISTA, 'post', '/api/frotas/portal/registros', {
    tipo: 'saida', veiculo_id: v.id, km: 20000, data: '2026-10-22', horario: '07:15', nivel_combustivel: 'cheio',
    itens: todosOk(), avarias: [{ vista: 'lateral_direita', tipo: 'A', descricao: 'porta' }], origem: 'GMP', destino: 'Cliente Z', finalidade: 'Entrega',
  });
  assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
  const ret = await como(MOTORISTA, 'post', '/api/frotas/portal/registros', {
    tipo: 'retorno', km: 20180, data: '2026-10-22', horario: '16:40', nivel_combustivel: '1/2', itens: todosOk(),
  });
  assert.strictEqual(ret.status, 201, JSON.stringify(ret.body));
  const ab1 = await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', { veiculo_id: v.id, km: 20180, litros: 40, valor_total: 250, data: '2026-10-22' });
  assert.strictEqual(ab1.status, 201);
  const ab2 = await como(MOTORISTA, 'post', '/api/frotas/portal/abastecimentos', { veiculo_id: v.id, km: 20100, litros: 30, valor_total: 190, data: '2026-10-22' });
  assert.strictEqual(ab2.status, 201);

  // o alerta da pendencia (avaria na saida) chega ao gestor
  const alertas = (await como(ADMIN, 'get', '/api/frotas/alertas')).body;
  assert(alertas.some((a) => a.tipo === 'checklist' && a.referencia_id === saida.body.registro.id));

  // o Bruno nao ve nem altera
  const bruno = (await como(MOTORISTA2, 'get', '/api/frotas/portal/meus-registros')).body;
  assert.deepStrictEqual(bruno, { registros: [], abastecimentos: [] });
  assert.deepStrictEqual((await como(MOTORISTA2, 'get', '/api/frotas/abastecimentos')).body, []);
  assert.deepStrictEqual((await como(MOTORISTA2, 'get', '/api/frotas/viagens')).body, []);
  const alt = await como(MOTORISTA2, 'put', `/api/frotas/abastecimentos/${ab1.body.id}`, { litros: 1 });
  assert.strictEqual(alt.status, 403);
  const altV = await como(MOTORISTA2, 'put', `/api/frotas/viagens/${saida.body.viagem.id}`, { km_retorno: 99999 });
  assert.strictEqual(altV.status, 403);
  const bRet = await como(MOTORISTA2, 'post', '/api/frotas/portal/registros', { tipo: 'retorno', km: 30000 });
  assert.strictEqual(bRet.status, 409, 'o Bruno nao fecha viagem da Ana');
  assert.strictEqual((await como(MOTORISTA2, 'get', '/api/frotas/dashboard')).status, 403);
  assert.strictEqual((await como(MOTORISTA2, 'get', '/api/frotas/exportar.xlsx')).status, 403);

  // a Ana ve os dela
  const meus = (await como(MOTORISTA, 'get', '/api/frotas/portal/meus-registros')).body;
  assert.strictEqual(meus.registros.length, 2);
  assert.strictEqual(meus.abastecimentos.length, 2);

  ctx.setUser(ADMIN);
  const x = await ctx.req('get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  assert.strictEqual(x.status, 200);
  conferirPlanilha(planilha(x.body), 'INT0001');
});

test('T8 pelo servico: o mesmo fluxo sem HTTP da a mesma planilha', async () => {
  const ctx = await createFrotasTestApp();
  const { db } = ctx;
  const v = await frotasService.createVeiculo(db, { placa: 'INT0002', km_atual: 20000 });
  await frotasService.createMotorista(db, { nome: 'Ana Motorista', usuario_id: MOTORISTA.id });
  await frotasService.createMotorista(db, { nome: 'Bruno Motorista', usuario_id: MOTORISTA2.id });
  await portalService.registrar(db, MOTORISTA, {
    tipo: 'saida', veiculo_id: v.id, km: 20000, data: '2026-10-22', horario: '07:15', itens: todosOk(),
    avarias: [{ vista: 'lateral_direita', tipo: 'A', descricao: 'porta' }], origem: 'GMP', destino: 'Cliente Z', finalidade: 'Entrega',
  });
  await portalService.registrar(db, MOTORISTA, { tipo: 'retorno', km: 20180, data: '2026-10-22', horario: '16:40', itens: todosOk() });
  await portalService.registrarAbastecimento(db, MOTORISTA, { veiculo_id: v.id, km: 20180, litros: 40, valor_total: 250, data: '2026-10-22' });
  await portalService.registrarAbastecimento(db, MOTORISTA, { veiculo_id: v.id, km: 20100, litros: 30, valor_total: 190, data: '2026-10-22' });
  // escopo pelo servico
  assert.deepStrictEqual(await frotasService.listAbastecimentos(db, {}, MOTORISTA2), []);
  assert.strictEqual((await frotasService.listAbastecimentos(db, {}, MOTORISTA)).length, 2);
  assert.strictEqual((await frotasService.listAbastecimentos(db, {})).length, 2, 'chamada interna sem usuario ve tudo');
  await assert.rejects(portalService.registrar(db, MOTORISTA2, { tipo: 'retorno', km: 1 }), (e) => e.status === 409);
  const { buffer } = await exportacaoService.exportarPlanilha(db, { data_inicio: '2026-10-22', data_fim: '2026-10-22' });
  conferirPlanilha(planilha(buffer), 'INT0002');
});

(async () => {
  console.log('\nFrotas Etapa 1 — T8 (integracao do portal)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
