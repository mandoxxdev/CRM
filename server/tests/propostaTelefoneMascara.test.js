/**
 * Mascara de telefone na capa — 27/07/2026.
 *
 * O cadastro aceitou o campo livre por anos, entao o banco tem de tudo. Formatos REAIS
 * encontrados em clientes.telefone: "67998420146", "3598737467", "21 99723-1500",
 * "(11) 9.6406-3306", "7999192-0940", "(27) 98182-5530".
 *
 * CONTRATO:
 *   M1 — normaliza pelos DIGITOS e remonta no padrao brasileiro, seja qual for a
 *        pontuacao que veio do cadastro
 *   M2 — quantidade de digitos DESCONHECIDA devolve o valor ORIGINAL intacto. Mascarar
 *        na marra inventaria um numero errado num documento comercial — pior que nao
 *        mascarar. Nenhum digito pode ser perdido nesse caminho.
 *   M3 — a capa renderiza o telefone ja mascarado, e cai no travessao quando vazio
 *
 * Executar: node tests/propostaTelefoneMascara.test.js
 */
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
const itens = [{ produto_nome: 'M', quantidade: 1, unidade: 'UN', valor_unitario: 1, valor_total: 1 }];
const totais = { total: 1, dataEmissao: '27/07/2026' };

// Le o que a capa realmente imprime no campo, em vez de testar a funcao isolada:
// e o resultado visivel que importa, e assim o teste pega tambem uma troca de campo.
function telefoneNaCapa(valor) {
  const html = gerarHTMLPropostaPremiumV2({ ...proposta, cliente_telefone: valor }, itens, totais, null, null, false, true);
  const m = /<span data-edit="cliente_telefone">([^<]*)<\/span>/.exec(html);
  return m ? m[1] : null;
}

// M1 — formatos reais do banco
const CASOS = [
  ['67998420146', '(67) 99842-0146', 'celular 11 digitos sem pontuacao'],
  ['3598737467', '(35) 9873-7467', 'fixo 10 digitos sem pontuacao'],
  ['21 99723-1500', '(21) 99723-1500', 'DDD solto + hifen'],
  ['(11) 9.6406-3306', '(11) 96406-3306', 'mascara antiga com ponto do nono digito'],
  ['7999192-0940', '(79) 99192-0940', 'DDD colado no numero'],
  ['(27) 98182-5530', '(27) 98182-5530', 'ja mascarado, sai igual'],
  ['5511988887777', '(11) 98888-7777', 'com codigo do pais +55'],
  ['988887777', '98888-7777', 'sem DDD, 9 digitos'],
  ['29145011', '2914-5011', 'sem DDD, 8 digitos'],
];
console.log('[M1] formatos conhecidos');
CASOS.forEach(([entrada, esperado, nota]) => {
  const saida = telefoneNaCapa(entrada);
  checar(saida === esperado, `M1: ${JSON.stringify(entrada)} -> ${JSON.stringify(saida)} (esperado ${JSON.stringify(esperado)}) — ${nota}`);
});

// M2 — desconhecido nao pode ser mutilado
console.log('\n[M2] formatos desconhecidos preservados');
const PRESERVAR = [
  ['1129145011 r. 24', 'com ramal'],
  ['+1 415 555 2671', 'numero estrangeiro'],
  ['1234', 'incompleto'],
  ['contato pelo whatsapp', 'texto livre'],
];
PRESERVAR.forEach(([entrada, nota]) => {
  const saida = telefoneNaCapa(entrada);
  checar(saida === entrada, `M2: ${JSON.stringify(entrada)} preservado (saiu ${JSON.stringify(saida)}) — ${nota}`);
  const digitosEntrada = entrada.replace(/\D/g, '');
  const digitosSaida = String(saida).replace(/\D/g, '');
  checar(digitosSaida === digitosEntrada, `M2: nenhum digito perdido em ${JSON.stringify(entrada)}`);
});

// M3 — vazio cai no travessao
console.log('\n[M3] campo vazio');
checar(telefoneNaCapa('') === '—', `M3: vazio vira travessao (saiu ${JSON.stringify(telefoneNaCapa(''))})`);
checar(telefoneNaCapa(null) === '—', `M3: null vira travessao (saiu ${JSON.stringify(telefoneNaCapa(null))})`);

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
