/**
 * Livro de movimentações — quais linhas oferecem o botão de estorno.
 *
 * Achado do review final da Etapa 5: `podeEstornar` só excluía ESTORNO/RESERVA/LIBERACAO_RESERVA,
 * então o botão aparecia HABILITADO nas linhas de quarentena/inspeção. Não é cosmético: antes da
 * correção do servidor, clicar nele gravava uma linha ESTORNO e marcava a original cancelada SEM
 * reverter `quantidade_em_inspecao` — o livro afirmava uma reversão que nunca aconteceu. Com o
 * servidor recusando, o botão só entregaria um 400. Nos dois casos a tela não pode oferecê-lo.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado --watchAll=false
 */
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
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

// Permissões liberadas: o alvo aqui é a regra da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

const movimento = (id, tipo) => ({
  id, tipo, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', unidade: 'PC',
  quantidade: 10, saldo_anterior: 100, saldo_posterior: tipo === 'SAIDA' ? 90 : 100,
  usuario_nome: 'Maria', created_at: '2026-08-08T10:00:00Z', cancelado: 0,
});

// Uma linha de cada tipo cujo estorno o servidor recusa, mais uma SAIDA de controle: sem ela o
// teste passaria com um `podeEstornar` que devolvesse false para tudo.
const MOVIMENTOS = [
  movimento(1, 'SAIDA'),
  movimento(2, 'QUARENTENA'),
  movimento(3, 'LIBERACAO_INSPECAO'),
  movimento(4, 'REPROVACAO_INSPECAO'),
  movimento(5, 'DECISAO_INSPECAO'),
  movimento(6, 'RESERVA'),
  movimento(7, 'LIBERACAO_RESERVA'),
  { ...movimento(8, 'ESTORNO'), quantidade: 10 },
];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
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

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];

/** Índice da linha (na ordem de MOVIMENTOS) tem botão de estorno? */
const temBotaoEstorno = (i) => !!linhas()[i]
  .querySelector('.almox-btn-icon.danger');

describe('MovimentacoesAlmoxarifado — botão de estorno por tipo', () => {
  test('oferece estorno numa SAIDA comum', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(MOVIMENTOS.length);
    expect(temBotaoEstorno(0)).toBe(true);
  });

  test('não oferece estorno nos tipos de quarentena/inspeção (reversão é pela tela de Inspeções)', async () => {
    await renderizar();
    // índices 1..4 = QUARENTENA, LIBERACAO_INSPECAO, REPROVACAO_INSPECAO, DECISAO_INSPECAO
    [1, 2, 3, 4].forEach((i) => {
      expect(`${MOVIMENTOS[i].tipo}: ${temBotaoEstorno(i)}`).toBe(`${MOVIMENTOS[i].tipo}: false`);
    });
  });

  test('continua sem oferecer estorno em reserva e em estorno', async () => {
    await renderizar();
    [5, 6, 7].forEach((i) => {
      expect(`${MOVIMENTOS[i].tipo}: ${temBotaoEstorno(i)}`).toBe(`${MOVIMENTOS[i].tipo}: false`);
    });
  });
});

/**
 * Task 9 (Etapa 6): SUCATA e PERDA foram isentas da guarda de vencimento na Task 3 para que
 * material vencido pudesse ser descartado, mas até aqui nenhuma das duas era selecionável no
 * formulário — a regra "vencido não fica preso" era verdadeira da API e falsa da tela.
 *
 * Etapa 9, Task 5: SUCATA SAIU de novo do seletor — mesmo precedente de DEVOLUCAO na Etapa 7. A
 * rota genérica (POST /movimentacoes/v2, gate `movimentar`, o mais amplo do módulo) virou tipo
 * dedicado (server/services/almoxarifado/schema.js, TIPOS_DEDICADOS) porque a spec 15 exige um
 * teste impossível de cumprir com SUCATA aceito ali: "sucatear sem dupla aprovação falha". Este
 * formulário posta na v2, então oferecer SUCATA aqui seria oferecer um botão que a rota recusa
 * com 400 — e SUCATA continua aparecendo no livro (TIPOS mantém o tipo), porque as movimentações
 * antigas e as emitidas pelos caminhos legítimos (devolução destino sucata; e, a partir da
 * Task 6/7, a rota de sucateamento) continuam de verdade. PERDA fica: não tem processo de
 * aprovação na spec 15.
 */
