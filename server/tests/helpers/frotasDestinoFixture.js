/**
 * Frota Etapa 9 (RN-F9.02): destino novo exige endereco estruturado (rua, numero, bairro, cidade, UF). Os testes que so precisam de
 * "um destino qualquer" usam este endereco valido; quem testa o endereco monta o corpo a mao.
 *
 *   const { ENDERECO_OK, comEndereco, ENDERECO_OK_MONTADO } = require('../helpers/frotasDestinoFixture');
 *   await ana('post', '/api/frotas/destinos', comEndereco({ nome: 'Obra Beta' }));
 */
const ENDERECO_OK = Object.freeze({
  logradouro: 'Rua das Flores',
  numero: '100',
  bairro: 'Centro',
  cidade: 'São Bernardo do Campo',
  uf: 'SP',
});

/** O `endereco` que o servidor monta para ENDERECO_OK (sem CEP, sem complemento). */
const ENDERECO_OK_MONTADO = 'Rua das Flores, 100, Centro, São Bernardo do Campo/SP';

function comEndereco(corpo) {
  return { ...ENDERECO_OK, ...(corpo || {}) };
}

module.exports = { ENDERECO_OK, ENDERECO_OK_MONTADO, comEndereco };
