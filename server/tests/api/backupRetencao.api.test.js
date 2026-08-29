/**
 * Régua de retenção dos backups: `decidirRemocao` (pura) e a compatibilidade de
 * `pruneOldBackups`.
 *
 * Mora em tests/api/ porque **é o único lugar que o runner enxerga** (run-all.js só descobre
 * `*.api.test.js`) — mesmo precedente de `dbRecoveryBackup.api.test.js:1-6`, que também é teste
 * de serviço.
 *
 * ── O passivo que este arquivo existe para provar ──────────────────────────────────────────
 * Medido em server/data/backups (2026-08-29, somente leitura):
 *   165 arquivos · 187,8 MB → 11 cópias .sqlite (133,4 MB) + 132 acompanhantes ÓRFÃOS (44,4 MB)
 *   dos 132 órfãos, **130 estão no nome ANTIGO** `database-X-wal` (sem `.sqlite` no meio) —
 *   o formato que a Etapa 21 deixou para trás ao consertar a causa; só 2 estão no nome novo.
 * `backupDatabaseFiles` **só produz o nome novo**. Então um cenário montado a partir dele fica
 * VERDE com uma régua que limparia 2 arquivos (0,03 MB) de 44,4 MB de passivo. Por isso os
 * arranjos aqui são listas literais, com os dois formatos e com `-shm` além de `-wal`.
 *
 * ── Sem relógio ────────────────────────────────────────────────────────────────────────────
 * `decidirRemocao` recebe `agora` por parâmetro e nunca chama Date.now() dentro. Os `mtime` são
 * fixos (e `fs.utimesSync` nos poucos cenários que tocam disco). A Etapa 22 teve suíte que só
 * sabia falhar em 3 das 24 horas do dia.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decidirRemocao, pruneOldBackups } = require('../../services/dbRecovery');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-08-29T12:00:00.000Z');
const f = (nome, diasAtras) => ({ nome, mtimeMs: AGORA - diasAtras * DIA });

/** Guarda anti-teste-vazio: o arranjo tem de existir e algo tem de sobrar. */
function guardaNaoVazio(arquivos, apagar) {
  assert.ok(arquivos.length > 0, 'arranjo vazio: o cenário não prova nada');
  assert.ok(apagar.length < arquivos.length,
    `a régua apagou TUDO (${apagar.length}/${arquivos.length}) — isso não é limpeza, é perda`);
}

// ── Regra 1 (RN-01): órfão é varrido, nos DOIS formatos de nome ─────────────────────────────
test('RN-01 varre acompanhante órfão nos dois formatos de nome, -wal e -shm', () => {
  const acompanhados = [
    'database-2026-08-25T10-00-00.sqlite-wal',
    'database-2026-08-25T11-00-00.sqlite-wal',
  ];
  const orfaosAntigos = [   // 130 dos 132 órfãos REAIS têm este formato
    'database-2026-07-06T14-42-34-wal',
    'database-2026-07-06T14-42-34-shm',
    'database-2026-07-06T22-00-46-wal',
    'database-2026-07-06T22-00-46-shm',
  ];
  const orfaosNovos = [
    'database-2026-07-16T14-34-11.sqlite-wal',
    'database-2026-07-16T14-34-11.sqlite-shm',
  ];
  const arquivos = [
    f('database-2026-08-25T10-00-00.sqlite', 1),
    f('database-2026-08-25T11-00-00.sqlite', 1),
    ...acompanhados.map((n) => f(n, 1)),
    ...orfaosAntigos.map((n) => f(n, 50)),
    ...orfaosNovos.map((n) => f(n, 40)),
  ];

  const { apagar, motivo } = decidirRemocao(arquivos, { manterDias: 30, agora: AGORA });
  guardaNaoVazio(arquivos, apagar);

  const faltando = [...orfaosAntigos, ...orfaosNovos].filter((n) => !apagar.includes(n));
  assert.deepStrictEqual(faltando, [],
    `órfãos que ficaram para trás: ${JSON.stringify(faltando)} (apagar=${JSON.stringify(apagar)})`);

  // e o nome ANTIGO especificamente — é onde está 98% do passivo real
  assert.ok(apagar.includes('database-2026-07-06T14-42-34-wal'),
    `órfão de nome ANTIGO não foi varrido: a régua limparia ${apagar.length} arquivos de 132`);
  assert.ok(apagar.includes('database-2026-07-06T22-00-46-shm'),
    'órfão -shm de nome antigo não foi varrido (a régua só olha -wal?)');

  const sobrevivem = acompanhados.filter((n) => apagar.includes(n));
  assert.deepStrictEqual(sobrevivem, [],
    `acompanhante COM .sqlite vivo foi tratado como órfão: ${JSON.stringify(sobrevivem)}`);
  assert.strictEqual(motivo.orfaos.length, 6, `motivo.orfaos=${JSON.stringify(motivo.orfaos)}`);
});

