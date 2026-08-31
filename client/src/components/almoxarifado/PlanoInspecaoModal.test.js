/**
 * Cadastro do plano de inspeção pela tela (Etapa 30, Task 1 — C5, RN-02..RN-10).
 *
 * Até aqui o plano de inspeção só nascia por `curl`: o CRUD existe e é testado desde a Etapa 27
 * (`planoInspecao.api.test.js`), mas nenhuma tela criava, editava ou desativava característica —
 * o que deixava o bloco "Medidas do plano" da Etapa 29 inalcançável para quem opera.
 *
 * Três reguas que estes testes existem para segurar, e que a Fase 2 do plano mediu:
 *
 * 1. O mock de `api.get` aqui e PARAMS-AWARE (Global Constraint 8). O molde da base
 *    (`InspecoesAlmoxarifado.test.js:87`) e `mockImplementation((url) => ...)` e IGNORA os params:
 *    com ele, tirar o `todos: 1` da chamada nao muda uma linha renderizada e o controle positivo
 *    seria no-op. Aqui o mock filtra `ativo === 1` quando `todos` nao vem — e e por isso que a
 *    ausencia das inativas derruba o cenario (1).
 * 2. A fixture da faixa contem `1.1 ±0.1` (Global Constraint 7). Medido na Fase 2:
 *    `10 +0.005/+0.021`, `10 ±0.05` e `0/0/0` dao IDENTICO com e sem `toFixed` — a fixture
 *    unilateral sozinha nao ancora o `toFixed`. `1.1 − 0.1` da 1.0000000000000002.
 * 3. Cenario negativo carrega a metade positiva NO MESMO teste (Global Constraint 9): "nao chamou
 *    a API" passa igual com o botao ausente ou com o handler vazio.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false PlanoInspecaoModal
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import PlanoInspecaoModal from './PlanoInspecaoModal';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const MATERIAL = { id: 10, codigo: 'ALM-0010', nome: 'Eixo Retificado 10mm', unidade: 'PC' };

// `1.1 ±0.1` é a âncora do `toFixed` (ver cabeçalho): sem ele a faixa sai
// `[1.0000000000000002 ; 1.2000000000000002]`.
const FOLGA = {
  id: 1, material_id: 10, caracteristica: 'Folga', unidade: 'mm',
  valor_nominal: 1.1, desvio_inferior: -0.1, desvio_superior: 0.1, ativo: 1,
};
// Unilateral: a faixa inteira fica ACIMA do nominal. `nominal − |inf|` daria 9.995 aqui.
const DIAMETRO = {
  id: 2, material_id: 10, caracteristica: 'Diâmetro', unidade: 'mm',
  valor_nominal: 10, desvio_inferior: 0.005, desvio_superior: 0.021, ativo: 1,
};
const RUGOSIDADE_INATIVA = {
  id: 3, material_id: 10, caracteristica: 'Rugosidade', unidade: 'um',
  valor_nominal: 3.2, desvio_inferior: -0.2, desvio_superior: 0.4, ativo: 0,
};
// Colide com DIAMETRO (nome idêntico, uma ativa): reativar tem de ser barrado NA TELA.
const DIAMETRO_INATIVO = {
  id: 4, material_id: 10, caracteristica: 'Diâmetro', unidade: 'mm',
  valor_nominal: 9.9, desvio_inferior: -0.01, desvio_superior: 0.01, ativo: 0,
};
// NÃO colide com FOLGA: o índice do SQLite é BINARY e o servidor aceita as duas (medido na Fase
// 2). Uma comparação `toLowerCase()` na tela barraria o que o servidor aceita.
const FOLGA_MAIUSCULA_INATIVA = {
  id: 5, material_id: 10, caracteristica: 'FOLGA', unidade: 'mm',
  valor_nominal: 2.5, desvio_inferior: -0.5, desvio_superior: 0.5, ativo: 0,
};

let container;
let root;
let planoDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  planoDoBanco = [DIAMETRO, FOLGA, RUGOSIDADE_INATIVA];
  // PARAMS-AWARE de propósito (Global Constraint 8): filtra por material E por `todos`, como a
  // rota faz (`extended.js:297`, `req.query.todos === '1'` omite o `AND ativo = 1`).
  api.get.mockImplementation((url, cfg) => {
    if (url === '/almoxarifado/planos-inspecao') {
      const doMaterial = planoDoBanco.filter((p) => p.material_id === cfg?.params?.material_id);
      const todos = String(cfg?.params?.todos) === '1';
      return Promise.resolve({ data: todos ? doMaterial : doMaterial.filter((p) => p.ativo === 1) });
    }
    return Promise.resolve({ data: [] });
  });
  // A rota devolve o registro montado à mão (sem `created_at`) — ver C2 do plano.
  api.post.mockImplementation((url, body) => Promise.resolve({
    data: { id: 99, ativo: 1, ...body },
  }));
  api.put.mockResolvedValue({ data: { success: true } });
  api.delete.mockResolvedValue({ data: { success: true } });
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
  await act(async () => { root.render(<PlanoInspecaoModal material={MATERIAL} onClose={() => {}} />); });
}

const modal = () => container.querySelector('.almox-modal');
const textoModal = () => modal()?.textContent || '';
const blocoAtivas = () => container.querySelector('[data-testid="plano-ativas"]');
const blocoInativas = () => container.querySelector('[data-testid="plano-inativas"]');
const linhasAtivas = () => [...container.querySelectorAll('[data-testid="plano-ativas"] .almox-plano-linha')];
const linhasInativas = () => [...container.querySelectorAll('[data-testid="plano-inativas"] .almox-plano-linha')];
const linhaAtiva = (id) => container.querySelector(`[data-testid="plano-linha-${id}"]`);
const linhaInativa = (id) => container.querySelector(`[data-testid="plano-inativa-${id}"]`);
const novaLinha = () => container.querySelector('[data-testid="plano-nova"]');
const campo = (raiz, nome) => raiz.querySelector(`input[data-campo="${nome}"]`);
const faixa = (raiz) => raiz.querySelector('[data-testid="faixa"]').textContent;
const toggleInativas = () => container.querySelector('[data-testid="plano-inativas-toggle"]');

const botao = (raiz, texto) => [...raiz.querySelectorAll('button')]
  .find((b) => `${b.getAttribute('title') || ''} ${b.textContent}`.includes(texto));

function preencher(elemento, valor) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

async function abrirInativas() {
  expect(toggleInativas()).not.toBeNull();
  await clicar(toggleInativas());
}

/** Preenche a linha nova de uma vez. Campos omitidos ficam em branco. */
function preencherNova(valores) {
  Object.entries(valores).forEach(([nome, valor]) => preencher(campo(novaLinha(), nome), valor));
}

