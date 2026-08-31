/**
 * Numero de documento do almoxarifado — UM gerador so, para os quatro documentos (Etapa 31).
 *
 * Design: docs/superpowers/specs/2026-08-31-almoxarifado-etapa31-numeros-que-colidem-design.md
 * Plano:  docs/superpowers/plans/2026-08-31-almoxarifado-etapa31-numeros-que-colidem.md (C1)
 * Testes: server/tests/api/numeroDocumento.api.test.js
 *
 * ── O DEFEITO QUE ISTO CONSERTA ──────────────────────────────────────────────────────────────
 * Havia QUATRO copias divergentes de `Date.now().toString().slice(-N)` + um aleatorio curto
 * (`routes/almoxarifado.js` INV, `requisitionCreateService` REQ, `receiptService` REC,
 * `thirdPartyService` REM). Fatiar o milissegundo em DECIMAL faz o carimbo REPETIR a cada 10^N ms:
 * 16,7 minutos com `slice(-6)` e 27,78 horas com `slice(-8)`. Dois documentos criados nesses
 * intervalos, no mesmo offset de ms, disputavam 100 sufixos — e o `INV-` nao tinha aleatorio
 * nenhum, entao a colisao dele em criacao simultanea era CERTA. O usuario via `UNIQUE constraint
 * failed` cru, num fluxo que ele nao tinha como repetir com sucesso garantido.
 *
 * ── AS TRES DECISOES CONGELADAS ──────────────────────────────────────────────────────────────
 * 1. TEMPO em base36, o milissegundo INTEIRO, SEM `slice`. E o `slice` que fazia dar a volta.
 *    Sao 8 caracteres ate 2059-05-25 (`36^8 = 2.821.109.907.456` ms) e 9 dali em diante — o
 *    comprimento NAO e contrato, so o "nao da a volta" e. Por isso nada aqui nem nos chamadores
 *    fatia o numero por posicao, e `carimboTempo` e exportado para o teste comparar carimbos sem
 *    `slice`.
 * 2. ALEATORIO de 8 caracteres, produzido como 8 SORTEIOS independentes. A forma idiomatica
 *    `Math.random().toString(36).slice(2, 10)` esta PROIBIDA: quando o double tem representacao
 *    base36 curta ela devolve MENOS de 8 caracteres (e string vazia quando o sorteio e 0),
 *    encurtando o numero sem ninguem entender por que. Sao ~2,8x10^12 sufixos por milissegundo.
 * 3. RETRY curto como cinto de seguranca, nao como estrategia. Com a entropia de (2) ele nunca
 *    deve disparar; existe porque `numero` e `UNIQUE NOT NULL` nas quatro tabelas e um erro cru
 *    de SQLite na cara do operador e inaceitavel.
 *
 * ── A REGUA DA COLISAO E ESTREITA DE PROPOSITO ───────────────────────────────────────────────
 * `RE_COLISAO_NUMERO` casa APENAS um UNIQUE de coluna UNICA chamada `numero`. Qualquer outro erro
 * sobe INTACTO, ja na primeira tentativa. Duas razoes, as duas medidas:
 *   - `/numero/i` solto (e tambem `/UNIQUE constraint failed:[^\n]*\.numero(\s|,|$)/i`, que o
 *     plano propunha como "ancorada") casam TAMBEM com
 *     `UNIQUE constraint failed: series_almoxarifado.material_id, series_almoxarifado.numero`,
 *     porque essa mensagem tambem TERMINA em `.numero`. Serie NAO e documento: o numero de serie e
 *     digitado pelo operador, e retentar com outro numero gravaria algo que ele nao digitou.
 *   - engolir `UNIQUE` generico esconderia colisao de `nota_fiscal` atras de um retry mudo.
 * Mensagens reais medidas (sqlite3 5.1.x):
 *   `SQLITE_CONSTRAINT: UNIQUE constraint failed: remessas_terceiro_almoxarifado.numero`
 *   `SQLITE_CONSTRAINT: UNIQUE constraint failed: series_almoxarifado.material_id, series_almoxarifado.numero`
 *
 * ⚠️ NAO EMBRULHE ESTAS ESCRITAS AQUI (achado da revisao adversarial da Etapa 31). A regua casa
 * `numero` de coluna unica, e o banco CORE tem duas tabelas com exatamente essa forma que NAO sao
 * documento deste modulo: `pedidos_compra.numero` (`server/index.js:19159`) e `cotacoes.numero`
 * (`server/index.js:19173`). Hoje isso e INALCANCAVEL — nenhum `fn` passado a
 * `inserirComNumeroUnico` insere nelas —, mas o numero de pedido de compra e de cotacao e
 * DIGITADO pelo comprador, igual ao de serie. Embrulhar a criacao deles aqui faria o retry
 * reescrever em silencio um numero que uma pessoa escolheu, que e exatamente a falha que a
 * exclusao da serie existe para evitar. Documento novo que queira este helper precisa de numero
 * GERADO pelo sistema, nunca digitado.
 */

