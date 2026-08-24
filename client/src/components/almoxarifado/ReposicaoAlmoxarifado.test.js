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
      fornecedor_id: 3, fornecedor_nome: 'Alfa Parafusos', total_itens: 1, valor_total: 940,
      itens: [
        { material_id: 10, codigo: 'ALM-0010', nome: 'Chapa 3mm', unidade: 'PC',
          disponivel: 4, a_caminho: 0, a_caminho_vencido: 0, posicao: 4, consumo_medio_diario: 0.5,
          prazo_reposicao_dias: 10, ponto_efetivo: 5, origem_ponto: 'CALCULADO',
          quantidade_sugerida: 17, valor_estimado: 940, risco_parada: false },
      ],
    },
    {
      fornecedor_id: 7, fornecedor_nome: 'Zeta Aços', total_itens: 1, valor_total: 400,
      itens: [
        // a_caminho_vencido: 3 — RN-03 esta descontando a_caminho normal (0) do calculo, mas
        // existe uma pendencia ANTIGA (fora do horizonte) que continua aberta de verdade
        // (achado do backend recem-landado, avisado na celula "A caminho").
        { material_id: 20, codigo: 'ALM-0020', nome: 'Perfil L', unidade: 'PC',
          disponivel: 0, a_caminho: 0, a_caminho_vencido: 3, posicao: 0, consumo_medio_diario: 1,
          prazo_reposicao_dias: 5, ponto_efetivo: 5, origem_ponto: 'CADASTRADO',
          quantidade_sugerida: 5, valor_estimado: 400, risco_parada: true },
      ],
    },
    {
      fornecedor_id: null, fornecedor_nome: 'Sem fornecedor definido', total_itens: 1, valor_total: 50,
      itens: [
        { material_id: 30, codigo: 'ALM-0030', nome: 'Parafuso M8', unidade: 'UN',
          disponivel: 2, a_caminho: 0, a_caminho_vencido: 0, posicao: 2, consumo_medio_diario: 0.2,
          prazo_reposicao_dias: 0, ponto_efetivo: 5, origem_ponto: 'MINIMO',
          quantidade_sugerida: 25, valor_estimado: 50, risco_parada: false },
      ],
    },
  ],
  // materiais_sugeridos DELIBERADAMENTE diferente da contagem de itens (3) — pega card
  // hardcoded (o resumo do backend pode contar universo maior que o exibido na tela).
  resumo: { materiais_sugeridos: 11, valor_total: 1390, riscos_parada: 1 },
};

// item 40: todas as 3 flags true + duas datas validas e DISTINTAS (pega troca de coluna de
// data). item 41: so excesso, ambas as datas nulas (pega o traço quando nao ha data).
const ESTOQUE_PARADO_FIXTURE = {
  dias_sem_consumo: 180,
  itens: [
    { material_id: 40, codigo: 'ALM-0040', nome: 'Tinta Epóxi', unidade: 'LT',
      quantidade_atual: 50, quantidade_maxima: 20, valor_parado: 500,
      ultima_entrada: '2026-01-10 10:00:00', ultima_saida: '2026-03-05 08:00:00',
      excesso: true, sem_consumo: true, obsoleto: true },
    { material_id: 41, codigo: 'ALM-0041', nome: 'Verniz Marítimo', unidade: 'LT',
      quantidade_atual: 8, quantidade_maxima: 3, valor_parado: 60,
      ultima_entrada: null, ultima_saida: null,
      excesso: true, sem_consumo: false, obsoleto: false },
  ],
  // Resumo é retrato do estoque parado INTEIRO (server-side, sem filtro) — por design não
  // precisa bater com os flags das linhas exibidas. Números deliberadamente diferentes dos
  // flags/contagens dos itens acima, para pegar card com valor hardcoded.
  resumo: { excesso: 6, sem_consumo: 4, obsoleto: 9, valor_parado_total: 12345 },
};

const SOLICITACOES_FIXTURE = [
  { id: 1, material_id: 10, material_codigo: 'ALM-0010', material_nome: 'Chapa 3mm',
    quantidade: 16, motivo: 'PONTO_REPOSICAO', status: 'PENDENTE', created_at: '2026-08-20 10:00:00' },
  { id: 2, material_id: 20, material_codigo: 'ALM-0020', material_nome: 'Perfil L',
    quantidade: 5, motivo: 'ESTOQUE_MINIMO', status: 'VINCULADO', created_at: '2026-08-18 09:00:00' },
];