async function abrirModalNovaMovimentacao() {
  await renderizar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

/** Um "tick" de macrotarefa: garante que a busca de lotes (efeito assíncrono) já rodou. */
async function esperarEfeitos() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function seletorTipo() {
  return [...container.querySelectorAll('.almox-modal select.almox-form-select')][1];
}

describe('MovimentacoesAlmoxarifado — SUCATA fora do seletor, PERDA dentro (Etapa 9, Task 5)', () => {
  test('SUCATA NÃO aparece como opção no seletor de tipo, mas PERDA continua', async () => {
    await abrirModalNovaMovimentacao();
    const valores = [...seletorTipo().querySelectorAll('option')].map((o) => o.value);
    expect(valores).not.toContain('SUCATA');
    expect(valores).toContain('PERDA');
  });

  test('AJUSTE_NEGATIVO não é oferecido (é tipo interno; AJUSTE puro cobre a correção de contagem)', async () => {
    await abrirModalNovaMovimentacao();
    const valores = [...seletorTipo().querySelectorAll('option')].map((o) => o.value);
    expect(valores).not.toContain('AJUSTE_NEGATIVO');
  });

  test('Perda mostra os campos que uma saída precisa: localização de origem e lote por seleção (não texto livre)', async () => {
    // Era o mesmo teste para SUCATA antes da Task 5 — SUCATA saiu do seletor, mas PERDA tem
    // exatamente os mesmos requisitos de campo (TIPOS_COM_ORIGEM/TIPOS_COM_LOTE_EXISTENTE), então
    // a cobertura do comportamento "saída com lote por seleção" continua por aqui.
    await abrirModalNovaMovimentacao();
    const selectMaterial = container.querySelector('.almox-modal select.almox-form-select');
    preencher(selectMaterial, '10');
    preencher(seletorTipo(), 'PERDA');
    await esperarEfeitos();

    const rotulos = [...container.querySelectorAll('.almox-modal .almox-field label')].map((l) => l.textContent);
    expect(rotulos).toEqual(expect.arrayContaining(['Localização de origem']));

    const campoLote = container.querySelector('#mov-lote');
    expect(campoLote.tagName).toBe('SELECT'); // não input de texto — motor não inventa lote numa saída
  });

  test('Perda também exige motivo (é o campo que carrega a justificativa da baixa)', async () => {
    await abrirModalNovaMovimentacao();
    preencher(seletorTipo(), 'PERDA');
    const rotuloMotivo = [...container.querySelectorAll('.almox-modal .almox-field label')]
      .find((l) => l.textContent.startsWith('Motivo'));
    expect(rotuloMotivo.textContent).toContain('*');
  });

  test('o filtro do livro continua oferecendo Sucata (TIPOS mantém o tipo, só o formulário fecha a porta)', async () => {
    await renderizar();
    const filtro = container.querySelector('.almox-filters select.almox-select');
    const valores = [...filtro.querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('SUCATA');
  });
});

/**
 * Etapa 7, Task 6: TRANSFERENCIA entra no formulario (a rota existia desde sempre e nunca teve
 * tela) e DEVOLUCAO sai dele — registrar "Devolucao" aqui criava uma movimentacao solta, sem
 * motivo, sem condicao e sem destino, e NAO criava registro nenhum na tabela de devolucoes.
 * DEVOLUCAO continua em TIPOS (a lista completa), senao o livro para de exibir os lancamentos
 * antigos e o filtro perde a opcao.
 */
const LOTES_TRANSFERENCIA = [
  { id: 41, codigo: 'L-OK', status: 'ATIVO', saldo: 10, elegivel: true, vencido: false, vencimento_liberado: false },
  { id: 42, codigo: 'L-BLOQ', status: 'BLOQUEADO', saldo: 5, elegivel: false, vencido: false, vencimento_liberado: false },
  { id: 43, codigo: 'L-VENC', status: 'ATIVO', saldo: 3, elegivel: false, vencido: true, vencimento_liberado: false },
];

describe('MovimentacoesAlmoxarifado — TRANSFERENCIA no formulário e DEVOLUCAO fora dele', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', controle_lote: 1 }] });
      }
      if (url.startsWith('/almoxarifado/materiais/10/lotes')) return Promise.resolve({ data: LOTES_TRANSFERENCIA });
      if (url === '/almoxarifado/localizacoes') {
        return Promise.resolve({ data: [{ id: 1, codigo: 'A-01', descricao: 'Prateleira A' }, { id: 2, codigo: 'B-01', descricao: 'Prateleira B' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('Transferência é opção do formulário e Devolução não é', async () => {
    await abrirModalNovaMovimentacao();
    const valores = [...seletorTipo().querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('TRANSFERENCIA');
    expect(valores).not.toContain('DEVOLUCAO');
  });

  test('o filtro do livro continua oferecendo Devolução (TIPOS mantém o tipo)', async () => {
    await renderizar();
    const filtro = container.querySelector('.almox-filters select.almox-select');
    const valores = [...filtro.querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('DEVOLUCAO');
  });

  test('Transferência mostra origem E destino e o seletor de lote', async () => {
    await abrirModalNovaMovimentacao();
    const selectMaterial = container.querySelector('.almox-modal select.almox-form-select');
    preencher(selectMaterial, '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const rotulos = [...container.querySelectorAll('.almox-modal .almox-field label')].map((l) => l.textContent);
    expect(rotulos).toEqual(expect.arrayContaining(['Localização de origem', 'Localização de destino']));
    expect(container.querySelector('#mov-lote').tagName).toBe('SELECT');
  });

  test('Transferência NÃO mostra seletor de série (decisão 9: fora do escopo)', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Motor 5cv', unidade: 'PC', controle_serie: 1 }] });
      }
      return Promise.resolve({ data: [] });
    });
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const rotulos = [...container.querySelectorAll('.almox-modal label')].map((l) => l.textContent);
    expect(rotulos.some((t) => t.startsWith('Séries a '))).toBe(false);
  });

  // Decisão 8: transferência não checa status nem vencimento — TODOS os lotes servem.
  test('na Transferência todos os lotes ficam selecionáveis, inclusive bloqueado e vencido', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const opcoes = [...container.querySelector('#mov-lote').querySelectorAll('option')].filter((o) => o.value);
    expect(opcoes).toHaveLength(3);
    expect(opcoes.map((o) => o.disabled)).toEqual([false, false, false]);
  });

  // Controle positivo do disabled: numa SAIDA os mesmos três lotes NÃO ficam todos habilitados.
  test('[controle positivo] na Saída o lote bloqueado e o vencido continuam desabilitados', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'SAIDA');
    await esperarEfeitos();

    const opcoes = [...container.querySelector('#mov-lote').querySelectorAll('option')].filter((o) => o.value);
    expect(opcoes.map((o) => o.disabled)).toEqual([false, true, true]);
  });

  test('Transferência posta origem, destino e lote no payload', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'TRANSFERENCIA');
    await esperarEfeitos();

    const inputs = [...container.querySelectorAll('.almox-modal input.almox-input')];
    preencher(inputs.find((i) => i.type === 'number'), '5');
    const selects = [...container.querySelectorAll('.almox-modal select.almox-form-select')];
    const origem = selects.find((s) => s.previousElementSibling?.textContent === 'Localização de origem')
      || selects[selects.length - 2];
    const destino = selects.find((s) => s.previousElementSibling?.textContent === 'Localização de destino')
      || selects[selects.length - 1];
    preencher(origem, '1');
    preencher(destino, '2');

    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/movimentacoes/v2', expect.objectContaining({
      tipo: 'TRANSFERENCIA', material_id: 10, quantidade: 5,
      localizacao_origem_id: 1, localizacao_destino_id: 2, lote_id: 41,
    }));
  });

  test('um hint aponta a tela nova de Devoluções', async () => {
    await abrirModalNovaMovimentacao();
    expect(container.querySelector('.almox-modal').textContent).toMatch(/Devolu/);
    expect(container.querySelector('.almox-modal').textContent).toMatch(/\/almoxarifado\/devolucoes|tela de Devolu/i);
  });
});

