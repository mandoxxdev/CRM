/**
 * Selo de propriedade na tela de Materiais (Etapa 8, Task 9).
 *
 * A Etapa 8 unificou material de cliente e material proprio na MESMA tabela e nas MESMAS telas
 * (classe C da auditoria da Task 1: o catalogo operacional mistura de proposito, porque a chapa
 * do cliente ocupa prateleira, e movimentada e etiquetada como qualquer outra). Sem identificacao
 * visual, a chapa do Cliente X e a nossa ficam indistinguiveis na listagem — a unificacao CRIA a
 * confusao que a spec 13 mandava evitar ("identificacao visual de propriedade em todas as
 * listagens que misturam materiais").
 *
 * As duas metades do teste sao obrigatorias: exigir so a PRESENCA do selo na linha do cliente
 * seria aprovado por uma implementacao que pinta o selo em toda linha — que nao identifica nada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MateriaisAlmoxarifado from './MateriaisAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas: o alvo aqui é o que a tela mostra, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const MATERIAL_NOSSO = {
  id: 1, codigo: 'CHP-001', nome: 'Chapa 3mm nossa', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, quantidade_maxima: 100,
  proprietario_cliente_id: null, proprietario_cliente_nome: null,
};
const MATERIAL_CLIENTE = {
  id: 2, codigo: 'CHP-002', nome: 'Chapa 3mm do cliente', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, quantidade_maxima: 100,
  proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Alfa LTDA',
};
// O servidor devolve `proprietario_cliente_id` desde a Task 1 (o SELECT e `m.*`), mas o nome do
// dono depende de um LEFT JOIN em clientes. Enquanto esse JOIN nao existir na rota da lista, o
// selo tem de continuar identificando a propriedade — um selo vazio seria a mesma falha muda que
// o badge sem classe CSS.
const MATERIAL_CLIENTE_SEM_NOME = {
  id: 3, codigo: 'CHP-003', nome: 'Chapa 3mm sem nome de dono', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 50, quantidade_minima: 10, quantidade_maxima: 100,
  proprietario_cliente_id: 9,
};

// Etapa 26 — o catálogo do cliente (GET /almoxarifado/categorias), que substitui a 3ª cópia da
// lista hardcoded (a que o design da Fase 0 tinha deixado de fora da varredura).
const CATALOGO = [
  { id: 1, nome: 'Aço carbono', parent_id: null, ativo: 1 },
  { id: 2, nome: 'Chapas', parent_id: null, ativo: 1 },
  { id: 3, nome: 'Ferramentas', parent_id: null, ativo: 1 },
];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só o
  // primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [MATERIAL_NOSSO, MATERIAL_CLIENTE, MATERIAL_CLIENTE_SEM_NOME] });
    }
    if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

// A busca de materiais é debounced em 300ms (useEffect com setTimeout); sem avançar o relógio a
// tabela ainda está no skeleton e o teste leria zero linhas — passando por vazio.
async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><MateriaisAlmoxarifado /></MemoryRouter>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
}

const linhaDe = (codigo) => [...container.querySelectorAll('tbody tr')]
  .find((tr) => tr.textContent.includes(codigo));

describe('MateriaisAlmoxarifado — selo de propriedade', () => {
  test('material de cliente mostra o selo com a razão social', async () => {
    await renderizar();
    const linhaCliente = linhaDe('CHP-002');
    expect(linhaCliente).toBeDefined();
    const selo = linhaCliente.querySelector('.almox-badge-cliente');
    expect(selo).not.toBeNull();
    expect(selo.textContent).toContain('Cliente Alfa LTDA');
  });

  test('[controle positivo] material nosso NÃO mostra selo nenhum', async () => {
    // Sem esta metade, um selo pintado em TODA linha passaria como se identificasse propriedade.
    await renderizar();
    const linhaNossa = linhaDe('CHP-001');
    expect(linhaNossa).toBeDefined();
    expect(linhaNossa.querySelector('.almox-badge-cliente')).toBeNull();
    // Nem o `0`/`null` vazado por um `{m.proprietario_cliente_id && ...}` escrito solto.
    expect(linhaNossa.textContent).not.toContain('cliente');
  });

  test('o selo diz a consequência prática no title, não só o nome do dono', async () => {
    await renderizar();
    const selo = linhaDe('CHP-002').querySelector('.almox-badge-cliente');
    expect(selo.getAttribute('title')).toContain('Cliente Alfa LTDA');
    expect(selo.getAttribute('title')).toMatch(/OS ou projeto/);
  });

  test('material de cliente sem o nome do dono na resposta ainda é identificado', async () => {
    await renderizar();
    const selo = linhaDe('CHP-003').querySelector('.almox-badge-cliente');
    expect(selo).not.toBeNull();
    expect(selo.textContent.trim().length).toBeGreaterThan(0);
  });

  test('a classe .almox-badge-cliente existe no CSS (badge sem cor já foi entregue nesta base)', () => {
    // O template `almox-badge-${cls}` não acha a classe, o navegador não reclama e nenhum teste
    // de comportamento pega — foi exatamente assim que a Etapa 7 entregou um badge invisível.
    // Este é o único teste da suíte que olha estilo, e existe por causa daquele precedente.
    const css = fs.readFileSync(path.join(__dirname, 'Almoxarifado.css'), 'utf8');
    const regra = css.match(/\.almox-badge-cliente\s*\{[^}]*\}/);
    expect(regra).not.toBeNull();
    expect(regra[0]).toMatch(/color\s*:/);
    expect(regra[0]).toMatch(/background\s*:/);
  });
});

/**
 * Etapa 26, Task 2 — RN-01 nesta tela. Este arquivo é a 3ª cópia da lista hardcoded, a que a
 * varredura da Fase 0 tinha deixado de fora (achado A1). O filtro é o caso mais visível de
 * lista errada: nenhum material da GMP tem `EPI`, então filtrar por `EPI` devolvia zero linhas
 * — e "zero linhas" parece estoque vazio, não filtro inútil.
 *
 * As metades andam juntas: o mock termina em `{ data: [] }` como catch-all, então "não tem
 * CONSUMÍVEL" sozinho seria satisfeito por um select sem nenhuma opção.
 */