// ── Regra 0: fora de `database-*`, não toca ─────────────────────────────────────────────────
test('regra 0: arquivo que não é backup do sistema nunca entra em apagar', () => {
  const arquivos = [
    f('producao-2026.sqlite', 400),
    f('notas-wal', 400),
    f('LEIA-ME.txt', 400),
    f('database-2026-08-28T10-00-00.sqlite', 1),
    f('database-2026-06-01T10-00-00-wal', 90),  // órfão de verdade, para não ficar vazio
  ];
  const { apagar } = decidirRemocao(arquivos, { manterDias: 30, agora: AGORA });
  guardaNaoVazio(arquivos, apagar);

  assert.ok(apagar.includes('database-2026-06-01T10-00-00-wal'),
    'cenário vazio: nem o órfão de controle foi apagado');
  ['producao-2026.sqlite', 'notas-wal', 'LEIA-ME.txt'].forEach((n) => {
    assert.ok(!apagar.includes(n),
      `a régua decidiu sobre arquivo que não é dela: ${n} (apagar=${JSON.stringify(apagar)})`);
  });
});

// ── Regra 2 (RN-02): TETO ───────────────────────────────────────────────────────────────────
test('RN-02 teto: 15 cópias todas novas → as 5 mais velhas saem assim mesmo', () => {
  // sem esta asserção a etapa troca um teto rígido (~121 MB) por NENHUM teto:
  // 8 boots/dia x 30 dias x 12,1 MB = ~2,9 GB (achado A5)
  const arquivos = [];
  for (let i = 0; i < 15; i++) arquivos.push(f(`database-2026-08-${10 + i}T10-00-00.sqlite`, i));
  const { apagar, motivo } = decidirRemocao(arquivos, { manterDias: 30, agora: AGORA });
  guardaNaoVazio(arquivos, apagar);

  assert.strictEqual(apagar.length, 5,
    `teto de 10 não aplicado: sobrariam ${arquivos.length - apagar.length} cópias`);
  assert.deepStrictEqual(apagar.slice().sort(), [
    'database-2026-08-20T10-00-00.sqlite',
    'database-2026-08-21T10-00-00.sqlite',
    'database-2026-08-22T10-00-00.sqlite',
    'database-2026-08-23T10-00-00.sqlite',
    'database-2026-08-24T10-00-00.sqlite',
  ].sort(), `saíram as erradas: ${JSON.stringify(apagar)}`);
  assert.ok(!apagar.includes('database-2026-08-10T10-00-00.sqlite'),
    'a cópia MAIS RECENTE foi apagada pelo teto');
  assert.strictEqual(motivo.acimaDoTeto.length, 5);
});

// ── Regra 2 (RN-02): PISO ───────────────────────────────────────────────────────────────────
test('RN-02 piso: 5 cópias todas velhas → só 2 saem, as 3 mais novas ficam', () => {
  const arquivos = [
    f('database-2026-01-01T10-00-00.sqlite', 240),
    f('database-2026-02-01T10-00-00.sqlite', 209),
    f('database-2026-03-01T10-00-00.sqlite', 181),
    f('database-2026-04-01T10-00-00.sqlite', 150),
    f('database-2026-05-01T10-00-00.sqlite', 120),
  ];
  const { apagar, motivo } = decidirRemocao(arquivos, { manterDias: 30, agora: AGORA });
  guardaNaoVazio(arquivos, apagar);

  assert.strictEqual(apagar.length, 2,
    `piso de 3 não respeitado: sobrariam ${arquivos.length - apagar.length} cópias`);
  assert.deepStrictEqual(apagar.slice().sort(), [
    'database-2026-01-01T10-00-00.sqlite',
    'database-2026-02-01T10-00-00.sqlite',
  ].sort(), `saíram as erradas: ${JSON.stringify(apagar)}`);
  assert.deepStrictEqual(motivo.protegidasPeloPiso, [
    'database-2026-05-01T10-00-00.sqlite',
    'database-2026-04-01T10-00-00.sqlite',
    'database-2026-03-01T10-00-00.sqlite',
  ]);
});

