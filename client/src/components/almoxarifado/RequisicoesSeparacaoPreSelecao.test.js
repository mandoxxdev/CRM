/**
 * Etapa 189 (T2) — a janela de separação já abre com o "Sai de" no endereço que a fila sugere.
 *
 * A janela busca GET /almoxarifado/requisicoes/:id/sugestao-coleta (contrato recongelado no plano da 189, "Execução") e, por item sem
 * planejada pendente e sem separado pendente, escolhe o par sugerido quando ele cobre (RN-189.02/04 com M1, M2 e I3). A escolha do
 * almoxarife vence (RN-189.05); sem sugestão fica no automático, sem erro (RN-189.06); a frase abaixo do "Sai de" diz o que aconteceu
 * (RN-189.09 com I1, M3 e I3).
 *
 * Plano: docs/superpowers/plans/2026-10-23-almoxarifado-etapa189-lista-de-coleta-e-pre-selecao-do-sai-de.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSeparacaoPreSelecao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import RequisicoesList, { valorSugeridoNaSeparacao } from './RequisicoesList';
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

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));

jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const ITEM_BASE = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 5,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
  quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0,
};

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};

const aprovada = (itens = [{}]) => ({
  ...REQ_BASE, status: 'APROVADO', itens: itens.map((extra, i) => ({ ...ITEM_BASE, id: i + 1, ...extra })),
});

// A-01 sem lote (10), B-02 lote L-7 (6), C-03 sem lote (2).
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 6 },
  { id: 6, material_id: 10, localizacao_id: 3, localizacao_codigo: 'C-03', lote_id: null, lote: null, quantidade: 2 },
];

const PAR = {
  A01: { localizacao_id: 1, localizacao_codigo: 'A-01', caminho: 'ALM / A-01', lote_id: null, lote_codigo: null, lote_validade: null },
  B02: { localizacao_id: 2, localizacao_codigo: 'B-02', caminho: 'ALM / B-02', lote_id: 7, lote_codigo: 'L-7', lote_validade: '2026-11-10' },
  C03: { localizacao_id: 3, localizacao_codigo: 'C-03', caminho: 'ALM / C-03', lote_id: null, lote_codigo: null, lote_validade: null },
  FORA: { localizacao_id: 9, localizacao_codigo: 'Z-09', caminho: 'ALM / Z-09', lote_id: null, lote_codigo: null, lote_validade: null },
};
const pegar = (par, sugerida, extra = {}) => ({ ...par, quantidade_no_endereco: 6, quantidade_sugerida: sugerida, cobre: true, ...extra });
const sugItem = (item_id, pegar_em, extra = {}) => ({
  item_id, separavel: pegar_em ? pegar_em.quantidade_sugerida : 0, pegar_em, pegar_em_aviso: null, pegar_em_alerta: null, ...extra,
});
const sugestao = (...itens) => ({ data: { requisicao_id: 55, itens, ordem_coleta: [] } });

const SUGERIDO = 'Sugerido pela fila de separação. Se pegou de outro endereço, troque aqui.';
const PARCIAL = ' Entregue esta parte antes de separar o resto — separar o resto de outro endereço troca a origem.';
const ALERTA = 'Parte do saldo deste material está retida (em inspeção, bloqueada ou em terceiros) e o sistema não sabe em qual '
  + 'endereço — confira antes de pegar.';
const naoVeio = (texto) => `Sugestão da fila: ${texto} — não veio escolhida; confira o saldo no 'Sai de' antes de escolher.`;

let container;
let root;
let requisicao;
let saldos;
let sugestaoImpl;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = SALDOS;
  sugestaoImpl = () => Promise.resolve({ data: [] });
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return Promise.resolve({ data: saldos });
    if (url === '/almoxarifado/requisicoes/55/sugestao-coleta') return sugestaoImpl();
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { parcial: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
}

const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => {
  await act(async () => { botaoPorTexto(texto).click(); });
};
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const fecharSeparacao = () => [...container.querySelectorAll('.almox-modal')]
  .find((m) => m.textContent.includes('Separar Materiais')).querySelector('.almox-modal-close');
const selectDe = (id) => container.querySelector(`#separacao-origem-${id}`);
const fraseDe = (id) => container.querySelector(`#separacao-sugestao-${id}`);
const putsSeparacao = () => api.put.mock.calls.filter((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
const flush = async () => { await act(async () => { await Promise.resolve(); }); };
const controlada = () => {
  let resolver;
  const promessa = new Promise((r) => { resolver = r; });
  return { promessa, resolver: async (v) => { await act(async () => { resolver(v); await promessa; }); } };
};

describe('Etapa 189 (T2): a janela de separação pré-seleciona o endereço sugerido', () => {
  test('[RN-189.02] cobre -> abre com o par escolhido e a frase; confirmar manda o par', async () => {
    requisicao = aprovada();
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.B02, 5))));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/requisicoes/55/sugestao-coleta');
    expect(selectDe(1).value).toBe('2:7');
    expect(fraseDe(1).textContent).toBe(SUGERIDO);
    await clicar('Confirmar Separação');
    expect(putsSeparacao()[0][1].itens_separados[0])
      .toEqual({ item_id: 1, quantidade_separada: 5, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('[RN-189.02] par sem lote -> valor "<loc>:" e o PUT sem lote_id', async () => {
    requisicao = aprovada();
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.A01, 5))));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(1).value).toBe('1:');
    await clicar('Confirmar Separação');
    expect(putsSeparacao()[0][1].itens_separados[0]).toEqual({ item_id: 1, quantidade_separada: 5, localizacao_origem_id: 1 });
  });

  test('[RN-189.03] planejada pendente -> regra da 65, nunca a sugestao (tela e funcao pura)', async () => {
    // 5 separados de B-02/L-7 (planejada), 5 a separar; B-02/L-7 com 12 cobre. A sugestao (adulterada) aponta A-01 cobrindo.
    const item = {
      quantidade_solicitada: 10, quantidade_separada: 5,
      origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'B-02', lote_separacao_codigo: 'L-7',
    };
    requisicao = { ...aprovada([item]), status: 'EM_SEPARACAO' };
    saldos = [SALDOS[0], { ...SALDOS[1], quantidade: 12 }];
    const sug = sugItem(1, pegar(PAR.A01, 5));
    expect(valorSugeridoNaSeparacao({ ...ITEM_BASE, ...item }, sug, opcoes(saldos), 5, 0, 0)).toBe('');
    sugestaoImpl = () => Promise.resolve(sugestao(sug));
    await renderizar();
    await clicar('Ajustar Separação');
    expect(selectDe(1).value).toBe('2:7');
    expect(fraseDe(1)).toBeNull();
  });

  test('[RN-189.04] dois irmaos no mesmo par que nao comporta os dois -> so o primeiro', async () => {
    requisicao = aprovada([{ quantidade_solicitada: 4 }, { quantidade_solicitada: 4 }]);
    saldos = [{ ...SALDOS[0], quantidade: 6 }, SALDOS[1]];
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.A01, 4)), sugItem(2, pegar(PAR.A01, 4))));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(1).value).toBe('1:');
    expect(selectDe(2).value).toBe('');
    expect(fraseDe(1).textContent).toBe(SUGERIDO);
    expect(fraseDe(2).textContent).toBe(naoVeio('A-01 · 4 PC'));
  });

  test('[RN-189.04, M1] o primeiro escolhido a mao no par antes de a sugestao chegar -> o segundo nao e pre-selecionado', async () => {
    requisicao = aprovada([{ quantidade_solicitada: 4 }, { quantidade_solicitada: 4 }]);
    saldos = [{ ...SALDOS[0], quantidade: 6 }, SALDOS[1]];
    const c = controlada();
    sugestaoImpl = () => c.promessa;
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectDe(1), '1:');
    await c.resolver(sugestao(sugItem(1, null), sugItem(2, pegar(PAR.A01, 4))));
    expect(selectDe(1).value).toBe('1:');
    expect(selectDe(2).value).toBe('');
  });

  test('[RN-189.05] o usuario muda antes da sugestao chegar -> continua a escolha dele', async () => {
    requisicao = aprovada();
    const c = controlada();
    sugestaoImpl = () => c.promessa;
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectDe(1), '1:');
    escolher(selectDe(1), '');
    await c.resolver(sugestao(sugItem(1, pegar(PAR.B02, 5))));
    expect(selectDe(1).value).toBe('');
    await clicar('Confirmar Separação');
    expect(putsSeparacao()[0][1].itens_separados[0]).toEqual({ item_id: 1, quantidade_separada: 5 });
  });

  describe('[RN-189.06] sem sugestao fica no automatico, sem erro', () => {
    const semPreSelecao = async () => {
      await renderizar();
      await clicar('Iniciar Separação');
      await flush();
      expect(selectDe(1).value).toBe('');
      expect(toast.error).not.toHaveBeenCalled();
    };
    test('busca rejeitada (500)', async () => {
      requisicao = aprovada();
      sugestaoImpl = () => Promise.reject(Object.assign(new Error('x'), { response: { status: 500, data: { error: 'x' } } }));
      await semPreSelecao();
      expect(fraseDe(1)).toBeNull();
    });
    test('resposta { data: [] } (o mock dos testes de antes)', async () => {
      requisicao = aprovada();
      await semPreSelecao();
      expect(fraseDe(1)).toBeNull();
    });
    test('cobre: false -> a frase "Sugestao da fila: ..."', async () => {
      requisicao = aprovada();
      sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.B02, 3, { cobre: false }),
        { pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' })));
      await semPreSelecao();
      expect(fraseDe(1).textContent).toBe(naoVeio('B-02 — lote L-7 · 3 PC'));
    });
    test('par fora das opcoes', async () => {
      requisicao = aprovada();
      sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.FORA, 5))));
      await semPreSelecao();
      expect(fraseDe(1).textContent).toBe(naoVeio('Z-09 · 5 PC'));
    });
    test('nao cobre a quantidade pre-preenchida (C-03 tem 2, a janela abre com 5)', async () => {
      requisicao = aprovada();
      sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.C03, 5))));
      await semPreSelecao();
      expect(fraseDe(1).textContent).toBe(naoVeio('C-03 · 5 PC'));
    });
    test('PLANEJADA_INDISPONIVEL (pegar_em null) -> nada, nem frase', async () => {
      requisicao = aprovada();
      sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, null, { pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' })));
      await semPreSelecao();
      expect(fraseDe(1)).toBeNull();
    });
  });

  test('[RN-189.07] o 400 do servidor mantem a janela; trocar para automatico e confirmar -> PUT sem chave', async () => {
    requisicao = aprovada();
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.B02, 5))));
    const LITERAL = 'Chapa 3mm: O saldo em B-02 (1) não cobre a quantidade (5) — a saída tiraria de outros endereços';
    api.put.mockRejectedValueOnce(Object.assign(new Error('400'), { response: { status: 400, data: { error: LITERAL } } }));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(1).value).toBe('2:7');
    await clicar('Confirmar Separação');
    expect(toast.error).toHaveBeenCalledWith(LITERAL);
    expect(selectDe(1)).not.toBeNull();
    escolher(selectDe(1), '');
    await clicar('Confirmar Separação');
    const puts = putsSeparacao();
    expect(puts).toHaveLength(2);
    expect(puts[1][1].itens_separados[0]).toEqual({ item_id: 1, quantidade_separada: 5 });
  });

  test('[RN-189.09] trocar o select tira a frase "Sugerido…"', async () => {
    requisicao = aprovada();
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.B02, 5))));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(fraseDe(1).textContent).toBe(SUGERIDO);
    escolher(selectDe(1), '1:');
    expect(fraseDe(1)).toBeNull();
    escolher(selectDe(1), '2:7');
    expect(fraseDe(1).textContent).toBe(SUGERIDO);
  });

  test('[RN-189.09, I1] separar so uma parte do pendente -> "Entregue esta parte antes de separar o resto…"', async () => {
    // 8 pedidos, saldo 5: a janela abre com 5 < 8.
    requisicao = aprovada([{ quantidade_solicitada: 8, saldo_atual: 5 }]);
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.B02, 5))));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(1).value).toBe('2:7');
    expect(fraseDe(1).textContent).toBe(SUGERIDO + PARCIAL);
  });

  test('[I3] com RETENCAO_NO_MATERIAL pre-seleciona e mostra o alerta da 188 depois da frase', async () => {
    requisicao = aprovada();
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.B02, 5), { pegar_em_alerta: 'RETENCAO_NO_MATERIAL' })));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(1).value).toBe('2:7');
    expect(fraseDe(1).textContent).toBe(`${SUGERIDO} ${ALERTA}`);
  });

  test('[M2] separado pendente sem planejada (rodada anterior no automatico) -> nao pre-seleciona; "Sugestao da fila: …"', async () => {
    requisicao = { ...aprovada([{ quantidade_separada: 2 }]), status: 'EM_SEPARACAO' };
    const item = { ...ITEM_BASE, quantidade_separada: 2 };
    const sug = sugItem(1, pegar(PAR.A01, 3));
    expect(valorSugeridoNaSeparacao(item, sug, opcoes(SALDOS), 3, 0, 0)).toBe('');
    sugestaoImpl = () => Promise.resolve(sugestao(sug));
    await renderizar();
    await clicar('Ajustar Separação');
    await flush();
    expect(selectDe(1).value).toBe('');
    expect(fraseDe(1).textContent).toBe(naoVeio('A-01 · 3 PC'));
  });

  test('abrir, fechar e abrir de novo -> a resposta atrasada da primeira abertura nao pre-seleciona a segunda', async () => {
    requisicao = aprovada();
    const primeira = controlada();
    const segunda = controlada();
    const fila = [primeira, segunda];
    sugestaoImpl = () => fila.shift().promessa;
    await renderizar();
    await clicar('Iniciar Separação');
    await act(async () => { fecharSeparacao().click(); });
    await clicar('Iniciar Separação');
    // A da primeira abertura chega DEPOIS de a segunda abrir e ANTES da resposta dela: tem de ser descartada.
    await primeira.resolver(sugestao(sugItem(1, pegar(PAR.B02, 5))));
    expect(selectDe(1).value).toBe('');
    expect(fraseDe(1)).toBeNull();
    await segunda.resolver(sugestao(sugItem(1, pegar(PAR.A01, 5))));
    expect(selectDe(1).value).toBe('1:');
    expect(fraseDe(1).textContent).toBe(SUGERIDO);
  });

  // Fase 5 da 189 (achado 1, sonda J2): o foco da janela recarrega o detalhe; se um item de OUTRO material deixa de ser separavel,
  // a chave dos materiais muda. Antes do fix-round isso zerava todas as escolhas e a pre-selecao, e a escolha do almoxarife voltava
  // para a sugestao, com a frase "Sugerido…" (RN-189.05 vale tambem depois de recarregar).
  const doisMateriais = () => {
    requisicao = aprovada([{}, { material_id: 20, material_codigo: 'MAT-2', quantidade_solicitada: 1 }]);
    sugestaoImpl = () => Promise.resolve(sugestao(sugItem(1, pegar(PAR.B02, 5)), sugItem(2, pegar(PAR.A01, 1))));
  };
  const buscasSugestao = () => api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/requisicoes/55/sugestao-coleta').length;
  const outroSeparaOItem2 = async () => {
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => (i.id === 2 ? { ...i, quantidade_separada: 1 } : i)) };
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    await flush();
  };

  test('[Fase 5, J2] recarregar com outro material saindo da janela -> a escolha do almoxarife no item 1 continua', async () => {
    doisMateriais();
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(1).value).toBe('2:7');
    expect(selectDe(2)).not.toBeNull();
    escolher(selectDe(1), '1:');
    expect(fraseDe(1)).toBeNull();
    const antes = buscasSugestao();
    await outroSeparaOItem2();
    // Premissa: a chave mudou de verdade (o item 2 saiu e a sugestao foi buscada de novo) — senao o teste nao prova nada.
    expect(selectDe(2)).toBeNull();
    expect(buscasSugestao()).toBe(antes + 1);
    expect(selectDe(1).value).toBe('1:');
    expect(fraseDe(1)).toBeNull();
    await clicar('Confirmar Separação');
    expect(putsSeparacao()[0][1].itens_separados)
      .toEqual([{ item_id: 1, quantidade_separada: 5, localizacao_origem_id: 1 }]);
  });

  test('[Fase 5, J2] recarregar com outro material saindo da janela -> o item pre-selecionado e nao tocado continua com a frase', async () => {
    doisMateriais();
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(1).value).toBe('2:7');
    const antes = buscasSugestao();
    await outroSeparaOItem2();
    expect(selectDe(2)).toBeNull();
    expect(buscasSugestao()).toBe(antes + 1);
    expect(selectDe(1).value).toBe('2:7');
    expect(fraseDe(1).textContent).toBe(SUGERIDO);
  });

  test('[Fase 5, J2] item que saiu da janela e voltou na mesma abertura -> e decidido de novo (so fica a escolha de quem continuou)', async () => {
    doisMateriais();
    const orig = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url === '/almoxarifado/estoque/20/saldos'
      ? Promise.resolve({ data: [{ id: 9, material_id: 20, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 5 }] })
      : orig(url)));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectDe(2).value).toBe('1:');
    escolher(selectDe(2), '');
    await outroSeparaOItem2();
    expect(selectDe(2)).toBeNull();
    // A separacao do item 2 foi desfeita: ele volta para a janela, sem a escolha velha.
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => (i.id === 2 ? { ...i, quantidade_separada: 0 } : i)) };
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await flush();
    await flush();
    expect(selectDe(2).value).toBe('1:');
    expect(fraseDe(2).textContent).toBe(SUGERIDO);
    expect(selectDe(1).value).toBe('2:7');
  });
});

// As opções do "Sai de" como a tela as monta (linhas com endereço e quantidade > 0).
function opcoes(rows) {
  return rows.filter((s) => s.localizacao_id != null && Number(s.quantidade) > 0);
}
