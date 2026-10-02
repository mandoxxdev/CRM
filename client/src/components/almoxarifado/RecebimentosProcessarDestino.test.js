/**
 * Etapa 57 (T2, RN-05) — o modal de "Processar nota" com o destino POR ITEM.
 *
 * Arquivo próprio (e não mais cenários em `RecebimentosAlmoxarifado.test.js`): a fixture daqui
 * precisa de um recebimento em FATURAMENTO com seis itens de formas diferentes, e acrescentá-lo à
 * lista daquele arnês mexeria nas contagens dos cenários (a)-(aa).
 *
 * Mesma disciplina do arnês de lá: o fallback do mock REJEITA (URL inesperada estoura), igualdade
 * antes de regex, e toda asserção negativa tem uma metade positiva no mesmo cenário.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     src/components/almoxarifado/RecebimentosProcessarDestino.test.js
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
  id: 95, numero: 'REC-2026-095', nota_fiscal: 'NF-9500', pedido_compra_numero: null,
  fornecedor_nome: 'Aços Vale Ltda', status: 'ENCAMINHADO_FATURAMENTO', created_at: '2026-09-20T10:00:00Z',
}];

// Seis itens, um por forma que a regra da tela tem de distinguir. Ids 951..956 e materiais
// 21..26: nenhum id repete entre item e material, para a asserção do payload saber qual usou.
const ITENS = [
  // entra (recebida 10); a padrão RECUSA o material
  { id: 951, material_id: 21, material_codigo: 'ALM-0201', material_nome: 'Tinta Epóxi', unidade: 'L',
    quantidade_esperada: 10, quantidade_recebida: 10, entrada_estoque_em: null },
  // entra pela ESPERADA (recebida NULA = não conferido → cai na esperada, igual ao servidor); padrão INATIVA
  { id: 952, material_id: 22, material_codigo: 'ALM-0202', material_nome: 'Eletrodo 6013', unidade: 'KG',
    quantidade_esperada: 5, quantidade_recebida: null, entrada_estoque_em: null },
  // já entrou numa tentativa anterior → NÃO aparece
  { id: 953, material_id: 23, material_codigo: 'ALM-0203', material_nome: 'Luva Nitrílica', unidade: 'PC',
    quantidade_esperada: 7, quantidade_recebida: 7, entrada_estoque_em: '2026-09-21 08:00:00' },
  // quantidade zero nas duas colunas → NÃO aparece
  { id: 954, material_id: 24, material_codigo: 'ALM-0204', material_nome: 'Disco de Corte', unidade: 'PC',
    quantidade_esperada: 0, quantidade_recebida: 0, entrada_estoque_em: null },
  // entra; SEM padrão
  { id: 955, material_id: 25, material_codigo: 'ALM-0205', material_nome: 'Arame MIG', unidade: 'KG',
    quantidade_esperada: 3, quantidade_recebida: 3, entrada_estoque_em: null },
  // entra; a sugestão FALHA (400 material inativo) → sem aviso, sem quebrar
  { id: 956, material_id: 26, material_codigo: 'ALM-0206', material_nome: 'Broca 8mm', unidade: 'PC',
    quantidade_esperada: 4, quantidade_recebida: 4, entrada_estoque_em: null },
  // Etapa 70 (T0): CHEGOU ZERO (recebida 0 com esperada 5) → NÃO aparece. Era o mesmo `||` do servidor que
  // trocava o 0 pela esperada e dava entrada no que não chegou.
  { id: 957, material_id: 27, material_codigo: 'ALM-0207', material_nome: 'Rebite Pop', unidade: 'PC',
    quantidade_esperada: 5, quantidade_recebida: 0, entrada_estoque_em: null },
];

const DETALHE = {
  ...RECEBIMENTOS[0], fornecedor_cnpj: null, valor_total_nota: 1000, chave_nfe: null,
  nota_serie: '1', observacoes: null, contas_pagar_id: null, itens: ITENS,
};

const LOCALIZACOES = [
  { id: 301, codigo: 'A', endereco_completo: 'Galpão > A', parent_id: null, ativo: 1, bloqueada: 0 }, // pai de 302
  { id: 302, codigo: 'A-01', endereco_completo: 'Galpão > A > A-01', parent_id: 301, ativo: 1, bloqueada: 0 },
  { id: 303, codigo: 'Q-01', endereco_completo: 'Galpão > Q-01', parent_id: null, ativo: 1, bloqueada: 1 },
  { id: 304, codigo: 'B-02', endereco_completo: null, parent_id: null, ativo: 1, bloqueada: 0 },
  { id: 305, codigo: 'Z-99', endereco_completo: 'Galpão > Z-99', parent_id: null, ativo: 0, bloqueada: 0 },
];

const SUGESTOES = {
  // `recusa` é a literal REAL do motor (`motivoRecusaEndereco` em server/services/almoxarifado/
  // stockService.js), não um texto inventado: a tela só repete entre parênteses o que o servidor diz.
  21: { padrao: { localizacao_id: 310, codigo: 'C-03', recusa: "Localização C-03 não aceita o tipo de material 'CONSUMIVEL'", inativa: false }, sugestoes: [] },
  22: { padrao: { localizacao_id: 311, codigo: 'D-04', recusa: null, inativa: true }, sugestoes: [] },
  25: { padrao: null, sugestoes: [] },
};

let container; let root; let falhaLocalizacoes;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  falhaLocalizacoes = false;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: RECEBIMENTOS });
    if (url === '/almoxarifado/recebimentos/95') return Promise.resolve({ data: DETALHE });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/localizacoes') {
      return falhaLocalizacoes
        ? Promise.reject(Object.assign(new Error('500'), { response: { status: 500, data: { error: 'x' } } }))
        : Promise.resolve({ data: LOCALIZACOES });
    }
    const m = /^\/almoxarifado\/materiais\/(\d+)\/sugestao-localizacao$/.exec(url);
    if (m) {
      const mid = Number(m[1]);
      if (mid === 26) {
        return Promise.reject(Object.assign(new Error('400'),
          { response: { status: 400, data: { error: 'Material inativo' } } }));
      }
      return SUGESTOES[mid]
        ? Promise.resolve({ data: SUGESTOES[mid] })
        : Promise.reject(new Error(`Sugestão do material ${mid} fora da fixture`));
    }
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation(() => Promise.resolve({ data: { success: true, contas_pagar_id: 77 } }));
  api.put.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

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
const modal = () => container.querySelector('[data-testid="modal-processar"]');
const linhasModal = () => [...(modal()?.querySelectorAll('tbody tr') || [])];
const selectDo = (itemId) => container.querySelector(`[data-testid="destino-item-${itemId}"]`);
const avisoDo = (itemId) => container.querySelector(`[data-testid="aviso-padrao-${itemId}"]`);
const chamadasProcessar = () => api.post.mock.calls
  .filter(([url]) => url === '/almoxarifado/recebimentos/95/processar');

async function abrirModal() {
  await act(async () => {
    root.render(<MemoryRouter><RecebimentosAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
  const linha = [...container.querySelectorAll('.almox-table tbody tr')]
    .find((tr) => tr.textContent.includes('REC-2026-095'));
  await clicar(linha);
  await clicar(botaoPorTexto('Processar Nota'));
  await esperarEfeitos();
}

test('(a) o modal lista SÓ os itens que vão entrar — recebida nula entra pela esperada; chegou zero, já entrado e zero não', async () => {
  const confirmSpy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
  await abrirModal();
  expect(modal()).not.toBeNull();
  expect(confirmSpy).not.toHaveBeenCalled();              // o window.confirm saiu
  confirmSpy.mockRestore();
  expect(modal().textContent).toContain('Isso dará entrada no estoque e gerará contas a pagar.');

  const ids = linhasModal().map((tr) => tr.getAttribute('data-testid'));
  expect(ids).toEqual(['processar-item-951', 'processar-item-952', 'processar-item-955', 'processar-item-956']);
  // o 952 aparece com a quantidade ESPERADA (5), porque a recebida é nula (não conferido)
  const t952 = linhasModal()[1].textContent;
  expect(t952).toContain('ALM-0202');
  expect(t952).toContain('Eletrodo 6013');
  expect(t952).toContain('5 KG');
  expect(modal().textContent).not.toContain('ALM-0203');
  expect(modal().textContent).not.toContain('ALM-0204');
  expect(modal().textContent).not.toContain('ALM-0207');   // chegou zero não entra (Etapa 70, T0)
  // nada saiu antes de confirmar
  expect(chamadasProcessar()).toHaveLength(0);
});

test('(b) o seletor tem "Padrão do material" primeiro e só as localizações sem bloqueio, não-pai e ativas', async () => {
  await abrirModal();
  const opcoes = [...selectDo(951).options].map((o) => [o.value, o.textContent]);
  expect(opcoes).toEqual([
    ['', 'Padrão do material'],
    ['302', 'Galpão > A > A-01'],
    ['304', 'B-02'],                                      // sem endereco_completo → código
  ]);
});

test('(c) Confirmar manda destinos SÓ dos itens escolhidos, com localizacao_id numérico', async () => {
  await abrirModal();
  await selecionar(selectDo(951), '302');
  await selecionar(selectDo(956), '304');
  await clicar(container.querySelector('[data-testid="confirmar-processar"]'));

  expect(chamadasProcessar()).toHaveLength(1);
  expect(chamadasProcessar()[0][1]).toEqual({
    destinos: [{ item_id: 951, localizacao_id: 302 }, { item_id: 956, localizacao_id: 304 }],
  });
  // sucesso: o modal fecha e o detalhe recarrega
  expect(modal()).toBeNull();
  const toast = require('react-toastify').toast;
  expect(toast.success).toHaveBeenCalledWith('Nota processada — estoque atualizado e conta a pagar gerada!');
});

test('(d) sem nenhum destino escolhido manda destinos: []', async () => {
  await abrirModal();
  await clicar(container.querySelector('[data-testid="confirmar-processar"]'));
  expect(chamadasProcessar()).toHaveLength(1);
  expect(chamadasProcessar()[0][1]).toEqual({ destinos: [] });
});

test('(e) aviso da padrão recusada, inativa e inexistente — e some ao escolher um destino', async () => {
  await abrirModal();
  expect(avisoDo(951).textContent).toBe(
    "A localização padrão C-03 não recebe este material (Localização C-03 não aceita o tipo de material 'CONSUMIVEL') — escolha um destino.");
  expect(avisoDo(952).textContent).toBe('A localização padrão D-04 está inativa — escolha um destino.');
  expect(avisoDo(955).textContent).toBe('Sem localização padrão — o saldo entra sem endereço.');

  await selecionar(selectDo(951), '302');
  expect(avisoDo(951)).toBeNull();
  expect(avisoDo(952)).not.toBeNull();                    // o dos outros fica
  // voltar para a padrão traz o aviso de volta
  await selecionar(selectDo(951), '');
  expect(avisoDo(951)).not.toBeNull();
});

test('(f) sugestão que falha (400 material inativo) não mostra aviso e não quebra o modal', async () => {
  await abrirModal();
  expect(linhasModal().map((tr) => tr.getAttribute('data-testid'))).toContain('processar-item-956');
  expect(avisoDo(956)).toBeNull();
  // âncora: a sugestão do 26 foi pedida mesmo (senão "sem aviso" passaria por não ter consultado)
  expect(api.get.mock.calls.some(([u]) => u === '/almoxarifado/materiais/26/sugestao-localizacao')).toBe(true);
  expect([...selectDo(956).options]).toHaveLength(3);
});

test('(g) erro do servidor aparece DENTRO do modal e o modal fica aberto; o botão trava enquanto salva', async () => {
  let rejeitar;
  api.post.mockImplementation(() => new Promise((_, rej) => { rejeitar = rej; }));
  await abrirModal();
  await selecionar(selectDo(951), '302');
  const botao = container.querySelector('[data-testid="confirmar-processar"]');
  await clicar(botao);
  expect(container.querySelector('[data-testid="confirmar-processar"]').disabled).toBe(true);

  const msg = 'Nao foi possivel dar entrada no estoque: ALM-0201: localizacao bloqueada';
  await act(async () => { rejeitar({ response: { status: 400, data: { error: msg } } }); });
  await esperarEfeitos();

  expect(modal()).not.toBeNull();
  const alerta = modal().querySelector('[role="alert"]');
  expect(alerta).not.toBeNull();
  expect(alerta.textContent).toBe(msg);
  expect(container.querySelector('[data-testid="confirmar-processar"]').disabled).toBe(false);
  // a escolha sobrevive ao erro
  expect(selectDo(951).value).toBe('302');
});

test('(h) localizações que não carregam: o modal abre só com a padrão e ainda processa', async () => {
  falhaLocalizacoes = true;
  await abrirModal();
  expect(modal().textContent).toContain('Não foi possível carregar as localizações');
  expect([...selectDo(951).options].map((o) => o.value)).toEqual(['']);
  await clicar(container.querySelector('[data-testid="confirmar-processar"]'));
  expect(chamadasProcessar()[0][1]).toEqual({ destinos: [] });
});

test('(i) corrida: respostas da abertura anterior que chegam atrasadas não sobrescrevem as da reabertura', async () => {
  const base = api.get.getMockImplementation();
  const pendentes = [];                                   // respostas da 1ª abertura, seguradas
  let abertura = 0;
  const NOVAS_LOCALIZACOES = [
    { id: 401, codigo: 'N-01', endereco_completo: 'Galpão > N-01', parent_id: null, ativo: 1, bloqueada: 0 },
  ];
  const NOVAS_SUGESTOES = {
    21: { padrao: null, sugestoes: [] },
    22: { padrao: { localizacao_id: 312, codigo: 'E-05', recusa: null, inativa: true }, sugestoes: [] },
  };
  // o que as respostas VELHAS trazem — tudo diferente do novo, para qualquer vazamento aparecer
  const VELHAS_SUGESTOES = {
    ...SUGESTOES,
    26: { padrao: { localizacao_id: 399, codigo: 'VELHA', recusa: null, inativa: true }, sugestoes: [] },
  };
  api.get.mockImplementation((url) => {
    const m = /^\/almoxarifado\/materiais\/(\d+)\/sugestao-localizacao$/.exec(url);
    const ehConsultaModal = url === '/almoxarifado/localizacoes' || m;
    if (ehConsultaModal && abertura === 1) {
      return new Promise((resolve) => { pendentes.push({ url, mid: m && Number(m[1]), resolve }); });
    }
    if (ehConsultaModal && abertura === 2) {
      if (!m) return Promise.resolve({ data: NOVAS_LOCALIZACOES });
      const mid = Number(m[1]);
      if (NOVAS_SUGESTOES[mid]) return Promise.resolve({ data: NOVAS_SUGESTOES[mid] });
    }
    return base(url);
  });

  await act(async () => {
    root.render(<MemoryRouter><RecebimentosAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
  await clicar([...container.querySelectorAll('.almox-table tbody tr')]
    .find((tr) => tr.textContent.includes('REC-2026-095')));

  // 1ª abertura: localizações + uma sugestão por material (21, 22, 25, 26) ficam pendentes
  abertura = 1;
  await clicar(botaoPorTexto('Processar Nota'));
  expect(pendentes.map((p) => p.url).sort()).toEqual([
    '/almoxarifado/localizacoes',
    '/almoxarifado/materiais/21/sugestao-localizacao',
    '/almoxarifado/materiais/22/sugestao-localizacao',
    '/almoxarifado/materiais/25/sugestao-localizacao',
    '/almoxarifado/materiais/26/sugestao-localizacao',
  ]);
  expect([...selectDo(951).options].map((o) => o.value)).toEqual(['']);   // nada chegou ainda

  // fecha e reabre; a reabertura responde na hora com dados novos
  await clicar([...modal().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancelar'));
  expect(modal()).toBeNull();
  abertura = 2;
  await clicar(botaoPorTexto('Processar Nota'));

  const estadoNovo = () => {
    expect([...selectDo(951).options].map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Padrão do material'],
      ['401', 'Galpão > N-01'],
    ]);
    expect(avisoDo(951).textContent).toBe('Sem localização padrão — o saldo entra sem endereço.');
    expect(avisoDo(952).textContent).toBe('A localização padrão E-05 está inativa — escolha um destino.');
    expect(avisoDo(955).textContent).toBe('Sem localização padrão — o saldo entra sem endereço.');
    expect(avisoDo(956)).toBeNull();
  };
  estadoNovo();                                            // metade positiva: o novo chegou

  // agora as respostas da 1ª abertura chegam, atrasadas
  await act(async () => {
    pendentes.forEach((p) => p.resolve({ data: p.mid ? VELHAS_SUGESTOES[p.mid] : LOCALIZACOES }));
  });
  await esperarEfeitos();

  expect(modal()).not.toBeNull();
  estadoNovo();                                            // e nada do velho vazou
  expect(modal().textContent).not.toContain('VELHA');
  expect(modal().textContent).not.toContain('C-03');
  expect(modal().textContent).not.toContain('A-01');
});
