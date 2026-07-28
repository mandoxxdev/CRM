/**
 * Caixa de texto da secao 4 (ESCOPO) — rotulos E valores — 27/07/2026.
 *
 * O cadastro grava os rotulos em CAIXA ALTA (64 dos 77 registros de variaveis_tecnicas:
 * "MATERIAL TANQUE", "ROTAÇÃO DO MOTOR [RPM]"), o que fazia a secao inteira gritar. A
 * secao passa a sair no formato "Material tanque: <valor>".
 *
 * CONTRATO — o que NAO pode ser rebaixado junto:
 *   R1 — unidades entre COLCHETES: [kW], [Hz], [RPM], [pol.], [L/H], [m], [kg], [V], [L].
 *        Um toLowerCase cego virava "[kw]", "[rpm]" — unidade errada em documento tecnico.
 *   R2 — trechos entre PARENTESES, escritos a mao: "(Larg. × Comp. × Alt)"
 *   R3 — siglas reais: CCM aparece em 3 rotulos
 *   R4 — rotulo JA escrito em caixa mista fica intacto (alguem cuidou dele)
 *   R5 — a secao 4 renderiza "Rotulo: valor" e nenhum rotulo sai gritando
 *
 * Executar: node tests/propostaRotulosSecao4.test.js
 */
const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

// Rotulos REAIS do banco (variaveis_tecnicas.nome)
const CASOS = [
  ['VOLUME ÚTIL [L]', 'Volume útil [L]'],
  ['ROTAÇÃO MOTOR ESQUERDO [RPM]', 'Rotação motor esquerdo [RPM]'],
  ['MOTOR / MOTOREDUTOR CENTRAL [kW]', 'Motor / motoredutor central [kW]'],
  ['FREQUÊNCIA [Hz]', 'Frequência [Hz]'],
  ['DIÂMETRO BOCAL DE SAÍDA [pol.]', 'Diâmetro bocal de saída [pol.]'],
  ['VOLUME ÚTIL DE MOAGEM [L/H]', 'Volume útil de moagem [L/H]'],
  ['PESO ESTIMADO DO EQUIPAMENTO [kg]', 'Peso estimado do equipamento [kg]'],
  ['TENSÃO DE TRABALHO [V]', 'Tensão de trabalho [V]'],
  ['ÁREA DE INSTALAÇÃO', 'Área de instalação'],
  ['MATERIAL EIXOS E HÉLICES', 'Material eixos e hélices'],
  ['MARCA DO ACIONAMENTO P/ MOTOR CENTRAL', 'Marca do acionamento p/ motor central'],
  ['POSIÇÃO DO BOCAL DE SAÍDA 1', 'Posição do bocal de saída 1'],
  // R2 — parenteses escritos a mao
  ['DIMENSÕES GERAIS ESTIMADAS (Larg. × Comp. × Alt) [m]', 'Dimensões gerais estimadas (Larg. × Comp. × Alt) [m]'],
  // R3 — sigla
  ['GRAU DE PROTEÇÃO DO CCM', 'Grau de proteção do CCM'],
  ['MATERIAL DO CCM', 'Material do CCM'],
  ['PESO ESTIMADO DO CCM [kg]', 'Peso estimado do CCM [kg]'],
  // R4 — ja em caixa mista, nao mexe
  ['Volume útil do tanque', 'Volume útil do tanque'],
  ['Potência nominal do motor', 'Potência nominal do motor'],
];

// A secao 4 e montada dentro do template; renderiza um item com specs para ler o resultado.
function rotulosRenderizados(labels) {
  const chaves = labels.map((l, i) => `k${i}`);
  const variaveisLabels = {};
  const specs = {};
  labels.forEach((l, i) => { variaveisLabels[`k${i}`] = { nome: l }; specs[`k${i}`] = 'valor-de-teste'; });

  const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
  const itens = [{
    produto_nome: 'Masseira', descricao: 'Masseira', quantidade: 1, unidade: 'UN',
    valor_unitario: 1000, valor_total: 1000,
    familia_produto: 'TESTE', especificacoes_tecnicas: JSON.stringify(specs),
  }];
  // Nomes exatos que o template le: config.variaveis_proposta_tecnica (lista base) e
  // config.variaveis_proposta_por_familia (mapa familia -> chaves).
  const cfg = {
    variaveis_proposta_labels: variaveisLabels,
    variaveis_proposta_tecnica: chaves,
    variaveis_proposta_por_familia: { TESTE: chaves },
  };
  const html = gerarHTMLPropostaPremiumV2(proposta, itens, { total: 1000, dataEmissao: '27/07/2026' }, cfg, null, false, true);
  // <p>Rotulo: valor</p>
  return Array.from(html.matchAll(/<p>([^<]*?):\s*valor-de-teste<\/p>/g)).map(m => m[1]);
}

