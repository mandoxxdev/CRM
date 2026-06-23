const {
  materialPhotoFilename,
  materialPhotoUrl,
  enrichMaterialRow,
} = require('../services/almoxarifado/materialPhoto');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}`);
    throw e;
  }
}

async function run() {
  console.log('materialPhoto tests');

  test('materialPhotoFilename extracts from legacy path', () => {
    const fn = materialPhotoFilename('/uploads/almoxarifado/material-123.jpg');
    if (fn !== 'material-123.jpg') throw new Error(`expected material-123.jpg, got ${fn}`);
  });

  test('materialPhotoFilename keeps plain filename', () => {
    const fn = materialPhotoFilename('material-456.png');
    if (fn !== 'material-456.png') throw new Error(`expected material-456.png, got ${fn}`);
  });

  test('materialPhotoUrl builds api path', () => {
    const url = materialPhotoUrl('/uploads/almoxarifado/material-123.jpg');
    if (url !== '/api/uploads/almoxarifado/material-123.jpg') throw new Error(url);
  });

  test('enrichMaterialRow normalizes foto and foto_url', () => {
    const row = enrichMaterialRow({ id: 1, nome: 'Folha A4', foto: '/uploads/almoxarifado/x.webp' });
    if (row.foto_url !== '/api/uploads/almoxarifado/x.webp') throw new Error(row.foto_url);
    if (row.foto !== '/api/uploads/almoxarifado/x.webp') throw new Error(row.foto);
  });

  test('enrichMaterialRow handles empty foto', () => {
    const row = enrichMaterialRow({ id: 1, foto: null });
    if (row.foto_url !== null) throw new Error('expected null foto_url');
  });
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
