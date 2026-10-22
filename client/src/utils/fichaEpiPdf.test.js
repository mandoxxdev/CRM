/**
 * Etapa 178 (T2, RN-178.09) — Ficha de EPI por colaborador. Molde: posicaoClientePdf.test.js — o alvo e o DESCRITOR (o que vai em
 * qual coluna), e no renderizador so o que o descritor nao prova: a imagem da assinatura entra como PNG e o hash vai inteiro.
 * O jspdf e substituido por um gravador de chamadas (nao e fronteira HTTP — e o binario que nao se le em teste).
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/fichaEpiPdf --watchAll=false
 */
import { montarFichaEpi, gerarFichaEpiPdf } from './fichaEpiPdf';

const mockChamadas = [];
// Funcao comum, nao jest.fn: o CRA liga `resetMocks` e apagaria a implementacao antes de cada teste.
// Etapa 183 (Fase 5, M1): as MEDIDAS (getTextWidth, splitTextToSize e o setFontSize que as afeta) vao para um jsPDF REAL — a quebra por
// largura so se prova com a largura de verdade dos glifos (um gravador que devolve undefined esconderia o 'W' que sai da folha).
// As medicoes nao sao gravadas (o desenho e o que se confere); o setFontSize e, para a regua de margem saber a fonte de cada texto.
jest.mock('jspdf', () => {
  // Ao carregar, o jsPDF sonda o canvas do navegador; o jsdom nao tem e loga um console.error inofensivo — silenciado SO no carregamento.
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
const COLABORADOR = { id: 7, nome: 'Maria Souza', matricula: 'M-100', setor: 'Caldeiraria', cpf_mascarado: '***.***.***-09', excluido: false };
const ENTREGA = {
  id: 1, numero: 'EPI-20261022-0001', criado_em: '2026-10-23T01:30:00.000Z', colaborador_id: 7, colaborador_nome: 'Maria Souza',
  matricula: 'M-100', material_id: 3, material_codigo: 'EPI-LUV-01', material_nome: 'Luva de vaqueta', ca_numero: '12345',
  ca_validade: '2027-03-31', quantidade: 2, tamanho: 'G', motivo: 'TROCA', entregue_por_nome: 'Joao Almoxarife',
  arquivo_url: '/api/uploads/almoxarifado/assinatura-epi-1.png?exp=1&sig=a', registro_sha256: HASH,
};

beforeEach(() => { mockChamadas.length = 0; });

test('o cabecalho traz nome, matricula, setor e CPF mascarado', () => {
  const doc = montarFichaEpi({ colaborador: COLABORADOR, entregas: [ENTREGA], geradoEm: '2026-10-22T12:00:00Z' });
  expect(doc.titulo).toBe('Ficha de EPI — Maria Souza');
  expect(doc.colaborador).toEqual({ nome: 'Maria Souza', matricula: 'M-100', setor: 'Caldeiraria', cpf: '***.***.***-09' });
  expect(doc.excluido).toBe(false);
  expect(doc.avisoExcluido).toBeNull();
  expect(doc.geradoEm).toBe('22/10/2026');
});

test('a linha da entrega: data no dia de Brasilia (22h30 de 22/10 nao vira 23/10), EPI, CA, validade, qtd, tamanho, motivo, quem', () => {
  const [l] = montarFichaEpi({ colaborador: COLABORADOR, entregas: [ENTREGA] }).linhas;
  expect(l).toEqual({
    id: 1,
    numero: 'EPI-20261022-0001',
    data: '22/10/2026',
    epi: 'EPI-LUV-01 — Luva de vaqueta',
    ca: '12345',
    validadeCa: '31/03/2027',
    quantidade: '2',
    tamanho: 'G',
    motivo: 'Troca',
    entreguePor: 'Joao Almoxarife',
    assinaturaUrl: '/api/uploads/almoxarifado/assinatura-epi-1.png?exp=1&sig=a',
    hash: HASH,
    // Etapa 183 (T1c, M3): +3 campos — mudanca de contrato intencional. ENTREGA nao tem a evidencia nova -> 'Não registrada'.
    matriculaConfirmada: 'Não registrada',
    aparelho: 'Não registrado',
  });
});

test('opcionais vazios saem com travessao, e o CPF sem mascara (null) tambem', () => {
  const doc = montarFichaEpi({
    colaborador: { ...COLABORADOR, cpf_mascarado: null },
    entregas: [{ ...ENTREGA, tamanho: null, motivo: null }],
  });
  expect(doc.colaborador.cpf).toBe('—');
  expect(doc.linhas[0].tamanho).toBe('—');
  expect(doc.linhas[0].motivo).toBe('—');
});

test('colaborador excluido aparece marcado (snapshot da evidencia, emenda I2)', () => {
  const doc = montarFichaEpi({ colaborador: { ...COLABORADOR, excluido: true }, entregas: [ENTREGA] });
  expect(doc.excluido).toBe(true);
  expect(doc.avisoExcluido).toBe('Colaborador excluído do cadastro — dados da data da entrega');
});

test('sem entregas: lista vazia, nao quebra', () => {
  expect(montarFichaEpi({ colaborador: COLABORADOR, entregas: undefined }).linhas).toEqual([]);
});

test('gerarFichaEpiPdf: a assinatura entra como imagem PNG e o hash vai inteiro', async () => {
  const carregarImagem = jest.fn().mockResolvedValue('data:image/png;base64,AAAA');
  await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas: [ENTREGA] }, { carregarImagem });
  expect(carregarImagem).toHaveBeenCalledWith(ENTREGA.arquivo_url);
  const imagens = mockChamadas.filter(([n]) => n === 'addImage');
  expect(imagens).toHaveLength(1);
  expect(imagens[0][1]).toBe('data:image/png;base64,AAAA');
  expect(imagens[0][2]).toBe('PNG');
  const textos = mockChamadas.filter(([n]) => n === 'text').map(([, t]) => t);
  expect(textos.some((t) => String(t).includes(HASH))).toBe(true);
  expect(textos).toContain('Nome: Maria Souza    Matrícula: M-100');
  expect(mockChamadas.find(([n]) => n === 'save')[1]).toBe('ficha-epi-maria-souza.pdf');
});

