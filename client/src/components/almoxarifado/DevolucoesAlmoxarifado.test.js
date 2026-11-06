/**
 * Etapa 7, Task 7 — tela de devoluções.
 *
 * A rota POST /devolucoes existia desde sempre sem nenhuma tela: só era alcançável por chamada
 * direta à API. Estes testes cobrem as duas regras de UX que o design marca como essenciais — a
 * sugestão condição→destino (que existe SÓ na tela; o backend aceita qualquer combinação) e o
 * limite de quantidade pelo saldo devolvível da entrega escolhida — mais o caminho avulso, que é
 * o que impede a tela de travar quem devolve material sem registro de saída.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/DevolucoesAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DevolucoesAlmoxarifado from './DevolucoesAlmoxarifado';
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

const MATERIAL = { id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', controle_lote: 0, controle_serie: 0 };
const MATERIAL_LOTE = { id: 11, codigo: 'MAT-2', nome: 'Perfil L', unidade: 'PC', controle_lote: 1, controle_serie: 0 };
const MATERIAL_SERIE = { id: 12, codigo: 'MAT-3', nome: 'Motor 5cv', unidade: 'PC', controle_lote: 0, controle_serie: 1 };

const SAIDA_COM_SALDO = {
  id: 501, tipo: 'SAIDA_PRODUCAO', quantidade: 10, quantidade_devolvida: 3, saldo_devolvivel: 7,
  created_at: '2026-08-10T10:00:00Z', lote_id: null, lote: null,
  requisicao_id: 77, requisicao_numero: 'REQ-77', os_id: null, projeto_id: null,
  usuario_nome: 'Maria', series: [],
};
const SAIDA_ZERADA = {
  id: 502, tipo: 'SAIDA', quantidade: 4, quantidade_devolvida: 4, saldo_devolvivel: 0,
  created_at: '2026-08-09T10:00:00Z', lote_id: null, lote: null,
  requisicao_id: null, requisicao_numero: null, os_id: null, projeto_id: null,
  usuario_nome: 'João', series: [],
};
const DEVOLUCOES = [{
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  quantidade: 3, motivo: 'SOBRA_PROJETO', condicao: 'BOA', destino: 'ESTOQUE',
  movimentacao_saida_id: 501, responsavel_nome: 'Maria', created_at: '2026-08-11T10:00:00Z',
}, {
  // Etapa 34: a segunda linha existe para que os cenarios de anexo possam assertar um id que
  // NAO seja 1. `entidade_id: 1` e indistinguivel de indice-zero, de literal e de estado
  // obsoleto — em producao, o usuario clicaria o clipe da segunda linha e receberia os anexos
  // da primeira, sem 400 e sem erro nenhum.
  id: 42, material_id: 11, material_codigo: 'TUB-2', material_nome: 'Tubo 2 pol',
  quantidade: 5, motivo: 'SOBRA_PROJETO', condicao: 'BOA', destino: 'ESTOQUE',
  movimentacao_saida_id: null, responsavel_nome: 'Carlos', created_at: '2026-08-12T10:00:00Z',
}];

let container;
let root;
let saidasDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saidasDoBanco = [SAIDA_COM_SALDO, SAIDA_ZERADA];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL, MATERIAL_LOTE, MATERIAL_SERIE] });
    if (url === '/almoxarifado/devolucoes') return Promise.resolve({ data: DEVOLUCOES });
    if (url.startsWith('/almoxarifado/devolucoes/saidas-elegiveis')) return Promise.resolve({ data: saidasDoBanco });
    if (url.includes('/lotes')) {
      return Promise.resolve({ data: [{ id: 90, codigo: 'L-1', status: 'ATIVO', saldo: 12, elegivel: true }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 9 } });
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
    root.render(<MemoryRouter><DevolucoesAlmoxarifado /></MemoryRouter>);
  });
}

async function esperarEfeitos() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function abrirModal() {
  await renderizar();
  await esperarEfeitos();
  const botao = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Devolução'));
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const campo = (id) => container.querySelector(`#${id}`);

async function escolherMaterial(id) {
  preencher(campo('dev-material'), String(id));
  await esperarEfeitos();
}

describe('DevolucoesAlmoxarifado — lista', () => {
  test('lista as devoluções com material, destino e a saída de origem', async () => {
    await renderizar();
    await esperarEfeitos();
    const linha = container.querySelector('.almox-table tbody tr');
    expect(linha.textContent).toContain('MAT-1');
    expect(linha.textContent).toContain('Estoque');
    expect(linha.textContent).toContain('501');
  });
});

describe('DevolucoesAlmoxarifado — sugestão condição→destino', () => {
  test('Boa sugere Estoque, Suspeita sugere Quarentena, Danificada sugere Sucata', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);

    preencher(campo('dev-condicao'), 'BOA');
    expect(campo('dev-destino').value).toBe('ESTOQUE');
    preencher(campo('dev-condicao'), 'SUSPEITA');
    expect(campo('dev-destino').value).toBe('QUARENTENA');
    preencher(campo('dev-condicao'), 'DANIFICADA');
    expect(campo('dev-destino').value).toBe('SUCATA');
  });

  test('a sugestão não trava: o operador troca o destino e a condição não o desfaz', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-condicao'), 'DANIFICADA');
    preencher(campo('dev-destino'), 'RETRABALHO');
    expect(campo('dev-destino').value).toBe('RETRABALHO');
  });
});

describe('DevolucoesAlmoxarifado — saída de origem e limite de quantidade', () => {
  test('oferece as saídas do material e desabilita a já devolvida por inteiro', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    const opcoes = [...campo('dev-saida').querySelectorAll('option')];
    const zerada = opcoes.find((o) => o.value === '502');
    expect(opcoes.find((o) => o.value === '501').disabled).toBe(false);
    expect(zerada.disabled).toBe(true);
    expect(zerada.textContent).toMatch(/devolvid/i);
  });

  test('Etapa 121 (C253): a saída cujas peças voltaram por outra entrada diz isso, não "devolvido por inteiro"', async () => {
    saidasDoBanco = [
      { ...SAIDA_ZERADA, id: 503, quantidade: 2, quantidade_devolvida: 0, quantidade_reentrada: 2, saldo_devolvivel: 0 },
      { ...SAIDA_COM_SALDO, id: 504, quantidade: 2, quantidade_devolvida: 0, quantidade_reentrada: 1, saldo_devolvivel: 1 },
      { ...SAIDA_ZERADA, id: 505, quantidade: 2, quantidade_devolvida: 1, quantidade_reentrada: 1, saldo_devolvivel: 0 },
      SAIDA_ZERADA,
    ];
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    const opcoes = [...campo('dev-saida').querySelectorAll('option')];
    const voltou = opcoes.find((o) => o.value === '503');
    const parcial = opcoes.find((o) => o.value === '504');
    expect(voltou.disabled).toBe(true);
    expect(voltou.textContent).toMatch(/2 já voltaram ao estoque por outra entrada/);
    expect(voltou.textContent).not.toMatch(/devolvido por inteiro/);
    expect(parcial.disabled).toBe(false);
    expect(parcial.textContent).toMatch(/devolvível 1 · 1 já voltou ao estoque por outra entrada/);
    // Fase 2 (I5): com devolução e volta por fora, as duas partes aparecem.
    expect(opcoes.find((o) => o.value === '505').textContent).toMatch(/devolvido 1 · 1 já voltou ao estoque por outra entrada/);
    // A metade positiva: a saída devolvida de verdade continua dizendo "já devolvido por inteiro".
    expect(opcoes.find((o) => o.value === '502').textContent).toMatch(/já devolvido por inteiro/);
    // Fase 5 (r3): sem volta por fora, o rótulo não ganha o "devolvido" (nem na zerada nem na que tem saldo).
    expect(opcoes.find((o) => o.value === '502').textContent).not.toMatch(/devolvido [0-9]/);
    expect(opcoes.find((o) => o.value === '504').textContent).not.toMatch(/devolvido [0-9]/);
  });

  test('escolhida a saída, a quantidade fica limitada ao saldo devolvível', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-saida'), '501');
    expect(campo('dev-quantidade').getAttribute('max')).toBe('7');
  });

  test('quantidade acima do devolvível não chega a ser enviada', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-saida'), '501');
    preencher(campo('dev-quantidade'), '9');
    preencher(campo('dev-motivo'), 'SOBRA_PROJETO');
    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.post).not.toHaveBeenCalled();
  });

  test('devolução avulsa (sem saída) é permitida e não manda movimentacao_saida_id', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-quantidade'), '2');
    preencher(campo('dev-motivo'), 'NAO_UTILIZADO');
    preencher(campo('dev-condicao'), 'BOA');
    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/devolucoes', expect.objectContaining({
      material_id: 10, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
    }));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('movimentacao_saida_id');
  });
});

describe('DevolucoesAlmoxarifado — lote e série', () => {
  test('lote herdado da saída aparece em leitura, sem seletor', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, lote_id: 90, lote: 'L-1' }];
    await abrirModal();
    await escolherMaterial(MATERIAL_LOTE.id);
    preencher(campo('dev-saida'), '501');
    await esperarEfeitos();
    expect(container.querySelector('.almox-modal').textContent).toContain('L-1');
    expect(campo('dev-lote')).toBeNull();
  });

  test('sem lote a herdar, material com controle de lote ganha seletor', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL_LOTE.id);
    await esperarEfeitos();
    expect(campo('dev-lote')).not.toBeNull();
    expect([...campo('dev-lote').querySelectorAll('option')].map((o) => o.textContent).join(' ')).toContain('L-1');
  });

  test('material com série: checkboxes das séries entregues naquela saída', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, series: [{ id: 1, numero: 'SN-1', status: 'ENTREGUE' }, { id: 2, numero: 'SN-2', status: 'ENTREGUE' }] }];
    await abrirModal();
    await escolherMaterial(MATERIAL_SERIE.id);
    preencher(campo('dev-saida'), '501');
    await esperarEfeitos();
    const numeros = [...container.querySelectorAll('.almox-modal input[type="checkbox"]')].map((c) => c.value);
    expect(numeros).toEqual(['SN-1', 'SN-2']);
  });

  // Decisão 10: a tela EXPLICA o caminho de dois passos em vez de deixar o envio falhar.
  test('destino Sucata em material com série não oferece as séries e explica o caminho', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, series: [{ id: 1, numero: 'SN-1', status: 'ENTREGUE' }] }];
    await abrirModal();
    await escolherMaterial(MATERIAL_SERIE.id);
    preencher(campo('dev-saida'), '501');
    preencher(campo('dev-destino'), 'SUCATA');
    await esperarEfeitos();
    expect(container.querySelectorAll('.almox-modal input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('.almox-modal').textContent).toMatch(/Movimenta/);
  });
});

describe('DevolucoesAlmoxarifado — anexos da devolução (Etapa 34)', () => {
  const URL_ANEXOS = '/almoxarifado/anexos';
  const chamadasDeAnexo = () => api.get.mock.calls.filter(([u]) => u === URL_ANEXOS);
  const abrirAnexos = async (id) => {
    await act(async () => {
      container.querySelector(`[data-testid="anexos-devolucao-${id}"]`)
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await esperarEfeitos();
  };

  // O id 42, nunca o 1 — ver o comentario da fixture.
  test('o clipe abre o modal de anexos DA devolucao da linha — e nao da primeira', async () => {
    await renderizar();
    await esperarEfeitos();
    expect(container.querySelector('[data-testid="anexos-devolucao-42"]')).not.toBeNull();

    await abrirAnexos(42);

    expect(container.querySelector('[data-testid="anexos-modal"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="anexos-documento"]')).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith(URL_ANEXOS,
      { params: { entidade: 'devolucao', entidade_id: 42 } });
    expect(chamadasDeAnexo()).toHaveLength(1);
  });

  test('reabrir em outra linha consulta a linha nova, nao a anterior', async () => {
    await renderizar();
    await esperarEfeitos();
    await abrirAnexos(1);
    await act(async () => {
      container.querySelector('.almox-modal-close')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await abrirAnexos(42);
    const chamadas = chamadasDeAnexo();
    expect(chamadas[chamadas.length - 1][1].params.entidade_id).toBe(42);
  });

  // RN-02, negativo COM metade positiva: sozinho passaria com a tabela vazia.
  test('a lista sozinha nao consulta anexos; so o clique consulta', async () => {
    await renderizar();
    await esperarEfeitos();
    expect(chamadasDeAnexo()).toHaveLength(0);
    await abrirAnexos(42);
    expect(chamadasDeAnexo()).toHaveLength(1);
  });

  // A coluna nova mudou o `columns` do esqueleto de 8 para 9. Sem este cenario, esquecer o 9
  // deixaria o esqueleto uma coluna mais estreito que a tabela carregada — e verde para sempre,
  // porque este arquivo nao tinha nenhuma referencia a SkeletonTable, `columns` ou contagem de th.
  // A regua nao fixa numero nenhum: amarra as DUAS pontas uma na outra.
  test('o esqueleto tem tantas colunas quanto a tabela carregada', async () => {
    let liberar;
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/devolucoes'
      ? new Promise((r) => { liberar = () => r({ data: DEVOLUCOES }); })
      : original(url, cfg)));

    await renderizar();
    const colsEsqueleto = container.querySelectorAll('.skeleton-table-header-cell').length;
    expect(colsEsqueleto).toBeGreaterThan(0);   // metade positiva: o esqueleto existe mesmo

    await act(async () => { liberar(); await new Promise((r) => setTimeout(r, 0)); });
    expect(container.querySelectorAll('.almox-table thead th')).toHaveLength(colsEsqueleto);
  });
});

// ── Etapa 204 (C465; B1363-B1366): "Carregar entregas mais antigas" ─────────────────────────────────────────────────
// O servidor pagina de 30 em 30 (cursor `antes_de` = id da ultima linha da resposta anterior). A tela deduz "ha mais" da
// pagina cheia. O mock distingue `antes_de` na URL SO nestes testes; os de cima seguem com o mock generico e < 30 linhas.
describe('DevolucoesAlmoxarifado — entregas mais antigas (Etapa 204)', () => {
  const saida = (id) => ({ ...SAIDA_COM_SALDO, id, requisicao_numero: `REQ-${id}` });
  const pagina = (primeiro, n) => Array.from({ length: n }, (_, i) => saida(primeiro - i));
  const PAG1 = pagina(1000, 30); // 1000..971
  let respostaAntesDe; // (antesDe) => Promise
  let chamadasAntesDe;

  beforeEach(() => {
    chamadasAntesDe = [];
    respostaAntesDe = () => Promise.resolve({ data: pagina(970, 5) });
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => {
      if (url.startsWith('/almoxarifado/devolucoes/saidas-elegiveis')) {
        const m = /antes_de=([^&]*)/.exec(url);
        if (m) { chamadasAntesDe.push(url); return respostaAntesDe(m[1]); }
        return Promise.resolve({ data: url.includes('material_id=10') ? PAG1 : [saida(5)] });
      }
      return original(url, cfg);
    });
  });

  const botao = () => container.querySelector('[data-testid="dev-saidas-mais-antigas"]');
  const nota = () => container.querySelector('[data-testid="dev-saidas-fim"]');
  const idsDaLista = () => [...campo('dev-saida').querySelectorAll('option')].map((o) => o.value).filter(Boolean);
  async function clicar(el) {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await esperarEfeitos();
  }

  test('RN-204.06 pagina cheia mostra o botao; o clique pede antes_de da ultima e acrescenta no fim, sem repetir nem perder a escolha', async () => {
    respostaAntesDe = () => Promise.resolve({ data: [saida(971), ...pagina(970, 5)] }); // 971 repetida
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    expect(botao().textContent).toBe('Carregar entregas mais antigas');
    expect(nota()).toBeNull();
    preencher(campo('dev-saida'), '985');
    await clicar(botao());
    expect(chamadasAntesDe).toEqual(['/almoxarifado/devolucoes/saidas-elegiveis?material_id=10&antes_de=971']);
    const ids = idsDaLista();
    expect(ids).toHaveLength(35);
    expect(new Set(ids).size).toBe(35);
    expect(ids.slice(30)).toEqual(['970', '969', '968', '967', '966']);
    expect(campo('dev-saida').value).toBe('985');
    // Pagina com menos de 30: o botao some e a nota aparece.
    expect(botao()).toBeNull();
    expect(nota().textContent).toBe('Não há entregas mais antigas deste material.');
  });

  test('RN-204.06 primeira pagina curta: nem botao nem nota', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL_LOTE.id);
    expect(idsDaLista()).toEqual(['5']);
    expect(botao()).toBeNull();
    expect(nota()).toBeNull();
  });

  test('RN-204.06 pagina de 30 mantem o botao; antes_de e o da ultima linha da RESPOSTA; o clique que volta vazio diz que acabou', async () => {
    // A 2a resposta termina numa linha repetida (971): o proximo cursor e ela, nao a ultima do array sem repeticao.
    const segunda = [...pagina(970, 29), saida(971)];
    const respostas = [segunda, []];
    respostaAntesDe = () => Promise.resolve({ data: respostas.shift() });
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    await clicar(botao());
    expect(idsDaLista()).toHaveLength(59);
    expect(botao()).not.toBeNull();
    expect(nota()).toBeNull();
    await clicar(botao());
    expect(chamadasAntesDe[1]).toBe('/almoxarifado/devolucoes/saidas-elegiveis?material_id=10&antes_de=971');
    expect(botao()).toBeNull();
    expect(nota().textContent).toBe('Não há entregas mais antigas deste material.');
    expect(idsDaLista()).toHaveLength(59);
  });

  test('RN-204.06 enquanto carrega, o botao fica desabilitado com "Carregando…"', async () => {
    let liberar;
    respostaAntesDe = () => new Promise((r) => { liberar = () => r({ data: pagina(970, 5) }); });
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    await clicar(botao());
    expect(botao().disabled).toBe(true);
    expect(botao().textContent).toBe('Carregando…');
    await act(async () => { liberar(); await new Promise((r) => setTimeout(r, 0)); });
    expect(idsDaLista()).toHaveLength(35);
  });

  test('RN-204.07 trocar de material com o clique em voo: a resposta velha nao entra (A -> vazio -> A)', async () => {
    let liberar;
    respostaAntesDe = () => new Promise((r) => { liberar = () => r({ data: pagina(970, 5) }); });
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    await clicar(botao());
    expect(botao().textContent).toBe('Carregando…');
    await escolherMaterial('');
    await escolherMaterial(MATERIAL.id);
    await act(async () => { liberar(); await new Promise((r) => setTimeout(r, 0)); });
    expect(idsDaLista()).toEqual(PAG1.map((s) => String(s.id)));
    expect(botao().disabled).toBe(false);
    expect(botao().textContent).toBe('Carregar entregas mais antigas');
    expect(nota()).toBeNull();
  });

  test('RN-204.07 trocar para outro material com o clique em voo: a lista do novo nao recebe as velhas', async () => {
    let liberar;
    respostaAntesDe = () => new Promise((r) => { liberar = () => r({ data: pagina(970, 5) }); });
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    await clicar(botao());
    await escolherMaterial(MATERIAL_LOTE.id);
    await act(async () => { liberar(); await new Promise((r) => setTimeout(r, 0)); });
    expect(idsDaLista()).toEqual(['5']);
    expect(botao()).toBeNull();
    expect(nota()).toBeNull();
  });

  test('RN-204.08 falha ao carregar mais: toast, a lista e a escolha ficam, o botao volta', async () => {
    const { toast } = require('react-toastify');
    respostaAntesDe = () => Promise.reject(new Error('rede'));
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-saida'), '990');
    await clicar(botao());
    expect(toast.error).toHaveBeenCalledWith('Erro ao carregar entregas mais antigas');
    expect(idsDaLista()).toHaveLength(30);
    expect(campo('dev-saida').value).toBe('990');
    expect(botao().disabled).toBe(false);
    expect(botao().textContent).toBe('Carregar entregas mais antigas');
    expect(nota()).toBeNull();
  });

  test('Fase 2: depois de devolver o modal fecha e reabre na pagina 1; se o POST falha, as paginas ficam', async () => {
    const { toast } = require('react-toastify');
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    await clicar(botao());
    preencher(campo('dev-saida'), '968');
    preencher(campo('dev-quantidade'), '1');
    preencher(campo('dev-motivo'), 'SOBRA_PROJETO');
    const enviar = async () => {
      const form = container.querySelector('.almox-modal form');
      await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
      await esperarEfeitos();
    };
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Devolução acima do entregue: literal do servidor' } } });
    await enviar();
    expect(toast.error).toHaveBeenCalledWith('Devolução acima do entregue: literal do servidor');
    expect(container.querySelector('.almox-modal')).not.toBeNull();
    expect(idsDaLista()).toHaveLength(35);
    expect(nota()).not.toBeNull();
    await enviar();
    expect(api.post).toHaveBeenLastCalledWith('/almoxarifado/devolucoes', expect.objectContaining({ movimentacao_saida_id: 968 }));
    expect(container.querySelector('.almox-modal')).toBeNull();
    const botaoNova = [...container.querySelectorAll('.almox-header-actions button')].find((b) => b.textContent.includes('Nova Devolução'));
    await clicar(botaoNova);
    expect(nota()).toBeNull();
    expect(botao()).toBeNull();
    await escolherMaterial(MATERIAL.id);
    expect(idsDaLista()).toEqual(PAG1.map((s) => String(s.id)));
    expect(nota()).toBeNull();
    expect(botao().textContent).toBe('Carregar entregas mais antigas');
    expect(chamadasAntesDe).toHaveLength(1);
  });
});
