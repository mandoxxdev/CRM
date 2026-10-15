/**
 * Etapa 109 (G7) — a lista de modulos do sistema: uma fonte no servidor, uma no cliente, e este teste
 * no meio (cliente e servidor nao compartilham codigo).
 *
 * Ate a 108 a lista existia em cinco lugares com chave + nome (o G7 dizia quatro; o cadastro de usuario
 * era o quinto): `modulosMeta.js`, `TipoSelecao.todosModulos`, `UsuarioForm.todosModulos` no cliente;
 * `MODULE_ADMIN_KEYS` e `DEFAULT_MODULOS_TIPO` no servidor. No servidor as duas passam a sair de
 * `services/modulosSistema.js` (RN-109.10) — os valores derivados sao conferidos aqui contra os
 * LITERAIS de antes, ordem inclusa (caracterizacao: a unificacao nao muda nada).
 *
 * RN-109.13: le `client/src/constants/modulosMeta.js` como TEXTO (e um modulo ES com icones; o node nao
 * o carrega) e confere os conjuntos. A divergencia conhecida do admin de modulo (B60) fica CONGELADA:
 * `todolist` a tela oferece e o servidor descarta; `admin` o servidor aceita e a tela nao oferece.
 * Se alguem alinhar um dos lados, este teste cai e manda atualizar a B60 — de proposito.
 *
 * Executar: cd server && node tests/api/modulosClienteServidor.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`); } catch (e) { failed++; console.error(`  ✗ ${name}: ${e.message}`); }
}

const { MODULE_ADMIN_KEYS } = require('../../services/systemPermissions');
const { DEFAULT_MODULOS_TIPO } = require('../../services/modulosTipoConfigService');

const ARQ_CLIENTE = path.join(__dirname, '..', '..', '..', 'client', 'src', 'constants', 'modulosMeta.js');

/** Le `export const NOME = [ 'a', 'b' ];` do arquivo do cliente. Falha alto se nao achar. */
function listaDoCliente(src, nome) {
  const m = src.match(new RegExp(`export const ${nome} = \\[([^\\]]*)\\];`));
  assert.ok(m, `lista ${nome} nao encontrada em modulosMeta.js (o teste nao pode passar vazio)`);
  const itens = (m[1].match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
  assert.ok(itens.length > 0, `lista ${nome} vazia em modulosMeta.js`);
  return itens;
}
const ordenado = (xs) => [...xs].sort();
const menos = (a, b) => a.filter((x) => !b.includes(x));

(() => {
  console.log('\n═══ Lista de modulos: servidor x cliente (Etapa 109, G7) ═══\n');

  /* ── RN-109.10 caracterizacao do servidor ─────────────────────────────────────── */
  test('RN-109.10 MODULE_ADMIN_KEYS e o de antes da unificacao (valores e ordem)', () => {
    assert.deepStrictEqual(MODULE_ADMIN_KEYS, [
      'comercial', 'compras', 'financeiro', 'operacional', 'engenharia', 'engenharia_projetos',
      'almoxarifado', 'frota', 'relatorios', 'administrativo', 'admin',
    ]);
  });

  test('RN-109.10 DEFAULT_MODULOS_TIPO e o de antes da unificacao (valores e ordem das chaves)', () => {
    assert.deepStrictEqual(Object.entries(DEFAULT_MODULOS_TIPO), [
      ['comercial', 'administrativo'], ['compras', 'administrativo'], ['financeiro', 'administrativo'],
      ['operacional', 'industrial'], ['engenharia', 'administrativo'], ['engenharia_projetos', 'administrativo'],
      ['almoxarifado', 'administrativo'], ['administrativo', 'administrativo'], ['admin', 'administrativo'],
      ['frota', 'industrial'], ['todolist', 'administrativo'],
    ]);
  });

  test('RN-109.10 as duas listas do servidor saem de services/modulosSistema.js', () => {
    const { MODULOS_SISTEMA, chavesComAdminDeModulo, tiposPadrao } = require('../../services/modulosSistema');
    assert.ok(Array.isArray(MODULOS_SISTEMA) && MODULOS_SISTEMA.length === 12, 'MODULOS_SISTEMA com 12 modulos');
    assert.deepStrictEqual(MODULE_ADMIN_KEYS, chavesComAdminDeModulo());
    assert.deepStrictEqual(DEFAULT_MODULOS_TIPO, tiposPadrao());
    // fiacao: os dois servicos nao podem ter literal proprio
    for (const arq of ['systemPermissions.js', 'modulosTipoConfigService.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', '..', 'services', arq), 'utf8');
      assert.ok(!/'engenharia_projetos'/.test(src), `${arq} ainda tem a lista literal`);
      assert.ok(/require\('\.\/modulosSistema'\)/.test(src), `${arq} nao le modulosSistema`);
    }
  });

  /* ── RN-109.13 cliente x servidor ─────────────────────────────────────────────── */
  // Comentarios fora antes de procurar as listas (revisao da Fase 5: uma copia comentada antes da
  // lista real era a que o regex lia).
  const src = fs.readFileSync(ARQ_CLIENTE, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  test('RN-109.11/12 fiacao: as duas telas leem modulosMeta.js e nao tem lista propria', () => {
    const telas = { 'TipoSelecao.js': 'modulosDaSelecao', 'UsuarioForm.js': 'modulosConcediveis' };
    for (const [arq, funcao] of Object.entries(telas)) {
      const t = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', 'components', arq), 'utf8');
      assert.ok(new RegExp(`import \\{[^}]*\\b${funcao}\\b[^}]*\\} from '\\.\\./constants/modulosMeta'`).test(t), `${arq} nao importa ${funcao}`);
      assert.ok(t.includes(`const todosModulos = ${funcao}();`), `${arq} nao deriva todosModulos de ${funcao}()`);
      assert.ok(!/['"]engenharia_projetos['"]/.test(t), `${arq} voltou a ter a lista de modulos escrita a mao`);
    }
  });

  test('RN-109.13 (a) os modulos com tela no cliente (MODULOS_ORDEM) = os modulos com tipo no servidor', () => {
    const cliente = listaDoCliente(src, 'MODULOS_ORDEM');
    const servidor = Object.keys(DEFAULT_MODULOS_TIPO);
    assert.deepStrictEqual(ordenado(cliente), ordenado(servidor),
      `so no cliente: ${menos(cliente, servidor)} · so no servidor: ${menos(servidor, cliente)}`);
  });

  test('RN-109.13 (b) os modulos que o cadastro de usuario concede = todos os modulos do servidor', () => {
    const { MODULOS_SISTEMA } = require('../../services/modulosSistema');
    const cliente = listaDoCliente(src, 'MODULOS_CONCEDIVEIS');
    const servidor = MODULOS_SISTEMA.map((m) => m.chave);
    assert.deepStrictEqual(ordenado(cliente), ordenado(servidor),
      `so no cliente: ${menos(cliente, servidor)} · so no servidor: ${menos(servidor, cliente)}`);
  });

  test('RN-109.13 (c) admin de modulo: a divergencia conhecida (B60) e so esta — todolist so na tela, admin so no servidor', () => {
    const concedidos = listaDoCliente(src, 'MODULOS_CONCEDIVEIS');
    const semToggle = listaDoCliente(src, 'MODULOS_SEM_ADMIN_DE_MODULO_NA_TELA');
    const tela = menos(concedidos, semToggle);
    assert.deepStrictEqual(
      { soNaTela: ordenado(menos(tela, MODULE_ADMIN_KEYS)), soNoServidor: ordenado(menos(MODULE_ADMIN_KEYS, tela)) },
      { soNaTela: ['todolist'], soNoServidor: ['admin'] },
      'a divergencia do admin de modulo mudou — atualize a B60 de docs/compras-novidades-por-etapa.md e este teste'
    );
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
