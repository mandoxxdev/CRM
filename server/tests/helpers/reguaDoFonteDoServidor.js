/**
 * Etapa 152 (T3, retro da 151) — a regua do fonte de TODO o servidor, para os testes de portao das etapas 148 a 152.
 *
 * Os testes de portao provam pelo fonte que cada rota protegida tem o portao como 2o middleware. Essa regua so le registros escritos como
 * `app.<verbo>('<caminho literal>', ...)`. Um registro cujo caminho NAO e texto literal (app['post'], o caminho num identificador, um
 * router montado por variavel, um caminho concatenado ou em template) escapa dela — a rota nasceria sem portao e o teste continuaria verde.
 * A 151 fechou isso para os quatro prefixos dela (clientesProjetosPortao, inline); aqui a mesma regua, parametrizada pelos caminhos que cada
 * teste protege, para os outros.
 *
 *   registrosNaoLiterais(caminhosProtegidos)  todo registro de app/router cujo caminho nao e texto literal, e todo caminho montado cujo
 *                                             trecho fixo do comeco pode virar um dos caminhos protegidos (com ou sem o /api), em
 *                                             `<arquivo>: <linha>` ordenado — compare com REGISTROS_NAO_LITERAIS_MEDIDOS
 *   registrosForaDoIndex(re)                  { fora, vistos }: os arquivos do servidor (fora o index.js) cujo texto casa `re` (uma regex ou
 *                                             uma funcao do texto), e todos os
 *                                             que a varredura leu (para provar que ela enxerga routes/ e services/)
 *
 * `raiz` (opcional) troca a pasta varrida — o controle positivo do proprio helper (custosViagensPortao) roda sobre fontes sinteticas.
 * Os registros que o texto nao ve (receptor apelidado, app[verbo], .call, o verbo search, arquivo sem extensao ou em tests/) ficam
 * com a leitura das camadas do Express de verdade (despejaCamadasDoExpress.js).
 * A varredura le .js, .cjs e .mjs, inclusive o arquivo que comeca com ponto, e pula node_modules, tests, data, uploads, backups e .git.
 */
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..', '..');
const PULAR = ['node_modules', 'tests', 'data', 'uploads', 'backups', '.git'];

function arquivosDoServidor(raiz = SERVER_DIR) {
  const out = [];
  const andar = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (PULAR.includes(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) andar(p);
      else if (/\.(c|m)?js$/.test(e.name)) out.push({ rel: path.relative(raiz, p), src: fs.readFileSync(p, 'utf8') });
    }
  };
  andar(raiz);
  return out;
}

// Medidos (Etapa 151, conferidos de novo na 152): 4 middlewares sem caminho, o router dos modulos (sem prefixo) e um comentario.
const REGISTROS_NAO_LITERAIS_MEDIDOS = [
  'index.js: app.use((req, res, next) => {', "index.js: app.use(cors({ exposedHeaders: ['Content-Disposition'] }));",
  "index.js: app.use(express.json({ limit: '15mb' }));", 'index.js: app.use(express.static(clientBuildPath, { etag: true, lastModified: true, maxAge: 0 }));',
  'index.js: app.use(rotasModulos);',
  `${path.join('services', 'almoxarifado', 'origemRequisicao.js')}: * \`authenticateToken\` faz \`req.user = user\`, SUBSTITUINDO o objeto. Um \`app.use(prefixo, ...,`,
].sort();

const canon = (s) => s.toLowerCase().replace(/^\/api(?=\/)/, '');

function registrosNaoLiterais(caminhosProtegidos, { raiz } = {}) {
  if (!Array.isArray(caminhosProtegidos) || caminhosProtegidos.length === 0) throw new Error('registrosNaoLiterais: diga os caminhos protegidos');
  const protegidos = caminhosProtegidos.map((c) => canon(c.replace(/\/+$/, '')) + '/');
  const achados = [];
  for (const { rel, src } of arquivosDoServidor(raiz)) {
    const linhas = src.split('\n');
    const linhaDe = (i) => linhas[src.slice(0, i).split('\n').length - 1].trim();
    const res = [
      /\b\w+\s*\[\s*["'`](get|post|put|patch|delete|all|use|route)["'`]\s*\]/g,
      /\b(app|router|r|\w*[Rr]outer)\.(get|post|put|patch|delete|all|use|route)\(\s*[^\s'"`[)]/g,
    ];
    for (const re of res) for (const m of src.matchAll(re)) achados.push(`${rel}: ${linhaDe(m.index)}`);
    // o caminho montado (concatenado ou em template), em qualquer receptor: passa so quando o trecho fixo do comeco (ate a ultima barra)
    // ja tira o caminho de todos os protegidos (os routers de frotas e producao montam `/api/frotas/${base}`, `/api/producao/${base}`)
    const reMontado = /\b(\w+)\.(get|post|put|patch|delete|all|use|route)\(\s*(?:["'`](\/[^"'`]*)["'`]\s*\+|`(\/[^`$]*)\$\{)/g;
    for (const m of src.matchAll(reMontado)) {
      const inicio = m[3] !== undefined ? m[3] : m[4];
      const fixo = canon(inicio.slice(0, inicio.lastIndexOf('/') + 1));
      if (protegidos.some((p) => p.startsWith(fixo) || fixo.startsWith(p))) achados.push(`${rel}: ${linhaDe(m.index)}`);
    }
  }
  return achados.sort();
}

function registrosForaDoIndex(re, { raiz } = {}) {
  const fora = []; const vistos = [];
  for (const { rel, src } of arquivosDoServidor(raiz)) {
    if (rel === 'index.js') continue;
    vistos.push(rel);
    const casa = typeof re === 'function' ? re(src) : re.test(src);
    if (typeof re !== 'function') re.lastIndex = 0;
    if (casa) fora.push(rel);
  }
  return { fora, vistos };
}

module.exports = { SERVER_DIR, arquivosDoServidor, registrosNaoLiterais, registrosForaDoIndex, REGISTROS_NAO_LITERAIS_MEDIDOS };
