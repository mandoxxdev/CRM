// Regressão do bug de produção: cabeçalho/rodapé apareciam como IMAGEM FIXA legada
// (CBC2), escondendo o cabeçalho montado do modelo DOCX — e com ele o "Nº da proposta".
//
// Causa original: proposta_template_config.header_image_url/footer_image_url apontavam para
// arquivos que existiam no volume de produção. Quando o arquivo existia, o template escondia
// .page-header-inner (onde vive o número) e renderizava a imagem por cima. No local os mesmos
// registros existiam, mas os arquivos não — daí o cabeçalho parecer correto só na máquina do dev.
//
// Decisão: o suporte a cabeçalho/rodapé por imagem foi REMOVIDO do template. Estas colunas
// permanecem no banco, mas são ignoradas. Este teste trava esse contrato usando arquivos que
// EXISTEM no disco — que é exatamente a condição em que o bug se manifestava.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { uploadsHeaderDir, uploadsFooterDir } = require('../config/paths');

let passed = 0, failed = 0;
function test(n, f) { try { f(); passed++; console.log('  ✓ ' + n); } catch (e) { failed++; console.error('  ✗ ' + n + ': ' + e.message); } }

// PNG 1x1 válido — precisa ser um arquivo real para reproduzir a condição de produção.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const headerFile = '__test_header_legado.png';
const footerFile = '__test_footer_legado.png';
const headerPath = path.join(uploadsHeaderDir, headerFile);
const footerPath = path.join(uploadsFooterDir, footerFile);

fs.writeFileSync(headerPath, PNG_1X1);
fs.writeFileSync(footerPath, PNG_1X1);

try {
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: 'PROP-777' },
    [],
    { total: 0 },
    { header_image_url: headerFile, footer_image_url: footerFile },
    null,
    false,
    true
  );

  test('numero da proposta aparece mesmo com header_image_url apontando para arquivo existente', () => {
    assert(html.includes('Nº PROP-777'), 'faltou o numero da proposta');
    assert(html.includes('page-header-num'), 'faltou o elemento do numero');
  });

  test('page-header-inner NAO e escondido pela config de imagem', () => {
    assert(
      !/class="page-header-inner"[^>]*display:none/.test(html),
      'cabecalho montado foi escondido — a imagem legada voltou a ter precedencia'
    );
  });

  test('page-footer-inner NAO e escondido pela config de imagem', () => {
    assert(
      !/class="page-footer-inner"[^>]*display:none/.test(html),
      'rodape montado foi escondido — a imagem legada voltou a ter precedencia'
    );
  });

  test('nenhuma <img> de cabecalho/rodape por imagem e renderizada', () => {
    assert(!html.includes('class="header-image"'), 'ainda renderiza <img class="header-image">');
    assert(!html.includes('class="footer-image"'), 'ainda renderiza <img class="footer-image">');
  });

  test('conteudo montado do rodape (empresa + paginacao) esta presente', () => {
    // Compara o TEXTO do rodape, sem as tags: o que importa e o conteudo estar la, nao a
    // marcacao inline. Antes a assercao casava a string crua e quebrava so por alguem
    // envolver os termos em <strong>, sem nada de errado com o rodape.
    const texto = html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    assert(texto.includes('MOINHO YPIRANGA | CNPJ'), 'faltou a linha da empresa no rodape');
    assert(html.includes('js-page-number') && html.includes('js-page-count'), 'faltou a paginacao Pag. X/Y');
  });
} finally {
  fs.unlinkSync(headerPath);
  fs.unlinkSync(footerPath);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
