/**
 * Etapa 80 / T1 — fila serial do Chromium compartilhado dos PDFs (B32).
 *
 * Teste de SERVICO, nao de rota — mora em tests/api/ porque o runner (tests/api/run-all.js)
 * so descobre `*.api.test.js` (mesmo precedente de backupExposicao.api.test.js).
 *
 * O que esta coberto (services/filaPdf.js):
 *   RN-80.01 — no maximo uma tarefa roda por vez (concorrencia maxima MEDIDA = 1 com 5 tarefas
 *   assincronas de duracoes diferentes), em ordem de chegada.
 *   RN-80.02 — uma tarefa que lanca rejeita SO a propria promessa, com o mesmo erro, e as
 *   seguintes rodam (a fila nao fica envenenada).
 *   O valor de retorno de cada tarefa chega a quem enfileirou.
 */
const assert = require('assert');
const { criarFilaSerial } = require('../../services/filaPdf');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await test('roda uma tarefa por vez (concorrencia maxima = 1) e em ordem de chegada', async () => {
    const enfileirar = criarFilaSerial();
    let emCurso = 0; let maximo = 0;
    const inicios = []; const fins = [];
    const duracoes = [40, 5, 25, 0, 15];
    const promessas = duracoes.map((ms, i) => enfileirar(async () => {
      emCurso += 1; maximo = Math.max(maximo, emCurso); inicios.push(i);
      await esperar(ms);
      fins.push(i); emCurso -= 1;
      return i;
    }));
    await Promise.all(promessas);
    assert.strictEqual(maximo, 1, `concorrencia maxima medida = ${maximo}`);
    assert.deepStrictEqual(inicios, [0, 1, 2, 3, 4], `ordem de inicio ${inicios}`);
    assert.deepStrictEqual(fins, [0, 1, 2, 3, 4], `ordem de fim ${fins}`);
  });

  await test('controle: sem a fila as mesmas tarefas sobrepoem (a medida sabe ver > 1)', async () => {
    let emCurso = 0; let maximo = 0;
    await Promise.all([40, 5, 25, 0, 15].map(async (ms) => {
      emCurso += 1; maximo = Math.max(maximo, emCurso); await esperar(ms); emCurso -= 1;
    }));
    assert.ok(maximo > 1, `sem fila deveria sobrepor; maximo = ${maximo}`);
  });

  await test('tarefa que lanca rejeita so a sua promessa (mesmo erro) e as seguintes rodam', async () => {
    const enfileirar = criarFilaSerial();
    const erro = new Error('Target closed');
    const rodou = [];
    const a = enfileirar(async () => { await esperar(10); rodou.push('a'); return 'A'; });
    const b = enfileirar(async () => { await esperar(5); rodou.push('b'); throw erro; });
    const c = enfileirar(() => { rodou.push('c'); throw new Error('sincrono'); });
    const d = enfileirar(async () => { rodou.push('d'); return 'D'; });
    const r = await Promise.allSettled([a, b, c, d]);
    assert.strictEqual(r[0].status, 'fulfilled');
    assert.strictEqual(r[1].status, 'rejected');
    assert.strictEqual(r[1].reason, erro, 'a rejeicao tem de ser o MESMO erro da tarefa');
    assert.strictEqual(r[2].status, 'rejected');
    assert.strictEqual(r[2].reason.message, 'sincrono');
    assert.strictEqual(r[3].status, 'fulfilled');
    assert.deepStrictEqual(rodou, ['a', 'b', 'c', 'd']);
    // e a fila continua viva depois das falhas
    assert.strictEqual(await enfileirar(async () => 'depois'), 'depois');
  });

  await test('valor de retorno da tarefa chega a quem enfileirou', async () => {
    const enfileirar = criarFilaSerial();
    const buf = Buffer.from('%PDF-1.7');
    const [x, y, z] = await Promise.all([
      enfileirar(async () => buf),
      enfileirar(() => 42),
      enfileirar(async () => ({ pdfBuffer: buf, filaMs: 3 })),
    ]);
    assert.strictEqual(x, buf);
    assert.strictEqual(y, 42);
    assert.deepStrictEqual(z, { pdfBuffer: buf, filaMs: 3 });
  });

  await test('filas diferentes sao independentes (cada criarFilaSerial tem a sua cadeia)', async () => {
    const f1 = criarFilaSerial(); const f2 = criarFilaSerial();
    let emCurso = 0; let maximo = 0;
    const t = () => async () => { emCurso += 1; maximo = Math.max(maximo, emCurso); await esperar(20); emCurso -= 1; };
    await Promise.all([f1(t()), f2(t())]);
    assert.strictEqual(maximo, 2);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
