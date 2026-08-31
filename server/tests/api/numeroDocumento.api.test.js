/**
 * Etapa 31, Task 1 — o GERADOR DE NUMERO DE DOCUMENTO (`services/almoxarifado/numeroDoc.js`).
 *
 * Plano:  docs/superpowers/plans/2026-08-31-almoxarifado-etapa31-numeros-que-colidem.md (C1)
 * Design: docs/superpowers/specs/2026-08-31-almoxarifado-etapa31-numeros-que-colidem-design.md
 *
 * Prova RN-01 (forma), RN-02 (o carimbo de tempo NAO DA A VOLTA), RN-03 (mil numeros no MESMO
 * milissegundo sao mil numeros distintos), RN-04 (retry curto + erro traduzido) e RN-07 (o numero
 * devolvido e o VENCEDOR, nao o da primeira tentativa).
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────────────────────
 * Ate a Etapa 31 havia QUATRO geradores divergentes, todos com `Date.now().toString().slice(-N)`.
 * Fatiar o milissegundo em decimal faz o carimbo REPETIR a cada 10^N ms: 16,7 minutos com
 * `slice(-6)` (REQ) e 27,78 horas com `slice(-8)` (REC/REM/INV). Nao e preciso simultaneidade
 * nenhuma para colidir — bastam dois documentos criados com 16,7 minutos de diferenca no mesmo
 * offset de ms, disputando 100 sufixos.
 *
 * ── GUARDA ANTI-TESTE-VAZIO (as tres armadilhas que este arquivo evita de proposito) ─────────
 * 1. `numero.startsWith('REQ-')` — a UNICA assercao que a suite tinha sobre estes numeros
 *    (`requisicaoCriacao.api.test.js:103`) — passa IGUAL com o gerador velho. Por isso aqui a
 *    forma e aferida por regex COMPLETA, `/^REM-[0-9A-Z]{16}$/`.
 * 2. "rodei mil vezes e nao colidiu" nao prova nada sobre um evento de 1 em 100. Por isso o
 *    cenario (3) FIXA o relogio e CONTA distintos, em vez de torcer.
 * 3. Erro de colisao inventado a mao pode nao ser o erro que o SQLite emite. Por isso as tres
 *    fixtures de erro (`ERRO_NUMERO`, `ERRO_SERIE`, `ERRO_NF`) sao capturadas de INSERTs REAIS
 *    num banco `:memory:` com os nomes de tabela REAIS do modulo, e o setup afirma o texto de
 *    cada uma antes de qualquer cenario usa-la.
 *
 * ── COMO O RELOGIO E FIXADO ──────────────────────────────────────────────────────────────────
 * `tests/api/run-all.js` roda UM PROCESSO POR ARQUIVO, em sequencia, e nao ha jest aqui: um stub
 * global de `Date.now` fica contido neste arquivo. Sempre `const real = Date.now; ... finally
 * { Date.now = real; }`. O epoch usado e REALISTA (parte de um `Date.now()` de verdade) — com `t`
 * pequeno o carimbo tem menos de 8 caracteres e a assercao de comprimento desalinha por um motivo
 * que nao e o defeito.
 *
 * ── O `{16}` DA REGEX ────────────────────────────────────────────────────────────────────────
 * Sao 8 de tempo + 8 de aleatorio. Os 8 de tempo valem ate 2059-05-25 (36^8 ms desde o epoch);
 * depois o carimbo vira 9 caracteres e ESTA regex tem de crescer para {17}. Isso e proposital e
 * esta escrito aqui: o numero NAO e fatiado por posicao em lugar nenhum (Global Constraint 9), a
 * RN-02 compara carimbos via `carimboTempo(ms)` e nao por `slice`, e este comentario e o unico
 * lugar onde o "8" precisa ser revisto.
 *
 * Executar: cd server && node tests/api/numeroDocumento.api.test.js
 */
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { dbRun, dbGet } = require('../../services/almoxarifado/db');
const {
  carimboTempo,
  gerarNumeroDocumento,
  inserirComNumeroUnico,
  NUMERO_TENTATIVAS,
} = require('../../services/almoxarifado/numeroDoc');

