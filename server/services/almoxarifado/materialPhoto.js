const path = require('path');

const MATERIAL_PHOTO_API_PREFIX = '/api/uploads/almoxarifado/';

function materialPhotoFilename(foto) {
  if (!foto || !String(foto).trim()) return null;
  return path.basename(String(foto).trim().replace(/\\/g, '/'));
}

function materialPhotoUrl(foto) {
  const filename = materialPhotoFilename(foto);
  return filename ? `${MATERIAL_PHOTO_API_PREFIX}${filename}` : null;
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
  MATERIAL_PHOTO_API_PREFIX,
  materialPhotoFilename,
  materialPhotoUrl,
  enrichMaterialRow,
  enrichMaterialRows,
};
