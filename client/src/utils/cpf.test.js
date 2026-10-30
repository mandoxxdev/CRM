import { formatarCPF, validarCPF } from './cpf';

describe('cpf (Etapa 192, RN-192.01/02)', () => {
  test('formatarCPF mascara progressivo e corta em 11 digitos', () => {
    expect(formatarCPF('529')).toBe('529');
    expect(formatarCPF('5299')).toBe('529.9');
    expect(formatarCPF('5299822')).toBe('529.982.2');
    expect(formatarCPF('52998224725')).toBe('529.982.247-25');
    expect(formatarCPF('529.982.247-25999')).toBe('529.982.247-25');
  });

  test('validarCPF: digitos verificadores, todos iguais e tamanho', () => {
    expect(validarCPF('529.982.247-25')).toBe(true);
    expect(validarCPF('11144477735')).toBe(true);
    expect(validarCPF('529.982.247-24')).toBe(false);
    expect(validarCPF('111.111.111-11')).toBe(false);
    expect(validarCPF('123')).toBe(false);
    expect(validarCPF('')).toBe(false);
  });
});