test('gerarFichaEpiPdf: imagem que nao carrega vira aviso, nao derruba o PDF', async () => {
  const carregarImagem = jest.fn().mockResolvedValue(null);
  await gerarFichaEpiPdf({ colaborador: { ...COLABORADOR, excluido: true }, entregas: [ENTREGA] }, { carregarImagem });
  expect(mockChamadas.filter(([n]) => n === 'addImage')).toHaveLength(0);
  const textos = mockChamadas.filter(([n]) => n === 'text').map(([, t]) => t);
  expect(textos).toContain('(imagem da assinatura indisponível)');
  expect(textos).toContain('Colaborador excluído do cadastro — dados da data da entrega');
});

// Etapa 183 (T1c) — o descritor ganha a confirmacao por matricula e o aparelho de cada entrega (lidos da evidencia do ato).
const UA_200 = `Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) ${'x'.repeat(200)}`.slice(0, 200);

test('[RN-183.03] confirmado com a matricula DA ENTREGA (M-100), nao a do cadastro de hoje (M-200)', () => {
  const doc = montarFichaEpi({ colaborador: { ...COLABORADOR, matricula: 'M-200' }, entregas: [{ ...ENTREGA, confirmado_por_matricula: 1 }] });
  expect(doc.colaborador.matricula).toBe('M-200');
  expect(doc.linhas[0].matriculaConfirmada).toBe('Sim — digitou M-100 (confere com o cadastro)');
});

