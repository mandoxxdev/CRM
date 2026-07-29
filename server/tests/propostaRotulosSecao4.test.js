/**
 * Caixa de texto da secao 4 (ESCOPO).
 *
 * CONTRATO (29/07/2026), depois de dois ajustes a pedido:
 *   - ROTULO da variavel -> caixa de FRASE. O cadastro grava 64 dos 77 rotulos em CAIXA
 *     ALTA ("MATERIAL TANQUE", "USO/FUNCAO DO EQUIPAMENTO"), o que fazia a secao gritar e
 *     destoar dos rotulos fixos do bloco ("Equipamento:", "Modelo:", "Familia:").
 *   - VALOR -> EXATAMENTE como cadastrado, inclusive em maiusculo. E o dado do usuario.
 *   - TITULO do item (4.x) -> sempre CAIXA ALTA, como os demais titulos do documento.
 *   - PREFIXO e SUFIXO -> literais (sao notacao/unidade e sao sensiveis a caixa).
 *
 * O que o rebaixamento do rotulo NAO pode estragar: unidades entre colchetes ([kW], [RPM]),
 * trechos entre parenteses escritos a mao, siglas (CCM) e rotulos ja em caixa mista.
 *
 * Executar: node tests/propostaRotulosSecao4.test.js
 */
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

// Rotulos REAIS do banco (variaveis_tecnicas.nome), incluindo os casos que antes eram
// armadilha para o rebaixamento de caixa: unidades entre colchetes, parenteses escritos
// a mao, siglas e rotulos ja em caixa mista. Todos devem sair inalterados.
const ROTULOS = [
  ['VOLUME ÚTIL [L]', 'Volume útil [L]'],
  ['ROTAÇÃO MOTOR ESQUERDO [RPM]', 'Rotação motor esquerdo [RPM]'],
  ['MOTOR / MOTOREDUTOR CENTRAL [kW]', 'Motor / motoredutor central [kW]'],
  ['FREQUÊNCIA [Hz]', 'Frequência [Hz]'],
  ['DIÂMETRO BOCAL DE SAÍDA [pol.]', 'Diâmetro bocal de saída [pol.]'],
  ['VOLUME ÚTIL DE MOAGEM [L/H]', 'Volume útil de moagem [L/H]'],
  ['PESO ESTIMADO DO EQUIPAMENTO [kg]', 'Peso estimado do equipamento [kg]'],
  ['TENSÃO DE TRABALHO [V]', 'Tensão de trabalho [V]'],
  ['USO/FUNÇÃO DO EQUIPAMENTO', 'Uso/função do equipamento'],
  ['MATERIAL EIXOS E HÉLICES', 'Material eixos e hélices'],
  ['MARCA DO ACIONAMENTO P/ MOTOR CENTRAL', 'Marca do acionamento p/ motor central'],
  ['DIMENSÕES GERAIS ESTIMADAS (Larg. × Comp. × Alt) [m]', 'Dimensões gerais estimadas (Larg. × Comp. × Alt) [m]'],
  ['GRAU DE PROTEÇÃO DO CCM', 'Grau de proteção do CCM'],
  ['MATERIAL DO CCM', 'Material do CCM'],
  ['Volume útil do tanque', 'Volume útil do tanque'],
];

const FAMILIA = 'TESTE';