describe('PlanoInspecaoModal — leitura do plano (RN-02, RN-07, RN-08)', () => {
  test('(1) abre com ?todos=1 e lista ativas e inativas SEPARADAS, cada uma com a faixa somada COM SINAL', async () => {
    await renderizar();

    // C1 com os dois params — `todos: 1` é o que traz as inativas.
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/planos-inspecao',
      { params: { material_id: 10, todos: 1 } });

    // Cabeçalho: o modal recebe o OBJETO material (C5), e mostra código, nome e unidade.
    expect(textoModal()).toContain('ALM-0010');
    expect(textoModal()).toContain('Eixo Retificado 10mm');

    // Ativas: só as duas, no bloco das ativas.
    expect(linhasAtivas()).toHaveLength(2);
    expect(campo(linhaAtiva(1), 'caracteristica').value).toBe('Folga');
    expect(campo(linhaAtiva(2), 'caracteristica').value).toBe('Diâmetro');
    // A inativa NÃO está no bloco das ativas.
    expect(blocoAtivas().textContent).not.toContain('Rugosidade');

    // Faixa: soma COM SINAL e casas decimais do plano (`toFixed`).
    expect(faixa(linhaAtiva(2))).toBe('[10.005 ; 10.021]');   // unilateral: acima do nominal
    expect(faixa(linhaAtiva(1))).toBe('[1.0 ; 1.2]');         // âncora do toFixed
    expect(faixa(linhaAtiva(1))).not.toContain('1.2000000000000002');
    expect(faixa(linhaAtiva(1))).not.toContain('1.0000000000000002');

    // Inativas: colapsadas, com contagem, e só aparecem porque o `todos: 1` foi mandado.
    expect(blocoInativas()).toBeNull();
    await abrirInativas();
    expect(linhasInativas()).toHaveLength(1);
    expect(linhaInativa(3).textContent).toContain('Rugosidade');
    expect(faixa(linhaInativa(3))).toBe('[3.0 ; 3.6]');
    expect(botao(linhaInativa(3), 'Reativar')).not.toBeUndefined();

    expect(toast.error).not.toHaveBeenCalled();
  });

  test('(10) RN-08: falha ao carregar NÃO vira "plano vazio" — estado de erro com Tentar de novo', async () => {
    api.get.mockRejectedValueOnce({ response: { data: { error: 'Material é obrigatório' } } });
    await renderizar();

    expect(textoModal()).toContain('Material é obrigatório');
    expect(toast.error).toHaveBeenCalledWith('Material é obrigatório');
    // O buraco que a Etapa 29 aprendeu no Histórico: erro exibido como lista vazia.
    expect(textoModal()).not.toContain('Nenhuma característica cadastrada');
    expect(linhasAtivas()).toHaveLength(0);
    expect(novaLinha()).toBeNull();

    // Metade positiva no mesmo teste: "Tentar de novo" recarrega de verdade.
    const tentar = botao(modal(), 'Tentar de novo');
    expect(tentar).not.toBeUndefined();
    await clicar(tentar);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(linhasAtivas()).toHaveLength(2);
    expect(textoModal()).not.toContain('Material é obrigatório');
  });
});

