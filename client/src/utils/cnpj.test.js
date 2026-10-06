/**
 * Etapa 34 — utilitário de CNPJ da ficha do fornecedor.
 *
 * Nasce aqui (e não como refatoração do ClienteForm) porque o comercial não está no lote;
 * a lógica dos dígitos verificadores é a mesma de ClienteForm.js, que pode adotar este
 * módulo depois.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/cnpj.test.js --watchAll=false
 */
import {
  somenteDigitos, formatarCNPJ, formatarCNPJCompleto, validarCNPJ, camposDaConsultaCNPJ, mesclarSoVazios, formatarCEP,
} from './cnpj';

describe('somenteDigitos / formatarCNPJ / formatarCEP', () => {
  test('somenteDigitos tira tudo que nao e numero e tolera null', () => {
    expect(somenteDigitos('54.984.382/0001-64')).toBe('54984382000164');
    expect(somenteDigitos(null)).toBe('');
    expect(somenteDigitos(undefined)).toBe('');
  });

  test('formatarCNPJ mascara progressivamente, tecla a tecla', () => {
    expect(formatarCNPJ('54')).toBe('54');
    expect(formatarCNPJ('549')).toBe('54.9');
    expect(formatarCNPJ('549843')).toBe('54.984.3');
    expect(formatarCNPJ('549843820')).toBe('54.984.382/0');
    expect(formatarCNPJ('5498438200016')).toBe('54.984.382/0001-6');
    expect(formatarCNPJ('54984382000164')).toBe('54.984.382/0001-64');
    // 15o digito nao entra
    expect(formatarCNPJ('549843820001649')).toBe('54.984.382/0001-64');
  });

  test('formatarCEP mascara 8 digitos como 00000-000 e devolve o resto como veio', () => {
    expect(formatarCEP('01310100')).toBe('01310-100');
    expect(formatarCEP('01310-100')).toBe('01310-100');
    expect(formatarCEP('0131')).toBe('0131');
    expect(formatarCEP('')).toBe('');
  });
});

describe('validarCNPJ (digitos verificadores)', () => {
  test('aceita CNPJs validos, com ou sem mascara', () => {
    expect(validarCNPJ('11.222.333/0001-81')).toBe(true);
    expect(validarCNPJ('11222333000181')).toBe(true);
    expect(validarCNPJ('00.000.000/0001-91')).toBe(true);
  });
  test('rejeita digito verificador errado, sequencia repetida e tamanho errado', () => {
    expect(validarCNPJ('11.222.333/0001-82')).toBe(false);
    expect(validarCNPJ('11.111.111/1111-11')).toBe(false);
    expect(validarCNPJ('1122233300018')).toBe(false);
    expect(validarCNPJ('')).toBe(false);
    expect(validarCNPJ(null)).toBe(false);
  });
});

describe('camposDaConsultaCNPJ (o que o proxy /api/cnpj devolve -> campos da ficha)', () => {
  const RESPOSTA_PROXY = {
    razao_social: 'TECNOPAR FIXADORES LTDA',
    nome_fantasia: 'TECNOPAR',
    logradouro: 'AV. WINSTON CHURCHILL',
    numero: '596',
    complemento: 'SALA 2',
    bairro: 'RUDGE RAMOS',
    municipio: 'SAO BERNARDO DO CAMPO',
    cidade: 'SAO BERNARDO DO CAMPO',
    uf: 'SP',
    estado: 'SP',
    cep: '09614000',
    telefone: '1141772311',
    email: 'contato@tecnopar.com.br',
  };

  test('monta endereco como o ClienteForm (logradouro, numero - complemento, bairro), CEP e telefone mascarados', () => {
    expect(camposDaConsultaCNPJ(RESPOSTA_PROXY)).toEqual({
      razao_social: 'TECNOPAR FIXADORES LTDA',
      nome_fantasia: 'TECNOPAR',
      email: 'contato@tecnopar.com.br',
      telefone: '(11) 4177-2311',
      endereco: 'AV. WINSTON CHURCHILL, 596 - SALA 2, RUDGE RAMOS',
      cidade: 'SAO BERNARDO DO CAMPO',
      estado: 'SP',
      cep: '09614-000',
    });
  });

  test('sem logradouro o endereco vem vazio; sem complemento nao sobra " - "', () => {
    const r = camposDaConsultaCNPJ({ ...RESPOSTA_PROXY, logradouro: '', complemento: '' });
    expect(r.endereco).toBe('');
    const r2 = camposDaConsultaCNPJ({ ...RESPOSTA_PROXY, complemento: '' });
    expect(r2.endereco).toBe('AV. WINSTON CHURCHILL, 596, RUDGE RAMOS');
  });

  test('tolera resposta parcial: tudo que falta vira string vazia', () => {
    expect(camposDaConsultaCNPJ({ razao_social: 'X' })).toEqual({
      razao_social: 'X', nome_fantasia: '', email: '', telefone: '', endereco: '', cidade: '', estado: '', cep: '',
    });
    expect(camposDaConsultaCNPJ(null).razao_social).toBe('');
  });
});

describe('mesclarSoVazios (preencher sem sobrescrever o que o usuario ja digitou)', () => {
  test('so preenche as chaves vazias do form; ignora valores vazios dos novos', () => {
    const form = { razao_social: '', cidade: 'Campinas', estado: '', cep: '  ', telefone: '(19) 3333-4444' };
    const novos = { razao_social: 'ACME', cidade: 'Sao Paulo', estado: 'SP', cep: '', telefone: '' };
    expect(mesclarSoVazios(form, novos)).toEqual({
      razao_social: 'ACME', cidade: 'Campinas', estado: 'SP', cep: '  ', telefone: '(19) 3333-4444',
    });
  });
  test('nao muta o form original e mantem chaves que os novos nao trazem', () => {
    const form = { a: '', b: 'x', c: 'y' };
    const r = mesclarSoVazios(form, { a: '1' });
    expect(r).toEqual({ a: '1', b: 'x', c: 'y' });
    expect(form.a).toBe('');
  });
});

describe('formatarCNPJCompleto (carga da edicao — F1 da revisao da Etapa 34)', () => {
  test('14 digitos (com ou sem mascara) viram 00.000.000/0000-00', () => {
    expect(formatarCNPJCompleto('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCNPJCompleto('11.222.333/0001-81')).toBe('11.222.333/0001-81');
  });
  test('CNPJ legado fora do padrao volta COMO VEIO — nunca inventa um CNPJ', () => {
    expect(formatarCNPJCompleto('ISENTO')).toBe('ISENTO');
    expect(formatarCNPJCompleto('12345678901')).toBe('12345678901');
    expect(formatarCNPJCompleto('DE123456789')).toBe('DE123456789');
    expect(formatarCNPJCompleto('')).toBe('');
    expect(formatarCNPJCompleto(null)).toBe('');
    // 14 digitos MAIS uma letra: nao e CNPJ — tem de voltar como veio (pega a regex errada /D/ no lugar de /D/)
    expect(formatarCNPJCompleto('A11222333000181')).toBe('A11222333000181');
  });
  test('controle: a progressiva, usada no onChange, CORTA — e por isso nao serve para a carga', () => {
    expect(formatarCNPJ('ISENTO')).toBe('');
    expect(formatarCNPJ('12345678901')).toBe('12.345.678/901');
  });
});
