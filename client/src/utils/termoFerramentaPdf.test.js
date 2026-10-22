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
// Etapa 185 (T2): o termo passa a quebrar por LARGURA (getTextWidth/splitTextToSize) — essas medidas vao para um jsPDF REAL (molde:
// EpiAlmoxarifado.test.js da 183); o resto continua gravado. O console.error do carregamento (sonda de canvas do jsdom) e calado.
jest.mock('jspdf', () => {
  const erroOriginal = console.error;
  console.error = () => {};
  let JsPdfReal;
  try { ({ jsPDF: JsPdfReal } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
  return function JsPdfGravador() {
    const medidor = new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    const soMedem = { getTextWidth: true, splitTextToSize: true };
    return new Proxy({}, {
      get: (_alvo, nome) => (...args) => {
        if (nome === 'setFontSize') medidor.setFontSize(...args);
        if (soMedem[nome]) return medidor[nome](...args);
        mockChamadas.push([nome, ...args]);
        return undefined;
      },
    });
  };
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
  // Etapa 185 (RN-185.09): o descritor leva o TEXTO da versao, literal (a quebra em linhas passou para o desenho, por largura medida) —
  // mudanca de contrato intencional do descritor (`linhasTexto` saiu; ninguem o lia fora deste teste).
  expect(doc.texto).toBe(TEXTO);
  expect(doc).not.toHaveProperty('linhasTexto');
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
  expect(vazio.texto).toBe('');
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

// ---------------------------------------------------------------------------------------------------------------------------------
// Etapa 185 (T2, B1219) — o termo e prova assinada como a ficha de EPI e tinha o mesmo defeito: o texto era quebrado por CONTAGEM (95
// letras) e as linhas de identificacao saiam numa linha so, sem medir. Texto em CAIXA ALTA ia a 210,6 mm (a folha tem 210); a linha
// "Registrado por" com nome de 44 letras, a 199,9 (margem 196). As reguas medem com o jsPDF REAL, na fonte em que cada texto foi desenhado.
const MARGEM_DIREITA = 196;
const novoMedidor = () => {
  // eslint-disable-next-line global-require
  const { jsPDF: JsPdfReal } = jest.requireActual('jspdf');
  return new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
};
// copia da regua da ficha (fichaEpiPdf.test.js) — os arquivos de teste nao importam um do outro
const textosForaDaFolha = () => {
  const medidor = novoMedidor();
  let fonte = 16;
  const fora = [];
  for (const [nome, ...args] of mockChamadas) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'text') {
      medidor.setFontSize(fonte);
      const fim = args[1] + medidor.getTextWidth(String(args[0]));
      if (fim > MARGEM_DIREITA + 1e-6) fora.push([String(args[0]).slice(0, 30), fonte, Number(fim.toFixed(1))]);
    }
  }
  return fora;
};
const textosNaFonte = (f) => {
  let fonte = 16;
  const out = [];
  for (const [nome, ...args] of mockChamadas) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'text' && fonte === f) out.push(String(args[0]));
  }
  return out;
};
const semEspaco = (s) => String(s).replace(/\s/g, '');
const medirFonte10 = (() => {
  let medidor = null;
  return (s) => {
    if (!medidor) { medidor = novoMedidor(); medidor.setFontSize(10); }
    return medidor.getTextWidth(s);
  };
})();
const LARGURA_UTIL = 182;
const CAIXA_ALTA = 'MAIUSCULAS LARGAS NO TEXTO DO TERMO DE RESPONSABILIDADE QUE A EMPRESA FORNECEU EM CAIXA ALTA PARA DESTACAR AS OBRIGACOES '
  + 'DO COLABORADOR';
const W_200 = 'W'.repeat(200);

test('[RN-185.07] quebrarTexto com a regua medida: nenhuma linha passa de 182 mm; a juncao por paragrafo e o paragrafo', () => {
  for (const texto of [CAIXA_ALTA, W_200, `${CAIXA_ALTA}\n\n${W_200}`]) {
    const linhas = quebrarTexto(texto, LARGURA_UTIL, medirFonte10);
    linhas.forEach((l) => expect([l.slice(0, 20), medirFonte10(l) <= LARGURA_UTIL]).toEqual([l.slice(0, 20), true]));
    // juncao: as linhas de cada paragrafo (separados pela linha em branco), sem espacos, sao o paragrafo sem espacos
    const paragrafos = texto.split('\n\n');
    const grupos = linhas.join('\n').split('\n\n');
    expect(grupos.map((g) => semEspaco(g))).toEqual(paragrafos.map((p) => semEspaco(p)));
  }
  expect(quebrarTexto(W_200, LARGURA_UTIL, medirFonte10).length).toBeGreaterThanOrEqual(3);
  expect(quebrarTexto(CAIXA_ALTA, LARGURA_UTIL, medirFonte10).length).toBeGreaterThanOrEqual(2);
  expect(quebrarTexto('a\n\nb', LARGURA_UTIL, medirFonte10)).toEqual(['a', '', 'b']);
});

