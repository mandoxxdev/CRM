/**
 * Monta a lista de Clientes (client/src/components/Clientes.js, a tabela do computador) com o CSS DO SISTEMA, na ordem do app, dentro do
 * `.layout > .main-content` (o tema escopa as regras da tabela em `html .layout`) — para medir no navegador sem subir o sistema.
 * A marcação é a do componente; se ele mudar, mude aqui também.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', '..', 'client', 'src');

function cssImportados(arquivo) {
  const txt = fs.readFileSync(path.join(SRC, arquivo), 'utf8');
  const base = path.dirname(path.join(SRC, arquivo));
  return [...txt.matchAll(/^import\s+'(\.[^']+\.css)';/gm)].map((m) => path.join(base, m[1]));
}
function cssDoSistema(extras) {
  const arquivos = [...cssImportados('index.js'), ...cssImportados('App.js'), ...extras.map((e) => path.join(SRC, e))];
  return arquivos.map((f) => `/* ${path.basename(f)} */\n${fs.readFileSync(f, 'utf8')}`).join('\n');
}
// O ícone como o react-icons desenha (stroke = currentColor).
const icone = '<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" height="1em" width="1em"><path d="M11 4H4v16h16v-7"></path><path d="M18.5 2.5l3 3L12 15H9v-3z"></path></svg>';

/** clientes: [{ razao_social, nome_fantasia, cnpj, segmento, contato_principal, email, logo (data URL ou null) }] */
function htmlClientes(clientes, { tema = 'light' } = {}) {
  const linhas = clientes.map((c) => `
    <tr>
      <td><span class="cli-td-nome">${c.logo
        ? `<img class="cli-logo-mini" src="${c.logo}" alt="" />`
        : `<span class="cli-logo-ini" aria-hidden="true">${(c.nome_fantasia || c.razao_social).charAt(0)}</span>`}<span>${c.razao_social}</span></span></td>
      <td>${c.nome_fantasia || '-'}</td>
      <td>${c.cnpj || '-'}</td>
      <td><span class="badge">${c.segmento || '-'}</span></td>
      <td><div>${c.contato_principal || '-'}</div><div class="text-muted">${c.email || '-'}</div></td>
      <td><span class="status-badge ativo">Ativo</span></td>
      <td><div class="action-buttons"><a href="#" class="btn-icon" title="Editar">${icone}</a><button class="btn-icon btn-danger" title="Desativar">${icone}</button></div></td>
    </tr>`).join('');
  return `<!doctype html><html data-theme="${tema}"><head><meta charset="utf-8"><style>${cssDoSistema(['components/Clientes.css'])}</style></head>
  <body><div id="root"><div class="layout"><div class="main-content"><div class="clientes">
    <div class="page-header"><div><h1>Clientes</h1><p>Gestão de clientes da GMP INDUSTRIAIS</p></div></div>
    <div class="table-container"><table class="data-table"><thead><tr><th>Razão Social</th><th>Nome Fantasia</th><th>CNPJ</th><th>Segmento</th>
      <th>Contato</th><th>Status</th><th>Ações</th></tr></thead><tbody>${linhas}</tbody></table></div>
  </div></div></div></div></body></html>`;
}

module.exports = { htmlClientes, cssDoSistema };
