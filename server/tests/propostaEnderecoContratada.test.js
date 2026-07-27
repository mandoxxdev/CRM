/**
 * Endereco da CONTRATADA (27/07/2026): a empresa mudou de Diadema para Sao Bernardo
 * do Campo. O endereco aparece em mais de um lugar do documento e e informacao
 * contratual — um lugar desatualizado gera proposta com endereco de retirada errado
 * (a clausula 5.2 e EXW: o cliente vai buscar o equipamento nesse endereco).
 *
 * Cobre os pontos VIVOS:
 *   E1 — rodape de todas as paginas (.page-footer-addr)
 *   E2 — clausula 5.2 TRANSPORTE E EMBALAGEM no ramo de clausulas DEFAULT do template
 *   E3 — clausula 5.2 em clausulasDefault.js (usado no preview e ao adotar os padroes)
 *   E4 — nenhum vestigio do endereco antigo em nenhum dos dois caminhos
 *
 * O endereco confere com assets/proposta/dados-contratada.png, que e a fonte oficial
 * exibida na propria proposta (inclusive o CEP 09844-100).
 *
 * Executar: node tests/propostaEnderecoContratada.test.js
 */
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');
const { getClausulasDefault } = require('../clausulasDefault');

const LOGRADOURO = 'Av. Ângelo Demarchi, nº 130';
const BAIRRO = 'Batistini';
const MUNICIPIO = 'São Bernardo do Campo';
const CEP = '09844-100';
// Marcas do endereco antigo que nao podem sobreviver em nenhum caminho vivo.
const ANTIGO = ['Ulysses', '09990-080', 'Vila Nogueira'];

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'Masseira', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000 }];
const totais = { total: 1000, dataEmissao: '27/07/2026' };

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

// (a) template com clausulas DEFAULT embutidas (caminho do PDF sem clausulas salvas)
const htmlDefault = gerarHTMLPropostaPremiumV2(proposta, itens, totais, null, null, false, true);
// (b) template com as clausulas de clausulasDefault.js (caminho do preview)
const custom = getClausulasDefault().map(c => ({ numero: c.numero, titulo: c.titulo, conteudo: c.conteudo }));
const htmlCustom = gerarHTMLPropostaPremiumV2(proposta, itens, totais, { clausulas_custom: custom }, null, false, true);

// E1 — rodape
const rodape = /<span class="page-footer-addr">([^<]*)<\/span>/.exec(htmlDefault);
checar(!!rodape, 'E1: rodape tem .page-footer-addr');
if (rodape) {
  const txt = rodape[1];
  checar(txt.includes(LOGRADOURO), `E1: rodape com o logradouro novo (achado: "${txt}")`);
  checar(txt.includes(BAIRRO) && txt.includes(MUNICIPIO), 'E1: rodape com bairro e municipio novos');
  checar(txt.includes(CEP), `E1: rodape com CEP ${CEP}`);
}

// E2/E3 — clausula 5.2 nos dois caminhos
[['E2 (clausulas default do template)', htmlDefault], ['E3 (clausulasDefault.js)', htmlCustom]].forEach(([rotulo, html]) => {
  const i52 = html.indexOf('TRANSPORTE E EMBALAGEM');
  checar(i52 >= 0, `${rotulo}: clausula 5.2 presente`);
  const trecho = i52 >= 0 ? html.slice(i52, i52 + 1200) : '';
  checar(trecho.includes(LOGRADOURO), `${rotulo}: 5.2 cita o logradouro novo`);
  checar(trecho.includes(MUNICIPIO), `${rotulo}: 5.2 cita ${MUNICIPIO}`);
  checar(trecho.includes(CEP), `${rotulo}: 5.2 cita o CEP ${CEP}`);
});

// E4 — nada do endereco antigo sobrou
[['default', htmlDefault], ['custom', htmlCustom]].forEach(([rotulo, html]) => {
  ANTIGO.forEach((marca) => {
    checar(!html.includes(marca), `E4 [${rotulo}]: sem vestigio de "${marca}"`);
  });
});

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
