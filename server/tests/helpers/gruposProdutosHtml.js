/**
 * Monta a tela de grupos de Produtos (client/src/components/GruposProdutos.js) com o CSS DO SISTEMA, na ordem em que o app o carrega
 * (index.js, depois App.js, depois o CSS da tela, que vem no pedaço da rota) — para medir no navegador sem subir o sistema.
 * A marcação é a do componente; se ele mudar, mude aqui também.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', '..', 'client', 'src');

/** Os `import './x.css'` de um arquivo, na ordem (só os do próprio projeto). */
function cssImportados(arquivo) {
  const txt = fs.readFileSync(path.join(SRC, arquivo), 'utf8');
  const base = path.dirname(path.join(SRC, arquivo));
  return [...txt.matchAll(/^import\s+'(\.[^']+\.css)';/gm)].map((m) => path.join(base, m[1]));
}

function cssDoSistema() {
  const arquivos = [...cssImportados('index.js'), ...cssImportados('App.js'), path.join(SRC, 'components', 'GruposProdutos.css')];
  return arquivos.map((f) => `/* ${path.basename(f)} */\n${fs.readFileSync(f, 'utf8')}`).join('\n');
}

const fotoDataUrl = (arquivo) => {
  const ext = path.extname(arquivo).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${fs.readFileSync(arquivo).toString('base64')}`;
};

/** grupos: [{ numero, nome, foto (caminho de arquivo ou null) }]. tema: 'light' | 'dark'. */
function htmlGruposProdutos(grupos, { tema = 'light' } = {}) {
  const cartoes = grupos.map((g, i) => `
    <div class="grupo-card grupo-card-theme-${i % 3}" role="button" tabindex="0">
      <div class="grupo-card-header">
        <div class="grupo-card-foto-wrap">${g.foto
          ? `<img src="${fotoDataUrl(g.foto)}" alt="${g.nome}" class="grupo-card-foto-img" />`
          : '<div class="grupo-card-placeholder"><svg width="56" height="56"></svg></div>'}</div>
        <div class="grupo-card-actions"><button type="button" class="btn-icon-grupo" title="Editar grupo"><svg width="18" height="18"></svg></button></div>
      </div>
      <div class="grupo-card-body">
        ${g.numero != null ? `<span class="grupo-card-numero">Nº ${g.numero}</span>` : ''}
        <div class="grupo-card-nome">${g.nome}</div>
        <span class="grupo-card-cta-label">Ver famílias <svg class="grupo-card-chevron" width="16" height="16"></svg></span>
      </div>
    </div>`).join('');
  return `<!doctype html><html data-theme="${tema}"><head><meta charset="utf-8"><style>${cssDoSistema()}</style></head>
  <body><div id="root"><div class="grupos-produtos">
    <div class="page-header grupos-header"><div><h1>Produtos</h1><p>Selecione um grupo para ver as famílias e produtos</p></div>
      <div class="grupos-header-actions"><button type="button" class="btn-novo-grupo">Adicionar grupo</button></div></div>
    <div class="grupos-grid">${cartoes}</div>
  </div></div></body></html>`;
}

module.exports = { htmlGruposProdutos, cssDoSistema };