/**
 * Etapa 8, Task 9: selo de propriedade no livro de movimentacoes e no seletor de material.
 *
 * O livro mistura material nosso e de cliente porque o motor e o mesmo (foi esse o ponto da
 * unificacao da Etapa 8). Sem selo, "SAIDA 10 PC de Chapa 3mm" nao diz de quem era a chapa — e a
 * saida de material de cliente e justamente a que tem regra propria (so com OS/projeto do dono).
 *
 * A resposta de GET /almoxarifado/movimentacoes NAO traz o dono (o SELECT lista colunas de `ma`
 * uma a uma), entao a tela resolve a propriedade pelo catalogo que ela ja carregou em
 * `materiais` — e prefere o dado da propria linha se um dia ele passar a vir do servidor.
 */
const MOV_MISTAS = [
  { ...movimento(101, 'SAIDA'), material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm nossa' },
  { ...movimento(102, 'SAIDA'), material_id: 11, material_codigo: 'MAT-2', material_nome: 'Chapa 3mm do cliente' },
];
const CATALOGO_MISTO = [
  { id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm nossa', unidade: 'PC', quantidade_atual: 50, proprietario_cliente_id: null, proprietario_cliente_nome: null },
  { id: 11, codigo: 'MAT-2', nome: 'Chapa 3mm do cliente', unidade: 'PC', quantidade_atual: 50, proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Alfa LTDA' },
];

describe('MovimentacoesAlmoxarifado — selo de propriedade', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOV_MISTAS });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: CATALOGO_MISTO });
      return Promise.resolve({ data: [] });
    });
  });

  test('a linha do material de cliente mostra o selo com a razão social', async () => {
    await renderizar();
    const linha = linhas().find((tr) => tr.textContent.includes('MAT-2'));
    const selo = linha.querySelector('.almox-badge-cliente');
    expect(selo).not.toBeNull();
    expect(selo.textContent).toContain('Cliente Alfa LTDA');
  });

  test('[controle positivo] a linha do material nosso não mostra selo', async () => {
    // Sem esta metade, um selo pintado em toda linha passaria como se identificasse propriedade.
    await renderizar();
    const linha = linhas().find((tr) => tr.textContent.includes('MAT-1'));
    expect(linha.querySelector('.almox-badge-cliente')).toBeNull();
  });

  test('o seletor de material do formulário diz o dono no próprio rótulo (option não aceita markup)', async () => {
    await abrirModalNovaMovimentacao();
    const opcoes = [...container.querySelector('.almox-modal select.almox-form-select').querySelectorAll('option')];
    const doCliente = opcoes.find((o) => o.value === '11');
    const nossa = opcoes.find((o) => o.value === '10');
    expect(doCliente.textContent).toContain('Cliente Alfa LTDA');
    expect(nossa.textContent).not.toMatch(/cliente/i);
  });
});

