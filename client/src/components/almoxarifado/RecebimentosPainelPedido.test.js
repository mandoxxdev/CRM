/**
 * Etapa 39, T3 (RN-39.08) — o painel do PEDIDO dentro do "Novo Recebimento" (Fornecedor e
 * Condições), portado da Etapa 32 SEM preço, SEM totais e SEM `observacoes` (B22/B23).
 *
 * Arquivo próprio, e não mais um bloco em `RecebimentosAlmoxarifado.test.js`: aquele arnês tem
 * 27 cenários com um mock que REJEITA toda URL fora da fixture — e é exatamente por isso que ele
 * continua valendo como prova de que a rota nova falha SEM derrubar o recebimento (lá a rota do
 * documento rejeita em todo cenário do pedido, e os itens continuam na tela). Aqui o mock ganha o
 * ramo da rota nova, com três fixtures: a limpa (312), a CONTAMINADA (313 — traz `observacoes`,
 * `valor_total` e `totais`, que o servidor não manda mas o painel também não pode exibir se
 * vierem) e a que não existe (314 → 404).
 *
 * Por que as asserções são medidas no PAINEL (`data-testid="painel-pedido"`) e não no modal:
 * o `<select>` de pedidos lista `numero — fornecedor_nome`, então "Aços Vale" está no texto do
 * modal mesmo com o painel vazio. Medir no modal faria a metade positiva passar sem painel.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     src/components/almoxarifado/RecebimentosPainelPedido.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RecebimentosAlmoxarifado from './RecebimentosAlmoxarifado';
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

const RECEBIMENTOS = [{
  id: 41, numero: 'REC-2026-041', nota_fiscal: 'NF-4100', pedido_compra_numero: null,
  fornecedor_nome: 'Aços Vale Ltda', status: 'RECEBIDO', created_at: '2026-09-10T11:00:00Z',
}];

const PEDIDOS = [
  {
    id: 312, numero: 'PC-2026-312', fornecedor_nome: 'Aços Vale Ltda',
    fornecedor_cnpj: '11.111.111/0001-11', status: 'aprovado', valor_total: 350,
    quantidade_pedida: 10, quantidade_recebida: 0, saldo_pendente: 10, situacao_recebimento: 'ABERTO',
  },
  {
    id: 313, numero: 'PC-2026-313', fornecedor_nome: 'Parafusos Sul',
    fornecedor_cnpj: '22.222.222/0001-22', status: 'aprovado', valor_total: 900,
    quantidade_pedida: 8, quantidade_recebida: 0, saldo_pendente: 8, situacao_recebimento: 'ABERTO',
  },
  {
    id: 314, numero: 'PC-2026-314', fornecedor_nome: 'Ferramentas Norte',
    fornecedor_cnpj: '33.333.333/0001-33', status: 'aprovado', valor_total: 120,
    quantidade_pedida: 4, quantidade_recebida: 0, saldo_pendente: 4, situacao_recebimento: 'ABERTO',
  },
];

const linha = (id, material) => ({
  id, material_id: 9, material_nome: material, material_codigo: 'ALM-0100', codigo: 'ALM-0100',
  descricao: material, unidade: 'PC', quantidade: 10, quantidade_recebida: 0,
  saldo_pendente: 10, saldo_pendente_material: 10,
});
const ITENS_PEDIDO = {
  312: [linha(9312, 'Parafuso M8')],
  313: [linha(9313, 'Parafuso M10')],
  314: [linha(9314, 'Parafuso M12')],
};

// O contrato congelado da T1: `GET /recebimentos-aux/pedidos-compra/:id`. Nomes do SNAPSHOT
// distintos dos da lista de propósito ("Aços Vale Comércio de Metais Ltda" × "Aços Vale Ltda"):
// é o que prova que o painel veio do documento, não da linha do `<select>`.
const DOC_PEDIDO = {
  312: {
    id: 312, numero: 'PC-2026-312', status: 'aprovado',
    data_pedido: '2026-09-01', previsao_entrega: '2026-09-20',
    fornecedor: {
      nome: 'Aços Vale Comércio de Metais Ltda', cnpj: '11.111.111/0001-11', ie: '123.456.789.000',
      endereco: 'Rua das Chapas, 100', municipio: 'Joinville', uf: 'SC', cep: '89200-000',
      telefone: '(47) 3333-1111', celular: '(47) 99999-1111', email: 'vendas@acosvale.com.br',
      origem: 'cadastro',
    },
    condicoes: {
      condicao_pagamento: '28/56 DDL', frete_modalidade: 'CIF', transportadora: 'TransLog Sul',
      transportadora_telefone: '(47) 3222-9000', via_transporte: 'Rodoviário',
      tabela_preco: 'Tabela 2026-A', contato: 'Marcos (compras)',
      local_entrega: 'Portaria 2 — Galpão B',
    },
  },
  // CONTAMINADA: o que a rota NÃO manda (RN-39.08) — se um dia mandar, o painel não exibe.
  313: {
    id: 313, numero: 'PC-2026-313', status: 'aprovado',
    data_pedido: '2026-09-05', previsao_entrega: null,
    observacoes: 'NEGOCIACAO SIGILOSA com o fornecedor',
    valor_total: 1234.56,
    totais: { total_produtos: 1000, total_ipi: 100, total_geral: 1234.56 },
    itens: [{ id: 9313, descricao: 'Parafuso M10', valor_unitario: 77.77 }],
    fornecedor: {
      nome: 'Parafusos Sul Indústria', cnpj: '22.222.222/0001-22', ie: null,
      endereco: null, municipio: null, uf: null, cep: null,
      telefone: null, celular: '(51) 98888-2222', email: null, origem: 'snapshot',
    },
    condicoes: {
      condicao_pagamento: null, frete_modalidade: 'FOB', transportadora: null,
      transportadora_telefone: null, via_transporte: null, tabela_preco: null, contato: null,
      local_entrega: null,
    },
  },
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: RECEBIMENTOS });
    if (/^\/almoxarifado\/recebimentos\/\d+$/.test(url)) return Promise.reject(new Error('sem detalhe'));
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: PEDIDOS });
    if (/^\/almoxarifado\/recebimentos-aux\/pedidos-compra\/\d+\/itens$/.test(url)) {
      const id = Number(url.split('/')[4]);
      return ITENS_PEDIDO[id]
        ? Promise.resolve({ data: ITENS_PEDIDO[id] })
        : Promise.reject(new Error(`Pedido ${id} fora da fixture`));
    }
    // Etapa 39 (T3): a rota do DOCUMENTO do pedido. Regex fechada em `$` — ela é PREFIXO da rota
    // de itens, e `startsWith` entregaria o documento no lugar das linhas.
    if (/^\/almoxarifado\/recebimentos-aux\/pedidos-compra\/\d+$/.test(url)) {
      const id = Number(url.split('/').pop());
      if (DOC_PEDIDO[id]) return Promise.resolve({ data: DOC_PEDIDO[id] });
      const err = new Error('Request failed with status code 404');
      err.response = { status: 404, data: { error: 'Pedido não encontrado' } };
      return Promise.reject(err);
    }
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation(() => Promise.resolve({ data: { id: 91, numero: 'REC-2026-091' } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter><RecebimentosAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
async function selecionar(select, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await esperarEfeitos();
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));
const modalNovo = () => container.querySelector('.almox-modal');
const selectPorLabel = (texto) => [...container.querySelectorAll('.almox-field')]
  .find((d) => d.querySelector('label')?.textContent.includes(texto))
  ?.querySelector('select');
const inputQtdPedido = (pedidoItemId) => container
  .querySelector(`[data-testid="qtd-pedido-${pedidoItemId}"]`);
const painelPedido = () => container.querySelector('[data-testid="painel-pedido"]');
const seloCadastro = () => painelPedido()?.querySelector('[data-testid="painel-pedido-origem"]');
const chamadasDoc = (id) => api.get.mock.calls
  .filter(([url]) => url === `/almoxarifado/recebimentos-aux/pedidos-compra/${id}`);
const chamadasItens = (id) => api.get.mock.calls
  .filter(([url]) => url === `/almoxarifado/recebimentos-aux/pedidos-compra/${id}/itens`);
async function escolherPedido(id) {
  await clicar(botaoPorTexto('Novo Recebimento'));
  await selecionar(selectPorLabel('Forma de recebimento'), 'PEDIDO_COMPRA');
  const selPedido = selectPorLabel('Número do Pedido de Compra');
  await selecionar(selPedido, String(id));
  return selPedido;
}

// O que NUNCA pode sair no painel — preço, total e observação (B22/B23). Medido por literal e
// por padrão de moeda, porque "R$" é o que qualquer `formatMoney` desta tela produz.
const PROIBIDOS = ['R$', '1.234', '1234', '77,77', '77.77', 'total', 'vl. unit', 'preço', 'preco',
  'NEGOCIACAO', 'observa', 'Tabela 2026-A'];
const semProibidos = (texto) => PROIBIDOS.filter((p) => texto.toLowerCase().includes(p.toLowerCase()));

test('(a) escolher o pedido chama o GET do documento UMA vez e o painel mostra Fornecedor e Condicoes da fixture', async () => {
  await renderizar();
  await escolherPedido(312);

  expect(chamadasDoc(312)).toHaveLength(1);
  expect(chamadasItens(312)).toHaveLength(1);           // o GET novo não substitui o de itens
  const p = painelPedido();
  expect(p).not.toBeNull();
  const t = p.textContent;
  // Fornecedor — do documento (nome do snapshot, não o da lista do <select>).
  expect(t).toContain('Fornecedor');
  expect(t).toContain('Aços Vale Comércio de Metais Ltda');
  expect(t).toContain('11.111.111/0001-11');
  expect(t).toContain('123.456.789.000');
  expect(t).toContain('(47) 3333-1111');
  expect(t).toContain('(47) 99999-1111');
  expect(t).toContain('vendas@acosvale.com.br');
  expect(t).toContain('Rua das Chapas, 100');
  expect(t).toContain('Joinville');
  expect(t).toContain('SC');
  expect(t).toContain('89200-000');
  expect(seloCadastro()).not.toBeNull();                 // origem === 'cadastro' → selo
  expect(seloCadastro().textContent).toMatch(/cadastro/i);
  // Condições.
  expect(t).toContain('Condições');
  expect(t).toContain('28/56 DDL');
  expect(t).toContain('CIF');
  expect(t).toContain('TransLog Sul');
  expect(t).toContain('(47) 3222-9000');
  expect(t).toContain('Rodoviário');
  expect(t).toContain('Marcos (compras)');
  expect(t).toContain('Portaria 2 — Galpão B');
  // O recebimento continua inteiro: itens e campo de quantidade do pedido.
  expect(inputQtdPedido(9312)).not.toBeNull();
  expect(inputQtdPedido(9312).value).toBe('10');
});

test('(b) o painel nao tem preco, total nem observacao — nem quando a resposta os traz; campo vazio vira "—"', async () => {
  await renderizar();
  // Metade 1: a fixture limpa.
  const selPedido = await escolherPedido(312);
  expect(semProibidos(painelPedido().textContent)).toEqual([]);

  // Metade 2: a fixture CONTAMINADA — o painel não repassa o que a RN-39.08 proíbe.
  await selecionar(selPedido, '313');
  const p = painelPedido();
  expect(p).not.toBeNull();
  expect(p.textContent).toContain('Parafusos Sul Indústria');   // metade positiva: é o 313
  expect(semProibidos(p.textContent)).toEqual([]);
  expect(p.textContent).not.toContain('SIGILOSA');
  expect(seloCadastro()).toBeNull();                             // origem 'snapshot' → sem selo
  // Campos nulos: o traço, não "null"/"undefined".
  expect(p.textContent).not.toContain('null');
  expect(p.textContent).not.toContain('undefined');
  expect(p.textContent).toContain('—');
  expect(p.textContent).toContain('(51) 98888-2222');            // celular cobre o telefone vazio
  expect(p.textContent).toContain('FOB');
});

test('(c) GET do documento rejeitado (404) nao derruba o recebimento: itens e quantidade seguem, painel ausente com aviso', async () => {
  await renderizar();
  await escolherPedido(314);

  expect(chamadasDoc(314)).toHaveLength(1);
  expect(painelPedido()).toBeNull();
  expect(modalNovo().textContent).toContain('Dados do pedido não disponíveis');
  // O recebimento continua utilizável.
  expect(inputQtdPedido(9314)).not.toBeNull();
  expect(inputQtdPedido(9314).value).toBe('10');
  expect(modalNovo().textContent).toContain('Itens do pedido');
  expect(modalNovo().textContent).not.toContain('Erro ao carregar os itens do pedido');
  expect(modalNovo().querySelector('.almox-modal-footer button[type="submit"]').disabled).toBe(false);
});

test('(d) corrida: a resposta ATRASADA do pedido anterior nao sobrescreve o painel do pedido escolhido depois', async () => {
  await renderizar();
  const original = api.get.getMockImplementation();
  let liberar312;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra/312') {
      return new Promise((resolve) => { liberar312 = () => resolve({ data: DOC_PEDIDO[312] }); });
    }
    return original(url);
  });

  const selPedido = await escolherPedido(312);   // o documento do 312 fica em voo
  expect(liberar312).toBeInstanceOf(Function);
  expect(painelPedido()).toBeNull();             // ainda não há documento para mostrar
  await selecionar(selPedido, '313');            // o 313 resolve normalmente
  expect(painelPedido()).not.toBeNull();
  expect(painelPedido().textContent).toContain('Parafusos Sul Indústria');

  await act(async () => { liberar312(); });      // a resposta ATRASADA do 312 chega por último
  await esperarEfeitos();

  expect(painelPedido().textContent).toContain('Parafusos Sul Indústria');
  expect(painelPedido().textContent).not.toContain('Aços Vale Comércio');
  expect(modalNovo().textContent).not.toContain('Carregando dados do pedido');
});

test('(d2) a FALHA atrasada do pedido abandonado tambem nao aparece sobre o pedido escolhido', async () => {
  await renderizar();
  const original = api.get.getMockImplementation();
  let falhar314;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra/314') {
      return new Promise((resolve, reject) => { falhar314 = () => reject(new Error('500')); });
    }
    return original(url);
  });

  const selPedido = await escolherPedido(314);
  await selecionar(selPedido, '312');
  expect(painelPedido().textContent).toContain('Aços Vale Comércio');

  await act(async () => { falhar314(); });
  await esperarEfeitos();

  expect(painelPedido()).not.toBeNull();
  expect(painelPedido().textContent).toContain('Aços Vale Comércio');
  expect(modalNovo().textContent).not.toContain('Dados do pedido não disponíveis');
});

test('(e) voltar para "Selecione o pedido..." ou trocar para Nota Fiscal limpa o painel', async () => {
  await renderizar();
  const selPedido = await escolherPedido(312);
  expect(painelPedido()).not.toBeNull();

  await selecionar(selPedido, '');
  expect(painelPedido()).toBeNull();
  expect(modalNovo().textContent).not.toContain('Aços Vale Comércio');

  await selecionar(selPedido, '312');
  expect(painelPedido()).not.toBeNull();
  expect(chamadasDoc(312)).toHaveLength(2);      // reescolher busca de novo (sem cache velho)

  await selecionar(selectPorLabel('Forma de recebimento'), 'NOTA_FISCAL');
  expect(painelPedido()).toBeNull();
  expect(modalNovo().textContent).not.toContain('Aços Vale Comércio');
  expect(modalNovo().textContent).not.toContain('Dados do pedido não disponíveis');
});
