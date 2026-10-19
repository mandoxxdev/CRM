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
 * Os registros que o texto nao ve (um VERBO por receptor apelidado com o caminho num identificador — `apelido.get(IDENT)` —, app[verbo]
 * escondido, o verbo search, arquivo sem extensao ou em tests/) ficam com a leitura das camadas do Express de verdade
 * (despejaCamadasDoExpress.js). O `.use(` nao literal, por qualquer receptor (apelido inclusive), o `.use` com um caminho literal que vale
 * para toda a API (`'/'`, `''`, `'*'`, `'/api'`), o `use?.(` e o `.use.bind(` o texto ve desde a Etapa 155 (RN-155.05, Fase 5 r1/r2 A1):
 * esses middlewares as camadas nao acusam (rodam no caminho neutro, na mesma posicao). Escapam ainda as formas que so se escrevem de
 * proposito: o nome montado (`app['us' + 'e']`), o escape de unicode no identificador, o comentario entre o `use` e o `(`.
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

// Medidos (Etapa 151, conferidos de novo na 152): 4 middlewares sem caminho, o router dos modulos (sem prefixo) e um comentario. Etapa 155
// (RN-155.05): o `.use(` por qualquer receptor acrescentou o middleware de login do socket.io (`io.use`, nao e o Express).
// E (Fase 5 r1 A1, r2 A1) os 5 `app.use('/api', ...)` — o caminho literal que vale para toda a API.
const REGISTROS_NAO_LITERAIS_MEDIDOS = [
  `${path.join('services', 'chat', 'socket.js')}: io.use(criarAuthSocket(jwtSecret, db));`,
  "index.js: app.use('/api', rateLimit);", "index.js: app.use('/api', (req, res, next) => {", "index.js: app.use('/api', tratarErroFormatoImagem);",
  "index.js: app.use('/api', tratarArquivoGrandeDemais);", "index.js: app.use('/api', tratarErroGlobalApi);",
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
      /\b(app|router|r|\w*[Rr]outer)\.(get|post|put|patch|delete|all|route)\(\s*[^\s'"`[)]/g,
      // Etapa 155 (RN-155.05, Fase 5 r3 R2 da 154): o `.use(` por QUALQUER receptor — ou sem receptor colado — com o 1o argumento que nao e
      // texto literal (funcao, identificador, chamada, lista). Um middleware GLOBAL por apelido (`const apelido = app; apelido.use(fn)`), por
      // parametro com outro nome, encadeado (`app.use(a).use(b)`), com quebra de linha antes do `.use`, `?.use` ou `(apelido).use` escapava da
      // regex de cima (so `app|router|r|*Router`) e das camadas (um global roda no caminho neutro, na mesma posicao). Medido no servidor: os 7 da
      // lista (o `io.use` do socket.io entrou). Custo declarado: um `.use(` novo de biblioteca (`passport.use(new …)`) derruba os testes da
      // regua — de proposito: alguem confere e o acrescenta a REGISTROS_NAO_LITERAIS_MEDIDOS.
      /\.\s*use\s*\(\s*[^\s'"`)]/g,
      // Etapa 155 (Fase 5 r1 A1, r2 A1): o `.use` com um caminho LITERAL que vale para toda a API — `'/'`, `''`, `'*'`, `'/api'` (com ou sem a
      // barra final, em qualquer caixa) — tambem roda no caminho neutro das camadas (`/api/zz-neutro-NNN`), na mesma posicao: escapava das
      // duas reguas. Os 5 `app.use('/api', ...)` de hoje (o limite de pedidos, o de antes das rotas e os 3 tratadores de erro) estao na lista
      // medida. E a chamada opcional (`apelido.use?.(fn)`) e o `.use.bind(` (o `bind` dos verbos fica de fora pelo `db.get.bind` — o do `use`
      // nao conflita).
      /\.\s*use\s*\(\s*(["'`])(\/?|\*|\/api\/?)\1/gi,
      /\.\s*use\s*\?\.\s*\(/g,
      /\.\s*use\s*\.\s*bind\s*\(/g,
      // Etapa 153 (Fase 5 r3, familia 1): o registro por `.call`/`.apply` (`app.get.call(app, '/api/...', ...)`), em qualquer receptor (o
      // `.bind` fica de fora: o servidor faz `db.get.bind(db)` no sqliteConcurrency — a leitura das camadas cobre o registro por bind)
      /\b\w+\.(get|post|put|patch|delete|all|use|route|search|param)\.(call|apply)\(/g,
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
