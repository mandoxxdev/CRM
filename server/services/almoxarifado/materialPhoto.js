const path = require('path');

/**
 * Onde a URL de arquivo de upload do almoxarifado é MINADA — Etapa 33 (furo C42).
 *
 * Este módulo era só um montador de string (`prefixo + nome`) e o prefixo era exportado, então
 * qualquer serviço remontava a URL por conta própria — foi assim que `deliverySignatureService`
 * passou a emitir a URL da assinatura de entrega sem nunca chamar `materialPhotoUrl`.
 *
 * A partir da Etapa 33 a URL precisa de ASSINATURA, e por isso este passa a ser o **único ponto de
 * mintagem do módulo**: `MATERIAL_PHOTO_API_PREFIX` **saiu do `module.exports` de propósito** —
 * enquanto ele fosse exportável, um serviço poderia montar `prefixo + nome` e devolver URL sem
 * assinatura, com a suíte inteira verde. O guard de "lançar sem assinador" só vale se ninguém
 * conseguir contornar o assinador.
 */

// PRIVADO. Ver o parágrafo acima antes de exportar isto de novo.
const MATERIAL_PHOTO_API_PREFIX = '/api/uploads/almoxarifado/';

let assinador = null;

/**
 * Chamado UMA vez, no registrador das rotas. É estado global de processo, e a escolha é
 * consciente: `materialPhotoUrl` é consumido por 6 call sites de rota, e passar o assinador em
 * todos eles seria invasivo sem ganho. A alternativa está registrada na letra B.
 */
function configurarAssinador(novo) {
  assinador = novo;
}

function materialPhotoFilename(foto) {
  if (!foto || !String(foto).trim()) return null;
  return path.basename(String(foto).trim().replace(/\\/g, '/'));
}

function materialPhotoUrl(foto) {
  const filename = materialPhotoFilename(foto);
  if (!filename) return null;
  // LANÇA em vez de devolver URL crua. Devolver `prefixo + nome` sem assinatura seria o furo C42
  // de volta — e de volta em SILÊNCIO, porque a resposta continuaria parecendo certa e só a imagem
  // quebraria na tela. Falhar alto no boot é o comportamento que se quer aqui.
  if (!assinador) {
    throw new Error('materialPhoto: assinador nao configurado — chame configurarAssinador() no boot');
  }
  return assinador.assinar(filename);
}

function enrichMaterialRow(row) {
  if (!row) return row;
  const url = materialPhotoUrl(row.foto);
  if (!url) return { ...row, foto_url: null };
  return { ...row, foto: url, foto_url: url };
}

function enrichMaterialRows(rows) {
  return (rows || []).map(enrichMaterialRow);
}

module.exports = {
  configurarAssinador,
  materialPhotoFilename,
  materialPhotoUrl,
  enrichMaterialRow,
  enrichMaterialRows,
};
