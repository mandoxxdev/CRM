/**
 * Etapa 9b, Task 7 — tela "Ferramentas" (patrimônio emprestável + calibração).
 *
 * O alvo aqui e o que SO a tela pode errar: o payload de POST .../emprestar (contrato
 * congelado no design), a mensagem de recusa do backend aparecendo (RN-03), o gate de escrita
 * unico `gerenciar_ferramentas` escondendo as acoes de linha, e o painel de calibracao separando
 * vencidas de a-vencer. O motor (maquina de estados, claim atomico, auditoria) tem teste de
 * servico e de rota no servidor (toolFundacao.api.test.js, toolEmprestimo.api.test.js) — nao
 * duplicado aqui.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=FerramentasAlmoxarifado
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FerramentasAlmoxarifado from './FerramentasAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// Permissoes: por padrao tudo liberado. mockPode troca em runtime (mesmo padrao de
// SobrasAlmoxarifado.test.js) — o gate REAL continua sendo do servidor.
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao, ev) => {
      if (mockPode(acao)) return true;
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    },
    loading: false,
  }),
}));

// Shape real de toolService.listarFerramentas: calibracao_vigente e bool|null (null quando a
// ferramenta nao exige calibracao), emprestimo_aberto e {id, colaborador_nome,
// data_prevista_devolucao}|null. exige_calibracao chega 0/1 do SQLite (contrato congelado).
const FERRAMENTAS = [
  { id: 1, codigo_patrimonio: 'FER-001', nome: 'Furadeira de bancada', tipo: 'Elétrica',
    setor_responsavel: 'Produção', status: 'DISPONIVEL', numero_serie: 'SN-1001',
    localizacao_id: 5, exige_calibracao: 0, calibracao_vigente: null, emprestimo_aberto: null },
  { id: 2, codigo_patrimonio: 'FER-002', nome: 'Paquímetro digital', tipo: 'Instrumento',
    setor_responsavel: 'Qualidade', status: 'EMPRESTADA', numero_serie: 'SN-2002',
    localizacao_id: null, exige_calibracao: 1, calibracao_vigente: true,
    emprestimo_aberto: { id: 20, colaborador_nome: 'João Silva', data_prevista_devolucao: '2026-08-10' } },
  { id: 3, codigo_patrimonio: 'FER-003', nome: 'Multímetro', tipo: 'Instrumento',
    setor_responsavel: 'Manutenção', status: 'BLOQUEADA', numero_serie: null,
    localizacao_id: null, exige_calibracao: 1, calibracao_vigente: false, emprestimo_aberto: null },
];

// GET /emprestimos (toolService.listarEmprestimos): join com ferramenta (ferramenta_nome,
// codigo_patrimonio). O emprestimo 20 tem data_prevista_devolucao NO PASSADO em relacao a
// "hoje" do teste (mockado abaixo) — prova o destaque de vencido sem precisar de filtro.
const EMPRESTIMOS = [
  { id: 20, ferramenta_id: 2, codigo_patrimonio: 'FER-002', ferramenta_nome: 'Paquímetro digital',
    colaborador_nome: 'João Silva', setor: 'Qualidade', data_retirada: '2026-08-01',
    data_prevista_devolucao: '2026-08-10', data_devolucao_real: null, status: 'EMPRESTADA', observacoes: null },
  { id: 21, ferramenta_id: 1, codigo_patrimonio: 'FER-001', ferramenta_nome: 'Furadeira de bancada',
    colaborador_nome: 'Maria Souza', setor: 'Produção', data_retirada: '2026-07-01',
    data_prevista_devolucao: '2026-07-05', data_devolucao_real: '2026-07-04', status: 'DEVOLVIDA', observacoes: null },
];

// GET /calibracoes/painel: {vencidas:[], a_vencer:[]} — FER-003 vencida, FER-002 a vencer. Os
// dois nomes NAO podem aparecer trocados de secao (o teste de painel prova isso).
//
// FER-004 e uma ferramenta que NUNCA foi calibrada — decisao do design (D3):
// `calibracaoVigente` nao acha nenhum registro, entao o backend classifica em `vencidas` mesmo
// sem `data_validade`/`dias_restantes` (os dois vem null, nao ha calibracao nenhuma para tirar
// esses numeros). O fallback generico ("Vencida", "—") tem de aguentar isso sem quebrar.
const PAINEL = {
  vencidas: [
    { id: 100, ferramenta_id: 3, codigo_patrimonio: 'FER-003', nome: 'Multímetro',
      data_validade: '2026-08-01', dias_restantes: -18 },
    { id: null, ferramenta_id: 4, codigo_patrimonio: 'FER-004', nome: 'Trena a laser',
      data_validade: null, dias_restantes: null },
  ],
  a_vencer: [{ id: 101, ferramenta_id: 2, codigo_patrimonio: 'FER-002', nome: 'Paquímetro digital',
    data_validade: '2026-09-01', dias_restantes: 13 }],
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/ferramentas') return Promise.resolve({ data: FERRAMENTAS });
    if (url === '/almoxarifado/emprestimos') return Promise.resolve({ data: EMPRESTIMOS });
    if (url === '/almoxarifado/calibracoes/painel') return Promise.resolve({ data: PAINEL });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [] });
    if (url.match(/\/ferramentas\/\d+\/manutencoes$/)) return Promise.resolve({ data: [{ id: 900, data_fim: null }] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 999 } });
  api.put.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/almoxarifado/ferramentas']}><FerramentasAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const linhasFerramentas = () => [...container.querySelectorAll('.almox-ferramenta-lista tbody tr')];
const linhasEmprestimos = () => [...container.querySelectorAll('.almox-emprestimo-lista tbody tr')];
const linhasVencidas = () => [...container.querySelectorAll('.almox-calibracao-vencidas tbody tr')];
const linhasAVencer = () => [...container.querySelectorAll('.almox-calibracao-a-vencer tbody tr')];
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
function preencher(el, valor) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const campo = (rotulo, raiz = '.almox-modal') => [...container.querySelectorAll(`${raiz} .almox-field`)]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo))
  ?.querySelector('input, textarea, select');

describe('FerramentasAlmoxarifado — três visões', () => {
  test('renderiza as abas Ferramentas, Empréstimos e Calibrações', async () => {
    await renderizar();
    expect(botao('Ferramentas')).toBeTruthy();
    expect(botao('Empréstimos')).toBeTruthy();
    expect(botao('Calibrações')).toBeTruthy();

    // Ferramentas (default)
    expect(container.querySelector('.almox-ferramenta-lista')).toBeTruthy();

    await clicar(botao('Empréstimos'));
    expect(container.querySelector('.almox-emprestimo-lista')).toBeTruthy();
    expect(linhasEmprestimos()).toHaveLength(EMPRESTIMOS.length);
    expect(texto()).toContain('Vencido'); // emprestimo 20: previsao no passado (RN-06/histórico)

    await clicar(botao('Calibrações'));
    expect(container.querySelector('.almox-calibracao-vencidas')).toBeTruthy();
    expect(container.querySelector('.almox-calibracao-a-vencer')).toBeTruthy();
  });
});

describe('FerramentasAlmoxarifado — lista de ferramentas', () => {
  test('lista as ferramentas do mock com código, nome e status', async () => {
    await renderizar();
    expect(linhasFerramentas()).toHaveLength(FERRAMENTAS.length);
    expect(texto()).toContain('FER-001');
    expect(texto()).toContain('Furadeira de bancada');
    expect(texto()).toContain('Disponível');
    expect(texto()).toContain('Emprestada');
    expect(texto()).toContain('Bloqueada');
  });

  test('lista vazia mostra estado vazio, não tabela em branco', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/ferramentas' ? Promise.resolve({ data: [] }) : Promise.resolve({ data: [] })));
    await renderizar();
    expect(linhasFerramentas()).toHaveLength(0);
    expect(texto()).toMatch(/nenhuma ferramenta/i);
  });
});

describe('FerramentasAlmoxarifado — emprestar', () => {
  test('emprestar dispara POST com o payload do contrato', async () => {
    await renderizar();
    const linhaDisponivel = linhasFerramentas()[0]; // FER-001, DISPONIVEL
    await clicar(botao('Emprestar', linhaDisponivel));

    preencher(campo('Colaborador'), 'Carlos Pereira');
    preencher(campo('Setor'), 'Manutenção');
    await clicar(botao('Emprestar', container.querySelector('.almox-modal-footer')));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/ferramentas/1/emprestar', expect.objectContaining({
      colaborador_nome: 'Carlos Pereira',
      setor: 'Manutenção',
    }));
  });

  test('recusa 400 do backend (RN-03, calibração vencida) aparece como mensagem na tela', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'Ferramenta com calibração vencida ou sem calibração registrada' } },
    });
    await renderizar();
    const linhaDisponivel = linhasFerramentas()[0];
    await clicar(botao('Emprestar', linhaDisponivel));
    preencher(campo('Colaborador'), 'Carlos Pereira');
    await clicar(botao('Emprestar', container.querySelector('.almox-modal-footer')));

    expect(toast.error).toHaveBeenCalledWith('Ferramenta com calibração vencida ou sem calibração registrada');
  });

  test('devolver dispara POST no empréstimo aberto da ferramenta', async () => {
    await renderizar();
    const linhaEmprestada = linhasFerramentas()[1]; // FER-002, EMPRESTADA, emprestimo_aberto.id=20
    await clicar(botao('Devolver', linhaEmprestada));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/emprestimos/20/devolver', {});
  });
});

describe('FerramentasAlmoxarifado — permissão gerenciar_ferramentas', () => {
  test('usuário sem gerenciar_ferramentas não vê os botões de escrita nas linhas', async () => {
    mockPode = () => false;
    await renderizar();
    for (const linha of linhasFerramentas()) {
      expect(botao('Emprestar', linha)).toBeFalsy();
      expect(botao('Devolver', linha)).toBeFalsy();
      expect(botao('Bloquear', linha)).toBeFalsy();
      expect(botao('Ocorrência', linha)).toBeFalsy();
    }
  });

  // "Nova ferramenta" segue o padrão de Gerar retalho/Solicitar sucateamento (SobrasAlmoxarifado):
  // sempre visível, o clique é quem bloqueia via bloquearSeNaoPode. É o alvo da sabotagem —
  // tirar o guard do onClick faz o modal abrir mesmo sem permissão.
  test('"Nova ferramenta" fica visível mas o clique é bloqueado sem permissão', async () => {
    mockPode = () => false;
    await renderizar();
    expect(botao('Nova ferramenta')).toBeTruthy();
    await clicar(botao('Nova ferramenta'));
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('FerramentasAlmoxarifado — painel de calibrações', () => {
  test('painel separa vencidas de a-vencer', async () => {
    await renderizar();
    await clicar(botao('Calibrações'));

    expect(linhasVencidas()).toHaveLength(2); // FER-003 (numerica) + FER-004 (nunca calibrada)
    expect(linhasAVencer()).toHaveLength(1);

    const vencidasTexto = container.querySelector('.almox-calibracao-vencidas').textContent;
    const aVencerTexto = container.querySelector('.almox-calibracao-a-vencer').textContent;

    expect(vencidasTexto).toContain('FER-003');
    expect(vencidasTexto).not.toContain('FER-002');
    expect(aVencerTexto).toContain('FER-002');
    expect(aVencerTexto).not.toContain('FER-003');
  });

  // Achado da revisao (Important): ferramenta NUNCA calibrada entra em `vencidas` com
  // `data_validade`/`dias_restantes` null (design D3 — sem calibracao nenhuma para tirar esses
  // numeros). O guard `c.dias_restantes != null` (e o `c.data_validade ? ... : '—'`) tem de
  // aguentar isso sem quebrar a tela nem virar `NaN`/`null` cru na celula.
  test('calibração vencida sem data_validade/dias_restantes (nunca calibrada) renderiza com o fallback genérico', async () => {
    await renderizar();
    await clicar(botao('Calibrações'));

    expect(linhasVencidas()).toHaveLength(2);
    const linhaNuncaCalibrada = linhasVencidas().find((tr) => tr.textContent.includes('FER-004'));
    expect(linhaNuncaCalibrada).toBeTruthy();
    expect(linhaNuncaCalibrada.textContent).toContain('Trena a laser');
    expect(linhaNuncaCalibrada.textContent).toContain('—'); // coluna Validade, sem data
    expect(linhaNuncaCalibrada.querySelector('.almox-badge-vencida').textContent.trim()).toBe('Vencida');
  });
});

// Achado F4 da revisao final de branch: `new Date(str) < new Date()` compara a data prevista
// (meia-noite UTC) contra o INSTANTE atual — um emprestimo que vence HOJE aparecia "Vencido"
// horas antes da meia-noite local. O servidor (listarEmprestimos, filters.vencidos) usa
// `date(...) < date('now')`, comparacao so de data. O fix na tela precisa concordar com isso:
// data local de hoje, formatada 'YYYY-MM-DD', comparada como STRING.
describe('FerramentasAlmoxarifado — badge "Vencido" (data-only, espelha o servidor)', () => {
  test('emprestimo que vence HOJE nao aparece como Vencido', async () => {
    const hoje = new Date();
    const hojeISO = [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, '0'), String(hoje.getDate()).padStart(2, '0')].join('-');
    const emprestimosComVenceHoje = [
      { id: 30, ferramenta_id: 1, codigo_patrimonio: 'FER-001', ferramenta_nome: 'Furadeira de bancada',
        colaborador_nome: 'Carlos Lima', setor: 'Produção', data_retirada: hojeISO,
        data_prevista_devolucao: hojeISO, data_devolucao_real: null, status: 'EMPRESTADA', observacoes: null },
    ];
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/ferramentas') return Promise.resolve({ data: FERRAMENTAS });
      if (url === '/almoxarifado/emprestimos') return Promise.resolve({ data: emprestimosComVenceHoje });
      if (url === '/almoxarifado/calibracoes/painel') return Promise.resolve({ data: PAINEL });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
      if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    await renderizar();
    await clicar(botao('Empréstimos'));

    expect(linhasEmprestimos()).toHaveLength(1);
    expect(texto()).not.toContain('Vencido');
  });
});

// Extra barato da revisao final (F1/D9): filtro "Exige calibração" na visão Ferramentas, e a
// coluna Localização mostrando o rotulo (nao o id cru) quando a tela ja tem a localizacao
// carregada.
describe('FerramentasAlmoxarifado — extras da revisão final', () => {
  test('filtro "Exige calibração" manda ?exige_calibracao= no GET /ferramentas', async () => {
    await renderizar();
    const select = [...container.querySelectorAll('.almox-select')]
      .find((s) => s.textContent.includes('Exige calibração'));
    expect(select).toBeTruthy();

    api.get.mockClear();
    preencher(select, '1');
    await esperarEfeitos();

    const chamada = api.get.mock.calls.find((c) => c[0] === '/almoxarifado/ferramentas');
    expect(chamada[1].params.exige_calibracao).toBe('1');
  });

  test('coluna Localização mostra o rótulo, não o id cru, quando a localização está carregada', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/ferramentas') return Promise.resolve({ data: FERRAMENTAS });
      if (url === '/almoxarifado/emprestimos') return Promise.resolve({ data: EMPRESTIMOS });
      if (url === '/almoxarifado/calibracoes/painel') return Promise.resolve({ data: PAINEL });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
      if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [{ id: 5, setor: 'Almoxarifado Central', descricao: 'Prateleira A' }] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    // FERRAMENTAS[0] (FER-001) tem localizacao_id: 5. Colunas: Código, Nome, Status, Série,
    // Localização, Calibração, Ações — a celula de Localização e a 5a (indice 4).
    const linha = linhasFerramentas().find((tr) => tr.textContent.includes('FER-001'));
    const celulaLocalizacao = linha.querySelectorAll('td')[4];
    expect(celulaLocalizacao.textContent.trim()).not.toBe('5');
    expect(celulaLocalizacao.textContent).toContain('Almoxarifado Central');
  });
});
