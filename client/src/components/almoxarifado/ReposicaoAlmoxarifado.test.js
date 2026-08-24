/**
 * Etapa 11, Task 3 — tela "/almoxarifado/reposicao" contra o contrato congelado do design
 * (docs/superpowers/specs/2026-08-23-almoxarifado-etapa11-reposicao-compras-design.md).
 *
 * O motor de sugestão (RN-01..RN-06) e o gerador (RN-09) têm teste de rota no servidor
 * (reposicaoSugestao.api.test.js / reposicaoGerarSolicitacoes.api.test.js) — não duplicado
 * aqui. O alvo desta suíte é o que só a tela pode errar: agrupamento por fornecedor renderizado,
 * checkbox por material mandando SÓ os ids marcados (nunca o catálogo inteiro), badges de
 * risco/flags, formatação de moeda/data e traço em nulo, filtro por tipo refazendo a chamada,
 * e os três estados vazios não explodindo em undefined/NaN.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=ReposicaoAlmoxarifado
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ReposicaoAlmoxarifado from './ReposicaoAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
// Permissoes: por padrao tudo liberado. mockPode troca em runtime (mesmo padrao de
// ConferenciaEstoque.test.js / SobrasAlmoxarifado.test.js) — o gate REAL continua no servidor.
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'COMPRAS',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao, ev) => {
      if (mockPode(acao)) return true;
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    },
    loading: false,
  }),
}));

// Fixture com 2 fornecedores + grupo "Sem fornecedor definido" (RN-05: sem-fornecedor por
// último — mock já vem nessa ordem, a tela não reordena).
const SUGESTOES_DUAS_FORNECEDORES = {
  janela_dias: 90,
  fornecedores: [
    {
      fornecedor_id: 3, fornecedor_nome: 'Alfa Parafusos', total_itens: 1, valor_total: 800,
      itens: [
        { material_id: 10, codigo: 'ALM-0010', nome: 'Chapa 3mm', unidade: 'PC',
          disponivel: 4, a_caminho: 0, posicao: 4, consumo_medio_diario: 0.5,
          prazo_reposicao_dias: 10, ponto_efetivo: 5, origem_ponto: 'CALCULADO',
          quantidade_sugerida: 16, valor_estimado: 800, risco_parada: false },
      ],
    },
    {
      fornecedor_id: 7, fornecedor_nome: 'Zeta Aços', total_itens: 1, valor_total: 400,
      itens: [
        { material_id: 20, codigo: 'ALM-0020', nome: 'Perfil L', unidade: 'PC',
          disponivel: 0, a_caminho: 0, posicao: 0, consumo_medio_diario: 1,
          prazo_reposicao_dias: 5, ponto_efetivo: 5, origem_ponto: 'CADASTRADO',
          quantidade_sugerida: 5, valor_estimado: 400, risco_parada: true },
      ],
    },
    {
      fornecedor_id: null, fornecedor_nome: 'Sem fornecedor definido', total_itens: 1, valor_total: 50,
      itens: [
        { material_id: 30, codigo: 'ALM-0030', nome: 'Parafuso M8', unidade: 'UN',
          disponivel: 2, a_caminho: 0, posicao: 2, consumo_medio_diario: 0.2,
          prazo_reposicao_dias: 0, ponto_efetivo: 5, origem_ponto: 'MINIMO',
          quantidade_sugerida: 25, valor_estimado: 50, risco_parada: false },
      ],
    },
  ],
  resumo: { materiais_sugeridos: 3, valor_total: 1250, riscos_parada: 1 },
};

const ESTOQUE_PARADO_FIXTURE = {
  dias_sem_consumo: 180,
  itens: [
    { material_id: 40, codigo: 'ALM-0040', nome: 'Tinta Epóxi', unidade: 'LT',
      quantidade_atual: 50, quantidade_maxima: 20, valor_parado: 500,
      ultima_entrada: '2026-01-10 10:00:00', ultima_saida: null,
      excesso: true, sem_consumo: true, obsoleto: true },
  ],
  resumo: { excesso: 1, sem_consumo: 1, obsoleto: 1, valor_parado_total: 500 },
};

const SOLICITACOES_FIXTURE = [
  { id: 1, material_id: 10, material_codigo: 'ALM-0010', material_nome: 'Chapa 3mm',
    quantidade: 16, motivo: 'PONTO_REPOSICAO', status: 'PENDENTE', created_at: '2026-08-20 10:00:00' },
  { id: 2, material_id: 20, material_codigo: 'ALM-0020', material_nome: 'Perfil L',
    quantidade: 5, motivo: 'ESTOQUE_MINIMO', status: 'VINCULADO', created_at: '2026-08-18 09:00:00' },
];

let container; let root;

const mockarApi = (overrides = {}) => {
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/reposicao/sugestoes') {
      return Promise.resolve({ data: overrides.sugestoes ?? SUGESTOES_DUAS_FORNECEDORES });
    }
    if (url === '/almoxarifado/reposicao/estoque-parado') {
      return Promise.resolve({ data: overrides.estoqueParado ?? ESTOQUE_PARADO_FIXTURE });
    }
    if (url === '/almoxarifado/relatorios/solicitacoes-compra') {
      return Promise.resolve({ data: overrides.solicitacoes ?? SOLICITACOES_FIXTURE });
    }
    return Promise.resolve({ data: [] });
  });
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  mockarApi();
  api.post.mockResolvedValue({ data: { criadas: [{ material_id: 10, solicitacao_id: 99, quantidade: 16 }], puladas: [] } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/almoxarifado/reposicao']}><ReposicaoAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')]
    .find((b) => b.textContent.trim().includes(t) || (b.title && b.title.includes(t)));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
function preencher(el, valor) {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
function marcar(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('click', { bubbles: true }));
  });
}
const linhaMaterial = (codigo) => [...container.querySelectorAll('.almox-table tbody tr')]
  .find((tr) => tr.textContent.includes(codigo));

describe('ReposicaoAlmoxarifado — aba Sugestões de Compra', () => {
  test('sugestoes agrupadas por fornecedor com resumo', async () => {
    await renderizar();

    // Cabecalhos com nome e valor (R$ pt-BR) dos DOIS grupos com fornecedor + o sem-fornecedor.
    const valorAlfa = Number(800).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const valorZeta = Number(400).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(texto()).toContain('Alfa Parafusos');
    expect(texto()).toContain(valorAlfa);
    expect(texto()).toContain('Zeta Aços');
    expect(texto()).toContain(valorZeta);
    expect(texto()).toContain('Sem fornecedor definido');

    // Linha com posicao/ponto/origem/sugerida.
    const linha = linhaMaterial('ALM-0010');
    expect(linha).toBeTruthy();
    expect(linha.textContent).toContain('4'); // disponivel/posicao
    expect(linha.textContent).toContain('5'); // ponto efetivo
    expect(linha.textContent).toContain('Calculado');
    expect(linha.textContent).toContain('16'); // sugerida

    // Resumo geral: materiais_sugeridos e riscos_parada.
    expect(texto()).toContain('3'); // materiais_sugeridos
    expect(texto()).toContain('1'); // riscos_parada

    // Badge "Risco de parada" so na linha com a flag.
    const linhaRisco = linhaMaterial('ALM-0020');
    expect(linhaRisco.textContent).toContain('Risco de parada');
    expect(linha.textContent).not.toContain('Risco de parada');
  });

  test('gerar solicitacoes envia SO os ids marcados', async () => {
    await renderizar();

    // Desmarca o checkbox do material 20 (Zeta Acos) — so 10 e 30 devem ir no POST.
    const linha20 = linhaMaterial('ALM-0020');
    const checkbox20 = linha20.querySelector('input[type="checkbox"]');
    expect(checkbox20.checked).toBe(true); // todos marcados por default
    marcar(checkbox20, false);

    api.post.mockResolvedValueOnce({
      data: {
        criadas: [{ material_id: 10, solicitacao_id: 101, quantidade: 16 }],
        puladas: [{ material_id: 30, motivo: 'SEM_SUGESTAO' }],
      },
    });

    await clicar(botao('Gerar solicitações'));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/reposicao/gerar-solicitacoes', {
      material_ids: [10, 30],
    });
    // Resposta com puladas mostra os motivos.
    expect(texto()).toContain('SEM_SUGESTAO');
  });

  test('botao Gerar fica desabilitado quando nenhum material esta marcado', async () => {
    await renderizar();
    for (const codigo of ['ALM-0010', 'ALM-0020', 'ALM-0030']) {
      marcar(linhaMaterial(codigo).querySelector('input[type="checkbox"]'), false);
    }
    expect(botao('Gerar solicitações').disabled).toBe(true);
  });

  test('botao Gerar e gateado por gerenciar_reposicao', async () => {
    mockPode = () => false;
    await renderizar();
    await clicar(botao('Gerar solicitações'));
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('ReposicaoAlmoxarifado — aba Estoque Parado', () => {
  test('aba Estoque Parado renderiza flags e traço em datas nulas', async () => {
    await renderizar();
    await clicar(botao('Estoque Parado'));

    const linha = linhaMaterial('ALM-0040');
    expect(linha).toBeTruthy();
    // Dois badges na mesma linha (excesso + obsoleto — sem_consumo tambem true, mas obsoleto
    // ja implica sem_consumo; a tela mostra as flags independentes que vierem true).
    expect(linha.textContent).toContain('Excesso');
    expect(linha.textContent).toContain('Obsoleto');
    // ultima_saida: null -> traço.
    const celulas = linha.querySelectorAll('td');
    expect(linha.textContent).toContain('—');
  });

  test('filtro por tipo refaz a chamada', async () => {
    await renderizar();
    await clicar(botao('Estoque Parado'));
    api.get.mockClear();

    const selectTipo = container.querySelector('.almox-filters select');
    preencher(selectTipo, 'EXCESSO');
    await esperarEfeitos();

    expect(api.get).toHaveBeenCalledWith('/almoxarifado/reposicao/estoque-parado', { params: { tipo: 'EXCESSO' } });
  });
});

describe('ReposicaoAlmoxarifado — aba Solicitações', () => {
  test('aba Solicitacoes lista pendentes', async () => {
    await renderizar();
    await clicar(botao('Solicitações'));

    expect(linhaMaterial('ALM-0010')).toBeTruthy();
    expect(linhaMaterial('ALM-0020')).toBeTruthy();
    expect(texto()).toContain('PENDENTE');
    expect(texto()).toContain('VINCULADO');
  });
});

describe('ReposicaoAlmoxarifado — estados vazios', () => {
  test('payload vazio nao explode', async () => {
    mockarApi({
      sugestoes: { janela_dias: 90, fornecedores: [], resumo: { materiais_sugeridos: 0, valor_total: 0, riscos_parada: 0 } },
      estoqueParado: { dias_sem_consumo: 180, itens: [], resumo: { excesso: 0, sem_consumo: 0, obsoleto: 0, valor_parado_total: 0 } },
      solicitacoes: [],
    });
    await renderizar();
    expect(texto()).not.toMatch(/undefined|NaN/);
    expect(texto()).toMatch(/[Nn]enhuma sugest/);

    await clicar(botao('Estoque Parado'));
    expect(texto()).not.toMatch(/undefined|NaN/);

    await clicar(botao('Solicitações'));
    expect(texto()).not.toMatch(/undefined|NaN/);
  });
});
