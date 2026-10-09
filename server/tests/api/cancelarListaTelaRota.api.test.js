/**
 * Etapa 92 (T4, RN-07, B440) — a lista da rota e a lista da tela.
 *
 * A tela dos outros modulos (`RequisicoesList.js`, fora do modo almoxarifado) mostra Cancelar Requisicao
 * para os status de `STATUS_CANCELAVEIS_OUTROS_MODULOS` (`client/src/components/almoxarifado/requisicaoLabels.js`);
 * a rota `PUT /api/requisicoes-material/:id/cancelar` aceita os de `CANCELAVEIS_OUTROS_MODULOS`
 * (`services/almoxarifado/requisitionStateMachine.js`). A C149 era exatamente as duas listas divergindo: a
 * tela oferecia seis status, a rota aceitava dois, e quatro botoes davam 400. O CRA nao importa de fora de
 * `src/`, entao a lista existe duas vezes — este teste le o arquivo do cliente e compara (molde:
 * `configuracoesGerais.api.test.js`). Uma lista escrita a mao aqui seria a mesma mentira dos dois lados.
 *
 * Controle positivo embutido: o extrator roda num texto fixo e acha o array; o arquivo existe; a lista lida
 * tem 6 elementos (um regex errado que devolve lista vazia nao passa).
 *
 * Plano: docs/superpowers/plans/2026-10-08-almoxarifado-etapa92-cancelar-outros-modulos.md (T4)
 * Executar: cd server && node tests/api/cancelarListaTelaRota.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { CANCELAVEIS_OUTROS_MODULOS, validarTransicao } = require('../../services/almoxarifado/requisitionStateMachine');

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
  console.log('Etapa 92 — RN-07: a lista da rota dos outros modulos e a lista da tela');

  await test('[92 RN-07] controle positivo: o extrator acha o array num texto fixo', () => {
    const fixo = "export const OUTRA = ['X'];\nexport const STATUS_CANCELAVEIS_OUTROS_MODULOS = Object.freeze([\n"
      + "  'PENDENTE', 'APROVADO',\n  'TOTALMENTE_RESERVADA',\n]);\n";
    assert.deepStrictEqual(extrairLista(fixo, 'STATUS_CANCELAVEIS_OUTROS_MODULOS'),
      ['PENDENTE', 'APROVADO', 'TOTALMENTE_RESERVADA']);
    assert.throws(() => extrairLista(fixo, 'NAO_EXISTE'), /nao encontrado/);
  });

  await test('[92 RN-07] o arquivo do cliente existe e a lista lida tem os 6 status', () => {
    assert.ok(fs.existsSync(LABELS), `arquivo nao encontrado: ${LABELS}`);
    const lista = extrairLista(fs.readFileSync(LABELS, 'utf8'), 'STATUS_CANCELAVEIS_OUTROS_MODULOS');
    assert.strictEqual(lista.length, 6, `lista lida: ${JSON.stringify(lista)}`);
  });

  await test('[92 RN-07] a lista da tela e a constante da rota: mesmos elementos, mesma ordem', () => {
    const tela = extrairLista(fs.readFileSync(LABELS, 'utf8'), 'STATUS_CANCELAVEIS_OUTROS_MODULOS');
    assert.deepStrictEqual(tela, [...CANCELAVEIS_OUTROS_MODULOS]);
  });

  await test('[92 RN-07] cada status da lista vai a CANCELADO pela maquina de estados', () => {
    assert.strictEqual(CANCELAVEIS_OUTROS_MODULOS.length, 6);
    for (const s of CANCELAVEIS_OUTROS_MODULOS) {
      assert.strictEqual(validarTransicao(s, 'CANCELADO').ok, true, `${s} -> CANCELADO recusado pela maquina`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