// Fase 5 da 185: a M6 prometia "termina sempre", mas com largura <= 0, ou uma regua que mede '' acima da largura, a palavra vazia
// ainda "nao cabia" e o laco nao terminava (sonda rev185-s5: heap limit). A regua tem TETO de chamadas: uma regressao faz o teste
// CAIR com "NAO TERMINA" em vez de travar o Jest.
const comTeto = (medir, teto = 5000) => {
  let n = 0;
  return (s) => { n += 1; if (n > teto) throw new Error('NAO TERMINA'); return medir(s); };
};
test('[RN-185.07, emenda M6] quebrarTexto termina mesmo quando um caractere sozinho nao cabe: leva ao menos um por linha', () => {
  expect(quebrarTexto('WW', 1, comTeto(medirFonte10))).toEqual(['W', 'W']);
});

test('[Fase 5 da 185] quebrarTexto termina com qualquer largura ou regua e nao perde letra', () => {
  const casos = [
    ['a', -1, medirFonte10, ['a']],
    ['WW', 0, medirFonte10, ['W', 'W']],
    ['ab cd', -5, medirFonte10, ['a', 'b', 'c', 'd']],
    ['a', 5, () => Infinity, ['a']],
    ['ab', NaN, medirFonte10, ['ab']],
    ['ab cd', Infinity, medirFonte10, ['ab cd']],
    ['ab cd', 0, () => NaN, ['ab', 'cd']],
  ];
  casos.forEach(([texto, largura, medir, esperado]) => {
    const linhas = quebrarTexto(texto, largura, comTeto(medir));
    expect([texto, String(largura), linhas]).toEqual([texto, String(largura), esperado]);
    expect(semEspaco(linhas.join(''))).toBe(semEspaco(texto)); // nenhuma letra perdida
  });
});

test('[RN-185.07] o PDF do termo com o texto em CAIXA ALTA: nada passa da margem; o texto sai em 2+ linhas de fonte 10', async () => {
  await gerarTermoFerramentaPdf({ ...DADOS, termo: { ...DADOS.termo, texto: `${CAIXA_ALTA}\n\n${W_200}` } },
    { carregarImagem: async () => 'data:image/png;base64,AAAA' });
  expect(textosForaDaFolha()).toEqual([]);
  const doTexto = textosNaFonte(10);
  expect(doTexto.length).toBeGreaterThanOrEqual(2);
  expect(semEspaco(doTexto.join(''))).toBe(semEspaco(`${CAIXA_ALTA}${W_200}`));
});

const NOME_44 = 'Maria Aparecida dos Santos Oliveira Ferreira';
const NOME_60 = 'Jose Carlos Albuquerque Cavalcanti de Oliveira Pereira Netto';
const FERRAMENTA_80 = 'Esmerilhadeira angular 7 pol 2200W Bosch GWS 22-180 com disco de corte e coifa 9';
const MATRICULA_60 = 'MATRICULA-FUNCIONAL-'.repeat(3);
// junta as linhas (fonte 9) que comecam no text que abre com `inicio`, ate cobrir a frase
const juncaoDe = (inicio, frase) => {
  const textos = textosNaFonte(9);
  const i = textos.findIndex((t) => t.startsWith(inicio));
  const alvo = semEspaco(frase).length;
  const out = [];
  for (let k = i; k >= 0 && k < textos.length && semEspaco(out.join('')).length < alvo; k += 1) out.push(textos[k]);
  return out;
};

test('[RN-185.08] linhas de identificacao longas quebram por largura: nada passa da margem e nenhuma letra e perdida', async () => {
  expect([NOME_44.length, NOME_60.length, FERRAMENTA_80.length, MATRICULA_60.length]).toEqual([44, 60, 80, 60]);
  const dados = { ...DADOS, termo: { ...DADOS.termo, criado_por_nome: NOME_44,
    ferramenta: { ...DADOS.termo.ferramenta, nome: FERRAMENTA_80 },
    colaborador: { ...DADOS.termo.colaborador, nome: NOME_60, matricula: MATRICULA_60 } } };
  const doc = await gerarTermoFerramentaPdf(dados, { carregarImagem: async () => 'data:image/png;base64,AAAA' });
  expect(textosForaDaFolha()).toEqual([]);
  const frases = [
    ['Ferramenta: ', `Ferramenta: ${doc.ferramenta.codigo} — ${doc.ferramenta.nome}    Série: ${doc.ferramenta.serie}`],
    ['Colaborador: ', `Colaborador: ${doc.colaborador.nome}    Matrícula: ${doc.colaborador.matricula}    Setor: ${doc.colaborador.setor}`],
    ['Devolução prevista: ', `Devolução prevista: ${doc.dataPrevista}    Registrado por: ${doc.registradoPor}    Assinado em: ${doc.assinadoEm}`],
    ['Matrícula confirmada', `Matrícula confirmada pelo colaborador: ${doc.matriculaConfirmada}`],
    ['Assinatura de ', `Assinatura de ${doc.colaborador.nome}`],
  ];
  frases.forEach(([inicio, frase]) => expect([inicio, semEspaco(juncaoDe(inicio, frase).join(''))]).toEqual([inicio, semEspaco(frase)]));
  // metade positiva: a linha da devolucao (199,9 mm numa linha so) e a da matricula confirmada sairam em 2+ linhas
  expect(juncaoDe('Devolução prevista: ', frases[2][1]).length).toBeGreaterThanOrEqual(2);
  expect(juncaoDe('Matrícula confirmada', frases[3][1]).length).toBeGreaterThanOrEqual(2);
});
