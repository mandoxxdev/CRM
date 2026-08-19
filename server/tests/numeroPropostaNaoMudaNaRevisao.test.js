/**
 * O sequencial da proposta e identidade: sai uma vez, na criacao, e nao anda mais.
 * Executar: node server/tests/numeroPropostaNaoMudaNaRevisao.test.js
 *
 * O PUT /api/propostas/:id regerava o numero INTEIRO quando a revisao subia, e o
 * sequencial desse numero e MAX(sequencial)+1 sobre a tabela. Na pratica:
 *
 *     097-02-AJ-2026-REV01  --editou-->  098-02-AJ-2026-REV02
 *
 * O documento trocava de identidade no meio da negociacao e ainda queimava um
 * numero que nenhuma proposta usaria. Revisao pode mexer SO no sufixo REV.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

// Mesma expressao do index.js (bloco "deveIncrementarRevisao" do PUT).
function numeroDaRevisao(numeroAtual, novaRevisao, numeroDoCorpo) {
  const atual = String(numeroAtual || '').trim();
  const sufixo = `REV${String(novaRevisao).padStart(2, '0')}`;
  if (/REV\s*\d+\s*$/i.test(atual)) return atual.replace(/REV\s*\d+\s*$/i, sufixo);
  if (atual) return `${atual}-${sufixo}`;
  return numeroDoCorpo;
}

console.log('\n═══ Sequencial nao muda na revisao ═══\n');

console.log('O caso relatado');
checar(numeroDaRevisao('097-02-AJ-2026-REV01', 2) === '097-02-AJ-2026-REV02',
  '097-REV01 vira 097-REV02, nao 098');
checar(numeroDaRevisao('097-02-AJ-2026-REV02', 3) === '097-02-AJ-2026-REV03',
  'a revisao seguinte tambem mantem o 097');

console.log('\nO sequencial sobrevive a varias revisoes seguidas');
{
  let n = '096-02-MH-2026-REV00';
  for (let rev = 1; rev <= 12; rev++) n = numeroDaRevisao(n, rev);
  checar(n === '096-02-MH-2026-REV12', '12 revisoes depois continua 096: ' + n);
  checar(n.slice(0, 3) === '096', 'o prefixo sequencial nao andou nenhuma casa');
}

console.log('\nO resto do numero fica intacto');
{
  const r = numeroDaRevisao('090-01-MH-2026-REV01', 2);
  checar(r === '090-01-MH-2026-REV02', 'cliente (01), iniciais (MH) e ano (2026) preservados');
}

console.log('\nCasos de borda');
checar(numeroDaRevisao('088-02-AJ-2026', 1) === '088-02-AJ-2026-REV01',
  'numero legado sem sufixo ganha o REV em vez de ser reescrito');
checar(numeroDaRevisao('', 1, '099-01-XX-2026-REV01') === '099-01-XX-2026-REV01',
  'sem numero gravado, usa o do corpo em vez de inventar sequencial');
checar(numeroDaRevisao('095-04-AJ-2026-rev09', 10) === '095-04-AJ-2026-REV10',
  'sufixo em minusculo e reconhecido');
checar(numeroDaRevisao('095-04-AJ-2026-REV 07', 8) === '095-04-AJ-2026-REV08',
  'espaco entre REV e o numero nao quebra');
checar(numeroDaRevisao('100-01-AJ-2026-REV99', 100) === '100-01-AJ-2026-REV100',
  'passa de 99 sem truncar');

console.log('\nGuarda de regressao no index.js');
{
  const fonte = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
  // Recorta do PUT ate o proximo app.<verbo>, para nao varrer o arquivo inteiro.
  const depoisDoPut = fonte.split("app.put('/api/propostas/:id'")[1] || '';
  const corpoDoPut = depoisDoPut.split(/\napp\.(get|post|put|delete)\(/)[0] || '';

  checar(corpoDoPut.length > 0, 'o PUT /api/propostas/:id existe');
  // Procura a CHAMADA (com parentese), nao a mencao: o comentario que explica o
  // conserto cita o nome da funcao de proposito.
  checar(!/gerarNumeroPropostaComVerificacao\s*\(/.test(corpoDoPut),
    'a revisao NAO chama gerarNumeroPropostaComVerificacao (era o que trocava o sequencial)');
  checar(/sufixoRev/.test(corpoDoPut),
    'a revisao troca o sufixo REV do numero que ja existe');
}

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
