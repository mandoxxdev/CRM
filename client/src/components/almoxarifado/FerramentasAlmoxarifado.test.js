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

// ── Etapa 175 — editar a ferramenta pela tela ──────────────────────────────────────────────────
describe('FerramentasAlmoxarifado — Etapa 175, editar', () => {
  const rodape = () => container.querySelector('.almox-modal-footer');
  const putsDe = (id) => api.put.mock.calls.filter(([url]) => url === `/almoxarifado/ferramentas/${id}`);
  const getsDaLista = () => api.get.mock.calls.filter(([url]) => url === '/almoxarifado/ferramentas').length;
  const exigeCalibracao = () => [...container.querySelectorAll('.almox-modal input[type="checkbox"]')][0];

  test('RN-175.01: "Editar" em toda linha, em qualquer status; sem permissão, em nenhuma', async () => {
    await renderizar();
    const linhas = linhasFerramentas();
    expect(linhas).toHaveLength(3); // DISPONIVEL, EMPRESTADA, BLOQUEADA
    linhas.forEach((l) => expect(botao('Editar', l)).toBeTruthy());
    act(() => root.unmount());
    root = createRoot(container);
    mockPode = () => false;
    await renderizar();
    expect(linhasFerramentas()).toHaveLength(3);
    linhasFerramentas().forEach((l) => expect(botao('Editar', l)).toBeFalsy());
  });

  test('RN-175.02/03: abre preenchido; salvar manda os 9 campos (vazio = null), avisa, fecha e recarrega', async () => {
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0])); // FER-001
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Editar ferramenta');
    expect(campo('Código de patrimônio').value).toBe('FER-001');
    expect(campo('Nome').value).toBe('Furadeira de bancada');
    expect(campo('Tipo').value).toBe('Elétrica');
    expect(campo('Setor responsável').value).toBe('Produção');
    expect(campo('Número de série').value).toBe('SN-1001');
    expect(exigeCalibracao().checked).toBe(false);
    // localização 5 não veio na lista (o mock devolve []) — RN-175.06
    expect(campo('Localização').value).toBe('5');
    expect(campo('Localização').selectedOptions[0].textContent).toBe('Localização #5');

    preencher(campo('Nome'), 'Furadeira de bancada revisada');
    preencher(campo('Número de série'), '   ');
    const antes = getsDaLista();
    await clicar(botao('Salvar', rodape()));

    expect(putsDe(1)).toHaveLength(1);
    expect(putsDe(1)[0][1]).toEqual({
      codigo_patrimonio: 'FER-001', nome: 'Furadeira de bancada revisada', tipo: 'Elétrica',
      setor_responsavel: 'Produção', material_id: null, numero_serie: null, localizacao_id: 5,
      exige_calibracao: false, observacoes: null,
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Ferramenta atualizada');
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    expect(getsDaLista()).toBeGreaterThan(antes);
  });

  test('RN-175.04: nome ou código em branco recusam na tela, sem PUT', async () => {
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0]));
    preencher(campo('Nome'), '  ');
    await clicar(botao('Salvar', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Informe o nome da ferramenta');
    preencher(campo('Nome'), 'Ok');
    preencher(campo('Código de patrimônio'), '');
    await clicar(botao('Salvar', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Informe o código de patrimônio');
    expect(api.put).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
  });

  test('RN-175.05: o 409 do servidor aparece com a frase dele e a janela fica com o digitado', async () => {
    api.put.mockRejectedValue({ response: { status: 409, data: { error: 'Código de patrimônio já cadastrado' } } });
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0]));
    preencher(campo('Código de patrimônio'), 'FER-002');
    await clicar(botao('Salvar', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Código de patrimônio já cadastrado');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
    expect(campo('Código de patrimônio').value).toBe('FER-002');
  });

  test('RN-175.06: material gravado fora da lista aparece como "Material #77" e é mantido; exige calibração 1 vem marcado', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: [{ ...FERRAMENTAS[1], material_id: 77, observacoes: 'Caixa azul' }] })
      : base(url, cfg)));
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0])); // FER-002, EMPRESTADA
    expect(campo('Material do catálogo').value).toBe('77');
    expect(campo('Material do catálogo').selectedOptions[0].textContent).toBe('Material #77');
    expect(exigeCalibracao().checked).toBe(true);
    expect(campo('Observações').value).toBe('Caixa azul');
    await clicar(botao('Salvar', rodape()));
    const corpo = putsDe(2)[0][1];
    expect(corpo.material_id).toBe(77);
    expect(corpo.exige_calibracao).toBe(true);
    expect(corpo.localizacao_id).toBeNull();
    expect(corpo.observacoes).toBe('Caixa azul');
  });

  // Revisao adversarial (Fase 5): o RN-175.01 so tinha DISPONIVEL/EMPRESTADA/BLOQUEADA. Os outros
  // tres status da maquina (toolStateMachine.STATUS) tambem tem de oferecer "Editar" — um botao
  // embrulhado num `f.status === ...` passaria no teste de cima.
  test('RN-175.01 (revisão): "Editar" também em EM_MANUTENCAO, AVARIADA e PERDIDA', async () => {
    const outros = ['EM_MANUTENCAO', 'AVARIADA', 'PERDIDA'].map((status, i) => ({
      ...FERRAMENTAS[0], id: 40 + i, codigo_patrimonio: `FER-0${40 + i}`, status,
    }));
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: outros }) : base(url, cfg)));
    await renderizar();
    const linhas = linhasFerramentas();
    expect(linhas).toHaveLength(3);
    ['FER-040', 'FER-041', 'FER-042'].forEach((cod, i) => {
      expect(linhas[i].textContent).toContain(cod);
      expect(botao('Editar', linhas[i])).toBeTruthy();
    });
    await clicar(botao('Editar', linhas[2])); // PERDIDA
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Editar ferramenta');
    expect(campo('Código de patrimônio').value).toBe('FER-042');
  });

  // Revisao adversarial (Fase 5): o RN-175.05 so provava o 409. O 404 (ferramenta excluida por
  // outra pessoa com a janela aberta) e um 400 qualquer do servidor tambem tem de chegar com a frase
  // dele — nao a generica — e a janela fica aberta.
  test.each([
    [404, 'Ferramenta não encontrada'],
    [400, 'Frase de validação que só o servidor conhece'],
  ])('RN-175.05 (revisão): o %i do servidor aparece literal e a janela fica aberta', async (status, frase) => {
    api.put.mockRejectedValue({ response: { status, data: { error: frase } } });
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0]));
    preencher(campo('Nome'), 'Nome digitado');
    await clicar(botao('Salvar', rodape()));
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(frase);
    expect(toast.error).not.toHaveBeenCalledWith('Erro ao atualizar a ferramenta');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
    expect(campo('Nome').value).toBe('Nome digitado');
  });

  // Revisao adversarial (Fase 5): o RN-175.02 so contava o GET da lista. Marcar/desmarcar "exige
  // calibracao" muda o painel; depois de salvar, o painel tem de vir de um GET feito DEPOIS do PUT,
  // e o que ele mostra e o novo. (Hoje o painel rebusca a cada entrada na aba, e o recarregarCal()
  // do salvar e redundante — o teste prende o comportamento, nao o mecanismo.)
  test('RN-175.02 (revisão): depois de salvar, o painel de calibrações vem de um GET posterior ao PUT', async () => {
    const PAINEL_NOVO = { vencidas: [], a_vencer: [{ id: 102, ferramenta_id: 1, codigo_patrimonio: 'FER-001',
      nome: 'Furadeira de bancada', data_validade: '2026-12-01', dias_restantes: 40 }] };
    let salvou = false;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/calibracoes/painel'
      ? Promise.resolve({ data: salvou ? PAINEL_NOVO : PAINEL }) : base(url, cfg)));
    api.put.mockImplementation(() => { salvou = true; return Promise.resolve({ data: { id: 1 } }); });
    await renderizar();
    await clicar(botao('Calibrações'));
    expect(linhasVencidas()).toHaveLength(2);
    await clicar(botao('Ferramentas'));
    await clicar(botao('Editar', linhasFerramentas()[0]));
    await act(async () => { exigeCalibracao().click(); });
    await clicar(botao('Salvar', rodape()));
    expect(putsDe(1)[0][1].exige_calibracao).toBe(true);
    await clicar(botao('Calibrações'));
    const ordemPut = api.put.mock.invocationCallOrder[0];
    const getsPainelDepois = api.get.mock.calls
      .map((c, i) => [c[0], api.get.mock.invocationCallOrder[i]])
      .filter(([url, ordem]) => url === '/almoxarifado/calibracoes/painel' && ordem > ordemPut);
    expect(getsPainelDepois.length).toBeGreaterThan(0);
    expect(linhasVencidas()).toHaveLength(0);
    expect(linhasAVencer()).toHaveLength(1);
    expect(container.querySelector('.almox-calibracao-a-vencer').textContent).toContain('FER-001');
  });

  test('o "Nova ferramenta" continua cadastrando (POST) com o botão "Cadastrar"', async () => {
    await renderizar();
    await clicar(botao('Nova ferramenta'));
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Nova ferramenta');
    preencher(campo('Código de patrimônio'), 'FER-NOVA');
    preencher(campo('Nome'), 'Serra');
    await clicar(botao('Cadastrar', rodape()));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/ferramentas', expect.objectContaining({ codigo_patrimonio: 'FER-NOVA' }));
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('FerramentasAlmoxarifado — Etapa 177, retorno da manutenção (condição e destino)', () => {
  const rodape = () => container.querySelector('.almox-modal-footer');
  const EM_MANUTENCAO = { id: 7, codigo_patrimonio: 'FER-007', nome: 'Esmerilhadeira', tipo: 'Elétrica',
    setor_responsavel: 'Produção', status: 'EM_MANUTENCAO', numero_serie: null, localizacao_id: null,
    exige_calibracao: 0, calibracao_vigente: null, emprestimo_aberto: null };
  const BAIXADA = { id: 8, codigo_patrimonio: 'FER-008', nome: 'Torquímetro', tipo: 'Instrumento',
    setor_responsavel: 'Qualidade', status: 'BAIXADA', numero_serie: null, localizacao_id: null,
    exige_calibracao: 1, calibracao_vigente: false, emprestimo_aberto: null };
  const comLista = (lista) => {
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url, ...resto) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: lista }) : original(url, ...resto)));
  };
  const putsConcluir = () => api.put.mock.calls.filter(([url]) => url === '/almoxarifado/manutencoes/900/concluir');
  const getsDe = (url) => api.get.mock.calls.filter(([u]) => u === url).length;

  async function abrirConcluir() {
    comLista([EM_MANUTENCAO]);
    await renderizar();
    await clicar(botao('Concluir manutenção', linhasFerramentas()[0]));
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Concluir manutenção');
  }

  test('RN-177.10: sem condição a tela recusa com a frase e não manda PUT; o destino nasce "Volta ao uso"', async () => {
    await abrirConcluir();
    expect(campo('Destino').value).toBe('USO');
    expect([...campo('Condição do item').options].map((o) => o.textContent))
      .toEqual(['Escolha…', 'Em condições de uso', 'Em uso com restrição', 'Inservível']);
    await clicar(botao('Concluir', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Escolha a condição do item');
    expect(putsConcluir()).toHaveLength(0);
    expect(container.querySelector('.almox-modal')).toBeTruthy();
  });

  test('RN-177.02/10: condição OK + volta ao uso manda os dois, avisa e recarrega a lista e o painel', async () => {
    await abrirConcluir();
    preencher(campo('Condição do item'), 'OK');
    const lista = getsDe('/almoxarifado/ferramentas');
    const painel = getsDe('/almoxarifado/calibracoes/painel');
    await clicar(botao('Concluir', rodape()));
    expect(putsConcluir()).toHaveLength(1);
    expect(putsConcluir()[0][1]).toEqual({ condicao: 'OK', destino: 'USO' });
    expect(toast.success).toHaveBeenCalledWith('Manutenção concluída');
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    expect(getsDe('/almoxarifado/ferramentas')).toBeGreaterThan(lista);
    // o painel so busca quando a aba abre; o recarregar tem de valer na proxima abertura
    await clicar(botao('Calibrações'));
    expect(getsDe('/almoxarifado/calibracoes/painel')).toBeGreaterThan(painel);
  });

  test('RN-177.03/05/10: inservível puxa o destino para a baixa; o rótulo pede o motivo e o PUT vai com ele', async () => {
    await abrirConcluir();
    preencher(campo('Condição do item'), 'INSERVIVEL');
    expect(campo('Destino').value).toBe('BAIXA');
    expect(campo('Motivo da baixa')).toBeTruthy();
    preencher(campo('Motivo da baixa'), '  Motor queimado  ');
    await clicar(botao('Concluir', rodape()));
    expect(putsConcluir()[0][1]).toEqual({ condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' });
    expect(toast.success).toHaveBeenCalledWith('Manutenção concluída — ferramenta baixada');
  });

  test('RN-177.04/10: com restrição o rótulo pede a restrição; a recusa do servidor aparece com a frase dele e a janela fica', async () => {
    api.put.mockRejectedValue({ response: { status: 400, data: { error: 'Descreva a restrição nas observações' } } });
    await abrirConcluir();
    preencher(campo('Condição do item'), 'COM_RESTRICAO');
    expect(campo('Qual é a restrição')).toBeTruthy();
    expect(campo('Destino').value).toBe('USO');
    await clicar(botao('Concluir', rodape()));
    expect(putsConcluir()[0][1]).toEqual({ condicao: 'COM_RESTRICAO', destino: 'USO' });
    expect(toast.error).toHaveBeenCalledWith('Descreva a restrição nas observações');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
    expect(campo('Condição do item').value).toBe('COM_RESTRICAO');
  });

  test('RN-177.10: a baixada mostra "Baixada" e "Reverter baixa", sem Ocorrência nem Calibração (metade positiva: a em manutenção tem Ocorrência)', async () => {
    comLista([BAIXADA, EM_MANUTENCAO]);
    await renderizar();
    const [baixada, emManut] = linhasFerramentas();
    expect(baixada.textContent).toContain('Baixada');
    expect(botao('Reverter baixa', baixada)).toBeTruthy();
    expect(botao('Ocorrência', baixada)).toBeFalsy();
    expect(botao('Calibração', baixada)).toBeFalsy();
    expect(botao('Editar', baixada)).toBeTruthy();
    expect(botao('Ocorrência', emManut)).toBeTruthy();
    expect(botao('Reverter baixa', emManut)).toBeFalsy();
    // o filtro de status oferece "Baixada"
    const filtro = container.querySelector('.almox-filters select');
    expect([...filtro.options].map((o) => o.value)).toContain('BAIXADA');
  });

  test('Fase 5: a baixada com calibração vigente mostra "—" na coluna Calibração, não "Vigente" (metade positiva: a disponível vigente mostra "Vigente")', async () => {
    const DISPONIVEL_VIGENTE = { ...EM_MANUTENCAO, id: 9, codigo_patrimonio: 'FER-009', status: 'DISPONIVEL',
      exige_calibracao: 1, calibracao_vigente: true };
    comLista([{ ...BAIXADA, calibracao_vigente: true }, DISPONIVEL_VIGENTE]);
    await renderizar();
    const [baixada, viva] = linhasFerramentas();
    const celulaCalibracao = (linha) => linha.querySelectorAll('td')[5].textContent.trim();
    expect(celulaCalibracao(baixada)).toBe('—');
    expect(celulaCalibracao(viva)).toBe('Vigente');
  });

  test('RN-177.08/10: "Reverter baixa" pede justificativa, posta na rota, avisa e recarrega a lista e o painel', async () => {
    comLista([BAIXADA]);
    await renderizar();
    await clicar(botao('Reverter baixa', linhasFerramentas()[0]));
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Reverter a baixa da ferramenta');
    const just = container.querySelector('.almox-modal textarea');
    preencher(just, 'baixa errada');
    const painel = getsDe('/almoxarifado/calibracoes/painel');
    await clicar(botao('Confirmar', rodape()) || [...rodape().querySelectorAll('button')].pop());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/ferramentas/8/reverter-baixa', { justificativa: 'baixa errada' });
    expect(toast.success).toHaveBeenCalledWith('Baixa revertida — a ferramenta voltou a ficar disponível');
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    await clicar(botao('Calibrações'));
    expect(getsDe('/almoxarifado/calibracoes/painel')).toBeGreaterThan(painel);
  });
});
