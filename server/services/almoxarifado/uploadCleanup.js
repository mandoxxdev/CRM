/**
 * Limpeza de upload orfao — Etapa 20 (C1).
 *
 * EXTRAIDO do closure de `routes/almoxarifado/extended.js:889` (era uma `function` local, nunca
 * exportada), sem mudanca de comportamento. Saiu de la porque `routes/almoxarifado.js` precisa
 * da MESMA limpeza na rota de foto de material e nao alcanca aquele closure — a extended e
 * registrada por um require() separado.
 *
 * O problema que isto resolve, em toda rota multipart: quando o handler roda, o multer JA
 * GRAVOU o arquivo em disco. Toda saida que nao for sucesso (400 do Zod, 403/404/409 de regra,
 * 500 de banco) precisa apagar esse arquivo — senao ele fica para sempre em
 * uploads/almoxarifado, sem nada no banco apontando pra ele.
 *
 * `dir` e PARAMETRO, nao constante do modulo: o diretorio e derivado de PERSISTENT_DATA_DIR em
 * runtime (`routes/almoxarifado.js:146`) e o harness de teste passa um temporario
 * (`tests/helpers/testApp.js`). Re-derivar aqui a partir de `config/paths.js` quebraria o
 * harness — a mesma armadilha ja documentada no comentario do multer da extended.
 *
 * Falha ao apagar SO LOGA (console.warn) e segue: o orfao e lixo, nao dado — deixar o erro do
 * unlink virar a resposta HTTP trocaria a mensagem util (o 404/400 real) por um erro de I/O.
 */
const fs = require('fs');
const path = require('path');

function limparUploadOrfao(req, dir) {
  // `req.file.filename` e nao so `req.file` — achado da revisao adversarial da Etapa 32. No ramo
  // de ERRO do multer (LIMIT_UNEXPECTED_FILE, por exemplo) o `req.file` existe SEM `filename`, e o
  // `path.join(dir, undefined)` lancava — a funcao virava um console.warn e a "defesa em
  // profundidade" que o chamador acredita ter nao existia. Reproduzido enviando dois arquivos no
  // mesmo campo. Preferir `req.file.path` quando o multer o fornece: e o caminho REAL do que ele
  // gravou, sem depender de o chamador passar o mesmo `dir`.
  if (!req || !req.file || !(req.file.filename || req.file.path)) return;
  try {
    fs.unlinkSync(req.file.filename ? path.join(dir, req.file.filename) : req.file.path);
  } catch (unlinkErr) {
    // Mensagem GENERICA de proposito: a versao antiga dizia "comprovante de sucata orfao" e ja
    // mentia para calibracao, ocorrencia e assinatura de entrega — quatro rotas usavam a mesma
    // funcao. Com a foto de material seriam cinco.
    console.warn('[almoxarifado] Falha ao limpar upload orfao:', unlinkErr.message);
  }
}

module.exports = { limparUploadOrfao };