test('RN-02 a cópia mais recente NUNCA é apagada, por mais velha que seja', () => {
  // fallback da RN-08 da Etapa 21: dbRecovery.js manda restaurar dali, e o zip leva a mais recente
  const arquivos = [f('database-2019-01-01T10-00-00.sqlite', 3000)];
  const { apagar } = decidirRemocao(arquivos, { manterDias: 1, agora: AGORA });
  assert.deepStrictEqual(apagar, [],
    'única cópia (de 8 anos) foi apagada — a recuperação ficou sem fallback');
});

// ── Regra 3: apagar por idade leva os acompanhantes junto (senão RECRIA o passivo) ───────────
test('regra 3: cópia apagada por idade leva os acompanhantes dos DOIS formatos', () => {
  const arquivos = [
    f('database-2026-08-28T10-00-00.sqlite', 1),
    f('database-2026-08-28T10-00-00.sqlite-wal', 1),
    f('database-2026-08-27T10-00-00.sqlite', 2),
    f('database-2026-08-26T10-00-00.sqlite', 3),
    f('database-2026-01-10T10-00-00.sqlite', 230),
    f('database-2026-01-10T10-00-00.sqlite-wal', 230),
    f('database-2026-01-10T10-00-00.sqlite-shm', 230),
    f('database-2026-01-10T10-00-00-wal', 230),   // mesmo backup, nome antigo
    f('database-2026-01-10T10-00-00-shm', 230),
  ];
  const { apagar } = decidirRemocao(arquivos, { manterDias: 30, agora: AGORA });
  guardaNaoVazio(arquivos, apagar);

  const esperado = [
    'database-2026-01-10T10-00-00.sqlite',
    'database-2026-01-10T10-00-00.sqlite-wal',
    'database-2026-01-10T10-00-00.sqlite-shm',
    'database-2026-01-10T10-00-00-wal',
    'database-2026-01-10T10-00-00-shm',
  ];
  assert.deepStrictEqual(apagar.slice().sort(), esperado.slice().sort(),
    `acompanhante deixado para trás recria o passivo que a regra 1 limpou: ${JSON.stringify(apagar)}`);
});

// ── RN-03: valor inválido cai no padrão e não apaga nada por data ───────────────────────────
[undefined, 'abc', 0, -5, null, NaN, '', '0', ' ', {}].forEach((valor) => {
  // rótulo por String(), não JSON.stringify: JSON.stringify(NaN) é "null" e dois casos
  // diferentes apareceriam com o MESMO nome no placar
  test(`RN-03 manterDias=${typeof valor}:${String(valor)} cai no padrão e não apaga nada por data`, () => {
    const arquivos = [
      f('database-2026-08-28T10-00-00.sqlite', 1),
      f('database-2026-08-27T10-00-00.sqlite', 2),
      f('database-2026-08-26T10-00-00.sqlite', 3),
      f('database-2026-08-25T10-00-00.sqlite', 4),
      f('database-2026-06-01T10-00-00-wal', 90),  // órfão: este SIM tem de sair
    ];
    const { apagar, motivo } = decidirRemocao(arquivos, { manterDias: valor, agora: AGORA });
    guardaNaoVazio(arquivos, apagar);

    assert.deepStrictEqual(apagar, ['database-2026-06-01T10-00-00-wal'],
      `lixo na chave foi interpretado como "zero dias": ${JSON.stringify(apagar)}`);
    assert.strictEqual(motivo.manterDias, 30, 'não caiu no padrão de 30 dias');
    assert.strictEqual(motivo.manterDiasInvalido, true, 'valor inválido não foi sinalizado para log');
  });
});