describe('PlanoInspecaoModal — criar característica (RN-03, RN-10)', () => {
  test('(2) nominal 0 é VÁLIDO e chega ao payload como o número 0', async () => {
    // Batimento, planeza e folga têm nominal 0; o backend checa `=== null`, não falsy. A tela não
    // pode ser mais restritiva que o servidor.
    await renderizar();
    preencherNova({
      caracteristica: 'Batimento radial', unidade: 'mm', valor_nominal: '0',
      desvio_inferior: '-0.05', desvio_superior: '0.05',
    });
    // A faixa de um nominal 0 aparece — não é "linha em branco".
    expect(faixa(novaLinha())).toBe('[-0.05 ; 0.05]');

    await clicar(botao(novaLinha(), 'Adicionar'));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/planos-inspecao', {
      material_id: 10, caracteristica: 'Batimento radial', unidade: 'mm',
      valor_nominal: 0, desvio_inferior: -0.05, desvio_superior: 0.05,
    });
    expect(api.post.mock.calls[0][1].valor_nominal).toBe(0);
    expect(toast.error).not.toHaveBeenCalled();
    // Metade positiva: a linha entrou na lista, ordenada (B de "Batimento" vem antes de D e F).
    expect(linhasAtivas()).toHaveLength(3);
    expect(campo(linhasAtivas()[0], 'caracteristica').value).toBe('Batimento radial');
  });

  test('(3) desvio em branco vai como o número 0, nunca como string vazia', async () => {
    await renderizar();
    preencherNova({ caracteristica: 'Espessura', unidade: 'mm', valor_nominal: '12.3' });
    await clicar(botao(novaLinha(), 'Adicionar'));

    const payload = api.post.mock.calls[0][1];
    expect(payload).toEqual({
      material_id: 10, caracteristica: 'Espessura', unidade: 'mm',
      valor_nominal: 12.3, desvio_inferior: 0, desvio_superior: 0,
    });
    expect(typeof payload.desvio_inferior).toBe('number');
    expect(typeof payload.desvio_superior).toBe('number');
  });

  test('(4) recusa do servidor vai LITERAL ao toast e a linha continua preenchida', async () => {
    api.post.mockRejectedValueOnce({
      response: { data: { error: 'Já existe esta característica no plano deste material' } },
    });
    await renderizar();
    preencherNova({ caracteristica: 'Diâmetro', unidade: 'mm', valor_nominal: '10', desvio_superior: '0.02' });
    await clicar(botao(novaLinha(), 'Adicionar'));

    expect(toast.error).toHaveBeenCalledWith('Já existe esta característica no plano deste material');
    expect(toast.success).not.toHaveBeenCalled();
    // Perder o que foi digitado é o jeito mais rápido de o usuário desistir do formulário.
    expect(campo(novaLinha(), 'caracteristica').value).toBe('Diâmetro');
    expect(campo(novaLinha(), 'valor_nominal').value).toBe('10');
    expect(campo(novaLinha(), 'desvio_superior').value).toBe('0.02');
    expect(linhasAtivas()).toHaveLength(2);
  });

  test('(12) RN-10: vírgula decimal é convertida antes de enviar; o que não vira número não chama a API', async () => {
    // `paraNumeroFinito` do servidor NÃO troca vírgula: `10,5` responderia "Valor nominal é
    // obrigatório" com o campo preenchido na frente do usuário — enquanto `formatarFaixa` TROCA e
    // a faixa ao lado já mostraria [10.4 ; 10.6].
    await renderizar();
    preencherNova({ caracteristica: 'Comprimento', unidade: 'mm', valor_nominal: '10,5', desvio_inferior: '-0,1', desvio_superior: '0,1' });
    expect(faixa(novaLinha())).toBe('[10.4 ; 10.6]');
    await clicar(botao(novaLinha(), 'Adicionar'));

    const payload = api.post.mock.calls[0][1];
    expect(payload.valor_nominal).toBe(10.5);
    expect(payload.desvio_inferior).toBe(-0.1);
    expect(payload.desvio_superior).toBe(0.1);

    // E o que não vira número finito é recusado pela TELA, com mensagem própria.
    preencherNova({ caracteristica: 'Altura', valor_nominal: '10,5,5' });
    await clicar(botao(novaLinha(), 'Adicionar'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      'Valor nominal inválido: "10,5,5". Use ponto ou vírgula decimal (ex.: 10,5).');
  });
});

