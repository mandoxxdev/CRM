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
/** Le `export const NOME = { chave: 'Nome', ... };` do arquivo do cliente. Falha alto se nao achar. */
function objetoDoCliente(src, nome) {
  const m = src.match(new RegExp(`export const ${nome} = \\{([^}]*)\\};`));
  assert.ok(m, `objeto ${nome} nao encontrado em modulosMeta.js (o teste nao pode passar vazio)`);
  const pares = [...m[1].matchAll(/([a-z_]+): '([^']+)'/g)].map((p) => [p[1], p[2]]);
  assert.ok(pares.length > 0, `objeto ${nome} vazio em modulosMeta.js`);
  return Object.fromEntries(pares);
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

  /* ── RN-111.04 nome do modulo: servidor x cliente x App.js (Etapa 111, G17) ───────── */
  test('RN-111.04 NOMES_MODULO (cliente) = nome do servidor, para os 11 modulos com tela', () => {
    const { MODULOS_SISTEMA } = require('../../services/modulosSistema');
    const cliente = objetoDoCliente(src, 'NOMES_MODULO');
    const ordem = listaDoCliente(src, 'MODULOS_ORDEM');
    assert.deepStrictEqual(ordenado(Object.keys(cliente)), ordenado(ordem), 'NOMES_MODULO tem de ter as chaves de MODULOS_ORDEM');
    const nomeServidor = (k) => (MODULOS_SISTEMA.find((m) => m.chave === k) || {}).nome;
    const diferentes = ordem.filter((k) => nomeServidor(k) !== cliente[k])
      .map((k) => `${k}: cliente "${cliente[k]}" x servidor "${nomeServidor(k)}"`);
    assert.deepStrictEqual(diferentes, []);
  });

  test('RN-111.04 cada <ProtectedModuleRoute modulo nomeModulo> do App.js usa o nome de NOMES_MODULO (11 de 11)', () => {
    const cliente = objetoDoCliente(src, 'NOMES_MODULO');
    const app = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', 'App.js'), 'utf8');
    const rotas = [...app.matchAll(/<ProtectedModuleRoute modulo="([a-z_]+)" nomeModulo="([^"]+)">/g)].map((m) => [m[1], m[2]]);
    assert.strictEqual(rotas.length, 11, `esperava 11 ProtectedModuleRoute com modulo e nomeModulo no App.js, achei ${rotas.length}`);
    const diferentes = rotas.filter(([k, n]) => cliente[k] !== n).map(([k, n]) => `${k}: App.js "${n}" x NOMES_MODULO "${cliente[k]}"`);
    assert.deepStrictEqual(diferentes, []);
  });

  /* ── RN-111.08 "sem nenhuma linha de permissao": tres portoes, divergencia CONGELADA (B63) ── */
  test('RN-111.08 sem linha: portao do cliente libera comercial e frota, a selecao e o servidor so comercial — congelado (B63)', () => {
    const { MODULOS_LIBERADOS_SEM_GRUPO } = require('../../services/modulosSistema');
    const portao = listaDoCliente(src, 'MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO');
    const selecao = listaDoCliente(src, 'MODULOS_LIBERADOS_SEM_PERMISSAO_SELECAO');
    assert.ok(Array.isArray(MODULOS_LIBERADOS_SEM_GRUPO), 'MODULOS_LIBERADOS_SEM_GRUPO nao exportado por modulosSistema');
    assert.deepStrictEqual(
      {
        portao: ordenado(portao), selecao: ordenado(selecao), servidor: ordenado(MODULOS_LIBERADOS_SEM_GRUPO),
        soNoPortao: ordenado(menos(portao, MODULOS_LIBERADOS_SEM_GRUPO)),
      },
      { portao: ['comercial', 'frota'], selecao: ['comercial'], servidor: ['comercial'], soNoPortao: ['frota'] },
      'a regra do "sem linha" mudou num dos portoes — atualize a B63 de docs/compras-novidades-por-etapa.md e este teste'
    );
  });

  test('[RN-145.04] o portao das propostas usa a lista "sem linha" da TELA, igual a do cliente, e o le sem literal proprio', () => {
    const { MODULOS_LIBERADOS_SEM_LINHA_NA_TELA } = require('../../services/modulosSistema');
    const portao = listaDoCliente(src, 'MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO');
    assert.ok(Array.isArray(MODULOS_LIBERADOS_SEM_LINHA_NA_TELA), 'MODULOS_LIBERADOS_SEM_LINHA_NA_TELA nao exportado por modulosSistema');
    assert.deepStrictEqual(ordenado(MODULOS_LIBERADOS_SEM_LINHA_NA_TELA), ordenado(portao),
      'a lista "sem linha" do portao das propostas divergiu da do portao de rota do cliente (RN-145.04)');
    const corpo = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'portaoDasPropostas.js'), 'utf8');
    assert.ok(/MODULOS_LIBERADOS_SEM_LINHA_NA_TELA\.includes\(m\)/.test(corpo), 'temModuloComoATela nao le MODULOS_LIBERADOS_SEM_LINHA_NA_TELA');
    assert.ok(!/'frota'/.test(corpo), "portaoDasPropostas.js tem 'frota' escrito");
  });

  test('RN-111.08 fiacao: os dois portoes do servidor e os dois do cliente leem as listas, sem literal proprio', () => {
    // Desde a revisao da Fase 5 da 111 os portoes moram em services/portaoDeModulo.js (portaoDeModulo.api.test.js os executa).
    const idx = fs.readFileSync(path.join(__dirname, '..', '..', 'services', 'portaoDeModulo.js'), 'utf8');
    for (const [nome, fim] of [['checkModulePermission', 'function checkAnyModulePermission'], ['checkAnyModulePermission', 'return { checkModulePermission, checkAnyModulePermission };']]) {
      const ini = idx.indexOf(`function ${nome}(`);
      const corpo = idx.slice(ini, idx.indexOf(fim, ini + 1));
      assert.ok(ini >= 0 && corpo.length > 500, `${nome} nao encontrado em services/portaoDeModulo.js`);
      // A lista vazia do checkAnyModulePermission cai no portao de comercial (`checkModulePermission('comercial')`) —
      // e o portao de comercial, nao a regra do "sem grupo"; fica (declarado no plano da 111, M3).
      const semFallback = corpo.replace("if (mods.length === 0) return checkModulePermission('comercial');", '');
      assert.ok(!/'comercial'/.test(semFallback), `${nome} ainda tem 'comercial' escrito no corpo`);
      assert.ok(/MODULOS_LIBERADOS_SEM_GRUPO/.test(corpo), `${nome} nao le MODULOS_LIBERADOS_SEM_GRUPO`);
    }
    const cli = (arq) => fs.readFileSync(path.join(__dirname, '..', '..', '..', 'client', 'src', arq), 'utf8');
    const cache = cli('services/permissionsCache.js');
    assert.ok(/MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO\.includes\(modulo\)/.test(cache), 'hasModuleAccess nao le MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO');
    assert.ok(!/'frota'/.test(cache) && !/'comercial'/.test(cache), 'permissionsCache.js ainda tem comercial/frota escrito');
    const sel = cli('components/TipoSelecao.js');
    assert.ok((sel.match(/MODULOS_LIBERADOS_SEM_PERMISSAO_SELECAO/g) || []).length >= 5, 'TipoSelecao nao le MODULOS_LIBERADOS_SEM_PERMISSAO_SELECAO nos quatro pontos');
    assert.ok(!/'comercial'/.test(sel), "TipoSelecao ainda tem 'comercial' escrito");
  });

  console.log(`\n${passed} passaram, ${failed} falharam\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