/**
 * Etapa 9, Task 8: ENTRADA_RETALHO no livro (badge/cor).
 *
 * ENTRADA_RETALHO nasce SÓ pelo evento composto de POST /sobras/gerar-retalho (Task 3/4) — nunca
 * por este formulário, TIPOS_FORM não a oferece — mas precisa aparecer no livro (TIPOS mantém o
 * tipo, mesmo precedente de DEVOLUCAO/SUCATA) e com COR. cls 'entrada' reaproveitado, não uma
 * classe nova: ExtratoMaterialModal.js já pinta qualquer tipo que começa com 'ENTRADA' de verde
 * por prefixo, e uma classe nova esquecida no CSS sairia sem fundo nem cor sem nenhum teste de
 * comportamento pegar — a lição do d117dc2 (TRANSFERENCIA sem `.almox-badge-transferencia`).
 */
const MOV_RETALHO = [
  { ...movimento(201, 'ENTRADA_RETALHO'), material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm' },
];

describe('MovimentacoesAlmoxarifado — ENTRADA_RETALHO no livro (Etapa 9, Task 8)', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOV_RETALHO });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('ENTRADA_RETALHO aparece no livro com um badge que TEM classe (nao sai sem cor)', async () => {
    await renderizar();
    const badge = linhas()[0].querySelector('.almox-badge-entrada');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toMatch(/retalho/i);
  });

  test('a classe .almox-badge-entrada EXISTE no Almoxarifado.css, com cor (controle do d117dc2)', () => {
    const css = fs.readFileSync(path.join(__dirname, 'Almoxarifado.css'), 'utf8');
    const regra = css.match(/\.almox-badge-entrada\s*\{[^}]*\}/);
    if (!regra) throw new Error('falta a regra .almox-badge-entrada em Almoxarifado.css');
    expect(regra[0]).toMatch(/color\s*:/);
    expect(regra[0]).toMatch(/background\s*:/);
  });

  test('o filtro do livro oferece ENTRADA_RETALHO (TIPOS mantém o tipo)', async () => {
    await renderizar();
    const filtro = container.querySelector('.almox-filters select.almox-select');
    const valores = [...filtro.querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('ENTRADA_RETALHO');
  });
});

