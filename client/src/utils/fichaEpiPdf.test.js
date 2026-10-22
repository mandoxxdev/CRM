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
jest.mock('jspdf', () => function JsPdfGravador() {
  return new Proxy({}, { get: (_alvo, nome) => (...args) => { mockChamadas.push([nome, ...args]); } });
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
    linhasAparelho: ['Não registrado'],
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

test('[RN-183.04] aparelho literal (aparado), quebrado em linhas de ate 110 cuja juncao e o texto inteiro', () => {
  expect(UA_200).toHaveLength(200);
  const [l] = montarFichaEpi({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, user_agent: `  ${UA_200}  ` }] }).linhas;
  expect(l.aparelho).toBe(UA_200);
  expect(l.linhasAparelho).toHaveLength(2);
  expect(l.linhasAparelho.join('')).toBe(UA_200);
  l.linhasAparelho.forEach((s) => expect(s.length).toBeLessThanOrEqual(110));
  const [l300] = montarFichaEpi({ entregas: [{ ...ENTREGA, user_agent: 'y'.repeat(300) }] }).linhas;
  expect(l300.linhasAparelho).toHaveLength(3);
  expect(l300.linhasAparelho.join('')).toBe('y'.repeat(300));
});

test('[RN-183.05] sem user_agent (null ou so espacos) -> "Não registrado", tambem como linha unica', () => {
  for (const ua of [null, undefined, '   ']) {
    const [l] = montarFichaEpi({ colaborador: COLABORADOR, entregas: [{ ...ENTREGA, user_agent: ua }] }).linhas;
    expect(l.aparelho).toBe('Não registrado');
    expect(l.linhasAparelho).toEqual(['Não registrado']);
  }
});
