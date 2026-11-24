/**
 * Família vazia no catálogo da proposta: por que não achou nada (pedido do Comercial, 24/11/2026: "mesmo com o projeto conceitual
 * cadastrado no meu sistema, não sobe para cá").
 */
import { diagnosticarFamiliaVazia, normalizarFamilia } from './familiaVaziaDiagnostico';

test('produto preso a um nome de familia que nao existe mais aparece como orfao; o da familia atual (outra caixa/acento) nao', () => {
  const d = diagnosticarFamiliaVazia({
    inativosDaFamilia: [{ id: 9 }],
    ativos: [
      { codigo: '110-01-PCT-01', nome: 'PROJETO CONCEITUAL', familia: 'PROJETO CONCEITUAL' },
      { codigo: 'MB-1', nome: 'Masseira', familia: 'masseiras' },
      { codigo: 'H-1', nome: 'Helice', familia: 'Hélices e Acessórios' },
      { codigo: 'X', nome: 'Sem familia', familia: '' },
    ],
    familias: [{ nome: 'PROJETO CONCEITUAL - TINTAS' }, { nome: 'MASSEIRAS' }, { nome: 'HELICES E ACESSORIOS' }],
  });
  expect(d.inativos).toBe(1);
  expect(d.orfaos).toEqual([{ codigo: '110-01-PCT-01', nome: 'PROJETO CONCEITUAL', familia: 'PROJETO CONCEITUAL' }]);
});

test('a regua de familia e a do servidor: sem caixa, sem acento, espacos reduzidos', () => {
  expect(normalizarFamilia('  Hélices   e Acessórios ')).toBe('HELICES E ACESSORIOS');
});