/**
 * Etapa 10 (achado da revisão final de branch): AJUSTE_INVENTARIO no livro. Mesmo motivo de
 * ENTRADA_RETALHO acima — nasce SÓ da conclusão de uma conferência de inventário (nunca deste
 * formulário), precisa aparecer no livro com rótulo próprio (sem isso cai no rótulo cru
 * "AJUSTE_INVENTARIO" e some do dropdown de filtro), e RN-10 recusa o estorno dele no servidor —
 * o botão de estorno não pode aparecer, senão entrega um 400 garantido.
 */
const MOV_AJUSTE_INVENTARIO = [
  { ...movimento(300, 'AJUSTE_INVENTARIO'), material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm' },
];

describe('MovimentacoesAlmoxarifado — AJUSTE_INVENTARIO no livro (Etapa 10)', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOV_AJUSTE_INVENTARIO });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('AJUSTE_INVENTARIO aparece no livro com rótulo próprio, não o valor cru do tipo', async () => {
    await renderizar();
    expect(linhas()[0].textContent).toMatch(/Ajuste \(invent[aá]rio\)/i);
    expect(linhas()[0].textContent).not.toContain('AJUSTE_INVENTARIO');
  });

  test('o filtro do livro oferece AJUSTE_INVENTARIO (TIPOS mantém o tipo)', async () => {
    await renderizar();
    const filtro = container.querySelector('.almox-filters select.almox-select');
    const valores = [...filtro.querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('AJUSTE_INVENTARIO');
  });

  test('não oferece estorno (RN-10 recusa no servidor — o botão sempre voltaria 400)', async () => {
    await renderizar();
    expect(temBotaoEstorno(0)).toBe(false);
  });
});

/**
 * Etapa 9, Task 8: hint de retalho disponível na SAÍDA.
 *
 * NÃO BLOQUEIA: é sugestão ("considere usá-los"), não regra — o operador pode ter motivo legítimo
 * para consumir do estoque principal mesmo com retalho parado. Só aparece em SAIDA: é a saída de
 * consumo que compete por uso com o retalho, as outras (ENTRADA, AJUSTE, TRANSFERENCIA, PERDA)
 * não.
 */
describe('MovimentacoesAlmoxarifado — hint de retalho disponível na SAÍDA (Etapa 9, Task 8)', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
      }
      if (url === '/almoxarifado/materiais/10/retalhos-disponiveis') {
        return Promise.resolve({ data: [{ id: 1 }, { id: 2 }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('SAIDA com retalho disponível mostra o aviso com a contagem e um link para /almoxarifado/sobras', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'SAIDA');
    await esperarEfeitos();
    expect(container.querySelector('.almox-modal').textContent).toMatch(/2 retalho/i);
    expect(container.querySelector('.almox-modal a[href="/almoxarifado/sobras"]')).toBeTruthy();
  });

  test('[controle positivo] ENTRADA (tipo padrão do formulário) NÃO mostra o aviso mesmo com retalho disponível', async () => {
    // Sem este controle, um aviso que aparecesse em qualquer tipo passaria no teste acima e
    // confundiria o operador numa entrada, onde "retalho disponível" não faz sentido nenhum.
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    await esperarEfeitos();
    expect(container.querySelector('.almox-modal').textContent).not.toMatch(/retalho\(s\)/i);
  });

  test('o aviso NÃO bloqueia a submissão da saída', async () => {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    preencher(seletorTipo(), 'SAIDA');
    await esperarEfeitos();
    const inputs = [...container.querySelectorAll('.almox-modal input.almox-input')];
    preencher(inputs.find((i) => i.type === 'number'), '5');

    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/movimentacoes/v2', expect.objectContaining({
      tipo: 'SAIDA', material_id: 10, quantidade: 5,
    }));
  });
});

