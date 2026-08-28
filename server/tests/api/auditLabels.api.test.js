/**
 * Etapa 22, Task 1 — vocabulario da trilha de auditoria (C3) e os tres indices da tabela.
 * Plano: docs/superpowers/plans/2026-08-28-almoxarifado-etapa22-tela-de-auditoria.md
 * Design (RN-06, RN-07): docs/superpowers/specs/2026-08-28-almoxarifado-etapa22-tela-de-auditoria-design.md
 *
 * ── POR QUE A COBERTURA DO VOCABULARIO UNE TRES FONTES ──────────────────────────────────────
 *
 * A varredura ingenua por `acao: '<VERBO>'` e ao mesmo tempo RUIDOSA e CEGA (achado A2 da
 * revisao adversarial, reproduzido nesta base):
 *
 *   RUIDO — `grep -rhoP "acao: '\K[A-Z_]+"` casa o FINAL de outros identificadores:
 *   `localizacao: 'A...'` vira o "verbo" `A`, `motivoMovimentacao: 'E...'` vira `E`/`L`.
 *   Sao 48 tokens, tres deles lixo de uma letra. A varredura correta tem guarda de fronteira
 *   (`(?<![A-Za-z_])`) e da 45 verbos / 91 ocorrencias, o menor com 5 caracteres.
 *
 *   CEGUEIRA — 25 verbos NAO sao literais e varredura NENHUMA os enxerga:
 *     - `stockService.js:1367-1372` audita `acao: tipo`, onde `tipo` e um dos 18 de
 *       `movementTypes.js` (a maior produtora de linhas do modulo);
 *     - `receiptService.js:236-239` audita `acao: acao.toUpperCase()`, onde `acao` e uma chave
 *       de `transicoes` (`receiptService.js:205-216`);
 *     - `routes/almoxarifado.js:1284-1287` audita um ternario, `'RECONTAGEM' : 'CONTAGEM'` —
 *       literais, mas depois de `acao: marcaRecontagem ?`, entao a guarda nao os ve.
 *
 * A guarda antiga do plano (">= 20 verbos") passava nos DOIS defeitos ao mesmo tempo: 45 > 20
 * com ruido dentro e um terco do vocabulario faltando. Por isso aqui a assercao e >= 45 sobre a
 * varredura COM guarda, mais o canario de token curto, mais as duas fontes dinamicas.
 *
 * Executar: cd server && node tests/api/auditLabels.api.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const sqlite3 = require('sqlite3').verbose();
const { initSchema } = require('../../services/almoxarifado/schema');
const { dbAll } = require('../../services/almoxarifado/db');
const movementTypes = require('../../services/almoxarifado/movementTypes');
const labels = require('../../services/almoxarifado/auditLabels');

let passed = 0; let failed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const SERVER = path.join(__dirname, '..', '..');
const DIRS_AUDITADOS = ['routes', 'services'].map((d) => path.join(SERVER, d));

/**
 * Varredura COM GUARDA DE FRONTEIRA. Devolve os verbos literais distintos.
 * Guarda contra teste vazio (o modo de falha que ja aconteceu tres vezes nesta base): confere
 * que os diretorios existem ANTES, e trata `grep` sem match (exit 1) como FALHA, nunca como
 * lista vazia — nada de `2>/dev/null` engolindo caminho errado.
 */
function varrerVerbosLiterais() {
  for (const d of DIRS_AUDITADOS) {
    assert.ok(fs.existsSync(d), `diretorio varrido nao existe: ${d} (varredura vazia mascarada)`);
  }
  let saida;
  try {
    saida = execFileSync('grep', ['-rhoP', "(?<![A-Za-z_])acao: '\\K[A-Z_]+", ...DIRS_AUDITADOS],
      { encoding: 'utf8' });
  } catch (e) {
    throw new Error(`a varredura de verbos nao casou NADA (grep status ${e.status}) — `
      + 'caminho errado ou regex quebrada, nao vocabulario vazio');
  }
  const ocorrencias = saida.split('\n').filter(Boolean);
  assert.ok(ocorrencias.length > 0, 'varredura sem nenhuma ocorrencia');
  return { distintos: [...new Set(ocorrencias)], ocorrencias };
}

/**
 * Chaves de `transicoes` (receiptService), extraidas do FONTE — a const e local a
 * `avancarWorkflow`, nao exportada. A assercao de contagem exata e o mecanismo: quem
 * acrescentar uma transicao nova derruba este teste em vez de criar um verbo sem rotulo.
 */
