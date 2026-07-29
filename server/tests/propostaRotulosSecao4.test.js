/**
 * Caixa de texto da secao 4 (ESCOPO) — rotulos E valores.
 *
 * CONTRATO ATUAL (28/07/2026): o documento mostra o texto EXATAMENTE como esta no
 * cadastro. Nao ha transformacao de caixa. Antes existia um semCapsLock que rebaixava
 * CAIXA ALTA para caixa de frase ("MATERIAL TANQUE" -> "Material tanque"); foi removido
 * a pedido, porque escondia o que o usuario cadastrou de proposito em maiusculo.
 *
 * A UNICA transformacao que resta e o TITULO do item (4.x), que sai sempre em CAIXA
 * ALTA, como os demais titulos do documento.
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
  'VOLUME ÚTIL [L]',
  'ROTAÇÃO MOTOR ESQUERDO [RPM]',
  'MOTOR / MOTOREDUTOR CENTRAL [kW]',
  'FREQUÊNCIA [Hz]',
  'DIÂMETRO BOCAL DE SAÍDA [pol.]',
  'VOLUME ÚTIL DE MOAGEM [L/H]',
  'PESO ESTIMADO DO EQUIPAMENTO [kg]',
  'TENSÃO DE TRABALHO [V]',
  'ÁREA DE INSTALAÇÃO',
  'MATERIAL EIXOS E HÉLICES',
  'MARCA DO ACIONAMENTO P/ MOTOR CENTRAL',
  'POSIÇÃO DO BOCAL DE SAÍDA 1',
  'DIMENSÕES GERAIS ESTIMADAS (Larg. × Comp. × Alt) [m]',
  'GRAU DE PROTEÇÃO DO CCM',
  'MATERIAL DO CCM',
  'PESO ESTIMADO DO CCM [kg]',
  'Volume útil do tanque',
  'Potência nominal do motor',
];

const FAMILIA = 'TESTE';

// A secao 4 e montada dentro do template; renderiza um item com specs para ler o resultado.
function renderizarSecao4({ rotulos = [], valores = {}, item = {} } = {}) {
  const variaveisLabels = {};
  const specs = {};
  rotulos.forEach((l, i) => {
    variaveisLabels[`k${i}`] = { nome: l };
    specs[`k${i}`] = valores[l] != null ? valores[l] : 'valor-de-teste';
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
console.log('\n[rotulos] texto identico ao cadastro');
const htmlRotulos = renderizarSecao4({ rotulos: ROTULOS });
const semTags = htmlRotulos.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
ROTULOS.forEach((rotulo) => {
  checar(semTags.includes(`${rotulo}: valor-de-teste`), `${JSON.stringify(rotulo)} sai inalterado`);
});

console.log('\n[valores] texto identico ao cadastro');
const VALORES = {
  'ÁREA DE INSTALAÇÃO': 'AÇO INOX AISI 316',
  'MATERIAL DO CCM': 'Aço carbono pintado',
  'VOLUME ÚTIL [L]': '540',
};
const htmlValores = renderizarSecao4({ rotulos: Object.keys(VALORES), valores: VALORES });
const textoValores = htmlValores.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
Object.entries(VALORES).forEach(([rotulo, valor]) => {
  checar(textoValores.includes(`${rotulo}: ${valor}`), `valor ${JSON.stringify(valor)} sai inalterado`);
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

// O titulo e a UNICA transformacao: sempre CAIXA ALTA.
console.log('\n[titulo] unica transformacao: CAIXA ALTA');
checar(r.titulo === 'MASSEIRA HELICOIDAL ATM', `titulo 4.1 -> ${JSON.stringify(r.titulo)}`);
const rMinusculo = secao4DoItem({ produto_nome: 'Masseira helicoidal atm', descricao: 'Masseira helicoidal atm' });
checar(rMinusculo.titulo === 'MASSEIRA HELICOIDAL ATM',
  `nome cadastrado em minusculo tambem vira CAPS no titulo -> ${JSON.stringify(rMinusculo.titulo)}`);
checar(rMinusculo.equipamento === 'Masseira helicoidal atm',
  `mas no corpo continua como cadastrado -> ${JSON.stringify(rMinusculo.equipamento)}`);

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
