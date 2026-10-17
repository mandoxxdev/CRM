/**
 * Etapa 141 (RN-141.09): a aprovação que vale para a proposta, como o servidor a conta (casaComAprovacao). O modal "Nova solicitação"
 * de Aprovações a usa para esconder só a proposta que já tem aprovação válida.
 */
import { aprovacaoValeParaProposta } from './aprovacaoDescontoVale';

const prop = { id: 4, margem_desconto: 12.5 };
const ap = (extra = {}) => ({ proposta_id: 4, tipo: 'desconto', status: 'aprovado', valor_desconto: 12.5, solicitado_por: 7, aprovado_por: 9, ...extra });

test('[RN-141.09] aprovada por outro, mesmo percentual: vale (inclusive 12.504 ~ 12.5 e id em texto)', () => {
  expect(aprovacaoValeParaProposta(ap(), prop)).toBe(true);
  expect(aprovacaoValeParaProposta(ap({ valor_desconto: 12.504 }), prop)).toBe(true);
  expect(aprovacaoValeParaProposta(ap({ proposta_id: '4', aprovado_por: '9' }), prop)).toBe(true);
});

test('[RN-141.09] decidida por quem pediu ou por ninguém: não vale (B912) — antes escondia a proposta do modal', () => {
  expect(aprovacaoValeParaProposta(ap({ aprovado_por: 7 }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ aprovado_por: '7' }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ aprovado_por: null }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ aprovado_por: undefined }), prop)).toBe(false);
});

test('[RN-141.09] outro percentual, outra proposta, pendente, rejeitada ou outro tipo: não vale', () => {
  expect(aprovacaoValeParaProposta(ap({ valor_desconto: 12.52 }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ proposta_id: 5 }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ status: 'pendente' }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ status: 'rejeitado' }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ tipo: 'outro' }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(ap({ valor_desconto: 'abc' }), prop)).toBe(false);
  expect(aprovacaoValeParaProposta(null, prop)).toBe(false);
});

test('[RN-141.09] o modal "Nova solicitação" de Aprovações usa a regra (e não a comparação antiga só pelo valor)', () => {
  // eslint-disable-next-line global-require
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'components', 'Aprovacoes.js'), 'utf8');
  expect(src.split('aprovacaoValeParaProposta(ap, proposta)').length - 1).toBe(1);
  expect(src).not.toMatch(/ap\.valor_desconto === proposta\.margem_desconto/);
});