const renderizados = rotulosRenderizados(CASOS.map(c => c[0]));
console.log(`[R5] a secao 4 renderizou ${renderizados.length} de ${CASOS.length} rotulos no formato "Rotulo: valor"`);
checar(renderizados.length === CASOS.length,
  `R5: todos os rotulos saem como "Rotulo: valor" (saiu ${renderizados.length}/${CASOS.length})`);

console.log('');
CASOS.forEach(([entrada, esperado], i) => {
  const saida = renderizados[i];
  const regra = /^(Volume útil do|Potência nominal)/.test(esperado) ? 'R4'
    : /\(/.test(entrada) ? 'R2'
      : /CCM/.test(entrada) ? 'R3'
        : /\[/.test(entrada) ? 'R1' : 'R1';
  checar(saida === esperado, `${regra}: ${JSON.stringify(entrada)} -> ${JSON.stringify(saida)} (esperado ${JSON.stringify(esperado)})`);
});

// Nenhum rotulo pode sair inteiramente em caixa alta
console.log('');
const gritando = renderizados.filter(r => r && r === r.toUpperCase() && /\p{L}{2,}/u.test(r));
checar(gritando.length === 0, `R5: nenhum rotulo em CAIXA ALTA (${gritando.length}: ${gritando.join(' | ')})`);

// ============================================================================
// R6/R7 — os VALORES do item (o caso da proposta 41)
// ============================================================================
function secao4DoItem(item) {
  const proposta = { numero_proposta: '01/R00', titulo: 'T', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' };
  const html = gerarHTMLPropostaPremiumV2(proposta, [item], { total: 1, dataEmissao: '27/07/2026' }, null, null, false, true);
  const campo = (rotulo) => {
    const m = new RegExp(`<p>${rotulo}:\\s*([^<]*)</p>`).exec(html);
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
    tabelaOferta: (/<td>([^<]*)<\/td>\s*<\/tr>/.exec(html) || [])[1],
  };
}

console.log('\n[R6] valores do item — caso REAL da proposta 41');
const r41 = secao4DoItem({
  descricao: 'TALHAS PARA IÇAMENTO DE BIGBAG + TANQUES DE ARMAZENAMENTO DE SLURRYS',
  familia_produto: 'OUTROS', unidade: 'UN', quantidade: 1,
});
checar(r41.equipamento === 'Talhas para içamento de bigbag + tanques de armazenamento de slurrys',
  `R6: Equipamento -> ${JSON.stringify(r41.equipamento)}`);
checar(r41.quantidade === '1 Un', `R6: Quantidade -> ${JSON.stringify(r41.quantidade)}`);
checar(r41.familia === 'Outros', `R6: Família -> ${JSON.stringify(r41.familia)}`);
checar(r41.titulo === 'Talhas para içamento de bigbag + tanques de armazenamento de slurrys',
  `R6: titulo 4.1 acompanha o Equipamento -> ${JSON.stringify(r41.titulo)}`);
// A secao 3 lista o MESMO equipamento: as duas nao podem divergir na caixa.
checar(r41.tabelaOferta === r41.equipamento,
  `R6: tabela da secao 3 casa com a secao 4 -> ${JSON.stringify(r41.tabelaOferta)}`);

console.log('\n[R7] codigos de familia entre parenteses preservados (dados reais do banco)');
[
  ['MOINHO DE LABORATÓRIO (MLY)', 'Moinho de laboratório (MLY)'],
  ['MOINHO VERTICAL DE ALTO IMPACTO (MPY)', 'Moinho vertical de alto impacto (MPY)'],
  ['TANQUE DISPERSOR (TQY)', 'Tanque dispersor (TQY)'],
  ['DISPERSOR HIDROPNEUMÁTICO (DHY)', 'Dispersor hidropneumático (DHY)'],
  ['MASSEIRA BIMIX (MBY)', 'Masseira bimix (MBY)'],
].forEach(([entrada, esperado]) => {
  const out = secao4DoItem({ descricao: 'X', familia_produto: entrada, unidade: 'UN', quantidade: 1 }).familia;
  checar(out === esperado, `R7: ${JSON.stringify(entrada)} -> ${JSON.stringify(out)}`);
});

console.log('\n[R8] identificadores NAO podem ser rebaixados');
const ids = secao4DoItem({
  descricao: 'X', familia_produto: 'OUTROS', unidade: 'UN', quantidade: 1,
  codigo_produto: 'MPY-500A', modelo: 'AISI 316L', ncm: '8474.20.90',
});
checar(ids.codigo === 'MPY-500A', `R8: Código intacto -> ${JSON.stringify(ids.codigo)}`);
checar(ids.modelo === 'AISI 316L', `R8: Modelo intacto -> ${JSON.stringify(ids.modelo)}`);
checar(ids.ncm === '8474.20.90', `R8: NCM intacto -> ${JSON.stringify(ids.ncm)}`);

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
