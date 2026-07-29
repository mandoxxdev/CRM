'use strict';
const path = require('path');
const fs = require('fs');

// Pasta persistente (volume Docker/Coolify: /app/server/data)
// __dirname aqui é server/config/, então '..' aponta para server/
//
// CRM_DATA_DIR permite tirar o banco (e os uploads) de dentro da pasta do projeto.
// Isso existe por um motivo concreto: quando o projeto mora numa pasta sincronizada
// pelo OneDrive, o SQLite fica sujeito a corrupção — o OneDrive lê/bloqueia/reenvia o
// arquivo no meio de uma escrita, e os companheiros -wal e -shm sobem dessincronizados
// do arquivo principal. É a causa clássica de "o banco caiu" logo depois de uma rajada
// de gravações. Ver services/dbRecovery.js e o aviso impresso em index.js.
//
// Uso (Windows): defina CRM_DATA_DIR=C:\CRM-GMP\data antes de subir o servidor.
// Em Docker/Coolify não precisa: o volume já fica fora de qualquer sincronizador.
const PERSISTENT_DATA_DIR = (process.env.CRM_DATA_DIR && String(process.env.CRM_DATA_DIR).trim())
  ? path.resolve(String(process.env.CRM_DATA_DIR).trim())
  : path.join(__dirname, '..', 'data');
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