/**
 * Etapa 45, fechamento — DEVOLUCAO_FORNECEDOR no livro.
 *
 * ACHADO DA FASE 6, e ele escapou de três revisores: a etapa criou o tipo de movimento novo e
 * NÃO o pôs em `TIPOS`, que é a lista que o livro usa para rótulo (`tipoInfo`) e para o dropdown
 * de filtro. O efeito é o fallback `{ label: tipo }` — a coluna Tipo mostra o código cru
 * `DEVOLUCAO_FORNECEDOR` e o filtro não tem a opção, então a devolução ao fornecedor não é
 * localizável no livro.
 *
 * O ARQUIVO JÁ AVISAVA: o comentário de `AJUSTE_INVENTARIO` (linha ~55) foi escrito na Etapa 10
 * por este mesmo motivo, com a frase "senão cai no fallback genérico (rótulo cru
 * 'AJUSTE_INVENTARIO', sem opção no dropdown de filtro)". Mesma classe do épsilon do fix-round:
 * o aviso estava escrito no arquivo e eu passei por cima.
 *
 * `cls: 'saida'` (vermelho) e não `'devolucao'` (violeta): DEVOLUCAO é a devolução AO estoque, que
 * devolve material; esta TIRA material do galpão. A cor tem de dizer isso.
 *
 * ⚠️ O BURACO MAIOR FICA DECLARADO, não consertado aqui (letra G das novidades): medido em
 * 2026-09-29, `TIPOS` cobre 10 tipos e o serviço grava pelo menos 14 outros que caem no rótulo
 * cru — BLOQUEIO, DESBLOQUEIO, QUARENTENA, RESERVA, LIBERACAO_RESERVA, REMESSA_TERCEIRO,
 * RETORNO_TERCEIRO, CONSUMO_TERCEIRO, PERDA_TERCEIRO, RETORNO_TRANSFORMACAO, DEVOLUCAO_CLIENTE,
 * ENTRADA_COMPRA, ENTRADA_DEVOLUCAO e os de inspeção. Consertar todos é etapa própria (rótulo +
 * opção de filtro + cor por tipo); esta etapa paga só o tipo que ela mesma criou.
 */
const MOV_DEVOLUCAO_FORNECEDOR = [
  movimento(1, 'SAIDA'),
  { ...movimento(20, 'DEVOLUCAO_FORNECEDOR'), motivo: 'Devolução ao fornecedor', documento_vinculado: 'NC-2026-0007' },
];