const filtroCategoria = () => [...container.querySelectorAll('.almox-filters select')]
  .find((s) => s.querySelector('option')?.textContent.trim() === 'Todas categorias');

function escolher(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('MateriaisAlmoxarifado — RN-01: o filtro de categoria vem do catálogo', () => {
  test('as opções são as do endpoint, e a lista hardcoded sumiu', async () => {
    await renderizar();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias');
    const opcoes = [...filtroCategoria().querySelectorAll('option')].map((o) => o.textContent.trim());
    expect(opcoes).toContain('Aço carbono');
    expect(opcoes).toContain('Chapas');
    expect(opcoes).toContain('Ferramentas');
    expect(opcoes).not.toContain('CONSUMÍVEL');
    expect(opcoes).not.toContain('EPI');
    expect(opcoes[0]).toBe('Todas categorias');
  });

  test('trocar o catálogo do mock troca as opções — não é constante do front', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL_NOSSO] });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: [{ id: 9, nome: 'Rolamentos', ativo: 1 }] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    const opcoes = [...filtroCategoria().querySelectorAll('option')].map((o) => o.textContent.trim());
    expect(opcoes).toContain('Rolamentos');
    expect(opcoes).not.toContain('Aço carbono');
  });

  test('escolher uma categoria manda o filtro para o servidor', async () => {
    await renderizar();
    escolher(filtroCategoria(), 'Chapas');
    await act(async () => { await new Promise((r) => setTimeout(r, 350)); });
    const chamadas = api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/materiais');
    expect(chamadas[chamadas.length - 1][1]).toEqual({ params: { categoria: 'Chapas' } });
  });
});
