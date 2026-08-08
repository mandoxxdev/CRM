/**
 * Tela da fila de inspeções (Etapa 5, Task 6).
 *
 * O backend (Task 4/5) já garante que aprovado+reprovado precisa fechar com o retido, valida
 * `encaminhamento` e exige justificativa em bloqueio/desbloqueio. Estes testes cobrem o que a
 * UI faz ANTES de bater no servidor — cada caso corresponde a um jeito de a tela deixar passar
 * uma decisão que o servidor recusaria, ou pior, uma que o servidor aceitaria mas que perde
 * material no limbo por descuido de digitação.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/InspecoesAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import InspecoesAlmoxarifado from './InspecoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas: o alvo aqui é o comportamento da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const PENDENTE = {
  item_id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', quantidade_retida: 100, recebimento_id: 55,
  recebimento_numero: 'REC-55', nota_fiscal: 'NF-999', data_entrada: '2026-08-08T10:00:00Z',
};

let container;
let root;
let pendentesDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pendentesDoBanco = [PENDENTE];
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/inspecoes/pendentes') return Promise.resolve({ data: pendentesDoBanco });
    if (url === '/almoxarifado/estoque') {
      return Promise.resolve({
        data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_bloqueada: 0 }],
      });
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
    root.render(<MemoryRouter><InspecoesAlmoxarifado /></MemoryRouter>);
  });
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];

/** Abre o modal de decisão da linha (botão "Decidir inspeção"). */
async function abrirDecisao(indiceLinha) {
  const botao = [...linhas()[indiceLinha].querySelectorAll('.almox-btn-icon')]
    .find((b) => b.getAttribute('title')?.includes('Decidir'));
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

/** Abre o modal de bloqueio/desbloqueio avulso pelo botão do cabeçalho. */
async function abrirAjuste(textoBotao) {
  const botao = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.trim().includes(textoBotao));
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

/** Campo do modal aberto, localizado pelo texto do <label>. */
function campoPorLabel(rotulo) {
  const grupo = [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.replace('*', '').trim() === rotulo);
  return grupo.querySelector('input, textarea, select');
}

/** Variante que devolve null em vez de estourar quando o campo não existe. */
function campoPorLabelOuNull(rotulo) {
  const grupo = [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.replace('*', '').trim() === rotulo);
  return grupo ? grupo.querySelector('input, textarea, select') : null;
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : elemento.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

/** Botão do rodapé do modal pelo texto. */
async function clicarBotaoModal(texto) {
  const botao = [...container.querySelectorAll('.almox-modal-footer button')]
    .find((b) => b.textContent.trim() === texto);
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InspecoesAlmoxarifado — fila e decisão', () => {
  test('mostra a quantidade retida', async () => {
    await renderizar();
    expect(linhas()[0].textContent).toContain('100 PC');
  });

  test('lista vazia mostra o estado vazio do módulo', async () => {
    pendentesDoBanco = [];
    await renderizar();
    expect(container.querySelector('.almox-empty')).not.toBeNull();
  });

  test('aprovado + reprovado que não fecha com o retido não chama a API', async () => {
    await renderizar();
    await abrirDecisao(0);
    preencher(campoPorLabel('Quantidade aprovada'), '50');
    preencher(campoPorLabel('Quantidade reprovada'), '10');   // 60 ≠ 100
    await clicarBotaoModal('Salvar');
    // Deixar passar mandaria 40 unidades para o limbo: saem da fila e ficam retidas para sempre.
    expect(api.post).not.toHaveBeenCalled();
  });

  test('conta que não fecha continua bloqueada mesmo com observação preenchida', async () => {
    // Isola a regra de fechamento da regra de "reprovar exige observação": sem preencher
    // Observações, os dois guardas bloqueiam o mesmo clique e um bug no fechamento passaria
    // despercebido (foi o que o controle positivo desta task pegou na primeira versão do teste
    // acima — mutar só a regra de fechamento não derrubava nada porque a de observação também
    // barrava). Com Observações preenchida, só o fechamento pode estar segurando o Salvar aqui.
    await renderizar();
    await abrirDecisao(0);
    preencher(campoPorLabel('Quantidade aprovada'), '50');
    preencher(campoPorLabel('Quantidade reprovada'), '10');   // 60 ≠ 100
    preencher(campoPorLabel('Observações'), 'preenchida só para isolar a regra de fechamento');
    await clicarBotaoModal('Salvar');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('a conta fechando envia aprovado e reprovado', async () => {
    await renderizar();
    await abrirDecisao(0);
    preencher(campoPorLabel('Quantidade aprovada'), '90');
    preencher(campoPorLabel('Quantidade reprovada'), '10');
    preencher(campoPorLabel('Observações'), '10 amassadas');
    await clicarBotaoModal('Salvar');
    expect(api.post).toHaveBeenCalledWith(
      '/almoxarifado/recebimentos/itens/1/inspecionar',
      expect.objectContaining({ quantidade_aprovada: 90, quantidade_reprovada: 10 }));
  });

  test('reprovar sem observação não chama a API', async () => {
    await renderizar();
    await abrirDecisao(0);
    preencher(campoPorLabel('Quantidade aprovada'), '0');
    preencher(campoPorLabel('Quantidade reprovada'), '100');
    await clicarBotaoModal('Salvar');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('encaminhamento só aparece quando há quantidade reprovada', async () => {
    await renderizar();
    await abrirDecisao(0);
    preencher(campoPorLabel('Quantidade aprovada'), '100');
    preencher(campoPorLabel('Quantidade reprovada'), '0');
    expect(campoPorLabelOuNull('Encaminhamento')).toBeNull();
    preencher(campoPorLabel('Quantidade reprovada'), '5');
    expect(campoPorLabelOuNull('Encaminhamento')).not.toBeNull();
  });

  test('aprovar tudo (caso comum) já vem pré-preenchido e fecha de primeira', async () => {
    // Decisão de UX: aprovada nasce = retido, reprovada nasce = 0. Aprovar o lote inteiro é o
    // caso comum (recebimento sem defeito) — sem pré-preencher, o inspetor digitaria "100" toda
    // vez só para confirmar o óbvio. Continua editável: os testes acima provam que dá para mudar.
    await renderizar();
    await abrirDecisao(0);
    expect(campoPorLabel('Quantidade aprovada').value).toBe('100');
    expect(campoPorLabel('Quantidade reprovada').value).toBe('0');
    await clicarBotaoModal('Salvar');
    expect(api.post).toHaveBeenCalledWith(
      '/almoxarifado/recebimentos/itens/1/inspecionar',
      expect.objectContaining({ quantidade_aprovada: 100, quantidade_reprovada: 0 }));
  });
});

describe('InspecoesAlmoxarifado — bloqueio/desbloqueio avulso de material', () => {
  test('bloquear sem justificativa não chama a API', async () => {
    await renderizar();
    await abrirAjuste('Bloquear');
    preencher(campoPorLabel('Material'), '10');
    preencher(campoPorLabel('Quantidade'), '5');
    await clicarBotaoModal('Confirmar');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('bloquear com material, quantidade e justificativa chama o endpoint de bloquear', async () => {
    await renderizar();
    await abrirAjuste('Bloquear');
    preencher(campoPorLabel('Material'), '10');
    preencher(campoPorLabel('Quantidade'), '5');
    preencher(campoPorLabel('Justificativa'), 'Avaria encontrada na prateleira');
    await clicarBotaoModal('Confirmar');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais/10/bloquear', {
      quantidade: 5, justificativa: 'Avaria encontrada na prateleira',
    });
  });

  test('desbloquear chama o endpoint de desbloquear, não o de bloquear', async () => {
    await renderizar();
    await abrirAjuste('Desbloquear');
    preencher(campoPorLabel('Material'), '10');
    preencher(campoPorLabel('Quantidade'), '5');
    preencher(campoPorLabel('Justificativa'), 'Reinspecionado, conforme');
    await clicarBotaoModal('Confirmar');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais/10/desbloquear', {
      quantidade: 5, justificativa: 'Reinspecionado, conforme',
    });
  });
});