describe('MovimentacoesAlmoxarifado — DEVOLUCAO_FORNECEDOR no livro (Etapa 45)', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOV_DEVOLUCAO_FORNECEDOR });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('a linha mostra o rótulo "Devolução ao fornecedor", e NÃO o código cru', async () => {
    await renderizar();
    const badges = linhas().map((tr) => tr.querySelector('.almox-badge')?.textContent);
    // A metade positiva: a linha de controle tem o rótulo dela, senão este teste passaria com uma
    // tela que não desenha badge nenhuma.
    expect(badges).toContain('Saída');
    expect(badges).toContain('Devolução ao fornecedor');
    expect(badges).not.toContain('DEVOLUCAO_FORNECEDOR');
  });

  test('a badge da devolução ao fornecedor usa a cor de SAÍDA (o material sai do galpão)', async () => {
    await renderizar();
    const badge = linhas()
      .map((tr) => tr.querySelector('.almox-badge'))
      .find((b) => b?.textContent === 'Devolução ao fornecedor');
    expect(badge.className).toContain('almox-badge-saida');
  });

  test('o filtro do livro oferece a opção (senão a devolução não é localizável)', async () => {
    await renderizar();
    const filtro = container.querySelector('.almox-filters select.almox-select');
    const valores = [...filtro.querySelectorAll('option')].map((o) => o.value);
    expect(valores).toContain('DEVOLUCAO_FORNECEDOR');
    // Metade positiva de novo: a lista de filtro existe e tem os tipos vizinhos.
    expect(valores).toContain('SAIDA');
  });

  test('o FORMULÁRIO continua sem oferecer o tipo — ele é dedicado à execução da não conformidade', async () => {
    await abrirModalNovaMovimentacao();
    const valores = [...seletorTipo().querySelectorAll('option')].map((o) => o.value);
    expect(valores).not.toContain('DEVOLUCAO_FORNECEDOR');
    // Metade positiva: o seletor do formulário está de pé e oferece o que deve.
    expect(valores).toContain('SAIDA');
    expect(valores).toContain('TRANSFERENCIA');
  });
});

/**
 * Etapa 45, fechamento (segundo achado da Fase 6): o botão de estorno aparecia na linha da
 * devolução ao fornecedor, e o servidor recusa SEMPRE
 * (`stockService.js:1594`, casando por TIPO: *"Devolução ao fornecedor não pode ser estornada pelo
 * livro — o material voltaria bloqueado com o documento dizendo que foi devolvido"*).
 *
 * O cabeçalho DESTE arquivo já fixou o princípio, na Etapa 5: *"Com o servidor recusando, o botão
 * só entregaria um 400. Nos dois casos a tela não pode oferecê-lo."* A recusa aqui é por tipo e
 * incondicional, então `TIPOS_SEM_ESTORNO` é exatamente o lugar dela.
 *
 * ⚠️ NÃO vale para o `DESBLOQUEIO` da Etapa 44: lá a recusa casa por MOTIVO (o desbloqueio avulso
 * continua estornável), e `TIPOS_SEM_ESTORNO` é por tipo. Aquele caso continua recusado pelo
 * servidor com o botão visível, e fica declarado em G73.
 */
describe('MovimentacoesAlmoxarifado — estorno da devolução ao fornecedor (Etapa 45)', () => {
  beforeEach(() => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOV_DEVOLUCAO_FORNECEDOR });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  test('não oferece estorno na devolução ao fornecedor, e CONTINUA oferecendo na saída comum', async () => {
    await renderizar();
    // MOV_DEVOLUCAO_FORNECEDOR = [SAIDA, DEVOLUCAO_FORNECEDOR]. A linha de controle é obrigatória:
    // sem ela o teste passaria com um `podeEstornar` que devolvesse false para tudo.
    expect(temBotaoEstorno(0)).toBe(true);
    expect(temBotaoEstorno(1)).toBe(false);
  });
});

