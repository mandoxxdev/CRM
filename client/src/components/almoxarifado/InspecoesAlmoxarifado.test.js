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
import { toast } from 'react-toastify';

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

// Plano de inspeção (Etapa 27) do material 10. Os desvios são COM SINAL: o primeiro é
// unilateral (+0.005/+0.021 — a faixa inteira fica ACIMA do nominal) justamente para pegar a
// conta errada `nominal − |inf|`; o segundo é o ±0.1 comum.
const PLANO_DIAMETRO = {
  id: 1, material_id: 10, caracteristica: 'Diâmetro', unidade: 'mm',
  valor_nominal: 10, desvio_inferior: 0.005, desvio_superior: 0.021, ativo: 1,
};
const PLANO_ESPESSURA = {
  id: 2, material_id: 10, caracteristica: 'Espessura', unidade: 'mm',
  valor_nominal: 12.3, desvio_inferior: -0.1, desvio_superior: 0.1, ativo: 1,
};

// `calibracao_vigente`: true (vigente), false (vencida — o servidor recusa) e null (não exige).
const FERRAMENTAS = [
  { id: 1, nome: 'Paquímetro', codigo_patrimonio: 'PAQ-1', exige_calibracao: 1, calibracao_vigente: true },
  { id: 2, nome: 'Micrômetro', codigo_patrimonio: 'MIC-2', exige_calibracao: 1, calibracao_vigente: false },
  { id: 3, nome: 'Régua', codigo_patrimonio: 'REG-3', exige_calibracao: 0, calibracao_vigente: null },
];

// Etapa 29, Task 3b — uma inspeção decidida no shape C1, para a aba Histórico. Material
// DIFERENTE do pendente de propósito: a asserção "a tabela de pendentes sumiu" procura o
// recebimento REC-55, e se o histórico tivesse o mesmo texto a sabotagem "renderizar junto"
// passaria despercebida.
const HISTORICO = [{
  id: 7, recebimento_numero: 'REC-2026-055', nota_fiscal: 'NF-777',
  material_codigo: 'ALM-0010', material_nome: 'Eixo Retificado 10mm', material_unidade: 'PC',
  quantidade_aprovada: 8, quantidade_reprovada: 2, conforme: 0,
  divergencia_quantidade: 0, divergencia_dimensional: 1, certificado_ausente: 0,
  dano_fisico: 0, material_incorreto: 0, encaminhamento: 'DEVOLVER',
  observacoes: 'Diametro fora', responsavel_nome: 'Carlos Lima',
  data_inspecao: '2026-08-28T14:30:00Z', medidas_total: 2, medidas_nao_conformes: 1,
}];

let container;
let root;
let pendentesDoBanco;
let planoDoBanco;
let ferramentasDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pendentesDoBanco = [PENDENTE];
  planoDoBanco = [];
  ferramentasDoBanco = FERRAMENTAS;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/inspecoes/pendentes') return Promise.resolve({ data: pendentesDoBanco });
    if (url === '/almoxarifado/estoque') {
      return Promise.resolve({
        data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_bloqueada: 0 }],
      });
    }
    if (url === '/almoxarifado/planos-inspecao') return Promise.resolve({ data: planoDoBanco });
    if (url === '/almoxarifado/ferramentas') return Promise.resolve({ data: ferramentasDoBanco });
    if (url === '/almoxarifado/inspecoes/historico') return Promise.resolve({ data: HISTORICO });
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

/*
 * Etapa 29 — medidas do plano dentro do modal de decisão (C3, RN-01..04, RN-07, RN-08).
 *
 * O que estes testes protegem, na ordem do plano:
 * - sem plano cadastrado, o modal é IDÊNTICO ao de sempre (compromisso da Etapa 27);
 * - a faixa exibida soma o desvio COM SINAL — `nominal − |inf|` erraria o plano unilateral;
 * - B60 à risca: com medida preenchida a caixa "Divergência dimensional" é do servidor
 *   (desabilitada E desmarcada), e o payload não leva a flag manual;
 * - o valor medido vai como STRING CRUA ('12,4' continua '12,4' — parseFloat faria 12 em silêncio).
 */
