/**
 * Etapa 98 (T4, Fase 2 I-5) — a lista da tela e a lista da rota de devolver a prateleira.
 *
 * A tela do almoxarifado (`RequisicoesList.js`) mostra "Devolver a prateleira" no item com caixa quando o status
 * esta em `STATUS_COM_CAIXA` de `client/src/components/almoxarifado/requisicaoLabels.js`; a rota
 * `PUT /api/almoxarifado/requisicoes/:id/devolver-separado` recusa (D1) o status fora de `STATUS_COM_CAIXA` de
 * `services/almoxarifado/requisitionStateMachine.js`. O CRA nao importa de fora de `src/`, entao a lista existe
 * duas vezes — este teste le o arquivo do cliente e compara (molde: `cancelarListaTelaRota.api.test.js`, Etapa 92).
 * Comparado como CONJUNTO: no servidor a lista e derivada (`PODE_SEPARAR` + `PODE_ENTREGAR` + valor), a ordem
 * nao significa nada. Divergindo, a tela oferece um botao que da 400 D1, ou esconde o gesto onde ele existe.
 *
 * Controle positivo embutido: o extrator roda num texto fixo e acha o array; o arquivo existe; a lista lida tem
 * 9 elementos (um regex errado que devolve lista vazia nao passa).
 *
 * Plano: docs/superpowers/plans/2026-10-09-almoxarifado-etapa98-devolver-da-caixa-a-prateleira.md (T4)
 * Executar: cd server && node tests/api/devolverListaTelaRota.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { STATUS_COM_CAIXA } = require('../../services/almoxarifado/requisitionStateMachine');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${String(e.message).replace(/\s*\n\s*/g, ' ')}`); });
}

const LABELS = path.join(__dirname, '..', '..', '..', 'client', 'src', 'components',
  'almoxarifado', 'requisicaoLabels.js');

/** Extrai o array literal de `export const <nome> = [ ... ]` (com ou sem `Object.freeze(`). */
function extrairLista(src, nome) {
  const re = new RegExp(`export const ${nome}\\s*=\\s*(?:Object\\.freeze\\(\\s*)?\\[([^\\]]*)\\]`);
  const m = src.match(re);
  if (!m) {
    throw new Error(`"export const ${nome} = [" nao encontrado — se o arquivo foi reestruturado, ajuste `
      + 'este parser; NAO deixe o teste passar sem conferir nada');
  }
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
}

(async () => {
  console.log('Etapa 98 — T4: STATUS_COM_CAIXA da tela e da rota de devolver a prateleira');

  await test('[98 T4] controle positivo: o extrator acha o array num texto fixo', () => {
    const fixo = "export const OUTRA = ['X'];\nexport const STATUS_COM_CAIXA = Object.freeze([\n"
      + "  'APROVADO', 'EM_SEPARACAO',\n  'PRONTA_PARA_RETIRADA',\n]);\n";
    assert.deepStrictEqual(extrairLista(fixo, 'STATUS_COM_CAIXA'),
      ['APROVADO', 'EM_SEPARACAO', 'PRONTA_PARA_RETIRADA']);
    assert.throws(() => extrairLista(fixo, 'NAO_EXISTE'), /nao encontrado/);
  });

  await test('[98 T4] o arquivo do cliente existe e a lista lida tem 9 status, sem repetidos', () => {
    assert.ok(fs.existsSync(LABELS), `arquivo nao encontrado: ${LABELS}`);
    const lista = extrairLista(fs.readFileSync(LABELS, 'utf8'), 'STATUS_COM_CAIXA');
    assert.strictEqual(lista.length, 9, `lista lida: ${JSON.stringify(lista)}`);
    assert.strictEqual(new Set(lista).size, 9, `repetidos: ${JSON.stringify(lista)}`);
  });

  await test('[98 T4] a lista da tela e a da maquina: o mesmo conjunto (9 status)', () => {
    assert.strictEqual(STATUS_COM_CAIXA.length, 9, `servidor: ${JSON.stringify(STATUS_COM_CAIXA)}`);
    const tela = extrairLista(fs.readFileSync(LABELS, 'utf8'), 'STATUS_COM_CAIXA');
    assert.deepStrictEqual([...tela].sort(), [...STATUS_COM_CAIXA].sort());
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
