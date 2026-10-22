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