/** Tentativas de INSERT com numero novo antes de desistir (RN-04). */
const NUMERO_TENTATIVAS = 5;

/** Caracteres do sufixo aleatorio: base36 maiusculo. */
const ALEATORIO_CHARS = 8;

/**
 * Colisao de numero de DOCUMENTO: UNIQUE de UMA coluna chamada `numero`.
 * O `[A-Za-z0-9_]+\.numero\s*$` logo depois do `failed:` (sem `.*` no meio) e o que exclui o
 * UNIQUE COMPOSTO da serie — nele vem `series_almoxarifado.material_id,` antes.
 */
const RE_COLISAO_NUMERO = /UNIQUE constraint failed:\s*[A-Za-z0-9_]+\.numero\s*$/i;

/** Molde de erro traduzido do modulo (mesmo `erro()` de thirdPartyService/receiptService). */
const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

/**
 * Carimbo de tempo do numero: o milissegundo INTEIRO em base36 maiusculo.
 * Exportado para o teste da RN-02 comparar dois instantes sem fatiar o numero por posicao.
 */
function carimboTempo(ms) {
  return Number(ms).toString(36).toUpperCase();
}

function sufixoAleatorio() {
  let s = '';
  for (let i = 0; i < ALEATORIO_CHARS; i += 1) {
    s += Math.floor(Math.random() * 36).toString(36);
  }
  return s.toUpperCase();
}

/** `<PREFIXO>-<carimbo de tempo><8 aleatorios>` — 20 caracteres com prefixo de 3 (RN-01). */
function gerarNumeroDocumento(prefixo) {
  return `${String(prefixo).toUpperCase()}-${carimboTempo(Date.now())}${sufixoAleatorio()}`;
}

function ehColisaoDeNumero(err) {
  return !!err && RE_COLISAO_NUMERO.test(String(err.message || ''));
}

/**
 * Gera o numero, roda `fn(numero, db)` e retenta com numero NOVO enquanto o banco recusar por
 * colisao de `numero`, ate `NUMERO_TENTATIVAS` vezes.
 *
 * Devolve `{ numero, resultado }`, onde `numero` e o que VENCEU — pode ser o da 3a tentativa — e
 * `resultado` e o que o `fn` retornou (tipicamente o `{ lastID, changes }` do `dbRun`). Devolver o
 * numero e obrigatorio, e e a RN-07: os quatro chamadores usam o numero DEPOIS do INSERT (retorno
 * da rota, auditoria em `dados_novos`, impresso). Quem gerar o numero por fora e devolver esse
 * faria o papel impresso deixar de bater com a linha do banco quando o retry disparasse.
 *
 * `fn` tem de conter APENAS o INSERT do documento, e nada pode ser escrito ENTRE a geracao do
 * numero e o INSERT — o `fn` e re-executado por inteiro a cada tentativa. Escritas ANTERIORES ao
 * `fn` ficam FORA do retry e nao sao repetidas (o `ensureSetoresRequisicao` do REQ e uma delas, e
 * e idempotente).
 *
 * Nao ha reentrancia com o `writeChain` de `sqliteConcurrency.wrapDatabase`: cada tentativa so
 * comeca depois que a anterior REJEITOU, entao o retry fica por fora da fila de escrita, nunca
 * dentro dela.
 */
async function inserirComNumeroUnico(db, prefixo, fn) {
  for (let tentativa = 1; tentativa <= NUMERO_TENTATIVAS; tentativa += 1) {
    const numero = gerarNumeroDocumento(prefixo);
    try {
      const resultado = await fn(numero, db);
      return { numero, resultado };
    } catch (e) {
      if (!ehColisaoDeNumero(e)) throw e;
    }
  }
  throw erro('Não foi possível gerar um número único para o documento', 500);
}

module.exports = {
  carimboTempo,
  gerarNumeroDocumento,
  inserirComNumeroUnico,
  NUMERO_TENTATIVAS,
  RE_COLISAO_NUMERO,
};