function verbosDeTransicao() {
  const src = fs.readFileSync(path.join(SERVER, 'services/almoxarifado/receiptService.js'), 'utf8');
  const chaves = [...src.matchAll(/^\s+([a-z_]+): \{ de: \[/gm)].map((m) => m[1]);
  assert.strictEqual(chaves.length, 6,
    `transicoes mudou de tamanho (${chaves.length}): confira se o verbo novo tem rotulo`);
  // `processar` NAO chega ao `acao.toUpperCase()`: cai no `handler: 'processar'` e faz
  // `return processarNota(...)` ANTES do registrarAuditoria — a linha dele e gravada la, com o
  // literal 'PROCESSAR_NOTA' (receiptService.js:691), que a varredura ja pega. Por isso os
  // verbos de transicao REALMENTE gravados sao 5, e nao 6.
  return chaves.filter((k) => k !== 'processar').map((k) => k.toUpperCase());
}

(async () => {
  console.log('\n=== Etapa 22 Task 1: rotulos, regua de leitura e indices ===\n');

  // ── RN-06: sinonimo nao divide a lista ────────────────────────────────────────────────────
  await test('(a) CRIACAO e CRIAR devolvem O MESMO rotulo', () => {
    assert.strictEqual(labels.rotularAcao('CRIACAO'), labels.rotularAcao('CRIAR'),
      'sinonimo dividido: a tela mostraria duas opcoes para o mesmo ato');
    assert.strictEqual(labels.rotularAcao('CRIACAO'), 'Criação');
  });

  await test('(a2) EDICAO/ATUALIZACAO/ATUALIZAR e EXCLUSAO/DESATIVACAO tambem sao sinonimos', () => {
    assert.strictEqual(labels.rotularAcao('EDICAO'), labels.rotularAcao('ATUALIZACAO'));
    assert.strictEqual(labels.rotularAcao('EDICAO'), labels.rotularAcao('ATUALIZAR'));
    // Os DOIS gravam `ativo = 0` — EXCLUSAO em tipo_material/localizacao/setor/familia,
    // DESATIVACAO em material. Mesmo ato, nome diferente por entidade (achado A7).
    assert.strictEqual(labels.rotularAcao('EXCLUSAO'), labels.rotularAcao('DESATIVACAO'));
    assert.strictEqual(labels.rotularAcao('EXCLUSAO'), 'Exclusão');
  });

  await test('(b) verbosDoGrupo("Criação") traz os DOIS verbos', () => {
    const v = labels.verbosDoGrupo('Criação');
    assert.deepStrictEqual([...v].sort(), ['CRIACAO', 'CRIAR'],
      `esperava os dois verbos, veio ${JSON.stringify(v)}`);
    assert.deepStrictEqual([...labels.verbosDoGrupo('Edição')].sort(),
      ['ATUALIZACAO', 'ATUALIZAR', 'EDICAO']);
    assert.deepStrictEqual(labels.verbosDoGrupo('Rotulo Que Nao Existe'), [],
      'rotulo inexistente tem de dar [] — nunca undefined, que viraria crash no spread do IN');
  });

  await test('(c) verbo/entidade desconhecidos voltam ELES MESMOS (nunca undefined nem "")', () => {
    assert.strictEqual(labels.rotularAcao('VERBO_INVENTADO_XYZ'), 'VERBO_INVENTADO_XYZ',
      'verbo sem rotulo nao pode sumir: sumir esconderia atos numa trilha de auditoria');
    assert.strictEqual(labels.rotularEntidade('entidade_inventada_xyz'), 'entidade_inventada_xyz');
    // Chaves do Object.prototype nao podem vazar rotulo (mapa com lookup ingenuo devolveria funcao).
    assert.strictEqual(labels.rotularAcao('constructor'), 'constructor');
    assert.strictEqual(labels.rotularAcao('toString'), 'toString');
  });

  await test('(d) congelamento PROFUNDO: GRUPOS_ACAO[0].verbos.push lanca e nao altera', () => {
    const antes = labels.GRUPOS_ACAO[0].verbos.length;
    assert.throws(() => labels.GRUPOS_ACAO[0].verbos.push('X'), TypeError,
      'verbos mutavel: a Task 2 consome este array e um push envenenaria o filtro do IN');
    assert.strictEqual(labels.GRUPOS_ACAO[0].verbos.length, antes);
    // Object.freeze e RASO: sem congelar cada entrada, isto passaria em silencio (achado A8).
    const rotuloAntes = labels.GRUPOS_ACAO[0].rotulo;
    try { labels.GRUPOS_ACAO[0].rotulo = 'Sabotado'; } catch (e) { /* strict mode lanca */ }
    assert.strictEqual(labels.GRUPOS_ACAO[0].rotulo, rotuloAntes);
    try { labels.GRUPOS_ACAO.push({ rotulo: 'X', verbos: [] }); } catch (e) { /* esperado */ }
    assert.ok(Object.isFrozen(labels.GRUPOS_ACAO), 'o array externo tambem precisa estar congelado');
    assert.ok(Object.isFrozen(labels.ROTULOS_ENTIDADE));
  });

  // ── RN-07: a regua de LEITURA (NAO e o configDiff.calcularDiff) ───────────────────────────
  await test('(e1) uniao das chaves: a alteracao que so existe em `anteriores` NAO SOME', () => {
    // Este e o cenario que `configDiff.calcularDiff` perdia: ele itera so Object.keys(novos)
    // (configDiff.js:9-13, de proposito, porque la `anteriores` e a tabela inteira). Numa
    // exclusao de requisicao o `status` anterior e o UNICO de/para real da linha.
    const r = labels.alteracoesDaLinha({ status: 'PENDENTE' }, { numero: 'REQ-1' });
    assert.strictEqual(r.length, 2, `esperava 2 entradas, veio ${JSON.stringify(r)}`);
    const porCampo = Object.fromEntries(r.map((x) => [x.campo, x]));
    assert.deepStrictEqual(porCampo.status, { campo: 'status', de: 'PENDENTE', para: null },
      'a mudanca de status foi APAGADA — e o defeito A1, o mais grave da revisao');
    assert.deepStrictEqual(porCampo.numero, { campo: 'numero', de: null, para: 'REQ-1' });
  });

  await test('(e2) segredo: os dois lados "(alterado)" e a chave APARECE', () => {
    // A Etapa 19 grava o diff JA mascarado, entao quando a senha muda os dois lados sao iguais.
    // Uma regua que pula igualdade esconderia que a senha foi trocada — o oposto da RN-08.
    const r = labels.alteracoesDaLinha(
      { alertas_smtp_pass: '(alterado)', alertas_dias: '30' },
      { alertas_smtp_pass: '(alterado)', alertas_dias: '45' });
    const campos = r.map((x) => x.campo).sort();
    assert.deepStrictEqual(campos, ['alertas_dias', 'alertas_smtp_pass'],
      `a troca de senha sumiu da leitura: ${JSON.stringify(r)}`);
    const segredo = r.find((x) => x.campo === 'alertas_smtp_pass');
    assert.deepStrictEqual(segredo, { campo: 'alertas_smtp_pass', de: '(alterado)', para: '(alterado)' });
  });

  await test('(e3) lados vazios/nulos dao [] (ha call sites que nao gravam nenhum dos dois)', () => {
    // receiptService.js:236-239 (os 5 verbos de transicao) grava a linha SEM dados_* nenhum.
    assert.deepStrictEqual(labels.alteracoesDaLinha({ a: 1 }, null),
      [{ campo: 'a', de: 1, para: null }], 'nov=null nao pode apagar o lado anterior');
    assert.deepStrictEqual(labels.alteracoesDaLinha(null, null), []);
    assert.deepStrictEqual(labels.alteracoesDaLinha(undefined, undefined), []);
    assert.deepStrictEqual(labels.alteracoesDaLinha('', ''), []);
    assert.deepStrictEqual(labels.alteracoesDaLinha('{}', '{}'), []);
  });

  await test('(e4) string JSON crua (como vem do banco) da o MESMO resultado que objeto', () => {
    const ant = { nome: 'Parafuso', codigo: 'P1' };
    const nov = { nome: 'Parafuso M8', codigo: 'P1' };
    const viaString = labels.alteracoesDaLinha(JSON.stringify(ant), JSON.stringify(nov));
    // Ancora ANTES da comparacao: sem ela, "[] === []" faria o cenario passar sem regua nenhuma.
    assert.deepStrictEqual(viaString, [
      { campo: 'nome', de: 'Parafuso', para: 'Parafuso M8' },
      { campo: 'codigo', de: 'P1', para: 'P1' },
    ], `a string JSON nao foi lida: ${JSON.stringify(viaString)}`);
    assert.deepStrictEqual(viaString, labels.alteracoesDaLinha(ant, nov),
      'a coluna dados_* e TEXT: a rota entrega string, o teste unitario entrega objeto');
    // JSON quebrado nao pode derrubar a listagem inteira da auditoria.
    assert.deepStrictEqual(labels.alteracoesDaLinha('{nao e json', null), []);
  });

  await test('(e5) NENHUM valor e remascarado nem reformatado: sai como esta gravado', () => {
    const r = labels.alteracoesDaLinha(
      { senha: 'p@ss-em-claro', n: 0, b: false, lista: [1, 2] },
      { senha: 'outra', n: 7, b: true, lista: [2, 1] });
    const m = Object.fromEntries(r.map((x) => [x.campo, x]));
    assert.strictEqual(m.senha.de, 'p@ss-em-claro',
      'a leitura NAO mascara: se um dia gravarem segredo cru, o lugar de consertar e a ESCRITA (RN-08)');
    assert.strictEqual(m.n.de, 0, 'zero nao pode virar null');
    assert.strictEqual(m.b.de, false, 'false nao pode virar null');
    assert.deepStrictEqual(m.lista.de, [1, 2]);
  });

  // ── Cobertura do vocabulario: as TRES fontes ──────────────────────────────────────────────
  await test('varredura com guarda: >= 45 verbos e NENHUM token com menos de 4 caracteres', () => {
    const { distintos, ocorrencias } = varrerVerbosLiterais();
    assert.ok(distintos.length >= 45,
      `varredura com guarda achou ${distintos.length} verbos, esperava >= 45`);
    assert.ok(ocorrencias.length >= 91, `so ${ocorrencias.length} ocorrencias, esperava >= 91`);
    const curtos = distintos.filter((v) => v.length < 4);
    assert.deepStrictEqual(curtos, [],
      `CANARIO DE RUIDO: ${JSON.stringify(curtos)} sao caudas de identificador `
      + '(localizacao: \'A..\'), nao verbos — a guarda de fronteira caiu');
  });

  await test('as tres fontes cobertas: TODO verbo gravavel tem rotulo', () => {
    const literais = varrerVerbosLiterais().distintos;
    const dinamicosMovimentacao = [
      // stockService.js:1367-1372 — `acao: tipo`, o tipo da movimentacao.
      ...movementTypes.TIPOS_ENTRADA, ...movementTypes.TIPOS_SAIDA, ...movementTypes.TIPOS_DEVOLUCAO,
    ];
    const dinamicosRecebimento = verbosDeTransicao(); // receiptService.js:236-239
    const dinamicosConferencia = ['CONTAGEM', 'RECONTAGEM']; // routes/almoxarifado.js:1284-1287

    const uniao = [...new Set([...literais, ...dinamicosMovimentacao,
      ...dinamicosRecebimento, ...dinamicosConferencia])];
    assert.ok(uniao.length >= 68, `uniao caiu para ${uniao.length}: alguma fonte parou de ser lida`);
    assert.ok(dinamicosMovimentacao.length >= 18 && new Set(dinamicosMovimentacao).size === 18,
      'movementTypes deixou de ter os 18 tipos');

    const semRotulo = uniao.filter((v) => labels.rotularAcao(v) === v);
    assert.deepStrictEqual(semRotulo, [],
      `verbos gravaveis sem rotulo: ${JSON.stringify(semRotulo)} — a tela mostraria o verbo cru`);
  });

  await test('cobertura das entidades: os 25 literais tem rotulo (nenhum e dinamico)', () => {
    const saida = execFileSync('grep',
      ['-rhoP', "(?<![A-Za-z_])entidade: '\\K[a-z_]+", ...DIRS_AUDITADOS], { encoding: 'utf8' });
    const entidades = [...new Set(saida.split('\n').filter(Boolean))];
    assert.ok(entidades.length >= 25, `so ${entidades.length} entidades varridas, esperava >= 25`);
    const semRotulo = entidades.filter((e) => labels.rotularEntidade(e) === e);
    assert.deepStrictEqual(semRotulo, [], `entidades sem rotulo: ${JSON.stringify(semRotulo)}`);
  });

  // ── Step 4: os tres indices ───────────────────────────────────────────────────────────────
  await test('schema cria EXATAMENTE 3 indices em auditoria_log_almoxarifado', async () => {
    const db = new sqlite3.Database(':memory:');
    try {
      await initSchema(db);
      const linhas = await dbAll(db,
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='auditoria_log_almoxarifado'
         ORDER BY name`);
      // A tabela nao tem UNIQUE e o PK e o rowid, entao nao ha sqlite_autoindex_* inflando.
      assert.deepStrictEqual(linhas.map((l) => l.name), [
        'idx_auditoria_almox_created',
        'idx_auditoria_almox_entidade',
        'idx_auditoria_almox_usuario',
      ], `indices encontrados: ${JSON.stringify(linhas.map((l) => l.name))}`);
    } finally {
      await new Promise((r) => db.close(r));
    }
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