let passed = 0; let failed = 0;
function test(name, fn) {
  return fn().then(() => { passed++; console.log(`  ✓ ${name}`); })
    .catch((e) => { failed++; console.error(`  ✗ ${name}: ${e.message}`); });
}

const TABELA = 'remessas_terceiro_almoxarifado';
const FORMA = (p) => new RegExp(`^${p}-[0-9A-Z]{16}$`);

/** Captura o erro REAL de um INSERT que TEM de falhar. Se ele passar, a fixture nao serve. */
function erroReal(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err
      ? resolve(err)
      : reject(new Error(`o INSERT da fixture NAO falhou (${sql}) — sem erro real os cenarios (5)..(8) mediriam nada`))));
  });
}

(async () => {
  console.log('\n=== Etapa 31 Task 1: gerador unico de numero de documento ===\n');

  const db = new sqlite3.Database(':memory:');

  // ── Fixtures de ERRO REAL, com os nomes de tabela REAIS do modulo ─────────────────────────
  await dbRun(db, `CREATE TABLE ${TABELA} (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    nota_fiscal TEXT UNIQUE
  )`);
  await dbRun(db, `CREATE TABLE series_almoxarifado (
    material_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    UNIQUE(material_id, numero)
  )`);

  await dbRun(db, `INSERT INTO ${TABELA} (numero) VALUES ('REM-FIXTURE-COLISAO')`);
  const ERRO_NUMERO = await erroReal(db, `INSERT INTO ${TABELA} (numero) VALUES ('REM-FIXTURE-COLISAO')`);

  await dbRun(db, `INSERT INTO series_almoxarifado (material_id, numero) VALUES (1, 'S-1')`);
  const ERRO_SERIE = await erroReal(db, `INSERT INTO series_almoxarifado (material_id, numero) VALUES (1, 'S-1')`);

  await dbRun(db, `INSERT INTO ${TABELA} (numero, nota_fiscal) VALUES ('REM-FIXTURE-NF', 'NF-1')`);
  const ERRO_NF = await erroReal(db, `INSERT INTO ${TABELA} (numero, nota_fiscal) VALUES ('REM-FIXTURE-NF-2', 'NF-1')`);

  // As tres fixtures sao afirmadas ANTES de qualquer cenario. Se uma versao nova do sqlite3 mudar
  // o texto, os cenarios (7) e (8) passariam VAZIOS (tudo viraria "nao e colisao") — este bloco
  // e o que faz a mudanca aparecer como vermelho aqui, e nao como silencio la.
  assert.strictEqual(ERRO_NUMERO.message,
    `SQLITE_CONSTRAINT: UNIQUE constraint failed: ${TABELA}.numero`,
    `a mensagem de colisao de NUMERO mudou: ${JSON.stringify(ERRO_NUMERO.message)}`);
  assert.strictEqual(ERRO_SERIE.message,
    'SQLITE_CONSTRAINT: UNIQUE constraint failed: series_almoxarifado.material_id, series_almoxarifado.numero',
    `a mensagem do UNIQUE COMPOSTO da serie mudou: ${JSON.stringify(ERRO_SERIE.message)}`);
  assert.strictEqual(ERRO_NF.message,
    `SQLITE_CONSTRAINT: UNIQUE constraint failed: ${TABELA}.nota_fiscal`,
    `a mensagem do UNIQUE de nota_fiscal mudou: ${JSON.stringify(ERRO_NF.message)}`);

  const inserir = (numero) => dbRun(db, `INSERT INTO ${TABELA} (numero) VALUES (?)`, [numero]);
  const numeroGravado = async (id) => (await dbGet(db, `SELECT numero FROM ${TABELA} WHERE id = ?`, [id])).numero;

  // ── (1) RN-01: a forma COMPLETA, nao so o prefixo ─────────────────────────────────────────
  await test('(1) RN-01 forma completa PREFIXO-<8 tempo><8 aleatorio>, tudo maiusculo, nos quatro prefixos', async () => {
    for (const prefixo of ['INV', 'REQ', 'REC', 'REM']) {
      const n = gerarNumeroDocumento(prefixo);
      assert.match(n, FORMA(prefixo),
        `${JSON.stringify(n)} nao casa ${FORMA(prefixo)} — o formato antigo era PREFIXO- + so digitos, `
        + 'e uma assercao de prefixo (startsWith) passaria com ele; esta cai');
      assert.strictEqual(n.length, 20,
        `${JSON.stringify(n)} tem ${n.length} caracteres, esperado 20 (3 prefixo + 1 hifen + 8 + 8)`);
    }

    // O aleatorio TEM de ser 8 SORTEIOS, nao `Math.random().toString(36).slice(2, 10)`: quando o
    // double tem representacao base36 curta (~2^-41 dos sorteios, e SEMPRE quando o valor e 0) o
    // slice devolve MENOS de 8 caracteres e o numero encolhe sem ninguem entender por que. Os dois
    // extremos abaixo sao exatamente esse caso.
    const real = Math.random;
    try {
      Math.random = () => 0;
      const zero = gerarNumeroDocumento('REM');
      assert.match(zero, FORMA('REM'),
        `com Math.random() === 0 o numero virou ${JSON.stringify(zero)} (${zero.length} chars) — sinal de `
        + 'que o aleatorio saiu de `Math.random().toString(36).slice(2, 10)`, que devolve string vazia aqui');

      Math.random = () => 0.999999999;
      const alto = gerarNumeroDocumento('REM');
      assert.match(alto, FORMA('REM'),
        `com Math.random() ~ 1 o numero virou ${JSON.stringify(alto)} — o sorteio saiu da faixa [0, 35] `
        + 'ou nao foi para maiuscula');
    } finally {
      Math.random = real;
    }
  });

  // ── (2) RN-02: o carimbo NAO DA A VOLTA — a prova que importa ─────────────────────────────
  await test('(2) RN-02 carimboTempo nao repete em t, t + 1e6 ms (16,7 min) e t + 1e8 ms (27,78 h)', async () => {
    // 1e6 ms = 16,7 minutos e 1e8 ms = 27,78 horas sao EXATAMENTE os dois periodos em que o
    // gerador antigo repetia o carimbo: `slice(-6)` (REQ) e `slice(-8)` (REC/REM/INV). Sao os dois
    // pares que precisam ser distintos; qualquer outro par e bonus.
    const t = Date.now(); // epoch realista, medido — com `t` pequeno o carimbo teria < 8 chars
    const a = carimboTempo(t);
    const b = carimboTempo(t + 1e6);
    const c = carimboTempo(t + 1e8);

    assert.notStrictEqual(a, b,
      `carimboTempo(t) === carimboTempo(t + 16,7 min) === ${JSON.stringify(a)} — o carimbo deu a volta, `
      + 'que e o defeito do `slice(-6)` do REQ');
    assert.notStrictEqual(a, c,
      `carimboTempo(t) === carimboTempo(t + 27,78 h) === ${JSON.stringify(a)} — o carimbo deu a volta, `
      + 'que e o defeito do `slice(-8)` de REC/REM/INV');
    assert.notStrictEqual(b, c, `carimboTempo(t + 1e6) === carimboTempo(t + 1e8) === ${JSON.stringify(b)}`);
    assert.strictEqual(new Set([a, b, c]).size, 3, `os tres carimbos nao sao tres: ${JSON.stringify([a, b, c])}`);

    // E, em varredura: 200 instantes espacados de 1e8 ms (232 dias de historia) sao 200 carimbos
    // distintos. Um `slice` por posicao colapsa isso para poucos valores.
    const varredura = new Set();
    for (let k = 0; k < 200; k++) varredura.add(carimboTempo(t + k * 1e8));
    assert.strictEqual(varredura.size, 200,
      `200 instantes distintos produziram ${varredura.size} carimbos — o carimbo esta dando a volta`);

    // O carimbo e funcao PURA do argumento (a RN-02 compara instantes, nao chamadas).
    assert.strictEqual(carimboTempo(t), a, 'carimboTempo(t) mudou entre duas chamadas — nao e funcao pura do ms');
  });

  // ── (3) RN-03: mil no MESMO milissegundo, relogio FIXADO ──────────────────────────────────
  /*
   * (2b) nasceu da revisao adversarial da Etapa 31, e existe porque a defesa da RN-02 estava
   * pendurada em UMA assercao so.
   *
   * O revisor sabotou `carimboTempo` para `String(ms).slice(-8)` — o carimbo VOLTA A DAR A VOLTA,
   * mas continua com 8 caracteres, todos em [0-9A-Z]. Placar dessa sabotagem: 7/1 aqui (so o
   * cenario (2)) e VERDE nos quatro arquivos de fluxo, porque as regexes /^INV-[0-9A-Z]{16}$/ e
   * irmas distinguem o gerador VELHO (que tinha outro comprimento) e NAO distinguem base36 de
   * decimal fatiado do mesmo tamanho. Quem um dia mexesse em `carimboTempo` e afrouxasse o (2)
   * reintroduziria a colisao com a suite inteira verde.
   *
   * A regua aqui e um INVARIANTE, nao um par de exemplos: o carimbo tem de ser REVERSIVEL. Se
   * `parseInt(carimbo, 36)` devolve o milissegundo de volta, nenhuma informacao foi perdida — e
   * "nao perde informacao" e exatamente o mesmo que "nao da a volta", so que impossivel de
   * satisfazer por acidente. Qualquer fatiamento reprova, em qualquer base e qualquer comprimento.
   */
  await test('(2b) RN-02 o carimbo e REVERSIVEL: parseInt(carimbo, 36) devolve o ms inteiro', async () => {
    const base = Date.now();
    const instantes = [base, base + 1, base + 1e6, base + 1e8, base + 4e10, 1e12, 2e12];
    for (const ms of instantes) {
      const carimbo = carimboTempo(ms);
      assert.strictEqual(parseInt(carimbo, 36), ms,
        `carimboTempo(${ms}) = ${JSON.stringify(carimbo)} nao volta para ${ms} — o carimbo perdeu `
        + 'informacao, e carimbo que perde informacao da a volta');
      assert.ok(/^[0-9A-Z]+$/.test(carimbo), `carimbo fora de base36 maiusculo: ${JSON.stringify(carimbo)}`);
    }
    // Metade positiva do invariante: dois instantes DIFERENTES nunca compartilham carimbo, e isso
    // segue da reversibilidade — se seguissem, `parseInt` nao teria como devolver os dois.
    assert.notStrictEqual(carimboTempo(base), carimboTempo(base + 1),
      'dois milissegundos consecutivos com o mesmo carimbo');
  });

  await test('(3) RN-03 mil chamadas no MESMO milissegundo produzem mil numeros distintos', async () => {
    const real = Date.now;
    const T = real(); // epoch realista, congelado
    Date.now = () => T;
    try {
      const numeros = [];
      for (let i = 0; i < 1000; i++) numeros.push(gerarNumeroDocumento('REQ'));

      // Guarda: prova que o stub PEGOU. Sem isto, mil distintos poderiam vir do relogio andando —
      // e o cenario mediria o relogio, nao a entropia. Comparado via carimboTempo, sem fatiar.
      const carimbo = carimboTempo(T);
      const forasteiro = numeros.find((n) => !n.startsWith(`REQ-${carimbo}`));
      assert.strictEqual(forasteiro, undefined,
        `o relogio nao ficou fixo: ${JSON.stringify(forasteiro)} nao comeca com REQ-${carimbo}`);

      assert.strictEqual(new Set(numeros).size, 1000,
        `${new Set(numeros).size} numeros distintos em 1000 chamadas no mesmo ms — a entropia do sufixo `
        + 'nao cobre criacao simultanea, que e o caso real de 1 em 100 desta etapa');
    } finally {
      Date.now = real;
    }
  });

  // ── (4) inserirComNumeroUnico sem colisao ─────────────────────────────────────────────────
  await test('(4) inserirComNumeroUnico sem colisao devolve { numero, resultado } e chama o fn UMA vez', async () => {
    let chamadas = 0;
    let recebido = null;

    const r = await inserirComNumeroUnico(db, 'REM', async (numero) => {
      chamadas += 1;
      recebido = numero;
      return inserir(numero);
    });

    assert.strictEqual(chamadas, 1, `o fn foi chamado ${chamadas} vezes sem nenhuma colisao`);
    assert.ok(r && typeof r === 'object', `devolveu ${JSON.stringify(r)}, esperado { numero, resultado }`);
    assert.match(r.numero, FORMA('REM'), `o numero devolvido nao tem a forma da RN-01: ${JSON.stringify(r.numero)}`);
    assert.strictEqual(r.numero, recebido,
      `devolveu ${JSON.stringify(r.numero)} mas o fn recebeu ${JSON.stringify(recebido)} — o numero devolvido `
      + 'tem de ser o que foi gravado (RN-07)');
    assert.ok(r.resultado, `nao devolveu o resultado do fn: ${JSON.stringify(r)}`);
    assert.strictEqual(typeof r.resultado.lastID, 'number',
      `resultado nao e o { lastID, changes } do dbRun: ${JSON.stringify(r.resultado)}`);
    assert.strictEqual(await numeroGravado(r.resultado.lastID), r.numero,
      'o numero devolvido nao e o que ficou GRAVADO na linha (RN-07)');
  });

  // ── (5) colisao nas duas primeiras, sucesso na terceira — RN-07 na unidade ────────────────
  await test('(5) colide 2x e vence na 3a: fn chamado 3x com numeros DIFERENTES e o devolvido e o TERCEIRO', async () => {
    const real = Date.now;
    const T = real();
    Date.now = () => T; // relogio FIXO: se os tres numeros sao distintos, foi o aleatorio que mudou
    try {
      const args = [];
      const r = await inserirComNumeroUnico(db, 'REM', async (numero) => {
        args.push(numero);
        if (args.length <= 2) throw ERRO_NUMERO;
        return inserir(numero);
      });

      assert.strictEqual(args.length, 3, `o fn foi chamado ${args.length} vezes, esperado 3`);
      assert.strictEqual(new Set(args).size, 3,
        `o retry reusou numero: ${JSON.stringify(args)} — retentar com o MESMO numero colide de novo para `
        + 'sempre, e o retry viraria enfeite');
      assert.strictEqual(r.numero, args[2],
        `devolveu ${JSON.stringify(r.numero)}, mas quem venceu foi ${JSON.stringify(args[2])} — devolver o numero `
        + 'da PRIMEIRA tentativa faz o papel impresso nao bater com a linha do banco (RN-07)');
      assert.notStrictEqual(r.numero, args[0], 'devolveu o numero da primeira tentativa (RN-07)');
      assert.strictEqual(await numeroGravado(r.resultado.lastID), r.numero,
        'o numero devolvido nao e o que ficou GRAVADO na linha (RN-07)');
    } finally {
      Date.now = real;
    }
  });

  // ── (6) esgotadas as tentativas: erro TRADUZIDO ───────────────────────────────────────────
  await test('(6) RN-04 esgotadas as 5 tentativas sobe erro traduzido 500, sem o texto cru do SQLite', async () => {
    assert.strictEqual(NUMERO_TENTATIVAS, 5, `NUMERO_TENTATIVAS = ${NUMERO_TENTATIVAS}, esperado 5`);

    let chamadas = 0;
    let capturado = null;
    try {
      await inserirComNumeroUnico(db, 'REM', async () => { chamadas += 1; throw ERRO_NUMERO; });
    } catch (e) { capturado = e; }

    assert.ok(capturado, 'cinco colisoes seguidas terminaram em SUCESSO — nada foi gravado e ninguem soube');
    assert.strictEqual(chamadas, NUMERO_TENTATIVAS,
      `o fn foi chamado ${chamadas} vezes, esperado ${NUMERO_TENTATIVAS}`);
    assert.strictEqual(capturado.message, 'Não foi possível gerar um número único para o documento',
      `mensagem ${JSON.stringify(capturado.message)} — o usuario veria erro de banco cru, num fluxo que ele nao `
      + 'tem como repetir com sucesso garantido');
    assert.strictEqual(capturado.status, 500, `status ${capturado.status}, esperado 500 (molde do erro() do modulo)`);
    assert.ok(!/UNIQUE constraint/i.test(capturado.message),
      `o texto cru do SQLite vazou na mensagem: ${JSON.stringify(capturado.message)}`);
    assert.ok(!/SQLITE/i.test(capturado.message),
      `o texto cru do SQLite vazou na mensagem: ${JSON.stringify(capturado.message)}`);
  });

  // ── (7) erro que NAO e colisao de numero sobe INTACTO, na primeira ────────────────────────
  await test('(7) UNIQUE de outra coluna (nota_fiscal) e erro comum sobem INTACTOS na 1a tentativa', async () => {
    for (const [nome, original] of [['nota_fiscal', ERRO_NF], ['erro comum', new Error('falha de rede')]]) {
      let chamadas = 0;
      let capturado = null;
      try {
        await inserirComNumeroUnico(db, 'REM', async () => { chamadas += 1; throw original; });
      } catch (e) { capturado = e; }

      assert.strictEqual(capturado, original,
        `[${nome}] o erro nao subiu INTACTO (mesmo objeto): ${capturado && capturado.message} — engolir UNIQUE `
        + 'generico esconderia colisao de nota_fiscal atras de um retry mudo');
      assert.strictEqual(chamadas, 1,
        `[${nome}] o fn foi chamado ${chamadas} vezes — retentar um erro que nao e colisao de numero repete a `
        + 'falha 5 vezes e atrasa a resposta sem motivo');
    }
  });

  // ── (8) a ANCORA da regua: o UNIQUE COMPOSTO da serie NAO e colisao de documento ──────────
  await test('(8) UNIQUE composto de series_almoxarifado (material_id, numero) sobe INTACTO', async () => {
    // Esta e a razao de a regua ser ancorada. A mensagem da serie TERMINA em `.numero`, entao
    // tanto `/numero/i` solto quanto a regua do plano (`/UNIQUE constraint failed:[^\n]*\.numero(\s|,|$)/i`)
    // casam com ela — medido. Se o retry cobrisse a serie, um numero de serie duplicado seria
    // reescrito em silencio com outro numero, que NAO e o que o operador digitou.
    let chamadas = 0;
    let capturado = null;
    try {
      await inserirComNumeroUnico(db, 'REM', async () => { chamadas += 1; throw ERRO_SERIE; });
    } catch (e) { capturado = e; }

    assert.strictEqual(capturado, ERRO_SERIE,
      `o UNIQUE da serie nao subiu intacto (${capturado && capturado.message}) — a regua do retry pegou uma `
      + 'colisao que NAO e de documento');
    assert.strictEqual(chamadas, 1,
      `o fn foi chamado ${chamadas} vezes com o UNIQUE COMPOSTO da serie — o retry passou a cobrir a serie`);
  });

  await new Promise((resolve) => db.close(resolve));
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
