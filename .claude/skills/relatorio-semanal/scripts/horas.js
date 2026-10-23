#!/usr/bin/env node
// Estima horas trabalhadas a partir do historico do git e separa o tempo em
// "tela" (client/), "bastidores" (server/), "testes" e "documentacao".
//
// Uso: node .claude/skills/relatorio-semanal/scripts/horas.js [--semana AAAA-MM-DD] [--desde AAAA-MM-DD] [--ate AAAA-MM-DD]
//        [--autor texto] [--pausa 90] [--aquecimento 30] [--json]
//
// Como estima: commits do mesmo autor com menos de --pausa minutos entre si sao uma
// sessao. A sessao vale (ultimo - primeiro commit) + --aquecimento minutos (o trabalho
// antes do primeiro commit). Cada commit leva o tempo desde o commit anterior da sessao
// (o primeiro leva o aquecimento), dividido entre as areas pelas linhas alteradas.
// E uma ESTIMATIVA por baixo: pesquisa, reuniao e teste manual sem commit nao aparecem.
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
const opt = (nome, padrao) => {
  const i = args.indexOf('--' + nome);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : padrao;
};
// A semana vai de domingo a sabado. --semana AAAA-MM-DD pega a semana que contem
// esse dia; sem nada, a semana corrente. --desde/--ate sobrepoem o recorte.
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const diaRef = opt('semana', null);
const ref = diaRef ? new Date(`${diaRef}T12:00:00`) : new Date();
const domingo = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() - ref.getDay());
const sabado = new Date(domingo.getFullYear(), domingo.getMonth(), domingo.getDate() + 6);
const desde = opt('desde', iso(domingo));
const ate = opt('ate', iso(sabado));
const autorFiltro = opt('autor', null);
const pausaMin = Number(opt('pausa', 90));
const aquecMin = Number(opt('aquecimento', 30));
const comoJson = args.includes('--json');

// Identidades do mesmo dono (ver memoria "duas identidades git do Andre").
const APELIDOS = { mandoxxdev: 'Andre Melo' };

function area(caminho) {
  if (/(^|\/)tests?\//.test(caminho) || /\.test\.js$/.test(caminho)) return 'testes';
  if (caminho.startsWith('client/')) return 'tela';
  if (caminho.startsWith('server/')) return 'bastidores';
  return 'documentacao';
}

const saida = execFileSync('git', [
  'log', `--since=${desde} 00:00`, `--until=${ate} 23:59:59`, '--no-merges',
  '--numstat', '--format=@@%H|%at|%an|%s',
], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

const commits = [];
for (const linha of saida.split('\n')) {
  if (linha.startsWith('@@')) {
    const [hash, ts, autor, ...assunto] = linha.slice(2).split('|');
    commits.push({ hash, ts: Number(ts) * 1000, autor: APELIDOS[autor] || autor, assunto: assunto.join('|'), linhas: {} });
  } else if (linha.trim() && commits.length) {
    const [add, del, caminho] = linha.split('\t');
    if (!caminho || /^server\/(data|uploads)\//.test(caminho)) continue;
    const n = (add === '-' ? 1 : Number(add)) + (del === '-' ? 0 : Number(del)) || 1;
    const a = area(caminho);
    commits[commits.length - 1].linhas[a] = (commits[commits.length - 1].linhas[a] || 0) + n;
  }
}

const filtrados = commits
  .filter((c) => !autorFiltro || c.autor.toLowerCase().includes(autorFiltro.toLowerCase()))
  .sort((a, b) => a.ts - b.ts);

const AREAS = ['tela', 'bastidores', 'testes', 'documentacao'];
const vazio = () => Object.fromEntries(AREAS.map((a) => [a, 0]));
const porAutor = {};
const porDia = {};
const ultimoPorAutor = {};
let sessoes = 0;

for (const c of filtrados) {
  const ant = ultimoPorAutor[c.autor];
  const gap = ant ? (c.ts - ant) / 60000 : Infinity;
  const minutos = gap <= pausaMin ? gap : aquecMin;
  if (gap > pausaMin) sessoes++;
  ultimoPorAutor[c.autor] = c.ts;
  const total = Object.values(c.linhas).reduce((s, n) => s + n, 0) || 1;
  const dia = iso(new Date(c.ts));
  porAutor[c.autor] ||= vazio();
  porDia[dia] ||= vazio();
  for (const a of AREAS) {
    const parte = (minutos * (c.linhas[a] || 0)) / total;
    porAutor[c.autor][a] += parte;
    porDia[dia][a] += parte;
  }
  if (!Object.keys(c.linhas).length) { porAutor[c.autor].documentacao += minutos; porDia[dia].documentacao += minutos; }
}

const h = (m) => Math.round((m / 60) * 10) / 10;
const somar = (o) => Object.values(o).reduce((s, n) => s + n, 0);
const geral = vazio();
for (const o of Object.values(porAutor)) for (const a of AREAS) geral[a] += o[a];

const resultado = {
  periodo: { desde, ate }, commits: filtrados.length, sessoes,
  horasTotais: h(somar(geral)),
  porArea: Object.fromEntries(AREAS.map((a) => [a, h(geral[a])])),
  percentual: Object.fromEntries(AREAS.map((a) => [a, somar(geral) ? Math.round((geral[a] / somar(geral)) * 100) : 0])),
  porAutor: Object.fromEntries(Object.entries(porAutor).map(([k, o]) => [k, { total: h(somar(o)), ...Object.fromEntries(AREAS.map((a) => [a, h(o[a])])) }])),
  porDia: Object.fromEntries(Object.entries(porDia).map(([k, o]) => [k, { total: h(somar(o)), ...Object.fromEntries(AREAS.map((a) => [a, h(o[a])])) }])),
  assuntos: filtrados.map((c) => `${iso(new Date(c.ts))} ${c.hash.slice(0, 8)} ${c.assunto}`),
};

if (comoJson) { console.log(JSON.stringify(resultado, null, 2)); process.exit(0); }

console.log(`Periodo ${desde} a ${ate} — ${resultado.commits} commits, ${sessoes} sessoes, ~${resultado.horasTotais} h (estimativa por baixo)`);
console.log('Por area:', AREAS.map((a) => `${a} ${resultado.porArea[a]} h (${resultado.percentual[a]}%)`).join(' | '));
console.log('\nPor pessoa:');
for (const [k, o] of Object.entries(resultado.porAutor)) console.log(`  ${k}: ${o.total} h  (tela ${o.tela}, bastidores ${o.bastidores}, testes ${o.testes}, doc ${o.documentacao})`);
console.log('\nPor dia:');
for (const [k, o] of Object.entries(resultado.porDia)) console.log(`  ${k}: ${o.total} h  (tela ${o.tela}, bastidores ${o.bastidores}, testes ${o.testes}, doc ${o.documentacao})`);
console.log('\nAssuntos dos commits (materia-prima do relatorio, NAO copiar para o cliente):');
for (const s of resultado.assuntos) console.log('  ' + s);
