/**
 * Etapa 180 (T3, RN-180.05) — o termo de responsabilidade de um emprestimo em PDF. Molde: fichaEpiPdf.test.js — o alvo e o
 * DESCRITOR (montador puro, inclusive a quebra do texto), e no renderizador so o que o descritor nao prova: a assinatura entra como
 * PNG, o texto vai linha a linha e os hashes vao inteiros. O jspdf e substituido por um gravador de chamadas.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/termoFerramenta --watchAll=false
 */
import { montarTermoFerramenta, gerarTermoFerramentaPdf, quebrarTexto } from './termoFerramentaPdf';
import {
  montarFormDataEmprestimo, erroDaConfirmacaoTermo, ehVersaoDoTermoTrocada, mensagemErroEmprestimo, erroDoNovoTexto,
  matriculaConfirmadaTexto,
} from './termoFerramenta';

const mockChamadas = [];
jest.mock('jspdf', () => function JsPdfGravador() {
  return new Proxy({}, { get: (_alvo, nome) => (...args) => { mockChamadas.push([nome, ...args]); } });
});

const HASH = 'ab'.repeat(32);
const TEXTO = 'TEXTO PROVISÓRIO — substituir pelo termo da empresa.\n\nDeclaro que recebi a ferramenta.';
const DADOS = {
  emprestimo: { id: 20, codigo_patrimonio: 'FER-002', status: 'EMPRESTADA' },
  termo: { numero: 'TERMO-20261022-0001', versao: 3, texto: TEXTO, texto_sha256: 'cd'.repeat(32), provisorio: true,
    ferramenta: { id: 2, codigo_patrimonio: 'FER-002', numero_serie: null, nome: 'Paquímetro digital' },
    colaborador: { id: 9, nome: 'João Silva', matricula: 'M-900', setor: 'Qualidade' },
    data_prevista_devolucao: '2026-11-05', criado_por_nome: 'Joao Almoxarife', criado_em: '2026-10-23T01:30:00.000Z' },
  evidencia: { arquivo_url: '/api/uploads/almoxarifado/assinatura-termo-1.png?exp=1&sig=a', registro_sha256: HASH,
    confirmado_por_matricula: 1 }, // a forma real do servidor: a FLAG (T4), nao a matricula
};

beforeEach(() => { mockChamadas.length = 0; });

test('montarTermoFerramenta: dados da fotografia, versão, selo provisório, matrícula digitada, hashes inteiros', () => {
  const doc = montarTermoFerramenta(DADOS, { geradoEm: '2026-10-22T12:00:00Z' });
  expect(doc.titulo).toBe('Termo de responsabilidade — TERMO-20261022-0001');
  expect(doc.versao).toBe('3');
  expect(doc.provisorio).toBe(true);
  expect(doc.avisoProvisorio).toBe('Texto provisório — a empresa ainda não forneceu o texto definitivo do termo');
  expect(doc.ferramenta).toEqual({ codigo: 'FER-002', nome: 'Paquímetro digital', serie: '—' });
  expect(doc.colaborador).toEqual({ nome: 'João Silva', matricula: 'M-900', setor: 'Qualidade' });
  expect(doc.matriculaConfirmada).toBe('Sim — digitou M-900 (confere com o cadastro)');
  expect(doc.dataPrevista).toBe('05/11/2026');
  // 22h30 de 22/10 em Brasilia: nao vira 23/10
  expect(doc.assinadoEm).toMatch(/^22\/10\/2026/);
  expect(doc.linhasTexto).toEqual(['TEXTO PROVISÓRIO — substituir pelo termo da empresa.', '', 'Declaro que recebi a ferramenta.']);
  expect(doc.hashRegistro).toBe(HASH);
  expect(doc.hashTexto).toBe('cd'.repeat(32));
  expect(doc.geradoEm).toBe('22/10/2026');
  expect(doc.nomeArquivo).toBe('termo-TERMO-20261022-0001.pdf');
});

test('montarTermoFerramenta: texto definitivo sem aviso; tudo vazio vira travessão, não quebra', () => {
  expect(montarTermoFerramenta({ ...DADOS, termo: { ...DADOS.termo, provisorio: false } }).avisoProvisorio).toBeNull();
  const vazio = montarTermoFerramenta({});
  expect(vazio.numero).toBe('—');
  expect(vazio.colaborador.nome).toBe('—');
  expect(vazio.linhasTexto).toEqual(['']);
  expect(vazio.hashRegistro).toBe('—');
});

test('quebrarTexto: respeita a largura, as palavras e os parágrafos; palavra maior que a linha é cortada', () => {
  expect(quebrarTexto('um dois tres quatro', 9)).toEqual(['um dois', 'tres', 'quatro']);
  expect(quebrarTexto('a\n\nb', 10)).toEqual(['a', '', 'b']);
  expect(quebrarTexto('x'.repeat(12), 5)).toEqual(['xxxxx', 'xxxxx', 'xx']);
  quebrarTexto('palavra '.repeat(80), 40).forEach((l) => expect(l.length).toBeLessThanOrEqual(40));
});