test('[RN-183.03] flag null, 0 ou ausente -> "Não registrada"; flag 1 com matricula vazia -> "Sim"', () => {
  const comFlag = (extra) => montarFichaEpi({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, ...extra }] }).linhas[0].matriculaConfirmada;
  expect(comFlag({ confirmado_por_matricula: null })).toBe('Não registrada');
  expect(comFlag({ confirmado_por_matricula: 0 })).toBe('Não registrada');
  expect(comFlag({})).toBe('Não registrada');
  expect(comFlag({ confirmado_por_matricula: 1, matricula: '' })).toBe('Sim');
});

test('[RN-183.04] aparelho literal (aparado) — a quebra em linhas e do desenho, por largura (Fase 5, M1)', () => {
  expect(UA_200).toHaveLength(200);
  const [l] = montarFichaEpi({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, user_agent: `  ${UA_200}  ` }] }).linhas;
  expect(l.aparelho).toBe(UA_200);
  expect(l).not.toHaveProperty('linhasAparelho');
});

test('[RN-183.05] sem user_agent (null ou so espacos) -> "Não registrado", tambem como linha unica', () => {
  for (const ua of [null, undefined, '   ']) {
    const [l] = montarFichaEpi({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, user_agent: ua }] }).linhas;
    expect(l.aparelho).toBe('Não registrado');
  }
});

// Etapa 183 (T2) — o PDF desenha as duas linhas novas depois do hash (fonte 7, passo de 3 mm; aparelho recuado,
// quebrado por largura desde a Fase 5).
const ROTULO_CONFIRMACAO = 'Matrícula confirmada pelo colaborador: ';
const textosDoPdf = () => mockChamadas.filter(([n]) => n === 'text').map(([, t]) => String(t));

test('[RN-183.03] o PDF imprime a confirmacao da entrega e nenhum texto com a flag crua ("Matrícula ...: 1")', async () => {
  const carregarImagem = jest.fn().mockResolvedValue('data:image/png;base64,AAAA');
  await gerarFichaEpiPdf({ colaborador: { ...COLABORADOR, matricula: 'M-200' },
    entregas: [{ ...ENTREGA, confirmado_por_matricula: 1 }] }, { carregarImagem });
  const textos = textosDoPdf();
  expect(textos).toContain(`${ROTULO_CONFIRMACAO}Sim — digitou M-100 (confere com o cadastro)`);
  expect(textos.filter((t) => /Matr[ií]cula[^:]*:\s*1\b/.test(t))).toEqual([]);
  expect(textos.filter((t) => /:\s*1$/.test(t))).toEqual([]);
});

test('[RN-183.04] o aparelho longo sai com rotulo na 1a linha e o resto recuado, sem rotulo; a juncao e o texto inteiro', async () => {
  const carregarImagem = jest.fn().mockResolvedValue('data:image/png;base64,AAAA');
  await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, user_agent: UA_200 }] }, { carregarImagem });
  const textos = mockChamadas.filter(([n]) => n === 'text');
  const i = textos.findIndex(([, t]) => String(t).startsWith('Aparelho: '));
  expect(i).toBeGreaterThan(-1);
  const seguintes = [];
  for (let k = i + 1; k < textos.length && textos[k][2] === 14 + 14; k += 1) seguintes.push(textos[k]); // recuo M + 14
  expect(seguintes.length).toBeGreaterThan(0);
  expect(String(textos[i][1]).slice('Aparelho: '.length) + seguintes.map(([, t]) => t).join('')).toBe(UA_200);
  seguintes.forEach(([, , , y], k) => expect(y).toBe(textos[i][3] + 3 * (k + 1))); // passo de 3 mm
});

test('[RN-183.05] entrega antiga (sem evidencia nova) -> as duas linhas, com "Não registrada" e "Não registrado"', async () => {
  const carregarImagem = jest.fn().mockResolvedValue('data:image/png;base64,AAAA');
  await gerarFichaEpiPdf({ colaborador: COLABORADOR,
    entregas: [{ ...ENTREGA, id: 2, confirmado_por_matricula: 1, user_agent: 'Tablet-Almox/2.1 (Android)' },
      { ...ENTREGA, user_agent: null, confirmado_por_matricula: null }] }, { carregarImagem });
  const textos = textosDoPdf();
  expect(textos).toContain(`${ROTULO_CONFIRMACAO}Não registrada`);
  expect(textos).toContain('Aparelho: Não registrado');
  expect(textos).toContain(`${ROTULO_CONFIRMACAO}Sim — digitou M-100 (confere com o cadastro)`);
  expect(textos).toContain('Aparelho: Tablet-Almox/2.1 (Android)');
});