describe('PlanoInspecaoModal — editar característica (RN-04, RN-09)', () => {
  test('(5) editar manda SÓ o campo alterado, e a faixa acompanha enquanto se digita', async () => {
    await renderizar();
    preencher(campo(linhaAtiva(1), 'valor_nominal'), '1.15');
    // D3: a faixa é aritmética de exibição e aparece na hora (o veredito, não — esse é do servidor).
    expect(faixa(linhaAtiva(1))).toBe('[1.05 ; 1.25]');

    await clicar(botao(linhaAtiva(1), 'Salvar'));

    // Preserve-when-omitted: mandar o resto seria reescrever o que ninguém tocou.
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/planos-inspecao/1', { valor_nominal: 1.15 });
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('(11) RN-09: limpar o campo de desvio envia o número 0 — nunca "" (o PUT responde 400 "Desvio inválido")', async () => {
    // O POST tem `paraNumeroFinito(...) ?? 0`; o PUT NÃO tem. Medido na Fase 2:
    // `PUT desvio_inferior: ''` → 400 "Desvio inválido". Limpar um desvio para zerá-lo é o caso
    // mais banal do formulário, e é exatamente onde a armadilha mora.
    await renderizar();
    preencher(campo(linhaAtiva(1), 'desvio_inferior'), '');
    expect(faixa(linhaAtiva(1))).toBe('[1.1 ; 1.2]');

    await clicar(botao(linhaAtiva(1), 'Salvar'));

    expect(api.put).toHaveBeenCalledWith('/almoxarifado/planos-inspecao/1', { desvio_inferior: 0 });
    const payload = api.put.mock.calls[0][1];
    expect(typeof payload.desvio_inferior).toBe('number');
    expect(payload.desvio_inferior).not.toBe('');
    expect(payload.desvio_inferior).not.toBeNull();
  });
});

describe('PlanoInspecaoModal — desativar e reativar (RN-05, RN-06)', () => {
  test('(6) desativar chama DELETE, a linha migra para inativas sem recarregar, e ja_inativo NÃO é erro', async () => {
    api.delete.mockResolvedValueOnce({ data: { success: true, ja_inativo: true } });
    await renderizar();
    expect(api.get).toHaveBeenCalledTimes(1);

    await clicar(botao(linhaAtiva(2), 'Desativar'));

    expect(api.delete).toHaveBeenCalledWith('/almoxarifado/planos-inspecao/2');
    // `{ ja_inativo: true }` vem com 200 e é idempotência, não falha.
    expect(toast.error).not.toHaveBeenCalled();
    // A linha migrou de bloco — sem recarregar a lista inteira.
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(linhasAtivas()).toHaveLength(1);
    expect(linhaAtiva(2)).toBeNull();
    await abrirInativas();
    expect(linhasInativas()).toHaveLength(2);
    expect(linhaInativa(2)).not.toBeNull();
  });

  test('(7) reativar com nome já ativo é barrado NA TELA (sem PUT); maiúsculas diferentes NÃO são conflito', async () => {
    // As duas metades no mesmo teste: "não chamou o PUT" passaria igual com o botão ausente.
    planoDoBanco = [DIAMETRO, FOLGA, DIAMETRO_INATIVO, FOLGA_MAIUSCULA_INATIVA];
    await renderizar();
    await abrirInativas();
    expect(linhasInativas()).toHaveLength(2);

    // 1. "Diâmetro" inativa contra "Diâmetro" ativa: barrado, com o nome do conflito no texto.
    await clicar(botao(linhaInativa(4), 'Reativar'));
    expect(api.put).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(
      'Já existe uma característica ativa chamada "Diâmetro". Renomeie ou desative a outra antes de reativar esta.');
    expect(linhaInativa(4)).not.toBeNull();

    // 2. "FOLGA" inativa contra "Folga" ativa: o índice do SQLite é BINARY e o servidor ACEITA as
    //    duas. Comparar com `toLowerCase()` faria a tela barrar o que o servidor aceita.
    await clicar(botao(linhaInativa(5), 'Reativar'));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/planos-inspecao/5', { ativo: 1 });
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  test('(8) reativar sem conflito manda PUT { ativo: 1 } com 1 NUMÉRICO e a linha volta para ativas', async () => {
    await renderizar();
    await abrirInativas();
    await clicar(botao(linhaInativa(3), 'Reativar'));

    expect(api.put).toHaveBeenCalledWith('/almoxarifado/planos-inspecao/3', { ativo: 1 });
    // `'0'` string reativaria também (`req.body.ativo ? 1 : 0`), mas `ativo: '0'` é exatamente o
    // tipo de valor que um formulário produz sem querer — o número é o contrato.
    expect(typeof api.put.mock.calls[0][1].ativo).toBe('number');
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(linhasAtivas()).toHaveLength(3);
    expect(linhaAtiva(3)).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('(9) se a corrida acontecer, o 400 do servidor na reativação aparece LITERAL e a linha fica inativa', async () => {
    api.put.mockRejectedValueOnce({
      response: { data: { error: 'Já existe esta característica no plano deste material' } },
    });
    await renderizar();
    await abrirInativas();
    await clicar(botao(linhaInativa(3), 'Reativar'));

    expect(api.put).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('Já existe esta característica no plano deste material');
    expect(toast.success).not.toHaveBeenCalled();
    expect(linhaAtiva(3)).toBeNull();
    expect(linhaInativa(3)).not.toBeNull();
  });
});