// A secao 4 e montada dentro do template; renderiza um item com specs para ler o resultado.
function renderizarSecao4({ rotulos = [], valores = {}, item = {} } = {}) {
  const variaveisLabels = {};
  const specs = {};
  rotulos.forEach((par, i) => {
    const cadastrado = Array.isArray(par) ? par[0] : par;
    variaveisLabels[`k${i}`] = { nome: cadastrado };
    specs[`k${i}`] = valores[cadastrado] != null ? valores[cadastrado] : 'valor-de-teste';
  });
  const html = gerarHTMLPropostaPremiumV2(
    { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' },
    [{
      produto_nome: 'Masseira', descricao: 'Masseira', quantidade: 1, unidade: 'UN',
      valor_unitario: 1000, valor_total: 1000,
      familia_produto: FAMILIA, especificacoes_tecnicas: JSON.stringify(specs),
      ...item,
    }],
    { total: 1000, dataEmissao: '28/07/2026' },
    {
      variaveis_proposta_por_familia: { [FAMILIA]: rotulos.map((_, i) => `k${i}`) },
      variaveis_proposta_labels: variaveisLabels,
    },
    null, false, true
  );
  return html;
}

// ============================================================================
// Rotulos e valores saem exatamente como cadastrados
// ============================================================================
console.log('\n[rotulos] caixa de frase, preservando unidades, parenteses e siglas');
const htmlRotulos = renderizarSecao4({ rotulos: ROTULOS });
const semTags = htmlRotulos.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
ROTULOS.forEach(([cadastrado, esperado]) => {
  checar(semTags.includes(`${esperado}: valor-de-teste`),
    `${JSON.stringify(cadastrado)} -> ${JSON.stringify(esperado)}`);
});
const gritando = ROTULOS.map(([, e]) => e).filter((r) => r === r.toUpperCase() && /\p{L}{2,}/u.test(r));
checar(gritando.length === 0, `nenhum rotulo sai em CAIXA ALTA (${gritando.join(' | ')})`);

console.log('\n[valores] texto EXATAMENTE como cadastrado');
const VALORES = [
  ['MATERIAL EIXOS E HÉLICES', 'Material eixos e hélices', 'AÇO INOX AISI 316'],
  ['MATERIAL DO CCM', 'Material do CCM', 'Aço carbono pintado'],
  ['VOLUME ÚTIL [L]', 'Volume útil [L]', '540'],
];
const htmlValores = renderizarSecao4({
  rotulos: VALORES.map(([c, e]) => [c, e]),
  valores: Object.fromEntries(VALORES.map(([c, , v]) => [c, v])),
});
const textoValores = htmlValores.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
VALORES.forEach(([, exibido, valor]) => {
  checar(textoValores.includes(`${exibido}: ${valor}`),
    `valor ${JSON.stringify(valor)} sai EXATAMENTE como cadastrado`);
});

// ============================================================================
// Campos do item: tambem sem transformacao (o titulo e a excecao)
// ============================================================================
function secao4DoItem(item) {
  const html = renderizarSecao4({ rotulos: [], item });
  const campo = (nome) => {
    const re = new RegExp(`<p>${nome}:\\s*([^<]*)</p>`);
    const m = re.exec(html);
    return m ? m[1].trim() : null;
  };
  const h3 = /<h3>4\.1\s*([^<]*)<\/h3>/.exec(html);
  return {
    titulo: h3 ? h3[1].trim() : null,
    equipamento: campo('Equipamento'),
    quantidade: campo('Quantidade'),
    familia: campo('Fam&iacute;lia') || campo('Família'),
    codigo: campo('C&oacute;digo') || campo('Código'),
    modelo: campo('Modelo'),
    ncm: campo('NCM'),
  };
}

console.log('\n[item] campos do equipamento');
const r = secao4DoItem({
  produto_nome: 'MASSEIRA HELICOIDAL ATM',
  descricao: 'MASSEIRA HELICOIDAL ATM',
  familia_produto: 'MASSEIRA HELICOIDAL ATM [MHY]',
  unidade: 'UN',
  quantidade: 1,
  codigo_produto: 'PROD-24-MAS-MASSE',
  modelo: 'MHY-30',
  ncm: '8474.20.90',
});
checar(r.equipamento === 'MASSEIRA HELICOIDAL ATM', `Equipamento inalterado -> ${JSON.stringify(r.equipamento)}`);
checar(r.quantidade === '1 UN', `Quantidade com a unidade como cadastrada -> ${JSON.stringify(r.quantidade)}`);
checar(r.familia === 'MASSEIRA HELICOIDAL ATM [MHY]', `Família inalterada -> ${JSON.stringify(r.familia)}`);
// O CODIGO nao sai mais na proposta (e interno); no lugar dele vai o MODELO.
checar(r.codigo === null, `Código nao aparece na proposta -> ${JSON.stringify(r.codigo)}`);
checar(r.modelo === 'MHY-30', `Modelo intacto -> ${JSON.stringify(r.modelo)}`);
checar(r.ncm === '8474.20.90', `NCM intacto -> ${JSON.stringify(r.ncm)}`);

// O titulo e a UNICA transformacao de caixa, e traz o MODELO junto.
console.log('\n[titulo] CAIXA ALTA + modelo');
checar(r.titulo === 'MASSEIRA HELICOIDAL ATM, MODELO MHY-30', `titulo 4.1 -> ${JSON.stringify(r.titulo)}`);
const rSemModelo = secao4DoItem({ produto_nome: 'TANQUE PULMAO', descricao: 'TANQUE PULMAO' });
checar(rSemModelo.titulo === 'TANQUE PULMAO', `sem modelo, titulo so com o nome -> ${JSON.stringify(rSemModelo.titulo)}`);
const rDuplicado = secao4DoItem({ produto_nome: 'MASSEIRA ATM MHY-30', descricao: 'x', modelo: 'MHY-30' });
checar(rDuplicado.titulo === 'MASSEIRA ATM MHY-30',
  `nao repete o modelo quando o nome ja o contem -> ${JSON.stringify(rDuplicado.titulo)}`);
const rMinusculo = secao4DoItem({ produto_nome: 'Masseira helicoidal atm', descricao: 'Masseira helicoidal atm' });
checar(rMinusculo.titulo === 'MASSEIRA HELICOIDAL ATM',
  `nome cadastrado em minusculo tambem vira CAPS no titulo -> ${JSON.stringify(rMinusculo.titulo)}`);
checar(rMinusculo.equipamento === 'Masseira helicoidal atm',
  `mas no corpo continua como cadastrado -> ${JSON.stringify(rMinusculo.equipamento)}`);

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