// I2: a regua olha TODO y de text/line e o FUNDO da imagem (y + h). Casos: (a) a montagem que poe uma entrega de 3 linhas de aparelho
// comecando em y = 245 (6 sem imagem e aparelho curto = 6 x 25; 1 com imagem e 2 linhas = 45; a 1a comeca em 50) — com o limiar 245
// ela desenhava ate 288 (Fase 5: a altura agora e medida antes, e a quebra por largura da 4 linhas ao "w" de 300); (b) 8 entregas de aparelho de 300 caracteres com imagem; (c) as mesmas, sem imagem.
const conferirRodape = () => {
  const fora = [];
  for (const c of mockChamadas) {
    if (c[0] === 'text' && c[3] > 287) fora.push(['text', c[3], c[1]]);
    if (c[0] === 'line' && (c[2] > 287 || c[4] > 287)) fora.push(['line', c[2], c[4]]);
    if (c[0] === 'addImage' && c[4] + c[6] > 287) fora.push(['addImage', c[4], c[4] + c[6]]);
  }
  return fora;
};
const SEM_IMG = (i) => `/api/uploads/almoxarifado/sem-${i}.png`;
const carregarSoComImagem = async (url) => (String(url).includes('/sem-') ? null : 'data:image/png;base64,AAAA');

test('[RN-183.08] (a) entrega mais alta comecando em 245 -> nenhum text/line/addImage passa de 287 mm', async () => {
  const entregas = [
    ...Array.from({ length: 6 }, (_, i) => ({ ...ENTREGA, id: 10 + i, arquivo_url: SEM_IMG(i), user_agent: 'curto' })),
    { ...ENTREGA, id: 20, user_agent: 'z'.repeat(200) },
    { ...ENTREGA, id: 21, user_agent: 'w'.repeat(300) },
  ];
  await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas }, { carregarImagem: carregarSoComImagem });
  // a montagem e a que o teste diz: a divisoria da 7a entrega em 240 (200 + 40) -> a 8a comeca em 245
  expect(mockChamadas.filter(([n]) => n === 'addImage')).toHaveLength(2);
  expect(mockChamadas.filter(([n, , y1]) => n === 'line' && y1 === 240)).toHaveLength(1);
  expect(conferirRodape()).toEqual([]);
});

test('[RN-183.08] (b, c) 8 entregas de aparelho com 300 caracteres, com e sem imagem -> nada passa de 287 mm', async () => {
  for (const comImagem of [true, false]) {
    mockChamadas.length = 0;
    const entregas = Array.from({ length: 8 }, (_, i) => ({ ...ENTREGA, id: 30 + i, user_agent: 'q'.repeat(300),
      arquivo_url: comImagem ? ENTREGA.arquivo_url : SEM_IMG(i) }));
    await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas }, { carregarImagem: carregarSoComImagem });
    expect(conferirRodape()).toEqual([]);
  }
});