// Um UNICO fornecedor com DOIS itens — o cenario que o header checkbox "Selecionar todos"
// (achado 5) precisa provar: marcar/desmarcar um so grupo nao pode ser distinguido de marcar
// item por item quando o grupo so tem um item (fixture principal acima so tem 1 item por
// fornecedor).
const SUGESTOES_FORNECEDOR_DOIS_ITENS = {
  janela_dias: 90,
  fornecedores: [
    {
      fornecedor_id: 5, fornecedor_nome: 'Beta Insumos', total_itens: 2, valor_total: 300,
      itens: [
        { material_id: 50, codigo: 'ALM-0050', nome: 'Item A', unidade: 'UN',
          disponivel: 1, a_caminho: 0, a_caminho_vencido: 0, posicao: 1, consumo_medio_diario: 0.1,
          prazo_reposicao_dias: 5, ponto_efetivo: 5, origem_ponto: 'MINIMO',
          quantidade_sugerida: 10, valor_estimado: 150, risco_parada: false },
        { material_id: 51, codigo: 'ALM-0051', nome: 'Item B', unidade: 'UN',
          disponivel: 2, a_caminho: 0, a_caminho_vencido: 0, posicao: 2, consumo_medio_diario: 0.2,
          prazo_reposicao_dias: 5, ponto_efetivo: 5, origem_ponto: 'MINIMO',
          quantidade_sugerida: 5, valor_estimado: 150, risco_parada: false },
      ],
    },
  ],
  resumo: { materiais_sugeridos: 2, valor_total: 300, riscos_parada: 0 },
};

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
  // handleGerar agora confirma antes do POST — default true, testes de cancelamento sobrescrevem.
  window.confirm = jest.fn(() => true);
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
    const valorAlfa = Number(940).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const valorZeta = Number(400).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(texto()).toContain('Alfa Parafusos');
    expect(texto()).toContain(valorAlfa);
    expect(texto()).toContain('Zeta Aços');
    expect(texto()).toContain(valorZeta);
    expect(texto()).toContain('Sem fornecedor definido');

    // Linha com posicao/ponto/origem/sugerida — asserts POR CELULA (indice), nao substring
    // solta, para pegar uma troca de coluna sugerida<->valor.
    const linha = linhaMaterial('ALM-0010');
    expect(linha).toBeTruthy();
    const tds = linha.querySelectorAll('td');
    // colunas: 0 checkbox, 1 material, 2 disponivel, 3 a_caminho, 4 posicao, 5 ponto(origem),
    // 6 sugerida, 7 valor, 8 risco.
    expect(tds[2].textContent).toBe('4'); // disponivel
    expect(tds[4].textContent).toBe('4'); // posicao
    expect(tds[5].textContent).toContain('5'); // ponto efetivo
    expect(tds[5].textContent).toContain('Calculado');
    expect(tds[6].textContent).toBe('17'); // quantidade_sugerida
    expect(tds[7].textContent).toBe('R$ 940,00'); // valor_estimado

    // Resumo geral (cards com data-testid — exato, nao substring do container inteiro).
    expect(container.querySelector('[data-testid="kpi-materiais-sugeridos"]').textContent).toBe('11');
    expect(container.querySelector('[data-testid="kpi-valor-total-sugerido"]').textContent).toBe('R$ 1.390,00');
    expect(container.querySelector('[data-testid="kpi-riscos-parada"]').textContent).toBe('1');

    // Badge "Risco de parada" so na linha com a flag.
    const linhaRisco = linhaMaterial('ALM-0020');
    expect(linhaRisco.textContent).toContain('Risco de parada');
    expect(linha.textContent).not.toContain('Risco de parada');
  });

  // Achado 2 (medido): janela_dias vinha no payload e era descartado.
  test('subtitulo mostra a janela de dias do consumo medio, vinda do payload', async () => {
    await renderizar();
    expect(texto()).toContain('Consumo médio calculado sobre os últimos 90 dias');
  });

  // Achado 2 (medido): a celula "Ponto (origem)" mostrava so o rotulo da origem — quando
  // CALCULADO, a conta que produziu o ponto (consumo medio x prazo) ficava escondida.
  test('celula Ponto (origem) mostra consumo medio x prazo SO quando origem e CALCULADO', async () => {
    await renderizar();

    const linhaCalculado = linhaMaterial('ALM-0010'); // origem_ponto: CALCULADO
    const tdsCalculado = linhaCalculado.querySelectorAll('td');
    expect(tdsCalculado[5].textContent).toContain('0,5/dia × 10d');

    const linhaCadastrado = linhaMaterial('ALM-0020'); // origem_ponto: CADASTRADO
    const tdsCadastrado = linhaCadastrado.querySelectorAll('td');
    expect(tdsCadastrado[5].textContent).not.toContain('/dia');
  });

  // Backend recem-landado (a_caminho_vencido): ha solicitacao aberta fora do horizonte que
  // continua de pe mas nao segura mais posicao (RN-03) — a tela precisa avisar ANTES do
  // comprador clicar "Gerar" e duplicar o pedido (achado da duplicacao de dois caminhos).
  test('a_caminho_vencido > 0 mostra aviso de solicitacao antiga aberta, so na linha afetada', async () => {
    await renderizar();

    const linhaVencida = linhaMaterial('ALM-0020'); // a_caminho_vencido: 3
    expect(linhaVencida.textContent).toContain('Vencido');
    const badge = linhaVencida.querySelector('.almox-badge-baixo');
    expect(badge).toBeTruthy();
    expect(badge.title).toBe('Há solicitação antiga aberta (3) fora do horizonte');

    const linhaSemVencido = linhaMaterial('ALM-0010'); // a_caminho_vencido: 0
    expect(linhaSemVencido.textContent).not.toContain('Vencido');
  });

  // Achado 5 (medido): so dava para marcar/desmarcar material por material — em fornecedor com
  // dezenas de itens, isso e um clique por linha so para desmarcar um punhado.
  test('checkbox "Selecionar todos" do cabecalho marca/desmarca todos os itens do fornecedor', async () => {
    mockarApi({ sugestoes: SUGESTOES_FORNECEDOR_DOIS_ITENS });
    await renderizar();

    const linhaA = () => linhaMaterial('ALM-0050');
    const linhaB = () => linhaMaterial('ALM-0051');
    expect(linhaA().querySelector('input[type="checkbox"]').checked).toBe(true);
    expect(linhaB().querySelector('input[type="checkbox"]').checked).toBe(true);

    const headerCheckbox = container.querySelector('thead input[aria-label="Selecionar todos"]');
    expect(headerCheckbox).toBeTruthy();
    expect(headerCheckbox.checked).toBe(true); // todos marcados por default (design)

    marcar(headerCheckbox, false);
    expect(linhaA().querySelector('input[type="checkbox"]').checked).toBe(false);
    expect(linhaB().querySelector('input[type="checkbox"]').checked).toBe(false);
    expect(botao('Gerar solicitações').disabled).toBe(true);

    marcar(headerCheckbox, true);
    expect(linhaA().querySelector('input[type="checkbox"]').checked).toBe(true);
    expect(linhaB().querySelector('input[type="checkbox"]').checked).toBe(true);
  });

  // Achado 3 (medido): o servidor RECALCULA a quantidade no POST — o usuario confirmou uma
  // ESTIMATIVA (texto do window.confirm) e nunca via o que foi de fato pedido. O painel de
  // resultado tinha so a contagem ("2 solicitacao(oes) criada(s)."), nunca a quantidade real.
  test('painel de resultado lista cada solicitacao criada com codigo, nome e quantidade real', async () => {
    await renderizar();
    api.post.mockResolvedValueOnce({
      data: {
        criadas: [
          { material_id: 10, solicitacao_id: 201, quantidade: 17 },
          { material_id: 20, solicitacao_id: 202, quantidade: 5 },
        ],
        puladas: [],
      },
    });

    await clicar(botao('Gerar solicitações'));

    expect(texto()).toContain('2 solicitação(ões) criada(s):');
    expect(texto()).toContain('ALM-0010 — Chapa 3mm: 17');
    expect(texto()).toContain('ALM-0020 — Perfil L: 5');
  });

  // Achado 4 (medido): o painel de resultado da geracao anterior continuava na tela depois do
  // usuario trocar de aba e voltar — parecia que a ultima geracao ainda valia.
  test('painel de resultado da geracao some ao trocar de aba', async () => {
    await renderizar();
    await clicar(botao('Gerar solicitações'));
    expect(texto()).toContain('solicitação(ões) criada(s)');

    await clicar(botao('Estoque Parado'));
    await clicar(botao('Sugestões de Compra'));
    expect(texto()).not.toContain('solicitação(ões) criada(s)');
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
    // Resposta com puladas mostra codigo + nome (snapshot tirado no momento do POST) e o motivo.
    expect(texto()).toContain('ALM-0030 — Parafuso M8 (SEM_SUGESTAO)');
  });

  test('confirma antes de gerar, com quantidade e valor estimado no texto', async () => {
    await renderizar();
    await clicar(botao('Gerar solicitações'));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    const msg = window.confirm.mock.calls[0][0];
    expect(msg).toContain('3 solicitação(ões)');
    expect(msg).toContain('R$ 1.390,00');
  });

  test('clique direto em Gerar (sem tocar em nada) manda todos os ids da fixture, em ordem', async () => {
    await renderizar();
    await clicar(botao('Gerar solicitações'));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/reposicao/gerar-solicitacoes', {
      material_ids: [10, 20, 30],
    });
  });

  test('cancelar o confirm nao dispara o POST', async () => {
    window.confirm = jest.fn(() => false);
    await renderizar();
    await clicar(botao('Gerar solicitações'));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(api.post).not.toHaveBeenCalled();
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
  test('aba Estoque Parado renderiza os 3 badges e as datas nas colunas certas', async () => {
    await renderizar();
    await clicar(botao('Estoque Parado'));

    const linha = linhaMaterial('ALM-0040');
    expect(linha).toBeTruthy();
    // As TRES flags juntas na mesma linha (pega badge apagado, ex.: sem_consumo removido).
    expect(linha.textContent).toContain('Excesso');
    expect(linha.textContent).toContain('Sem consumo');
    expect(linha.textContent).toContain('Obsoleto');

    // Datas por INDICE de coluna — duas datas validas e DISTINTAS, pega troca de coluna.
    const tds = linha.querySelectorAll('td');
    // colunas: 0 material, 1 qtd atual, 2 qtd maxima, 3 valor parado, 4 ultima entrada,
    // 5 ultima saida, 6 flags.
    expect(tds[4].textContent).toBe('10/01/26'); // ultima_entrada
    expect(tds[5].textContent).toBe('05/03/26'); // ultima_saida
  });

  test('traço nas colunas de data quando ambas vem nulas', async () => {
    await renderizar();
    await clicar(botao('Estoque Parado'));

    const linha = linhaMaterial('ALM-0041');
    expect(linha).toBeTruthy();
    const tds = linha.querySelectorAll('td');
    expect(tds[4].textContent).toBe('—');
    expect(tds[5].textContent).toBe('—');
  });

  test('resumo do estoque parado exato nos cards, com qualificador de que o filtro nao muda os numeros', async () => {
    await renderizar();
    await clicar(botao('Estoque Parado'));

    const valorParadoFmt = Number(12345).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    expect(container.querySelector('[data-testid="kpi-excesso"]').textContent).toBe('6');
    expect(container.querySelector('[data-testid="kpi-sem-consumo"]').textContent).toBe('4');
    expect(container.querySelector('[data-testid="kpi-obsoleto"]').textContent).toBe('9');
    expect(container.querySelector('[data-testid="kpi-valor-parado-total"]').textContent).toBe(valorParadoFmt);
    expect(texto()).toContain('Retrato do estoque parado inteiro — o filtro abaixo não muda estes números.');
  });

  // Achado 2 (medido): dias_sem_consumo vinha no payload e era descartado.
  test('subtitulo mostra os dias sem consumo (corte de "parado"), vindo do payload', async () => {
    await renderizar();
    await clicar(botao('Estoque Parado'));
    expect(texto()).toContain('Parado = sem saída há 180 dias ou mais');
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

  test('nota de corte quando vem exatamente 500 itens', async () => {
    const itens500 = Array.from({ length: 500 }, (_, i) => ({
      material_id: 100 + i, codigo: `ALM-${1000 + i}`, nome: `Material ${i}`, unidade: 'UN',
      quantidade_atual: 1, quantidade_maxima: 1, valor_parado: 1,
      ultima_entrada: null, ultima_saida: null, excesso: false, sem_consumo: true, obsoleto: false,
    }));
    mockarApi({ estoqueParado: { dias_sem_consumo: 180, itens: itens500, resumo: { excesso: 0, sem_consumo: 500, obsoleto: 0, valor_parado_total: 500 } } });
    await renderizar();
    await clicar(botao('Estoque Parado'));

    expect(texto()).toContain('Mostrando os 500 itens de maior valor parado.');
  });
});

describe('ReposicaoAlmoxarifado — aba Solicitações', () => {
  test('aba Solicitacoes lista pendentes com motivo traduzido', async () => {
    await renderizar();
    await clicar(botao('Solicitações'));

    expect(linhaMaterial('ALM-0010')).toBeTruthy();
    expect(linhaMaterial('ALM-0020')).toBeTruthy();
    expect(texto()).toContain('PENDENTE');
    expect(texto()).toContain('VINCULADO');
    // MOTIVO_LABEL traduz o codigo cru vindo do backend.
    expect(texto()).toContain('Ponto de reposição');
    expect(texto()).toContain('Estoque mínimo');
    expect(texto()).not.toContain('PONTO_REPOSICAO');
    expect(texto()).not.toContain('ESTOQUE_MINIMO');
  });
});

describe('ReposicaoAlmoxarifado — 403 legivel do backend', () => {
  // Achado 1 (Critical, medido pelos dois revisores): os tres `.catch` gravavam estado de
  // painel VAZIO em cima de um 403 — ALMOXARIFE/PRODUCAO liam "nada para comprar/parado/
  // pendente" como fato operacional, nunca como "sem permissao". Cada teste abaixo prova as
  // DUAS pontas: o painel de erro aparece (mensagem do servidor verbatim) E o estado vazio /
  // KPIs NAO aparecem no lugar dele.
  test('sugestoes: painel de erro substitui KPIs e tabela — nunca o estado vazio', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/reposicao/sugestoes') {
        return Promise.reject({ response: { status: 403, data: { error: 'Sem permissão para reposicao.sugestoes' } } });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizar();

    expect(toast.error).toHaveBeenCalledWith('Sem permissão para reposicao.sugestoes');
    expect(texto()).toContain('Dados indisponíveis no momento');
    expect(texto()).toContain('Sem permissão para reposicao.sugestoes');
    // O sintoma do achado 1: NAO pode aparecer o estado vazio nem os cards de KPI zerados.
    expect(texto()).not.toContain('Nenhuma sugestão para gerar');
    expect(container.querySelector('[data-testid="kpi-materiais-sugeridos"]')).toBeNull();

    // "Tentar novamente" refaz a chamada (mesmo padrao do loadError de AlmoxarifadoDashboard).
    api.get.mockClear();
    api.get.mockImplementation(() => Promise.resolve({ data: SUGESTOES_DUAS_FORNECEDORES }));
    await clicar(botao('Tentar novamente'));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/reposicao/sugestoes');
    expect(container.querySelector('[data-testid="kpi-materiais-sugeridos"]')).toBeTruthy();
  });

  test('estoque-parado: painel de erro substitui KPIs e tabela — nunca o estado vazio', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/reposicao/sugestoes') {
        return Promise.resolve({ data: SUGESTOES_DUAS_FORNECEDORES });
      }
      if (url === '/almoxarifado/reposicao/estoque-parado') {
        return Promise.reject({ response: { status: 403, data: { error: 'Sem permissão para reposicao.estoque-parado' } } });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Estoque Parado'));

    expect(toast.error).toHaveBeenCalledWith('Sem permissão para reposicao.estoque-parado');
    expect(texto()).toContain('Dados indisponíveis no momento');
    expect(texto()).toContain('Sem permissão para reposicao.estoque-parado');
    expect(texto()).not.toContain('Nenhum material parado encontrado');
    expect(container.querySelector('[data-testid="kpi-excesso"]')).toBeNull();
  });

  test('solicitacoes: painel de erro substitui a tabela — nunca o estado vazio', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/reposicao/sugestoes') {
        return Promise.resolve({ data: SUGESTOES_DUAS_FORNECEDORES });
      }
      if (url === '/almoxarifado/relatorios/solicitacoes-compra') {
        // Etapa 11 revisao final: esta rota agora tambem 403 (gate `gerenciar_reposicao`
        // adicionado no backend DEPOIS desta tela ter sido escrita) — corpo sem `perfil`
        // (rota generica de relatorios, nao usa requirePermission do modulo).
        return Promise.reject({ response: { status: 403, data: { error: 'Sem permissão para este relatório', acao: 'gerenciar_reposicao' } } });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Solicitações'));

    expect(toast.error).toHaveBeenCalledWith('Sem permissão para este relatório');
    expect(texto()).toContain('Dados indisponíveis no momento');
    expect(texto()).not.toContain('Nenhuma solicitação de compra pendente');
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
