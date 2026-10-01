/**
 * Etapa 66, T5 — o motivo da movimentação vem do cadastro (RN-09) e o livro mostra a
 * justificativa (RN-08).
 *
 * RN-09: ao escolher o tipo, a tela busca `GET /almoxarifado/motivos-movimentacao?tipo=X` e
 * oferece um select com os motivos ativos daquele tipo + "Outro (digitar)". Motivo do cadastro
 * → payload com `motivo_id` NUMÉRICO e SEM `motivo` (o servidor recusa os dois juntos com 400);
 * o complemento opcional vai em `justificativa`. "Outro" → o payload de antes, idêntico
 * (`motivo` e `justificativa` = texto). Sem motivo cadastrado para o tipo, ou se a busca falhar,
 * fica só o campo de texto de antes — a busca nunca trava a movimentação.
 *
 * RN-08: o livro mostrava só `motivo`; bloqueio, inventário e estorno guardam o porquê em
 * `justificativa`, que ficava escondida. Agora ela aparece abaixo quando existe e difere do
 * motivo (igual não repete).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesMotivoCadastro --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

const AVARIA = { id: 7, nome: 'Avaria no manuseio', tipos: ['AJUSTE', 'PERDA'], ativo: 1 };
const CONSUMO = { id: 9, nome: 'Consumo interno', tipos: ['SAIDA'], ativo: 1 };
const MOTIVOS_POR_TIPO = {
  AJUSTE: [AVARIA],
  PERDA: [AVARIA],
  SAIDA: [CONSUMO],
  ENTRADA: [],
  TRANSFERENCIA: [],
};

const ehMotivos = (url) => String(url).startsWith('/almoxarifado/motivos-movimentacao');
const tipoDaUrl = (url) => new URLSearchParams(String(url).split('?')[1] || '').get('tipo');

let container;
let root;
let movimentosDoLivro;
let falharMotivos;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  movimentosDoLivro = [];
  falharMotivos = false;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: movimentosDoLivro });
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_atual: 50 }] });
    }
    if (ehMotivos(url)) {
      if (falharMotivos) return Promise.reject(new Error('rede'));
      return Promise.resolve({ data: MOTIVOS_POR_TIPO[tipoDaUrl(url)] || [] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function esperar() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
  await esperar();
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const selects = () => [...container.querySelectorAll('.almox-modal select.almox-form-select')];
const selectMotivo = () => container.querySelector('#mov-motivo-cadastro');
const textoMotivo = () => container.querySelector('#mov-motivo');
const complemento = () => container.querySelector('#mov-motivo-complemento');

async function abrirCom(tipo) {
  await renderizar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
  preencher(selects()[0], '10');
  preencher(selects()[1], tipo);
  await esperar();
  preencher(container.querySelector('.almox-modal input[type="number"]'), '5');
}

async function trocarTipo(tipo) {
  preencher(selects()[1], tipo);
  await esperar();
}

async function enviar() {
  const form = container.querySelector('.almox-modal form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}

const payload = () => {
  const chamada = api.post.mock.calls.find(([u]) => u === '/almoxarifado/movimentacoes/v2');
  return chamada ? chamada[1] : null;
};

describe('Movimentação — motivo do cadastro (Etapa 66, RN-09)', () => {
  test('busca os motivos do tipo e oferece o select com "Outro (digitar)"', async () => {
    await abrirCom('AJUSTE');
    expect(api.get.mock.calls.some(([u]) => ehMotivos(u) && tipoDaUrl(u) === 'AJUSTE')).toBe(true);
    expect(selectMotivo()).not.toBeNull();
    const rotulos = [...selectMotivo().querySelectorAll('option')].map((o) => o.textContent);
    expect(rotulos).toEqual(expect.arrayContaining(['Avaria no manuseio', 'Outro (digitar)']));
    // Ainda não escolheu "Outro": o texto livre não aparece.
    expect(textoMotivo()).toBeNull();
  });

  test('motivo do cadastro: motivo_id NUMÉRICO, sem motivo; complemento vai em justificativa', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), '7');
    expect(complemento()).not.toBeNull();
    preencher(complemento(), 'caixa amassada');
    await enviar();
    const p = payload();
    expect(p).not.toBeNull();
    expect(p.motivo_id).toBe(7);
    expect(p).not.toHaveProperty('motivo');
    expect(p.justificativa).toBe('caixa amassada');
  });

  test('motivo do cadastro sem complemento: nem motivo nem justificativa no payload', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), '7');
    await enviar();
    const p = payload();
    expect(p.motivo_id).toBe(7);
    expect(p).not.toHaveProperty('motivo');
    expect(p).not.toHaveProperty('justificativa');
  });

  test('"Outro (digitar)": o payload de antes — motivo e justificativa = texto, sem motivo_id', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), 'OUTRO');
    expect(textoMotivo()).not.toBeNull();
    preencher(textoMotivo(), 'contagem');
    await enviar();
    const p = payload();
    expect(p.motivo).toBe('contagem');
    expect(p.justificativa).toBe('contagem');
    expect(p).not.toHaveProperty('motivo_id');
  });

  test('trocar de "Outro" para um do cadastro LIMPA o texto digitado (senão 400 "não os dois")', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), 'OUTRO');
    preencher(textoMotivo(), 'contagem');
    preencher(selectMotivo(), '7');
    expect(textoMotivo()).toBeNull();
    // Voltar para "Outro" não ressuscita o texto antigo (o envio fecha o modal, então antes dele).
    preencher(selectMotivo(), 'OUTRO');
    expect(textoMotivo().value).toBe('');
    preencher(textoMotivo(), 'contagem');
    preencher(selectMotivo(), '7');
    await enviar();
    const p = payload();
    expect(p.motivo_id).toBe(7);
    expect(p).not.toHaveProperty('motivo');
    expect(p).not.toHaveProperty('justificativa');
  });

  test('trocar o tipo limpa a escolha quando o motivo não serve ao novo tipo', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), '7');
    preencher(complemento(), 'caixa amassada');
    await trocarTipo('SAIDA');
    expect(selectMotivo().value).toBe('');
    expect(complemento()).toBeNull();
    await enviar();
    const p = payload();
    expect(p).not.toHaveProperty('motivo_id');
    expect(p).not.toHaveProperty('justificativa');
  });

  // As duas camadas da limpeza, cada uma com o seu teste: a troca do tipo julga pelo `tipos` do
  // motivo (vale mesmo se a busca do tipo novo falhar), e a lista nova julga pelo que o servidor
  // devolveu (o motivo diz servir ao tipo mas foi desativado entre uma busca e outra). Sem cada
  // uma, a escolha antiga "ressuscita" quando se volta ao tipo original.
  test('troca de tipo cuja busca falha: a escolha que não serve não ressuscita na volta', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), '7');
    falharMotivos = true;
    await trocarTipo('SAIDA');
    // A lista do AJUSTE não pode ficar oferecida na SAIDA só porque a busca nova falhou.
    expect(selectMotivo()).toBeNull();
    expect(textoMotivo()).not.toBeNull();
    falharMotivos = false;
    await trocarTipo('AJUSTE');
    expect(selectMotivo().value).toBe('');
    await enviar();
    expect(payload()).not.toHaveProperty('motivo_id');
  });

  test('motivo que some da lista do tipo novo (desativado) é limpo e não ressuscita na volta', async () => {
    const original = MOTIVOS_POR_TIPO.PERDA;
    MOTIVOS_POR_TIPO.PERDA = [{ id: 8, nome: 'Queda', tipos: ['PERDA'], ativo: 1 }];
    try {
      await abrirCom('AJUSTE');
      preencher(selectMotivo(), '7');
      await trocarTipo('PERDA');
      expect(selectMotivo().value).toBe('');
      await trocarTipo('AJUSTE');
      expect(selectMotivo().value).toBe('');
      await enviar();
      expect(payload()).not.toHaveProperty('motivo_id');
    } finally {
      MOTIVOS_POR_TIPO.PERDA = original;
    }
  });

  test('[controle positivo] trocar para um tipo que o motivo serve mantém a escolha', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), '7');
    await trocarTipo('PERDA');
    expect(selectMotivo().value).toBe('7');
    await enviar();
    expect(payload().motivo_id).toBe(7);
  });

  test('tipo sem motivo cadastrado: só o campo de texto de antes, payload de antes', async () => {
    await abrirCom('ENTRADA');
    expect(selectMotivo()).toBeNull();
    const texto = textoMotivo();
    expect(texto).not.toBeNull();
    expect(texto.previousElementSibling.textContent.startsWith('Motivo')).toBe(true);
    preencher(texto, 'Compra');
    await enviar();
    const p = payload();
    expect(p.motivo).toBe('Compra');
    expect(p.justificativa).toBe('Compra');
    expect(p).not.toHaveProperty('motivo_id');
  });

  // Fase 5 (M3): o motivo 7 SERVE à PERDA, então a troca de tipo o mantinha — mas a busca da PERDA
  // falhou: a escolha ficava no estado sem select para mostrá-la (o operador achava que ia com o
  // motivo) e ressuscitava na volta. Agora é limpa, e um aviso diz por que o select sumiu.
  test('escolha que serve ao tipo novo, mas a busca do tipo novo falha: limpa e avisa', async () => {
    await abrirCom('AJUSTE');
    preencher(selectMotivo(), '7');
    expect(container.querySelector('[data-testid="mov-motivos-erro"]')).toBeNull();
    falharMotivos = true;
    await trocarTipo('PERDA');
    expect(selectMotivo()).toBeNull();
    expect(container.querySelector('[data-testid="mov-motivos-erro"]').textContent)
      .toBe('Não foi possível carregar os motivos do cadastro — digite o motivo.');
    falharMotivos = false;
    await trocarTipo('AJUSTE');
    expect(container.querySelector('[data-testid="mov-motivos-erro"]')).toBeNull();
    expect(selectMotivo().value).toBe('');
  });

  test('falha ao buscar os motivos: cai no texto livre e a movimentação segue', async () => {
    falharMotivos = true;
    await abrirCom('AJUSTE');
    expect(selectMotivo()).toBeNull();
    preencher(textoMotivo(), 'contagem');
    await enviar();
    const p = payload();
    expect(p.motivo).toBe('contagem');
    expect(p.justificativa).toBe('contagem');
    expect(p).not.toHaveProperty('motivo_id');
  });
});

const linhaLivro = (over) => ({
  id: 1, tipo: 'BLOQUEIO', material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  unidade: 'PC', quantidade: 3, saldo_anterior: 50, saldo_posterior: 50, usuario_nome: 'Maria',
  created_at: '2026-10-01T10:00:00Z', cancelado: 0, ...over,
});

describe('Livro — a justificativa aparece quando difere do motivo (Etapa 66, RN-08)', () => {
  const contar = (txt) => (container.querySelector('.almox-table').textContent.split(txt).length - 1);

  test('mostra a justificativa diferente do motivo', async () => {
    movimentosDoLivro = [linhaLivro({ motivo: 'Bloqueio', justificativa: 'lote com ferrugem' })];
    await renderizar();
    expect(contar('Bloqueio')).toBe(1);
    expect(contar('lote com ferrugem')).toBe(1);
  });

  test('não repete quando a justificativa é igual ao motivo', async () => {
    movimentosDoLivro = [linhaLivro({ id: 2, tipo: 'AJUSTE', motivo: 'contagem', justificativa: 'contagem' })];
    await renderizar();
    expect(contar('contagem')).toBe(1);
  });
});
