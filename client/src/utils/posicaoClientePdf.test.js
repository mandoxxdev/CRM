/**
 * Etapa 8, Task 8. Molde: utils/etiquetasPdf.js (Etapa 6c) — montadores PUROS testaveis sem DOM
 * nem binario de PDF, e um renderizador jspdf separado. Zero mudanca de servidor.
 *
 * O que se testa aqui e o CONTEUDO montado (o descritor), nunca o PDF gerado: assertar sobre
 * bytes de PDF nao diz se o numero certo foi para a coluna certa, que e o unico erro que importa
 * num documento que o cliente recebe para conferir o patrimonio dele.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/posicaoClientePdf --watchAll=false
 */
import { montarPosicaoClientePDF } from './posicaoClientePdf';

const CLIENTE = { id: 7, razao_social: 'Cliente Alfa LTDA' };
const ITENS = [
  { material_id: 1, codigo: 'CHP-001', nome: 'Chapa 3mm', unidade: 'PC', recebido: 100, consumido: 50, devolvido: 10, saldo: 40 },
  { material_id: 2, codigo: 'TUB-002', nome: 'Tubo 2"', unidade: 'M', recebido: 30, consumido: 0, devolvido: 0, saldo: 30 },
];
const APLICACOES = [
  { material_id: 1, codigo: 'CHP-001', os_id: null, numero_os: null, projeto_id: 9, projeto_nome: 'Projeto Alfa', quantidade: 30 },
  { material_id: 1, codigo: 'CHP-001', os_id: 5, numero_os: 'OS-ALFA-1', projeto_id: null, projeto_nome: null, quantidade: 20 },
];

test('o cabecalho nomeia o cliente e a data de geracao', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: APLICACOES, geradoEm: '2026-08-12T10:00:00Z' });
  expect(doc.titulo).toBe('Posição de materiais — Cliente Alfa LTDA');
  expect(doc.geradoEm).toBe('12/08/2026');
});

test('as linhas de item trazem recebido, consumido, devolvido e saldo', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: [] });
  expect(doc.linhasItens).toEqual([
    ['CHP-001', 'Chapa 3mm', 'PC', '100', '50', '10', '40'],
    ['TUB-002', 'Tubo 2"', 'M', '30', '0', '0', '30'],
  ]);
});

test('o total do rodape soma os saldos', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: [] });
  expect(doc.totalSaldo).toBe(70);
});

test('a aplicacao mostra OS quando ha OS e projeto quando so ha projeto', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: APLICACOES });
  expect(doc.linhasAplicacoes).toEqual([
    ['CHP-001', 'Projeto Alfa', '30'],
    ['CHP-001', 'OS OS-ALFA-1', '20'],
  ]);
});

test('sem aplicacoes o bloco sai vazio, nao quebra', () => {
  const doc = montarPosicaoClientePDF({ cliente: CLIENTE, itens: ITENS, aplicacoes: undefined });
  expect(doc.linhasAplicacoes).toEqual([]);
});

test('item sem saldo continua na lista (o cliente precisa ver o que zerou)', () => {
  const doc = montarPosicaoClientePDF({
    cliente: CLIENTE,
    itens: [{ material_id: 3, codigo: 'X', nome: 'Zerado', unidade: 'PC', recebido: 10, consumido: 10, devolvido: 0, saldo: 0 }],
    aplicacoes: [],
  });
  expect(doc.linhasItens).toHaveLength(1);
  expect(doc.totalSaldo).toBe(0);
});

test('sem dados nenhum o montador nao explode — o botao de PDF pode ser clicado antes da carga', () => {
  const doc = montarPosicaoClientePDF();
  expect(doc.linhasItens).toEqual([]);
  expect(doc.linhasAplicacoes).toEqual([]);
  expect(doc.totalSaldo).toBe(0);
  expect(doc.titulo).toBe('Posição de materiais — cliente');
});

test('aplicacao sem OS e sem projeto nao vira linha em branco', () => {
  // A guarda do dono (Task 3) impede saida de material de cliente sem OS nem projeto, e o
  // servico ja filtra essas linhas — mas o montador e usado com o que a tela tiver em maos, e
  // uma linha "aplicado em —" no PDF do cliente parece perda de rastreabilidade, nao ausencia
  // de dado.
  const doc = montarPosicaoClientePDF({
    cliente: CLIENTE,
    itens: ITENS,
    aplicacoes: [{ material_id: 1, codigo: 'CHP-001', os_id: null, numero_os: null, projeto_id: null, projeto_nome: null, quantidade: 5 }],
  });
  expect(doc.linhasAplicacoes).toEqual([]);
});
