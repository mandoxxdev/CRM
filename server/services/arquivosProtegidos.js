/**
 * Etapa 81 — arquivos que so saem com login (B36).
 *
 * Antes, o PDF da OS (`/uploads/ordens-servico`) e o modelo de contrato (`/api/uploads/contrato`)
 * eram servidos por `express.static` SEM autenticacao: quem adivinhasse o nome
 * (`OS_<numero>_<ms>.pdf`) baixava o PDF com cliente, itens e valores. As montagens sairam do
 * index.js; estes handlers sao registrados la atras do `authenticateToken`.
 *
 * Fabricas com `db` e pasta injetados para o teste exercitar o mecanismo de verdade
 * (tests/api/uploadsProtegidos.api.test.js) sem subir o index.js inteiro.
 */
const fs = require('fs');
const path = require('path');
const contentDisposition = require('content-disposition');

const ERRO_PDF_OS = 'PDF da OS não encontrado';
const ERRO_CONTRATO = 'Contrato não encontrado';

// O multer do contrato (index.js, storageContrato) troca tudo que nao e [A-Za-z0-9_-] por `_` e
// prefixa `contrato_<ms>_`; o padrao casa todo nome que ele gera, e nada com barra ou `..` sozinho.
const NOME_CONTRATO = /^contrato_[\w.\- ]+$/;

/** Arquivo comum dentro de `dir` (sem seguir para fora dela), ou null. */
function arquivoNaPasta(dir, nome) {
  if (!nome || nome === '.' || nome === '..') return null;
  const alvo = path.join(dir, nome);
  if (path.dirname(alvo) !== path.resolve(dir)) return null;
  try { return fs.statSync(alvo).isFile() ? alvo : null; } catch (_) { return null; }
}

// Achado da revisao adversarial: sem `cacheControl: false` o sendFile poe `Cache-Control: public,
// max-age=0` — `public` deixa proxy/cache compartilhado guardar um arquivo que so sai com login.
const CABECALHOS_PROTEGIDOS = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

function enviar(res, alvo, headers, erro) {
  res.sendFile(alvo, {
    headers: { ...CABECALHOS_PROTEGIDOS, ...headers }, cacheControl: false, dotfiles: 'allow',
  }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: erro });
  });
}

/**
 * RN-81.01 — GET /api/operacional/ordens-servico/:id/pdf. Le o `pdf_url` gravado pelo gerar-pdf
 * e usa SO o basename. O `numero_os` e texto livre: `"` ou caractere acima de U+00FF (travessao
 * colado do Word) num `Content-Disposition` montado a mao dava 500/ERR_INVALID_CHAR — por isso o
 * cabecalho sai do encoder `content-disposition` (filename ASCII + filename* UTF-8).
 */
function criarServirPdfOs({ db, uploadsOSDir }) {
  return (req, res) => {
    db.get('SELECT pdf_url FROM ordens_servico WHERE id = ?', [req.params.id], (err, os) => {
      if (err) return res.status(500).json({ error: err.message });
      const nome = os && os.pdf_url ? path.basename(String(os.pdf_url)) : null;
      const alvo = nome && arquivoNaPasta(uploadsOSDir, nome);
      if (!alvo) return res.status(404).json({ error: ERRO_PDF_OS });
      enviar(res, alvo, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(nome, { type: 'inline' }),
      }, ERRO_PDF_OS);
    });
  };
}

/**
 * RN-81.02 — GET /api/proposta-template/contrato-anexo/:arquivo. So sai o arquivo que e o
 * `contrato_anexo_url` de alguma linha de `proposta_template_config`: "Remover contrato" so zera
 * a coluna e deixa o arquivo no disco — sem esta regra o contrato removido continuaria baixavel.
 */
function criarServirContratoAnexo({ db, uploadsContratoDir }) {
  return (req, res) => {
    const nome = path.basename(String(req.params.arquivo || ''));
    if (nome !== req.params.arquivo || !NOME_CONTRATO.test(nome)) {
      return res.status(404).json({ error: ERRO_CONTRATO });
    }
    db.get('SELECT 1 AS ok FROM proposta_template_config WHERE contrato_anexo_url = ? LIMIT 1', [nome], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      const alvo = row && arquivoNaPasta(uploadsContratoDir, nome);
      if (!alvo) return res.status(404).json({ error: ERRO_CONTRATO });
      res.type(path.extname(nome));
      enviar(res, alvo, { 'Content-Disposition': contentDisposition(nome) }, ERRO_CONTRATO);
    });
  };
}

module.exports = { criarServirPdfOs, criarServirContratoAnexo, NOME_CONTRATO };