// ─── Etapa 53: sugestão de localização na ENTRADA ──────────────────────────────────────────
describe('Etapa 53: sugestao de localizacao na entrada', () => {
  let sugestaoDoBanco;
  beforeEach(() => {
    sugestaoDoBanco = {
      padrao: { localizacao_id: 1, codigo: 'A-01', recusa: null },
      sugestoes: [
        { localizacao_id: 1, codigo: 'A-01', endereco_completo: 'A-01', motivo: 'PADRAO', quantidade_no_endereco: 3 },
        { localizacao_id: 2, codigo: 'B-01', endereco_completo: 'B-01', motivo: 'JA_TEM_O_MATERIAL', quantidade_no_endereco: 20 },
        { localizacao_id: 3, codigo: 'C-01', endereco_completo: 'C-01', motivo: 'VAZIA_COMPATIVEL', quantidade_no_endereco: 0 },
        { localizacao_id: 4, codigo: 'D-01', endereco_completo: 'D-01', motivo: 'VAZIA_COMPATIVEL', quantidade_no_endereco: 0 },
      ],
    };
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
      if (url === '/almoxarifado/materiais') {
        return Promise.resolve({ data: [
          { id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' },
          { id: 11, codigo: 'MAT-2', nome: 'Perfil', unidade: 'PC' },
        ] });
      }
      if (url.endsWith('/sugestao-localizacao')) return Promise.resolve({ data: sugestaoDoBanco });
      if (url === '/almoxarifado/localizacoes') {
        return Promise.resolve({ data: [1, 2, 3, 4].map((id) => ({ id, codigo: `${'ABCD'[id - 1]}-01` })) });
      }
      return Promise.resolve({ data: [] });
    });
  });
  const blocoSugestoes = () => container.querySelector('[data-testid="sugestoes-localizacao"]');
  const selectDestino = () => [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((f) => f.textContent.includes('Localização de destino')).querySelector('select');
  const urlsSugestao = () => api.get.mock.calls.filter(([u]) => String(u).endsWith('/sugestao-localizacao'));
  async function entradaCom(materialId) {
    await abrirModalNovaMovimentacao();
    preencher(container.querySelector('.almox-modal select.almox-form-select'), String(materialId));
    preencher(seletorTipo(), 'ENTRADA');
    await esperarEfeitos();
  }

  test('ate 3 sugestoes com o motivo, e o clique preenche o destino (nada preenche sozinho)', async () => {
    await entradaCom(10);
    const botoes = [...blocoSugestoes().querySelectorAll('button')];
    expect(botoes.map((b) => b.textContent)).toEqual([
      'A-01 · padrão do material', 'B-01 · já tem este material (20)', 'C-01 · vazia',
    ]);
    expect(selectDestino().value).toBe('');
    await act(async () => { botoes[1].dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(selectDestino().value).toBe('2');
  });

  test('padrao RECUSADA: aviso com o motivo enquanto o destino esta vazio', async () => {
    sugestaoDoBanco = { padrao: { localizacao_id: 1, codigo: 'A-01', recusa: 'Localização A-01 está bloqueada' }, sugestoes: [] };
    await entradaCom(10);
    const aviso = container.querySelector('[data-testid="aviso-padrao-recusada"]');
    expect(aviso.textContent).toBe('A localização padrão A-01 não recebe este material (Localização A-01 está bloqueada) — escolha um destino.');
  });

  test('trocar de material LIMPA o destino que veio de sugestao; o escolhido a mao fica', async () => {
    await entradaCom(10);
    await act(async () => { blocoSugestoes().querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(selectDestino().value).toBe('1');
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '11');
    await esperarEfeitos();
    expect(selectDestino().value).toBe('');
    // à mão
    preencher(selectDestino(), '4');
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    await esperarEfeitos();
    expect(selectDestino().value).toBe('4');
    // Clicou uma sugestão e DEPOIS trocou à mão: a troca manual vence — o destino fica.
    await act(async () => { blocoSugestoes().querySelector('button').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    preencher(selectDestino(), '3');
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '11');
    await esperarEfeitos();
    expect(selectDestino().value).toBe('3');
  });

  test('numa SAIDA nao ha GET de sugestao; sem material tambem nao', async () => {
    await abrirModalNovaMovimentacao();
    preencher(seletorTipo(), 'ENTRADA');
    await esperarEfeitos();
    expect(urlsSugestao()).toEqual([]);
    // SAIDA primeiro, material depois: escolher o material com ENTRADA dispararia um GET legítimo.
    preencher(seletorTipo(), 'SAIDA');
    preencher(container.querySelector('.almox-modal select.almox-form-select'), '10');
    await esperarEfeitos();
    expect(urlsSugestao()).toEqual([]);
    expect(blocoSugestoes()).toBeNull();
  });

  test('falha da sugestao nao quebra o formulario', async () => {
    api.get.mockImplementation((url) => {
      if (url.endsWith('/sugestao-localizacao')) return Promise.reject(new Error('x'));
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa', unidade: 'PC' }] });
      return Promise.resolve({ data: [] });
    });
    await entradaCom(10);
    expect(blocoSugestoes()).toBeNull();
    expect(container.querySelector('.almox-modal')).not.toBeNull();
  });
});
