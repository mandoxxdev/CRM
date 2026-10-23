/**
 * Frota Etapa 5 — T3: integracao das fotos, cruzando o portal, as listas do gestor, o arquivo servido e a exclusao.
 *
 *   (a) PELA ROTA — a motorista sai com o carro marcando uma avaria pelo portal, manda a foto; o "Meus registros" traz a URL e ela
 *       devolve os mesmos bytes; o gestor e o Consulta veem a MESMA foto na lista Checklist; o colega nao ve nem anexa; o cupom do
 *       abastecimento idem; relatorio e planilha nao mudam (RN-F5.12); o gestor exclui o registro e o arquivo e a URL morrem.
 *   (b) PELO SERVICO — anexosService.gravar / comAnexos / apagarDoLancamento chamados direto, no mesmo cenario.
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md
 * Executar: cd server && node tests/api/frotasAnexosIntegracao.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const XLSX = require('xlsx');
const { createFrotasTestApp, ADMIN, MOTORISTA, CONSULTA, MOTORISTA2 } = require('../helpers/frotasTestApp');
const anexosService = require('../../services/frotas/anexosService');
const { dbAll } = require('../../services/frotas/db');

let passed = 0; let failed = 0;
const testes = [];
function test(name, fn) { testes.push([name, fn]); }

const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]), Buffer.alloc(200, 3)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.alloc(300, 9)]);

function binario(res, cb) {
  res.setEncoding('binary');
  let d = '';
  res.on('data', (c) => { d += c; });
  res.on('end', () => cb(null, Buffer.from(d, 'binary')));
}
const baixar = (ctx, url) => ctx.como(null)('get', url).buffer(true).parse(binario);
const enviarFoto = (ctx, quem, entidade, id, buf, nome, tipo) => ctx.como(quem)('post', '/api/frotas/anexos')
  .field('entidade', entidade).field('entidade_id', String(id)).attach('foto', buf, { filename: nome, contentType: tipo });
const nomeDaUrl = (url) => url.split('/').pop().split('?')[0];

async function montar() {
  const ctx = await createFrotasTestApp();
  const gestor = ctx.como(ADMIN);
  const car = (await gestor('post', '/api/frotas/veiculos', { placa: 'CAR0001', km_atual: 1000 })).body;
  await gestor('post', '/api/frotas/motoristas', { nome: 'Ana', usuario_id: 2 });
  await gestor('post', '/api/frotas/motoristas', { nome: 'Bruno', usuario_id: 4 });
  const itens = Object.fromEntries((await gestor('get', '/api/frotas/portal/inicio')).body.itens.map((i) => [i.chave, 'OK']));
  return { ctx, gestor, car, itens };
}

test('(a) pela rota: avaria no portal -> foto -> Meus registros -> gestor e Consulta -> exclusao', async () => {
  const { ctx, gestor, car, itens } = await montar();
  const ana = ctx.como(MOTORISTA);
  const saida = await ana('post', '/api/frotas/portal/registros', {
    tipo: 'saida', veiculo_id: car.id, km: 1050, itens, avarias: [{ vista: 'lateral_esquerda', tipo: 'A', descricao: 'porta' }],
  });
  assert.strictEqual(saida.status, 201, JSON.stringify(saida.body));
  const registroId = saida.body.registro.id; // o id do registro sai em `registro` (Fase 2, T-4)
  const f = await enviarFoto(ctx, MOTORISTA, 'registro', registroId, JPEG, 'IMG_0001.jpg', 'image/jpeg');
  assert.strictEqual(f.status, 201, JSON.stringify(f.body));

  // o cupom: o id do abastecimento e o proprio corpo
  const ab = await ana('post', '/api/frotas/portal/abastecimentos', { veiculo_id: car.id, km: 1100, litros: 30, valor_total: 180 });
  assert.strictEqual(ab.status, 201);
  const cupom = await enviarFoto(ctx, MOTORISTA, 'abastecimento', ab.body.id, PNG, 'cupom.png', 'image/png');
  assert.strictEqual(cupom.status, 201);

  // Meus registros da Ana: as duas fotos, e as URLs devolvem os mesmos bytes
  const meus = (await ana('get', '/api/frotas/portal/meus-registros')).body;
  const fotoReg = meus.registros.find((r) => r.id === registroId).anexos;
  const fotoAb = meus.abastecimentos.find((a) => a.id === ab.body.id).anexos;
  assert.deepStrictEqual(fotoReg.map((x) => x.id), [f.body.id]);
  assert.deepStrictEqual(fotoAb.map((x) => x.id), [cupom.body.id]);
  assert.ok(Buffer.compare((await baixar(ctx, fotoReg[0].url)).body, JPEG) === 0, 'a foto da avaria volta igual');
  assert.ok(Buffer.compare((await baixar(ctx, fotoAb[0].url)).body, PNG) === 0, 'o cupom volta igual');

  // gestor e Consulta veem a MESMA foto nas listas
  for (const quem of [ADMIN, CONSULTA]) {
    const chk = (await ctx.como(quem)('get', '/api/frotas/checklists')).body.find((c) => c.id === registroId);
    assert.strictEqual(chk.status_geral, 'PENDENCIA', 'a avaria continua dando pendencia');
    assert.deepStrictEqual(chk.anexos.map((x) => x.id), [f.body.id]);
    assert.strictEqual(nomeDaUrl(chk.anexos[0].url), nomeDaUrl(fotoReg[0].url));
    const lin = (await ctx.como(quem)('get', '/api/frotas/abastecimentos')).body.find((a) => a.id === ab.body.id);
    assert.deepStrictEqual(lin.anexos.map((x) => x.id), [cupom.body.id]);
  }

  // o colega nao ve e nao anexa
  const bruno = ctx.como(MOTORISTA2);
  const doBruno = JSON.stringify((await bruno('get', '/api/frotas/checklists')).body)
    + JSON.stringify((await bruno('get', '/api/frotas/portal/meus-registros')).body);
  assert.ok(!doBruno.includes(nomeDaUrl(fotoReg[0].url)), 'Bruno nao recebe a URL');
  assert.strictEqual((await enviarFoto(ctx, MOTORISTA2, 'registro', registroId, JPEG, 'x.jpg', 'image/jpeg')).status, 403);

  // RN-F5.12: relatorio e planilha nao leem anexo — continuam respondendo o de antes
  const consumo = (await gestor('get', '/api/frotas/relatorios/consumo')).body;
  assert.strictEqual(consumo.find((c) => c.placa === 'CAR0001').abastecimentos, 1);
  assert.ok(!JSON.stringify(consumo).includes('anexos'), 'relatorio sem anexo');
  const pl = await gestor('get', '/api/frotas/exportar.xlsx').buffer(true).parse(binario);
  const wb = XLSX.read(pl.body, { type: 'buffer' });
  assert.deepStrictEqual(wb.SheetNames, ['Cadastro Frota', 'Viagens e KM', 'Checklist', 'Abastecimentos', 'Manutenções', 'Documentos', 'Multas']);

  // o gestor exclui o registro: a foto (linha e arquivo) e a URL morrem; o cupom fica
  assert.strictEqual((await gestor('delete', `/api/frotas/checklists/${registroId}`)).status, 200);
  assert.strictEqual((await baixar(ctx, fotoReg[0].url)).status, 404);
  assert.deepStrictEqual(fs.readdirSync(ctx.uploadsDir), [nomeDaUrl(fotoAb[0].url)]);
  assert.strictEqual((await baixar(ctx, fotoAb[0].url)).status, 200, 'o cupom continua');
  // e a exclusao do abastecimento leva o cupom
  assert.strictEqual((await gestor('delete', `/api/frotas/abastecimentos/${ab.body.id}`)).status, 200);
  assert.deepStrictEqual(fs.readdirSync(ctx.uploadsDir), []);
  assert.deepStrictEqual(await dbAll(ctx.db, 'SELECT * FROM frotas_anexos'), []);
});

test('(b) pelo servico: gravar / comAnexos / apagarDoLancamento no mesmo cenario', async () => {
  const { ctx, car, itens } = await montar();
  const portalService = require('../../services/frotas/portalService');
  const { registro } = await portalService.registrar(ctx.db, MOTORISTA, {
    tipo: 'inspecao', veiculo_id: car.id, km: 1010, itens, avarias: [{ vista: 'frente', tipo: 'T' }],
  });
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'frotas-servico-'));
  try {
    const escrever = (nome, buf) => { fs.writeFileSync(path.join(pasta, nome), buf); return { nome, caminho: path.join(pasta, nome), tipo_mime: 'image/jpeg', tamanho: buf.length }; };
    const a1 = await anexosService.gravar(ctx.db, MOTORISTA, { entidade: 'registro', entidade_id: registro.id, arquivo: escrever('frota-a.jpg', JPEG) });
    assert.strictEqual(a1.entidade_id, registro.id);
    await assert.rejects(
      anexosService.gravar(ctx.db, MOTORISTA2, { entidade: 'registro', entidade_id: registro.id, arquivo: escrever('frota-b.jpg', JPEG) }),
      (e) => e.status === 403 && e.message === 'Você só pode alterar os seus próprios registros',
    );
    const assinar = (nome) => `assinada:${nome}`;
    const [linha] = await anexosService.comAnexos(ctx.db, 'registro', [{ id: registro.id }, { id: 9999 }], assinar);
    assert.deepStrictEqual(linha.anexos.map((x) => x.url), ['assinada:frota-a.jpg']);
    const semFoto = (await anexosService.comAnexos(ctx.db, 'registro', [{ id: 9999 }], assinar))[0];
    assert.deepStrictEqual(semFoto.anexos, []);
    assert.strictEqual(await anexosService.apagarDoLancamento(ctx.db, 'registro', registro.id, pasta), 1);
    assert.ok(!fs.existsSync(path.join(pasta, 'frota-a.jpg')), 'o arquivo foi apagado');
    assert.ok(fs.existsSync(path.join(pasta, 'frota-b.jpg')), 'o recusado nao e apagado pelo servico (quem chama apaga)');
    assert.deepStrictEqual(await dbAll(ctx.db, 'SELECT * FROM frotas_anexos'), []);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

(async () => {
  console.log('\nFrota Etapa 5 — T3 (integracao das fotos)\n');
  for (const [name, fn] of testes) {
    try { await fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.stack || e.message}`); }
  }
  console.log(`\nResultado: ${passed} passou, ${failed} falhou\n`);
  process.exit(failed > 0 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