test('RN-03 manterDias válido em string ("7") é aceito', () => {
  const arquivos = [
    f('database-2026-08-28T10-00-00.sqlite', 1),
    f('database-2026-08-27T10-00-00.sqlite', 2),
    f('database-2026-08-26T10-00-00.sqlite', 3),
    f('database-2026-08-01T10-00-00.sqlite', 28),
  ];
  const { apagar, motivo } = decidirRemocao(arquivos, { manterDias: '7', agora: AGORA });
  assert.strictEqual(motivo.manterDias, 7);
  assert.strictEqual(motivo.manterDiasInvalido, false);
  assert.deepStrictEqual(apagar, ['database-2026-08-01T10-00-00.sqlite'],
    `esperava a de 28 dias fora com manterDias=7: ${JSON.stringify(apagar)}`);
});

// ── Caso `teto < piso`: o TETO vence (senão o teste congelado quebra) ────────────────────────
test('teto < piso: o teto vence — pruneOldBackups(dbPath, 1) tem de deixar 1 cópia', () => {
  // dbRecoveryBackup.api.test.js:138 chama pruneOldBackups(dbPath, 1), abaixo do piso de 3.
  const arquivos = [
    f('database-2026-08-28T10-00-00.sqlite', 1),
    f('database-2026-08-27T10-00-00.sqlite', 2),
    f('database-2026-08-26T10-00-00.sqlite', 3),
  ];
  const { apagar, motivo } = decidirRemocao(arquivos, { tetoCopias: 1, agora: AGORA });
  assert.strictEqual(apagar.length, 2,
    `teto 1 com piso 3: esperava 2 apagadas, veio ${JSON.stringify(apagar)}`);
  assert.ok(!apagar.includes('database-2026-08-28T10-00-00.sqlite'), 'apagou a mais recente');
  assert.strictEqual(motivo.pisoEfetivo, 1, 'o piso deveria ter cedido ao teto');
});

// ── Compatibilidade: número NÃO pode virar no-op silencioso (achado A7) ──────────────────────
test('compat: decidirRemocao(arquivos, 1) não vira no-op silencioso', () => {
  const arquivos = [
    f('database-2026-08-28T10-00-00.sqlite', 1),
    f('database-2026-08-27T10-00-00.sqlite', 2),
    f('database-2026-08-26T10-00-00.sqlite', 3),
  ];
  const { apagar } = decidirRemocao(arquivos, 1);
  assert.strictEqual(apagar.length, 2,
    'Number desestruturado virou no-op: os campos viraram undefined e a limpeza não fez nada');
});

test('compat: pruneOldBackups(dbPath, 2) — o número é TETO, não piso', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retencao-'));
  fs.mkdirSync(path.join(dir, 'backups'));
  const nomes = [
    'database-2026-08-28T10-00-00.sqlite',
    'database-2026-08-27T10-00-00.sqlite',
    'database-2026-08-26T10-00-00.sqlite',
    'database-2026-08-25T10-00-00.sqlite',
    'database-2026-06-01T10-00-00-wal',   // órfão de nome antigo, em disco
  ];
  nomes.forEach((n, i) => {
    const p = path.join(dir, 'backups', n);
    fs.writeFileSync(p, 'x');
    const t = new Date(AGORA - (i + 1) * DIA);
    fs.utimesSync(p, t, t);   // mtime FIXO: nada aqui depende do relógio
  });

  pruneOldBackups(path.join(dir, 'database.sqlite'), 2);

  const depois = fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.deepStrictEqual(depois, [
    'database-2026-08-27T10-00-00.sqlite',
    'database-2026-08-28T10-00-00.sqlite',
  ], `o 2 foi lido como piso (ou virou no-op): sobrou ${JSON.stringify(depois)}`);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('pruneOldBackups não toca em arquivo fora de database-*', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retencao-'));
  fs.mkdirSync(path.join(dir, 'backups'));
  ['producao-2026.sqlite', 'notas-wal', 'database-2026-06-01T10-00-00-wal']
    .forEach((n) => fs.writeFileSync(path.join(dir, 'backups', n), 'x'));

  pruneOldBackups(path.join(dir, 'database.sqlite'), 10);

  const depois = fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.deepStrictEqual(depois, ['notas-wal', 'producao-2026.sqlite'],
    `sobrou ${JSON.stringify(depois)} — o órfão não saiu ou uma cópia manual foi apagada`);
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
