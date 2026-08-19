/**
 * Título da faixa azul da capa.
 * Executar: node server/tests/propostaCapaTituloPecas.test.js
 *
 * Disco, hélice, eixo e tela são peça de reposição, não equipamento. A capa
 * dizia "PROPOSTA PARA FORNECIMENTO DE EQUIPAMENTOS INDUSTRIAIS" para tudo.
 *
 * Regra (fixa no código, a pedido): se TODOS os itens forem de um grupo de
 * peças, a capa diz "PEÇAS E ACESSÓRIOS". Proposta mista continua equipamento.
 */

const { gerarHTMLPropostaPremiumV2 } = require('../templates/propostaPremiumV2');

let falhas = 0;
const checar = (cond, msg) => { if (cond) console.log('  ✓ ' + msg); else { console.log('  ✗ ' + msg); falhas++; } };

const EQUIP = 'PROPOSTA PARA FORNECIMENTO DE EQUIPAMENTOS INDUSTRIAIS';
const PECAS = 'PROPOSTA PARA FORNECIMENTO DE PEÇAS E ACESSÓRIOS';

function capa({ familias, grupoPorFamilia }) {
  return gerarHTMLPropostaPremiumV2(
    { numero_proposta: '098-02-AJ-2026-REV02', titulo: 'DISCO DISPERSOR', razao_social: 'X', cnpj: '1', cliente_email: 'a@b.c' },
    familias.map((f, i) => ({
      produto_nome: 'Item ' + i, descricao: 'd', quantidade: 1, unidade: 'UN',
      valor_unitario: 100, valor_total: 100, familia_produto: f,
      especificacoes_tecnicas: '{}'
    })),
    { total: 100, dataEmissao: '06/08/2026' },
    grupoPorFamilia === undefined ? {} : { grupo_por_familia: grupoPorFamilia },
    null, false, true
  );
}

console.log('\n═══ Título da capa por grupo ═══\n');

console.log('Proposta só de peças');
{
  const html = capa({
    familias: ['DISCO DISPERSOR', 'Eixo de Laboratório'],
    grupoPorFamilia: { 'DISCO DISPERSOR': 'Hélices e Acessórios', 'Eixo de Laboratório': 'Hélices e Acessórios' }
  });
  checar(html.includes(PECAS), 'capa diz PEÇAS E ACESSÓRIOS');
  checar(!html.includes(EQUIP), 'e não diz mais EQUIPAMENTOS INDUSTRIAIS');
}

console.log('\nProposta só de equipamentos');
{
  const html = capa({
    familias: ['Masseira Helicoidal ATM'],
    grupoPorFamilia: { 'Masseira Helicoidal ATM': 'Masseiras' }
  });
  checar(html.includes(EQUIP), 'continua EQUIPAMENTOS INDUSTRIAIS');
  checar(!html.includes(PECAS), 'não vira peças por engano');
}

console.log('\nProposta mista (tanque + disco)');
{
  const html = capa({
    familias: ['Masseira Helicoidal ATM', 'DISCO DISPERSOR'],
    grupoPorFamilia: { 'Masseira Helicoidal ATM': 'Masseiras', 'DISCO DISPERSOR': 'Hélices e Acessórios' }
  });
  checar(html.includes(EQUIP), 'vender equipamento junto com peça continua sendo equipamento');
}

console.log('\nCasos de borda');
{
  const html = capa({ familias: ['DISCO DISPERSOR'], grupoPorFamilia: undefined });
  checar(html.includes(EQUIP), 'sem o mapa de grupos, mantém o título padrão');
}
{
  // Grupo desconhecido para um dos itens: não dá para afirmar que é tudo peça.
  const html = capa({
    familias: ['DISCO DISPERSOR', 'Familia Sem Grupo'],
    grupoPorFamilia: { 'DISCO DISPERSOR': 'Hélices e Acessórios' }
  });
  checar(html.includes(EQUIP), 'item sem grupo conhecido mantém o padrão');
}
{
  // O nome do grupo tem acento e caixa variável no cadastro.
  const html = capa({
    familias: ['Tela de Lisa de Moinho'],
    grupoPorFamilia: { 'Tela de Lisa de Moinho': 'HELICES E ACESSORIOS' }
  });
  checar(html.includes(PECAS), 'reconhece o grupo sem depender de acento nem de caixa');
}
{
  const html = capa({
    familias: ['Disco Dispersor'],
    grupoPorFamilia: { 'DISCO DISPERSOR': 'Hélices e Acessórios' }
  });
  checar(html.includes(PECAS), 'casa a família mesmo com a caixa diferente do cadastro');
}

console.log(falhas === 0 ? '\n0 failed' : `\n${falhas} failed`);
process.exit(falhas === 0 ? 0 : 1);