// Etapa 183 (T4, I3) — a fixture e o corpo REAL de GET /epi/ficha/:id, gravado pelo teste do servidor
// (server/tests/api/epiFichaConfirmacaoIntegracao.api.test.js, CRM_GRAVAR_FIXTURE=1), que tambem confere SEMPRE que as chaves dela sao
// as da resposta real. Se o servidor renomear `user_agent` ou `confirmado_por_matricula`, um dos dois lados cai.
test('[RN-183.01/03/04, integracao com o servidor] a ficha REAL da rota sai com "Sim — digitou M-100" e o aparelho do tablet', async () => {
  // eslint-disable-next-line global-require
  const fichaDaRota = require('./__fixtures__/fichaEpi.rota.json');
  const [l] = montarFichaEpi(fichaDaRota).linhas;
  expect(l.matriculaConfirmada).toBe('Sim — digitou M-100 (confere com o cadastro)');
  // Fase 5 (M2): o aparelho do servidor e um User-Agent real e longo (197 caracteres) — conferido INTEIRO, no descritor e no PDF.
  const UA_DO_TABLET = 'Mozilla/5.0 (Linux; Android 14; SM-X210 Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) '
    + 'Version/4.0 Chrome/129.0.6668.100 Safari/537.36 Tablet-Almox/2.1 (Android; GMP Industriais)';
  expect(l.aparelho).toBe(UA_DO_TABLET);
  await gerarFichaEpiPdf(fichaDaRota, { carregarImagem: async () => 'data:image/png;base64,AAAA' });
  const textos = textosDoPdf();
  expect(textos).toContain(`${ROTULO_CONFIRMACAO}Sim — digitou M-100 (confere com o cadastro)`);
  const linhas = linhasDoAparelho(mockChamadas.filter(([n]) => n === 'text'));
  expect(linhas.length).toBeGreaterThan(1);
  expect(linhas.join('')).toBe(UA_DO_TABLET);
  expect(textosFora()).toEqual([]);
});

// Etapa 183, Fase 5 (M1): a quebra era por CONTAGEM (110 caracteres) — 300 'W' na fonte 7 iam ate 283 mm (a folha tem 210). A regua
// mede cada texto de fonte 7 (as linhas da evidencia) com o jsPDF REAL, na fonte em que foi desenhado: x + largura <= 196 (margem direita).
const MARGEM_DIREITA = 196;
const textosFora = () => {
  // eslint-disable-next-line global-require
  const { jsPDF: JsPdfReal } = jest.requireActual('jspdf');
  const medidor = new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
  let fonte = 16;
  const fora = [];
  for (const [nome, ...args] of mockChamadas) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'text' && fonte === 7) {
      medidor.setFontSize(fonte);
      const fim = args[1] + medidor.getTextWidth(String(args[0]));
      if (fim > MARGEM_DIREITA + 1e-6) fora.push([String(args[0]).slice(0, 30), Number(fim.toFixed(1))]);
    }
  }
  return fora;
};
const MATRICULA_88 = 'MATRICULA-MUITO-LONGA-'.repeat(4);
const linhasDoAparelho = (textos) => {
  const i = textos.findIndex(([, t]) => String(t).startsWith('Aparelho: '));
  const out = [String(textos[i][1]).slice('Aparelho: '.length)];
  for (let k = i + 1; k < textos.length && textos[k][2] === 14 + 14; k += 1) out.push(String(textos[k][1]));
  return out;
};

test('[Fase 5 M1] UA de 300 "W" e matricula de 88 caracteres: nenhuma linha da evidencia passa da margem; a juncao e o texto inteiro', async () => {
  const UA_W = 'W'.repeat(300);
  await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, confirmado_por_matricula: 1, matricula: MATRICULA_88,
    user_agent: UA_W }] }, { carregarImagem: async () => 'data:image/png;base64,AAAA' });
  const textos = mockChamadas.filter(([n]) => n === 'text');
  expect(textos.length).toBeGreaterThan(5); // metade positiva: houve desenho
  expect(textosFora()).toEqual([]);
  const linhas = linhasDoAparelho(textos);
  expect(linhas.length).toBeGreaterThan(3); // 300 'W' nao cabem em 3 linhas de largura util
  expect(linhas.join('')).toBe(UA_W);
  // a confirmacao inteira, quebrada por palavra: a juncao (com espaco) e a frase do molde
  const iConf = textos.findIndex(([, t]) => String(t).startsWith(ROTULO_CONFIRMACAO));
  const conf = [];
  for (let k = iConf; !String(textos[k][1]).startsWith('Aparelho: '); k += 1) conf.push(String(textos[k][1]));
  expect(conf.length).toBeGreaterThan(1);
  expect(conf.join(' ').replace(/\s+/g, ' ')).toBe(`${ROTULO_CONFIRMACAO}Sim — digitou ${MATRICULA_88} (confere com o cadastro)`);
});

