/**
 * Etapa 140 (RN-140.12b, C301): o seletor de status do formulário de proposta só oferece "Desconto aprovado" quando a proposta GRAVADA
 * já está nele — o status é dado pela aprovação do desconto (Comercial → Aprovações), e o servidor recusa entrar nele pelo salvar.
 * Antes: numa rascunho com 10% sem aprovação, escolher "Desconto aprovado", salvar e Enviar mandava a proposta.
 */
import { opcoesStatusProposta, STATUS_PROPOSTA } from './propostaComercial';

const desabilitadas = (lista) => lista.filter((o) => o.disabled).map((o) => o.value);

test('[RN-140.12b] fora de "desconto aprovado", a opção existe mas fica desabilitada', () => {
  for (const gravado of ['rascunho', 'enviada', 'aprovada', 'rejeitada', undefined, null, '']) {
    const ops = opcoesStatusProposta(gravado);
    expect(ops.map((o) => o.value)).toEqual(STATUS_PROPOSTA.map((o) => o.value));
    expect(desabilitadas(ops)).toEqual(['desconto_aprovado']);
    expect(ops.find((o) => o.value === 'desconto_aprovado').title).toMatch(/aprovação do desconto/);
  }
});

test('[RN-140.12b] a proposta gravada em "desconto aprovado" mantém a opção habilitada (o formulário manda o status de novo)', () => {
  expect(desabilitadas(opcoesStatusProposta('desconto_aprovado'))).toEqual([]);
});

test('[RN-140.12b] as outras opções nunca ficam desabilitadas e a lista original não é alterada', () => {
  opcoesStatusProposta('rascunho');
  expect(STATUS_PROPOSTA.some((o) => 'disabled' in o)).toBe(false);
  const ops = opcoesStatusProposta('rascunho').filter((o) => o.value !== 'desconto_aprovado');
  expect(ops.every((o) => o.disabled === false)).toBe(true);
});
