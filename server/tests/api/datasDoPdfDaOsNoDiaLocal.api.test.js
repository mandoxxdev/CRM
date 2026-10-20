/**
 * Etapa 169 (RN-169.05, B1077) — as datas do PDF da OS no dia de Brasilia.
 *
 * O bug: o `formatDate` de `gerarHTMLOS` (index.js) fazia `new Date(v).toLocaleDateString('pt-BR')`. A abertura e a previsao da OS sao
 * so data (`'AAAA-MM-DD'`, do `<input type="date">`): `new Date('2026-10-20')` e a meia-noite UTC — com o `TZ=America/Sao_Paulo` que o
 * Dockerfile fixa, o PDF imprimia a VESPERA (na maquina de teste em UTC, o dia certo: por isso nenhum teste o via).
 *
 * Como se prova: a declaracao `formatDate` e EXTRAIDA do corpo de `gerarHTMLOS` no index.js de verdade e avaliada com o `diaLocal` real
 * (o index.js abre o banco e faz listen no import — o precedente de pdfOsRodape/filaPdfFiacao). A rota que gera o PDF
 * (`POST /api/operacional/ordens-servico/:id/gerar-pdf`) precisa do Chromium e fica de fora (declarado no plano).
 *
 * DEPENDE DO FUSO: o processo e posto em America/Sao_Paulo ANTES do primeiro Date; a guarda derruba o arquivo se o fuso nao pegou. Os
 * cenarios do "hoje" rodam tambem com TZ=UTC e Asia/Tokyo (Fase 2 M1 — a regua e a do negocio, nao a do processo).
 * Plano: docs/superpowers/plans/2026-10-20-almoxarifado-etapa169-as-datas-das-aprovacoes-das-os-e-das-tarefas-no-dia-de-brasilia.md
 */
process.env.TZ = 'America/Sao_Paulo';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const diaLocal = require('../../services/diaLocal');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const fonte = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf8');

/** A declaracao `const formatDate = (date) => { ... };` de dentro de `gerarHTMLOS`, pelo casamento das chaves. */
function declaracaoDoFormatDate(src) {
  const ini = src.indexOf('function gerarHTMLOS(');
  assert.ok(ini > 0, 'gerarHTMLOS sumiu');
  const fimFn = src.indexOf('Erro na função gerarHTMLOS', ini);
  assert.ok(fimFn > ini, 'fim de gerarHTMLOS nao achado');
  const corpo = src.slice(ini, fimFn);
  const marca = 'const formatDate = (date) => {';
  const i = corpo.indexOf(marca);
  assert.ok(i > 0, 'o formatDate de gerarHTMLOS sumiu');
  assert.strictEqual(corpo.indexOf(marca, i + 1), -1, 'dois formatDate em gerarHTMLOS');
  let prof = 0; let j = i + marca.length - 1;
  for (; j < corpo.length; j++) {
    if (corpo[j] === '{') prof++;
    else if (corpo[j] === '}') { prof--; if (prof === 0) break; }
  }
  return { decl: corpo.slice(i, j + 1) + ';', corpo };
}

const { decl, corpo } = declaracaoDoFormatDate(fonte);
// eslint-disable-next-line no-new-func
const formatDate = new Function('diaLocal', `${decl}\nreturn formatDate;`)(diaLocal);

console.log('\n── PDF da OS: as datas no dia de Brasilia (RN-169.05) ──');

test('guarda: o processo esta em America/Sao_Paulo (a meia-noite UTC de 20/10 e 19/10 aqui) — fora dele o arquivo nao prova nada', () => {
  assert.strictEqual(new Date('2026-10-20').toLocaleDateString('pt-BR'), '19/10/2026');
  assert.strictEqual(new Date('2026-10-21T01:30:00Z').getDate(), 20);
});

test('fiacao: o index.js usa o diaLocal de services/ e o PDF passa a abertura, a previsao e a conferencia pelo formatDate', () => {
  assert.ok(/^const diaLocal = require\('\.\/services\/diaLocal'\);$/m.test(fonte), "o require do diaLocal no index.js mudou");
  // Fase 5 r3 P6: contadas — a abertura e a previsao aparecem duas vezes no HTML (o cabecalho e o quadro); includes aceitava uma so
  const vezes = (t) => corpo.split(t).length - 1;
  assert.strictEqual(vezes('${formatDate(os.data_abertura || os.data_entrada_pedido)}'), 2, 'a abertura nao passa pelo formatDate nas duas');
  assert.strictEqual(vezes('${formatDate(os.data_prevista)}'), 1, 'a previsao do quadro nao passa pelo formatDate');
  assert.ok(corpo.includes('${formatDate(os.data_entrega || os.data_prevista)}'), 'a entrega prevista nao passa pelo formatDate');
  assert.ok(corpo.includes('${formatDate(os.data_conferencia) || formatDate(new Date())}'), 'a data da conferencia nao passa pelo formatDate');
});

test("[RN-169.05] so data: '2026-10-20' -> 20/10/2026 com o processo em Brasilia (antes 19/10/2026, a vespera)", () => {
  assert.strictEqual(formatDate('2026-10-20'), '20/10/2026');
  assert.strictEqual(formatDate('2026-01-05'), '05/01/2026');
  assert.strictEqual(formatDate('2026-12-31'), '31/12/2026');
});

test("[RN-169.05] o instante do banco ('2026-10-21 01:30:00' UTC = 22h30 de 20/10) -> 20/10/2026 (antes 21/10/2026)", () => {
  assert.strictEqual(formatDate('2026-10-21 01:30:00'), '20/10/2026');
  assert.strictEqual(formatDate('2026-10-21 03:00:00'), '21/10/2026'); // a meia-noite de Brasilia: ja e 21
});

test("[RN-169.05] vazio, nulo, ilegivel e data impossivel -> '' (inalterado: a linha sai em branco)", () => {
  assert.strictEqual(formatDate(''), '');
  assert.strictEqual(formatDate(null), '');
  assert.strictEqual(formatDate(undefined), '');
  assert.strictEqual(formatDate('lixo'), '');
  assert.strictEqual(formatDate('2026-02-30'), '');
  assert.strictEqual(formatDate(new Date('lixo')), '');
});

test('[RN-169.05, Fase 2 M1] o "hoje" da conferencia (um Date) no dia de Brasilia em qualquer TZ do processo — 01h30 UTC de 21/10 e 20/10', () => {
  const instante = new Date('2026-10-21T01:30:00Z');
  const meioDia = new Date('2026-10-20T15:00:00Z');
  const original = process.env.TZ;
  try {
    for (const tz of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      assert.strictEqual(formatDate(instante), '20/10/2026', `TZ=${tz}`);
      assert.strictEqual(formatDate(meioDia), '20/10/2026', `TZ=${tz} (metade positiva, meio-dia)`);
      assert.strictEqual(formatDate('2026-10-20'), '20/10/2026', `TZ=${tz} (so data)`);
    }
  } finally {
    process.env.TZ = original;
  }
});

console.log(`\n${passed} passaram, ${failed} falharam`);
process.exit(failed ? 1 : 0);