test('[Fase 5 M1] o pior caso (8 entregas de 300 "W" e matricula larga, com e sem imagem) nao passa do rodape nem da margem', async () => {
  for (const comImagem of [true, false]) {
    mockChamadas.length = 0;
    const entregas = Array.from({ length: 8 }, (_, i) => ({ ...ENTREGA, id: 40 + i, user_agent: 'W'.repeat(300),
      confirmado_por_matricula: 1, matricula: MATRICULA_88, arquivo_url: comImagem ? ENTREGA.arquivo_url : SEM_IMG(i) }));
    await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas }, { carregarImagem: carregarSoComImagem });
    expect(mockChamadas.filter(([n]) => n === 'addPage').length).toBeGreaterThan(0); // metade positiva: houve quebra de pagina
    expect(conferirRodape()).toEqual([]);
    expect(textosFora()).toEqual([]);
  }
});

// Etapa 183, Fase 5 (M3): a assinatura comeca ABAIXO da ultima linha de texto da sua entrega (desenhada por cima, ela cobriria o aparelho).
test('[Fase 5 M3] a imagem da assinatura comeca abaixo da ultima linha de texto da entrega', async () => {
  await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, user_agent: UA_200, confirmado_por_matricula: 1 },
    { ...ENTREGA, id: 2, user_agent: 'W'.repeat(300) }] }, { carregarImagem: async () => 'data:image/png;base64,AAAA' });
  let ultimoTexto = null;
  const conferidas = [];
  for (const [nome, ...args] of mockChamadas) {
    if (nome === 'text') ultimoTexto = args[2];
    if (nome === 'line') ultimoTexto = null;
    if (nome === 'addImage') conferidas.push([args[3], ultimoTexto]);
  }
  expect(conferidas).toHaveLength(2);
  conferidas.forEach(([yImagem, yTexto]) => {
    expect(yTexto).not.toBeNull();
    expect(yImagem).toBeGreaterThan(yTexto);
  });
});

// Fase 5 (M1): com a quebra por largura a entrega pode ser MAIS alta que a de 3 linhas que o limiar fixo (y > 235) supunha. Montagem:
// 2 entregas curtas com imagem (42 cada) + 4 sem imagem (25 cada) poem a 7a em y = 234 (<= 235: o limiar antigo deixava comecar aqui);
// ela tem matricula e aparelho de 300 'W' (4+ linhas cada) e imagem — mais de 53 mm, entao so cabe na pagina seguinte.
test('[Fase 5 M1] entrega mais alta que o limiar antigo supunha, comecando em 234 -> vai para a pagina seguinte, nada passa de 287', async () => {
  const entregas = [
    ...Array.from({ length: 2 }, (_, i) => ({ ...ENTREGA, id: 50 + i, user_agent: 'curto' })),
    ...Array.from({ length: 4 }, (_, i) => ({ ...ENTREGA, id: 60 + i, arquivo_url: SEM_IMG(i), user_agent: 'curto' })),
    { ...ENTREGA, id: 70, confirmado_por_matricula: 1, matricula: 'W'.repeat(300), user_agent: 'W'.repeat(300) },
  ];
  await gerarFichaEpiPdf({ colaborador: COLABORADOR, entregas }, { carregarImagem: carregarSoComImagem });
  // a montagem e a que o teste diz: a divisoria da 6a entrega em 229 -> a 7a comeca em 234
  expect(mockChamadas.filter(([n, , y1]) => n === 'line' && y1 === 229)).toHaveLength(1);
  expect(conferirRodape()).toEqual([]); // a regua do rodape vem ANTES da contagem de paginas: e ela que o controle do limiar tem de derrubar
  expect(textosFora()).toEqual([]);
  expect(mockChamadas.filter(([n]) => n === 'addPage')).toHaveLength(1);
});