describe('InspecoesAlmoxarifado — medidas do plano de inspeção (Etapa 29)', () => {
  const textoModal = () => container.querySelector('.almox-modal')?.textContent || '';
  const linhasMedida = () => [...container.querySelectorAll('.almox-modal .almox-medida-linha')];
  const inputMedida = (i) => linhasMedida()[i].querySelector('input');
  const selectInstrumento = (i) => linhasMedida()[i].querySelector('select');
  const checkboxFlag = (rotulo) => [...container.querySelectorAll('.almox-modal input[type="checkbox"]')]
    .find((c) => c.closest('label')?.textContent.includes(rotulo));
  const chamadasGet = (url) => api.get.mock.calls.filter(([u]) => u === url);
  const payloadEnviado = () => api.post.mock.calls[0][1];

  const clicar = async (el) => {
    await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  };

  test('(1) sem plano cadastrado o modal é idêntico ao de hoje e não busca ferramentas', async () => {
    planoDoBanco = [];
    await renderizar();
    await abrirDecisao(0);
    expect(chamadasGet('/almoxarifado/planos-inspecao')[0][1]).toEqual({ params: { material_id: 10 } });
    expect(textoModal()).not.toContain('Medidas do plano');
    expect(linhasMedida()).toHaveLength(0);
    expect(chamadasGet('/almoxarifado/ferramentas')).toHaveLength(0);
    // O resto do modal continua lá, como sempre.
    expect(campoPorLabel('Quantidade aprovada').value).toBe('100');
    expect(checkboxFlag('Divergência dimensional').disabled).toBe(false);
  });

  test('(2) com plano, um campo por característica com a faixa somada COM SINAL', async () => {
    planoDoBanco = [PLANO_DIAMETRO, PLANO_ESPESSURA];
    await renderizar();
    await abrirDecisao(0);
    expect(textoModal()).toContain('Medidas do plano');
    expect(linhasMedida()).toHaveLength(2);
    const rotulos = linhasMedida().map((l) => l.querySelector('label').textContent);
    // Unilateral: a faixa inteira fica ACIMA do nominal. `nominal − |inf|` daria 9.995 aqui.
    expect(rotulos[0]).toContain('Diâmetro (mm)');
    expect(rotulos[0]).toContain('nominal 10');
    expect(rotulos[0]).toContain('[10.005 ; 10.021]');
    // Simétrico, formatado pelas casas do plano (1 casa), sem lixo de ponto flutuante.
    expect(rotulos[1]).toContain('Espessura (mm)');
    expect(rotulos[1]).toContain('[12.2 ; 12.4]');
    // Entrada de texto com teclado decimal, não `type="number"` (achado 7).
    expect(inputMedida(0).getAttribute('type')).toBe('text');
    expect(inputMedida(0).getAttribute('inputmode')).toBe('decimal');
    expect(inputMedida(0).getAttribute('placeholder')).toBe('ex.: 12.40 (ponto decimal)');
    // Ferramentas só são buscadas porque há plano.
    expect(chamadasGet('/almoxarifado/ferramentas')).toHaveLength(1);
    expect(selectInstrumento(0).options[0].textContent).toBe('— sem instrumento —');
    // Texto de ajuda fixo (achado 8).
    expect(textoModal()).toContain('Com medidas preenchidas, a divergência dimensional é calculada só pelas características do plano. Divergência em algo que o plano não mede vai em Observações.');
  });

  test('(3) B60: medida preenchida desabilita E desmarca a divergência dimensional, o payload leva a string crua, e limpar devolve a caixa', async () => {
    planoDoBanco = [PLANO_ESPESSURA];
    // O servidor recusa: o modal fica aberto com os valores (RN-03) e dá para seguir mexendo.
    api.post.mockRejectedValue({ response: { data: { error: 'recusado pelo teste' } } });
    await renderizar();
    await abrirDecisao(0);

    // 1. Inspetor marca a caixa na mão...
    await clicar(checkboxFlag('Divergência dimensional'));
    expect(checkboxFlag('Divergência dimensional').checked).toBe(true);

    // 2. ...e preenche uma medida (com vírgula, de propósito: vai como está).
    preencher(inputMedida(0), '12,4');

    // 3. A caixa passa a ser do servidor: desabilitada E desmarcada, com o porquê ao lado.
    const caixa = checkboxFlag('Divergência dimensional');
    expect(caixa.disabled).toBe(true);
    expect(caixa.checked).toBe(false);
    expect(textoModal()).toContain('Derivada das medidas ao salvar — fora da tolerância liga sozinha');

    // 4. Salvar: a flag manual NÃO vai, e o valor vai como STRING CRUA.
    await clicarBotaoModal('Salvar');
    expect(api.post).toHaveBeenCalledWith(
      '/almoxarifado/recebimentos/itens/1/inspecionar',
      expect.not.objectContaining({ divergencia_dimensional: true }));
    const payload = payloadEnviado();
    expect(payload.medidas).toHaveLength(1);
    expect(payload.medidas[0].plano_id).toBe(2);
    expect(payload.medidas[0].valor_medido).toBe('12,4');
    expect(typeof payload.medidas[0].valor_medido).toBe('string');
    expect(container.querySelector('.almox-modal')).not.toBeNull();

    // 5. Limpar a medida devolve a caixa ao que era: habilitada e MARCADA de novo.
    preencher(inputMedida(0), '');
    const caixaDepois = checkboxFlag('Divergência dimensional');
    expect(caixaDepois.disabled).toBe(false);
    expect(caixaDepois.checked).toBe(true);
    expect(textoModal()).not.toContain('Derivada das medidas ao salvar');
  });

  test('(4) linha sem valor não entra: payload SEM a chave medidas, mesmo com instrumento escolhido', async () => {
    planoDoBanco = [PLANO_DIAMETRO, PLANO_ESPESSURA];
    await renderizar();
    await abrirDecisao(0);
    // Instrumento sem valor é ignorado (D3) — e só espaço não é valor.
    preencher(selectInstrumento(0), '1');
    preencher(inputMedida(1), '   ');
    // Sem medida de verdade, a caixa continua manual.
    expect(checkboxFlag('Divergência dimensional').disabled).toBe(false);
    await clicarBotaoModal('Salvar');
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(Object.prototype.hasOwnProperty.call(payloadEnviado(), 'medidas')).toBe(false);
  });

  test('(5) instrumento com calibração vencida aparece rotulado e desabilitado; sem exigência aparece normal', async () => {
    planoDoBanco = [PLANO_DIAMETRO];
    await renderizar();
    await abrirDecisao(0);
    const opcoes = [...selectInstrumento(0).options];
    const porValor = (v) => opcoes.find((o) => o.value === v);
    expect(porValor('2').textContent).toContain('(calibração vencida)');
    expect(porValor('2').disabled).toBe(true);
    expect(porValor('1').textContent).not.toContain('(calibração vencida)');
    expect(porValor('1').disabled).toBe(false);
    expect(porValor('3').textContent).not.toContain('(calibração vencida)');
    expect(porValor('3').disabled).toBe(false);
    // Instrumento escolhido acompanha a medida no payload.
    preencher(inputMedida(0), '10.01');
    preencher(selectInstrumento(0), '1');
    await clicarBotaoModal('Salvar');
    expect(payloadEnviado().medidas[0]).toEqual({ plano_id: 1, valor_medido: '10.01', ferramenta_id: 1 });
  });

  test('(6) recusa do servidor vai literal ao toast e o modal continua aberto com os valores', async () => {
    planoDoBanco = [PLANO_DIAMETRO];
    api.post.mockRejectedValue({
      response: { data: { error: 'Ferramenta com calibração vencida ou sem calibração registrada (Micrômetro)' } },
    });
    await renderizar();
    await abrirDecisao(0);
    preencher(inputMedida(0), '10.03');
    await clicarBotaoModal('Salvar');
    expect(toast.error).toHaveBeenCalledWith('Ferramenta com calibração vencida ou sem calibração registrada (Micrômetro)');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).not.toBeNull();
    expect(inputMedida(0).value).toBe('10.03');
  });

  test('(7) o toast de sucesso diz o resultado do servidor quando houve medidas', async () => {
    planoDoBanco = [PLANO_DIAMETRO, PLANO_ESPESSURA];
    api.post.mockResolvedValue({ data: { divergencia_dimensional: 1, medidas_registradas: 2 } });
    await renderizar();
    await abrirDecisao(0);
    preencher(inputMedida(0), '10.03');
    preencher(inputMedida(1), '12.5');
    await clicarBotaoModal('Salvar');
    expect(toast.success).toHaveBeenCalledWith('Inspeção registrada! Divergência dimensional: sim (2 medidas)');
  });

  test('(7b) sem medidas registradas na resposta, o toast é o de sempre', async () => {
    planoDoBanco = [PLANO_DIAMETRO];
    await renderizar();
    await abrirDecisao(0);
    // Mock padrão: `{ success: true }`, sem `medidas_registradas` (achado 6).
    await clicarBotaoModal('Salvar');
    expect(toast.success).toHaveBeenCalledWith('Inspeção registrada!');
  });

  test('(8) falha ao carregar o plano avisa (toast.warn) e abre o modal sem o bloco — não vira "sem plano" em silêncio', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/inspecoes/pendentes') return Promise.resolve({ data: pendentesDoBanco });
      if (url === '/almoxarifado/planos-inspecao') return Promise.reject(new Error('rede'));
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await abrirDecisao(0);
    expect(toast.warn).toHaveBeenCalledWith('Não foi possível carregar o plano de inspeção');
    expect(container.querySelector('.almox-modal')).not.toBeNull();
    expect(textoModal()).not.toContain('Medidas do plano');
    expect(chamadasGet('/almoxarifado/ferramentas')).toHaveLength(0);
  });
});

