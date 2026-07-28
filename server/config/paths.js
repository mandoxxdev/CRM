'use strict';
const path = require('path');
const fs = require('fs');

// Pasta persistente (volume Docker/Coolify: /app/server/data)
// __dirname aqui é server/config/, então '..' aponta para server/
const PERSISTENT_DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(PERSISTENT_DATA_DIR)) {
  fs.mkdirSync(PERSISTENT_DATA_DIR, { recursive: true });
}

const mkd = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); return p; };

const uploadsDir                 = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'cotacoes'));
const uploadsComprovantesDir     = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'comprovantes-viagens'));
const uploadsProdutosDir         = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'produtos'));
const uploadsMateriaisEscritorioDir = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'materiais-escritorio'));
const uploadsFamiliasDir         = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'familias-produtos'));
const uploadsGruposDir           = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'grupos-produtos'));
const uploadsGruposComprasDir    = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'grupos-compras'));
const uploadsFornecedoresDir     = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'fornecedores'));
const uploadsLogosDir            = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'logos'));
const uploadsAvataresDir         = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'avatares'));
const uploadsChatDir             = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'chat'));
const uploadsHeaderDir           = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'headers'));
const uploadsFooterDir           = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'footers'));
const uploadsCoverDir            = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'covers'));
const uploadsContratoDir         = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'contrato'));
const uploadsOSDir               = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'ordens-servico'));
const uploadsPropostasPdfDir     = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'propostas'));
const uploadsPropostaFotosDir    = mkd(path.join(PERSISTENT_DATA_DIR, 'uploads', 'proposta-fotos'));

module.exports = {
  PERSISTENT_DATA_DIR,
  uploadsDir,
  uploadsComprovantesDir,
  uploadsProdutosDir,
  uploadsMateriaisEscritorioDir,
  uploadsFamiliasDir,
  uploadsGruposDir,
  uploadsGruposComprasDir,
  uploadsFornecedoresDir,
  uploadsLogosDir,
  uploadsAvataresDir,
  uploadsChatDir,
  uploadsHeaderDir,
  uploadsFooterDir,
  uploadsCoverDir,
  uploadsContratoDir,
  uploadsOSDir,
  uploadsPropostasPdfDir,
  uploadsPropostaFotosDir,
};
