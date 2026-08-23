/**
 * Etapa 10, Task 3 — tela "Conferência de Estoque" contra o contrato congelado da conferência
 * (design 2026-08-22-almoxarifado-etapa10-inventario-avancado, tabela "Contratos de API
 * (congelados)"). O alvo aqui é o que SÓ a tela pode errar: os dois campos novos na criação
 * (modo_cego, tolerancia_percentual), a coluna cliente-side não quebrar quando o GET vem sem
 * quantidade_sistema/divergencia (contagem cega), o badge "Recontagem necessária" vindo DIRETO
 * do campo recontagem_necessaria do servidor (nunca recalculado aqui), a justificativa do ajuste
 * exigida só quando "aplicar ajustes" está marcado, e as mensagens de recusa do concluir (400
 * tolerância, 400 retenção, 403 material de cliente) chegando completas e tratadas por caminhos
 * distintos. O motor (fórmula de tolerância, guarda de retenção, tudo-ou-nada) tem teste de rota
 * no servidor (conferenciaMotorAjuste/ConferenciaTolerancia/ConferenciaContagemCega
 * .api.test.js) — não duplicado aqui.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=ConferenciaEstoque
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConferenciaEstoque from './ConferenciaEstoque';
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
// SobrasAlmoxarifado.test.js / FerramentasAlmoxarifado.test.js) — o gate REAL continua sendo do
// servidor.
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

const CONFERENCIAS = [
  { id: 1, numero: 'CONF-0001', status: 'ABERTO', responsavel_nome: 'Ana Souza', data_inicio: '2026-08-20T10:00:00Z', data_fim: null },
];

// Conferência normal (não cega, ou usuário com ajustar_estoque): quantidade_sistema e
// divergencia sempre presentes. MAT-2 traz recontagem_necessaria: true mesmo com divergência
// zero local (diverg = 100 - 100 = 0) — prova que o badge vem do servidor, não de um cálculo
// daqui. MAT-3 traz recontagem_necessaria: false apesar de uma divergência local grande (50%) —
// prova o inverso: já foi recontado (RN-04), o front não reabre a fórmula.
const CONFERENCIA_ABERTA_NORMAL = {
  id: 1, numero: 'CONF-0001', status: 'ABERTO', modo_cego: false, tolerancia_percentual: 2,
  itens: [
    { id: 10, material_id: 100, material_codigo: 'MAT-1', material_nome: 'Parafuso M8', unidade: 'UN',
      localizacao: null, almoxarifado_codigo: null, quantidade_sistema: 100, quantidade_contada: null,
      divergencia: null, recontagem_necessaria: false, recontado: 0 },
    { id: 11, material_id: 101, material_codigo: 'MAT-2', material_nome: 'Porca M8', unidade: 'UN',
      localizacao: null, almoxarifado_codigo: null, quantidade_sistema: 100, quantidade_contada: 100,
      divergencia: 0, recontagem_necessaria: true, recontado: 0 },
    { id: 12, material_id: 102, material_codigo: 'MAT-3', material_nome: 'Arruela M8', unidade: 'UN',
      localizacao: null, almoxarifado_codigo: null, quantidade_sistema: 100, quantidade_contada: 50,
      divergencia: -50, recontagem_necessaria: false, recontado: 1 },
  ],
};

// modo_cego = true, status ABERTO, usuário sem ajustar_estoque: servidor OMITE
// quantidade_sistema/divergencia do item (RN-02). recontagem_necessaria continua presente.
const CONFERENCIA_ABERTA_CEGA = {
  id: 2, numero: 'CONF-0002', status: 'ABERTO', modo_cego: true, tolerancia_percentual: 2,
  itens: [
    { id: 20, material_id: 100, material_codigo: 'MAT-1', material_nome: 'Parafuso M8', unidade: 'UN',
      localizacao: null, almoxarifado_codigo: null, quantidade_contada: null, recontagem_necessaria: false, recontado: 0 },
  ],
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/conferencias') return Promise.resolve({ data: CONFERENCIAS });
    if (url === '/almoxarifado/conferencias/1') return Promise.resolve({ data: CONFERENCIA_ABERTA_NORMAL });
    if (url === '/almoxarifado/conferencias/2') return Promise.resolve({ data: CONFERENCIA_ABERTA_CEGA });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1, numero: 'CONF-0001', status: 'ABERTO', modo_cego: false, tolerancia_percentual: 2, totalItens: 3 } });
  api.put.mockResolvedValue({ data: { success: true, ajustesAplicados: 0, impactoFinanceiro: 0 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/almoxarifado/conferencias']}><ConferenciaEstoque /></MemoryRouter>); });
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
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function sairDoCampo(el) {
  // React 17+ implementa onBlur delegado por 'focusout' (que borbulha), não 'blur' nativo
  // (que não borbulha) — disparar 'blur' sozinho nunca chega no handler delegado no root.
  await act(async () => { el.dispatchEvent(new Event('focusout', { bubbles: true })); });
  // handleSalvarContagem encadeia DOIS awaits (PUT depois GET) — um único
  // setTimeout(0) só garante drenar o primeiro; espera duas voltas.
  await esperarEfeitos();
  await esperarEfeitos();
}
// Checkbox: React detecta o toggle pelo evento 'click' (mesmo padrão de SobrasAlmoxarifado.test.js).
function marcar(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('click', { bubbles: true }));
  });
}
const campo = (rotulo, raiz = '.almox-modal') => [...container.querySelectorAll(`${raiz} .almox-field`)]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo))
  ?.querySelector('input, textarea, select');
const linhaMaterial = (codigo) => [...container.querySelectorAll('.almox-table tbody tr')]
  .find((tr) => tr.textContent.includes(codigo));

describe('ConferenciaEstoque — criação com modo_cego e tolerancia_percentual', () => {
  test('checkbox "Contagem cega" e campo "Tolerância (%)" mandam modo_cego e tolerancia_percentual no POST', async () => {
    await renderizar();
    await clicar(botao('Nova Conferência'));

    marcar(campo('Contagem cega'), true);
    preencher(campo('Tolerância'), '5');
    await clicar(botao('Criar Conferência'));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/conferencias', expect.objectContaining({
      modo_cego: true,
      tolerancia_percentual: 5,
    }));
  });

  test('tolerância vazia não manda tolerancia_percentual (deixa o servidor decidir o default)', async () => {
    await renderizar();
    await clicar(botao('Nova Conferência'));
    await clicar(botao('Criar Conferência'));

    expect(api.post).toHaveBeenCalled();
    const payload = api.post.mock.calls[0][1];
    expect(payload.modo_cego).toBe(false);
    expect(payload.tolerancia_percentual).toBeUndefined();
  });

  test('campo Tolerância mostra o default fixo no placeholder quando a config nao responde nada util', async () => {
    await renderizar();
    await clicar(botao('Nova Conferência'));
    const campoTolerancia = campo('Tolerância');
    expect(campoTolerancia.placeholder).toMatch(/2/);
  });

  // Achado da revisão da Task 3: o placeholder original SEMPRE mostrava "2" fixo, alegando que
  // não existia endpoint de leitura de configuração — falso, GET /almoxarifado/configuracoes já
  // existe (e ConfiguracoesAlmoxarifado.js já o consome). Corrigido para ler a config real.
  test('campo Tolerância mostra o valor REAL configurado no placeholder, nao so o default fixo', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/conferencias') return Promise.resolve({ data: CONFERENCIAS });
      if (url === '/almoxarifado/configuracoes') {
        return Promise.resolve({ data: { tolerancia_inventario_percentual: { valor: '7.5', id: 1 } } });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Nova Conferência'));
    const campoTolerancia = campo('Tolerância');
    expect(campoTolerancia.placeholder).toMatch(/7\.5/);
  });
});

describe('ConferenciaEstoque — contagem cega não quebra o cálculo local de divergência', () => {
  test('GET sem quantidade_sistema/divergencia mostra "—" e não quebra ao digitar uma contagem', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/conferencias') return Promise.resolve({ data: [{ ...CONFERENCIAS[0], id: 2, numero: 'CONF-0002' }] });
      if (url === '/almoxarifado/conferencias/2') return Promise.resolve({ data: CONFERENCIA_ABERTA_CEGA });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Abrir'));

    const linha = linhaMaterial('MAT-1');
    expect(linha).toBeTruthy();
    // Qtd. Sistema (coluna 4) e Divergência (coluna 6) mostram "—" quando o dado não veio.
    const celulas = linha.querySelectorAll('td');
    expect(celulas[3].textContent.trim()).toBe('—');

    // Digitar uma contagem não pode quebrar a tela nem lançar um cálculo com quantidade_sistema
    // undefined (NaN vazando pra tela).
    const inputContagem = linha.querySelector('input[type="number"]');
    preencher(inputContagem, '80');
    await esperarEfeitos();

    expect(texto()).not.toMatch(/NaN/);
    const celulasDepois = linha.querySelectorAll('td');
    expect(celulasDepois[5].textContent.trim()).toBe('—');
  });
});

describe('ConferenciaEstoque — badge "Recontagem necessária" vem do servidor', () => {
  test('badge aparece quando recontagem_necessaria=true mesmo com divergência local zero, e some quando false mesmo com divergência local grande', async () => {
    await renderizar();
    await clicar(botao('Abrir'));

    const linhaMat1 = linhaMaterial('MAT-1'); // recontagem_necessaria: false, sem contagem ainda
    const linhaMat2 = linhaMaterial('MAT-2'); // recontagem_necessaria: true, diverg local = 0
    const linhaMat3 = linhaMaterial('MAT-3'); // recontagem_necessaria: false, diverg local = -50%

    expect(linhaMat1.textContent).not.toContain('Recontagem necessária');
    expect(linhaMat2.textContent).toContain('Recontagem necessária');
    expect(linhaMat3.textContent).not.toContain('Recontagem necessária');
  });

  // Achado da revisão final de branch: recontagem_necessaria só chegava na tela na hora de
  // ABRIR a conferência — salvar uma contagem não atualizava o badge, e quem contasse ficava
  // sem saber que precisava recontar até o 400 da conclusão. Depois do fix, salvar a contagem
  // rebusca a conferência e o badge da linha aparece SEM precisar reabrir a tela.
  test('badge atualiza sozinho depois de salvar uma contagem, sem precisar reabrir a conferência', async () => {
    let chamadasDetalhe = 0;
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/conferencias') return Promise.resolve({ data: CONFERENCIAS });
      if (url === '/almoxarifado/conferencias/1') {
        chamadasDetalhe += 1;
        if (chamadasDetalhe === 1) return Promise.resolve({ data: CONFERENCIA_ABERTA_NORMAL });
        // Segunda chamada (pós-contagem): MAT-1 passa a precisar de recontagem.
        return Promise.resolve({
          data: {
            ...CONFERENCIA_ABERTA_NORMAL,
            itens: CONFERENCIA_ABERTA_NORMAL.itens.map((it) =>
              it.material_codigo === 'MAT-1' ? { ...it, quantidade_contada: 50, divergencia: -50, recontagem_necessaria: true } : it),
          },
        });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Abrir'));

    const linhaMat1 = linhaMaterial('MAT-1');
    expect(linhaMat1.textContent).not.toContain('Recontagem necessária');

    const inputContagem = linhaMat1.querySelector('input[type="number"]');
    preencher(inputContagem, '50');
    await sairDoCampo(inputContagem);

    expect(api.get).toHaveBeenCalledWith('/almoxarifado/conferencias/1');
    expect(chamadasDetalhe).toBeGreaterThanOrEqual(2);
    expect(linhaMaterial('MAT-1').textContent).toContain('Recontagem necessária');
  });
});

describe('ConferenciaEstoque — concluir: justificativa do ajuste (RN-06b)', () => {
  test('com "aplicar ajustes" marcado, botão de confirmar fica desabilitado até a justificativa ter 5+ caracteres', async () => {
    await renderizar();
    await clicar(botao('Abrir'));
    await clicar(botao('Concluir Conferência'));

    const modal = container.querySelector('.almox-modal');
    expect(modal).toBeTruthy();
    const btnConfirmar = botao('Confirmar', modal.querySelector('.almox-modal-footer'));
    expect(btnConfirmar.disabled).toBe(true);

    preencher(campo('Justificativa do ajuste'), 'abc');
    expect(botao('Confirmar', modal.querySelector('.almox-modal-footer')).disabled).toBe(true);

    preencher(campo('Justificativa do ajuste'), 'Ajuste conforme contagem física');
    expect(botao('Confirmar', modal.querySelector('.almox-modal-footer')).disabled).toBe(false);

    await clicar(botao('Confirmar', modal.querySelector('.almox-modal-footer')));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/conferencias/1/concluir', expect.objectContaining({
      aplicar_ajustes: true,
      justificativa_ajuste: 'Ajuste conforme contagem física',
    }));
  });

  test('sem "aplicar ajustes", o modal não exige justificativa nenhuma', async () => {
    await renderizar();
    await clicar(botao('Abrir'));

    const checkboxAplicarAjustes = [...container.querySelectorAll('input[type="checkbox"]')]
      .find((c) => c.closest('label')?.textContent.includes('Aplicar ajustes'));
    marcar(checkboxAplicarAjustes, false);

    await clicar(botao('Concluir Conferência'));
    const modal = container.querySelector('.almox-modal');
    expect(campo('Justificativa do ajuste', '.almox-modal')).toBeFalsy();

    const btnConfirmar = botao('Confirmar', modal.querySelector('.almox-modal-footer'));
    expect(btnConfirmar.disabled).toBe(false);
    await clicar(btnConfirmar);

    expect(api.put).toHaveBeenCalledWith('/almoxarifado/conferencias/1/concluir', expect.objectContaining({
      aplicar_ajustes: false,
    }));
    const payload = api.put.mock.calls[0][1];
    expect(payload.justificativa_ajuste).toBeUndefined();
  });
});

describe('ConferenciaEstoque — recusas do concluir: mensagens completas e caminhos distintos', () => {
  // RN-05: mensagem literal exata do design ("Contratos de API (congelados)") — cada item
  // "<código> - <divergência 2 casas>% (limite <tolerância inteira>%)", junção "; ", sem a
  // palavra "divergência" antes do número.
  test('400 de recontagem (RN-05) mostra a lista COMPLETA no toast, todos os itens', async () => {
    const mensagem = 'Recontagem necessária antes de concluir: MAT-1 - 10.00% (limite 2%); MAT-2 - 15.50% (limite 2%)';
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: mensagem } } });
    await renderizar();
    await clicar(botao('Abrir'));
    await clicar(botao('Concluir Conferência'));
    preencher(campo('Justificativa do ajuste'), 'Ajuste conforme contagem física');
    await clicar(botao('Confirmar', container.querySelector('.almox-modal-footer')));

    expect(toast.error).toHaveBeenCalledWith(mensagem);
    // prova que não é só a primeira linha/primeiro item
    expect(toast.error.mock.calls[0][0]).toContain('MAT-1');
    expect(toast.error.mock.calls[0][0]).toContain('MAT-2');
  });

  // RN-06/RN-07, 400: bloqueio por retenção — mensagem literal já vem pronta do servidor
  // (Task 2), a tela só repassa sem reescrever.
  test('400 de retenção (RN-07) mostra a mensagem literal do servidor, sem reescrever', async () => {
    const mensagem = "Ajuste bloqueado: MAT-1: Ajuste para 10 UN deixaria o disponível negativo (reservada: 5 UN, mínimo aceitável: 5 UN). Resolva a retenção antes de ajustar para menos, ou ajuste para um valor maior ou igual ao mínimo.";
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: mensagem } } });
    await renderizar();
    await clicar(botao('Abrir'));
    await clicar(botao('Concluir Conferência'));
    preencher(campo('Justificativa do ajuste'), 'Ajuste conforme contagem física');
    await clicar(botao('Confirmar', container.querySelector('.almox-modal-footer')));

    expect(toast.error).toHaveBeenCalledWith(mensagem);
  });

  // RN-07, 403: material de cliente sem ajustar_material_cliente — prioridade sobre o 400 de
  // retenção quando os dois coexistem (decisão do servidor); a tela trata como caso distinto,
  // não cai no mesmo catch genérico que o 400.
  test('403 de material de cliente (RN-07) é tratado como caso distinto do 400, mensagem literal preservada', async () => {
    const mensagem = 'Ajuste bloqueado — os seguintes materiais são de cliente e exigem a permissão "ajustar_material_cliente": MAT-9 (Cliente Fulano)';
    api.put.mockRejectedValueOnce({ response: { status: 403, data: { error: mensagem } } });
    await renderizar();
    await clicar(botao('Abrir'));
    await clicar(botao('Concluir Conferência'));
    preencher(campo('Justificativa do ajuste'), 'Ajuste conforme contagem física');
    await clicar(botao('Confirmar', container.querySelector('.almox-modal-footer')));

    expect(toast.error).toHaveBeenCalledWith(mensagem);
  });
});

describe('ConferenciaEstoque — concluir com sucesso mostra o impacto financeiro', () => {
  test('sucesso com ajustesAplicados > 0 mostra "impacto financeiro" formatado em R$', async () => {
    const impactoFormatado = Number(1234.56).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    api.put.mockResolvedValueOnce({ data: { success: true, ajustesAplicados: 3, impactoFinanceiro: 1234.56 } });
    await renderizar();
    await clicar(botao('Abrir'));
    await clicar(botao('Concluir Conferência'));
    preencher(campo('Justificativa do ajuste'), 'Ajuste conforme contagem física');
    await clicar(botao('Confirmar', container.querySelector('.almox-modal-footer')));

    expect(toast.success).toHaveBeenCalled();
    const mensagem = toast.success.mock.calls[0][0];
    expect(mensagem).toContain('3');
    expect(mensagem).toContain(impactoFormatado);
  });
});

// SABOTAGEM (Step 5 do brief): se o catch do concluir virar um catch genérico que ignora
// err.response?.data?.error (ex.: sempre "Erro ao concluir conferência"), este teste tem de
// cair — é ele que prova que a mensagem completa do servidor chega ao toast.