/*
 * Etapa 29, Task 3b — abas Pendentes / Histórico (C4).
 *
 * A aba Histórico renderiza `HistoricoInspecoes` NO LUGAR da tabela de pendentes, nunca junto:
 * os helpers acima (`linhas()`, `campoPorLabel`) selecionam `.almox-table tbody tr` e
 * `.almox-modal .almox-field` sem discriminar, e duas tabelas na tela quebrariam o índice das
 * linhas. O conteúdo do histórico em si (expandir, faixa, contagem) é coberto em
 * HistoricoInspecoes.test.js — aqui só a troca de aba e o filtro de material chegando lá.
 */
describe('InspecoesAlmoxarifado — abas Pendentes / Histórico (Etapa 29)', () => {
  const botaoAba = (texto) => [...container.querySelectorAll('.almox-abas button')]
    .find((b) => b.textContent.trim() === texto);
  const clicarAba = async (texto) => {
    await act(async () => { botaoAba(texto).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };
  const chamadasHistorico = () => api.get.mock.calls.filter(([u]) => u === '/almoxarifado/inspecoes/historico');
  const linhasPendentes = () => linhas().filter((tr) => tr.textContent.includes('REC-55'));
  const botoesDecidir = () => [...container.querySelectorAll('.almox-btn-icon')]
    .filter((b) => b.getAttribute('title')?.includes('Decidir'));
  const linhaHistorico = () => container.querySelector('[data-testid="historico-linha-7"]');
  const selectMaterial = () => container.querySelector('.almox-filters .almox-select');

  test('(1) por padrão a aba Pendentes está ativa, a fila aparece e o histórico NÃO é buscado', async () => {
    await renderizar();
    expect(botaoAba('Pendentes').className).toBe('btn-almox-primary');
    expect(botaoAba('Histórico').className).toBe('btn-almox-secondary');
    expect(linhasPendentes()).toHaveLength(1);
    expect(linhaHistorico()).toBeNull();
    // Abrir a tela não pode custar a consulta do histórico que ninguém pediu.
    expect(chamadasHistorico()).toHaveLength(0);
  });

  test('(2) Histórico esconde a tabela de pendentes (no lugar, não junto) e busca o histórico', async () => {
    await renderizar();
    await clicarAba('Histórico');
    expect(botaoAba('Histórico').className).toBe('btn-almox-primary');
    expect(botaoAba('Pendentes').className).toBe('btn-almox-secondary');
    expect(chamadasHistorico()).toHaveLength(1);
    expect(linhaHistorico()).not.toBeNull();
    expect(linhaHistorico().textContent).toContain('Eixo Retificado 10mm');
    // A fila de pendentes sumiu de verdade: nem a linha do REC-55 nem o botão "Decidir".
    expect(linhasPendentes()).toHaveLength(0);
    expect(botoesDecidir()).toHaveLength(0);
    // O filtro de material da tela-mãe continua visível e alimenta as duas abas.
    expect(selectMaterial()).not.toBeNull();
    // Os botões de bloqueio avulso continuam onde estavam.
    expect([...container.querySelectorAll('.almox-header-actions button')].map((b) => b.textContent.trim()))
      .toEqual(expect.arrayContaining(['Bloquear Material', 'Desbloquear Material']));
  });

  test('(3) o material selecionado na tela-mãe chega ao histórico como material_id', async () => {
    await renderizar();
    preencher(selectMaterial(), '10');
    await clicarAba('Histórico');
    expect(chamadasHistorico()).toHaveLength(1);
    expect(chamadasHistorico()[0][1]).toEqual({ params: { material_id: '10' } });
    // Trocar o filtro com a aba aberta refaz a consulta com o novo valor (aqui: todos).
    preencher(selectMaterial(), '');
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(chamadasHistorico()).toHaveLength(2);
    expect(chamadasHistorico()[1][1]).toEqual({ params: {} });
  });

  test('(4) voltar para Pendentes mostra a fila de novo e some com o histórico', async () => {
    await renderizar();
    await clicarAba('Histórico');
    expect(linhasPendentes()).toHaveLength(0);
    await clicarAba('Pendentes');
    expect(botaoAba('Pendentes').className).toBe('btn-almox-primary');
    expect(linhasPendentes()).toHaveLength(1);
    expect(botoesDecidir()).toHaveLength(1);
    expect(linhaHistorico()).toBeNull();
    // E o modal de decisão continua funcionando depois da ida e volta.
    await abrirDecisao(0);
    expect(campoPorLabel('Quantidade aprovada').value).toBe('100');
  });
});
