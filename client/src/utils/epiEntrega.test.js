/**
 * Etapa 178 (T2) — as regras puras da tela "Entrega de EPI". O texto de cada aviso e o LITERAL do servidor (RN-178.04 e as
 * emendas da Fase 2): se a tela antecipar com outra frase, a pessoa le duas versoes do mesmo erro.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/epiEntrega --watchAll=false
 */
import {
  avisoDoCa, erroDaQuantidade, montarFormDataEntrega, codigoVerificacao, seloVerificacao, ehEpi, rotuloMotivo,
} from './epiEntrega';

const EPI = { id: 3, codigo: 'EPI-LUV-01', nome: 'Luva de vaqueta', is_epi: true, ca_numero: '12345', ca_validade: '2026-10-22' };

describe('avisoDoCa', () => {
  test('sem numero de CA: a frase do servidor', () => {
    expect(avisoDoCa({ ...EPI, ca_numero: null }, '2026-10-22')).toBe('EPI EPI-LUV-01 sem número de CA cadastrado');
    expect(avisoDoCa({ ...EPI, ca_numero: '   ' }, '2026-10-22')).toBe('EPI EPI-LUV-01 sem número de CA cadastrado');
  });

  test('CA vencido ontem: a frase do servidor com a data dd/mm/aaaa', () => {
    expect(avisoDoCa({ ...EPI, ca_validade: '2026-10-21' }, '2026-10-22'))
      .toBe('O CA 12345 do EPI EPI-LUV-01 venceu em 21/10/2026');
  });

  test('CA que vence HOJE ainda vale (o servidor recusa so o anterior ao dia de Brasilia)', () => {
    expect(avisoDoCa(EPI, '2026-10-22')).toBeNull();
  });

  test('sem validade gravada nao e vencido', () => {
    expect(avisoDoCa({ ...EPI, ca_validade: null }, '2026-10-22')).toBeNull();
  });

  test('o hoje padrao e o dia LOCAL (Brasilia), nao o UTC', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-23T01:30:00Z')); // 22/10 22h30 em Brasilia
    try {
      expect(avisoDoCa({ ...EPI, ca_validade: '2026-10-22' })).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('EPI com serie ou lote: a frase da emenda I3', () => {
    expect(avisoDoCa({ ...EPI, ca_validade: '2030-01-01', controle_serie: 1 }, '2026-10-22'))
      .toBe('EPI EPI-LUV-01 com controle de série/lote não é suportado nesta etapa');
  });
});

describe('erroDaQuantidade', () => {
  test('inteira positiva passa', () => {
    expect(erroDaQuantidade('2')).toBeNull();
    expect(erroDaQuantidade(1)).toBeNull();
  });
  test('fracionaria recusa com a frase do servidor', () => {
    expect(erroDaQuantidade('1.5')).toBe('Quantidade de EPI deve ser inteira');
    expect(erroDaQuantidade('1,5')).toBe('Quantidade de EPI deve ser inteira');
  });
  test('zero, negativa e vazia recusam', () => {
    expect(erroDaQuantidade('0')).not.toBeNull();
    expect(erroDaQuantidade('-1')).not.toBeNull();
    expect(erroDaQuantidade('')).toBe('Informe a quantidade');
  });
});

describe('montarFormDataEntrega', () => {
  const blob = new Blob(['png'], { type: 'image/png' });

  test('leva os campos do contrato e o arquivo `assinatura` PNG', () => {
    const fd = montarFormDataEntrega({
      colaborador_id: '7', material_id: '3', quantidade: '2', tamanho: ' G ', motivo: 'TROCA', observacao: ' rasgou ',
    }, blob);
    expect(fd.get('colaborador_id')).toBe('7');
    expect(fd.get('material_id')).toBe('3');
    expect(fd.get('quantidade')).toBe('2');
    expect(fd.get('tamanho')).toBe('G');
    expect(fd.get('motivo')).toBe('TROCA');
    expect(fd.get('observacao')).toBe('rasgou');
    const arquivo = fd.get('assinatura');
    expect(arquivo).toBeInstanceOf(Blob);
    expect(arquivo.type).toBe('image/png');
    expect(arquivo.name).toBe('assinatura.png');
  });

  test('opcionais vazios nao vao', () => {
    const fd = montarFormDataEntrega({ colaborador_id: 7, material_id: 3, quantidade: 1, tamanho: '', motivo: '', observacao: '  ' }, blob);
    expect(fd.has('tamanho')).toBe(false);
    expect(fd.has('motivo')).toBe(false);
    expect(fd.has('observacao')).toBe(false);
  });
});

describe('selo e codigo de verificacao', () => {
  test('integro', () => {
    expect(seloVerificacao({ integro: true })).toEqual({ ok: true, texto: 'Íntegro' });
  });
  test('adulterado traz o motivo do servidor', () => {
    expect(seloVerificacao({ integro: false, motivo: 'arquivo alterado' })).toEqual({ ok: false, texto: 'Adulterado: arquivo alterado' });
    expect(seloVerificacao({ integro: false, motivo: 'registro alterado' }).texto).toBe('Adulterado: registro alterado');
    expect(seloVerificacao({ integro: false, motivo: 'arquivo ausente' }).texto).toBe('Adulterado: arquivo ausente');
  });
  test('codigo abreviado: 12 primeiros hex em grupos de 4', () => {
    expect(codigoVerificacao('a1b2c3d4e5f6a7b8c9d0')).toBe('A1B2-C3D4-E5F6');
    expect(codigoVerificacao('')).toBe('—');
  });
});

test('ehEpi aceita bool e 0/1; rotuloMotivo traduz', () => {
  expect(ehEpi({ is_epi: 1 })).toBe(true);
  expect(ehEpi({ is_epi: true })).toBe(true);
  expect(ehEpi({ is_epi: 0 })).toBe(false);
  expect(ehEpi({})).toBe(false);
  expect(rotuloMotivo('PRIMEIRA_ENTREGA')).toBe('Primeira entrega');
});