test('gerarTermoFerramentaPdf: a assinatura entra como PNG, o texto linha a linha e o hash do registro inteiro', async () => {
  const carregarImagem = jest.fn().mockResolvedValue('data:image/png;base64,AAAA');
  const doc = await gerarTermoFerramentaPdf(DADOS, { carregarImagem });
  expect(carregarImagem).toHaveBeenCalledWith(DADOS.evidencia.arquivo_url);
  const imagens = mockChamadas.filter(([n]) => n === 'addImage');
  expect(imagens).toHaveLength(1);
  expect(imagens[0][1]).toBe('data:image/png;base64,AAAA');
  expect(imagens[0][2]).toBe('PNG');
  const textos = mockChamadas.filter(([n]) => n === 'text').map((c) => c[1]);
  expect(textos).toContain('Declaro que recebi a ferramenta.');
  expect(textos).toContain('Texto provisório — a empresa ainda não forneceu o texto definitivo do termo');
  expect(textos.some((t) => t.includes(HASH))).toBe(true);
  expect(textos.some((t) => t.includes('Matrícula confirmada pelo colaborador: Sim — digitou M-900 (confere com o cadastro)'))).toBe(true);
  expect(mockChamadas.find(([n]) => n === 'save')[1]).toBe('termo-TERMO-20261022-0001.pdf');
  expect(doc.assinaturaIndisponivel).toBe(false);
});

test('gerarTermoFerramentaPdf: sem a imagem, sai o aviso e o retorno diz que faltou', async () => {
  const doc = await gerarTermoFerramentaPdf(DADOS, { carregarImagem: jest.fn().mockResolvedValue(null) });
  expect(mockChamadas.filter(([n]) => n === 'addImage')).toHaveLength(0);
  expect(mockChamadas.some(([n, t]) => n === 'text' && t === '(imagem da assinatura indisponível)')).toBe(true);
  expect(doc.assinaturaIndisponivel).toBe(true);
});

describe('termoFerramenta (regras puras do empréstimo)', () => {
  const PNG = new Blob(['png'], { type: 'image/png' });

  test('montarFormDataEmprestimo: os campos do contrato; opcional vazio não vai; nada de colaborador_nome', () => {
    const fd = montarFormDataEmprestimo({ colaborador_id: '7', confirmacao_matricula: ' M-1 ', data_prevista_devolucao: '',
      observacoes: '   ', colaborador_nome: 'Digitado' }, PNG, 4, 'chave-1234');
    expect(fd.get('colaborador_id')).toBe('7');
    expect(fd.get('confirmacao_matricula')).toBe('M-1');
    expect(fd.get('termo_versao')).toBe('4');
    expect(fd.get('chave_idempotencia')).toBe('chave-1234');
    expect(fd.get('assinatura').type).toBe('image/png');
    expect(fd.has('data_prevista_devolucao')).toBe(false);
    expect(fd.has('observacoes')).toBe(false);
    expect(fd.has('colaborador_nome')).toBe(false);
  });

  test('erroDaConfirmacaoTermo, ehVersaoDoTermoTrocada, mensagemErroEmprestimo, erroDoNovoTexto', () => {
    expect(erroDaConfirmacaoTermo(' ')).toBe('O colaborador deve digitar a própria matrícula para assinar o termo');
    expect(erroDaConfirmacaoTermo('M-1')).toBeNull();
    expect(ehVersaoDoTermoTrocada({ response: { status: 409, data: { error: 'O texto do termo mudou (versão 2) — releia e assine de novo' } } })).toBe(true);
    expect(ehVersaoDoTermoTrocada({ response: { status: 409, data: { error: 'A ferramenta não está disponível' } } })).toBe(false);
    expect(mensagemErroEmprestimo({ response: { status: 413, data: {} } })).toBe('A imagem da assinatura passou de 2 MB — refaça a assinatura');
    expect(mensagemErroEmprestimo({ response: { status: 400, data: { error: 'X' } } })).toBe('X');
    expect(mensagemErroEmprestimo(new Error('rede'))).toMatch(/^Sem resposta do servidor/);
    expect(erroDoNovoTexto('', { texto: 'a' })).toBe('O texto do termo é obrigatório');
    expect(erroDoNovoTexto(' a ', { texto: 'a' })).toBe('O texto é igual ao da versão vigente');
    expect(erroDoNovoTexto('x'.repeat(20001), null)).toBe('O texto do termo deve ter no máximo 20000 caracteres');
    expect(erroDoNovoTexto('b', { texto: 'a' })).toBeNull();
  });
});

test('matriculaConfirmadaTexto (T4): a evidencia traz a FLAG 1, nao a matricula; nunca imprime o "1" cru', () => {
  const colab = { matricula: 'M-900' };
  expect(matriculaConfirmadaTexto({ confirmado_por_matricula: 1 }, colab)).toBe('Sim — digitou M-900 (confere com o cadastro)');
  expect(matriculaConfirmadaTexto({ confirmado_por_matricula: '1' }, colab)).toBe('Sim — digitou M-900 (confere com o cadastro)');
  expect(matriculaConfirmadaTexto({ confirmado_por_matricula: 1 }, { matricula: null })).toBe('Sim');
  expect(matriculaConfirmadaTexto({ confirmado_por_matricula: 0 }, colab)).toBe('Não registrada');
  expect(matriculaConfirmadaTexto({ confirmado_por_matricula: null }, colab)).toBe('Não registrada');
  expect(matriculaConfirmadaTexto(null, colab)).toBe('Não registrada');
});
