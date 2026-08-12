/**
 * Etapa 8b, Task 9 — tela "Remessas a Terceiros".
 *
 * O alvo aqui e o que SO a tela pode errar: rotular errado o que voltou, esconder (ou oferecer) a
 * acao errada para o status, e engolir a mensagem do backend. O ciclo em si ja tem teste de
 * servico e de rota no servidor.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RemessasTerceiros --watchAll=false
 */
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RemessasTerceirosAlmoxarifado from './RemessasTerceirosAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { gerarRemessaPDF } from '../../utils/remessaPdf';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// O PDF e testado como funcao pura em utils/remessaPdf.test.js — aqui so importa que a tela mande
// os dados que carregou, nao os bytes que saem.
jest.mock('../../utils/remessaPdf', () => ({
  __esModule: true, gerarRemessaPDF: jest.fn(), montarRemessaPDF: jest.fn(),
}));
// Permissoes liberadas: o gate real e do servidor (requirePermission), testado la.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const LISTA = [
  { id: 1, numero: 'REM-1', fornecedor_nome: 'Galvanizadora Sul', tipo_servico: 'Galvanizacao',
    status: 'ENVIADA', prazo_previsto: '2020-01-01', vencida: 1, itens_total: 2,
    proprietario_cliente_id: null, proprietario_cliente_nome: null },
  { id: 2, numero: 'REM-2', fornecedor_nome: 'Usinagem Norte', tipo_servico: 'Usinagem',
    status: 'ABERTA', prazo_previsto: '2099-01-01', vencida: 0, itens_total: 1,
    proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Chapa LTDA' },
  { id: 3, numero: 'REM-3', fornecedor_nome: 'Pintura Leste', tipo_servico: 'Pintura',
    status: 'ENCERRADA', prazo_previsto: '2026-01-01', vencida: 0, itens_total: 1,
    proprietario_cliente_id: null, proprietario_cliente_nome: null },
  { id: 4, numero: 'REM-4', fornecedor_nome: 'Corte Oeste', tipo_servico: 'Corte',
    status: 'ENVIADA', prazo_previsto: '2099-06-01', vencida: 0, itens_total: 1,
    proprietario_cliente_id: null, proprietario_cliente_nome: null },
];

const DETALHE_1 = {
  ...LISTA[0],
  itens: [
    { id: 11, material_id: 101, material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', unidade: 'PC',
      quantidade: 30, quantidade_retornada: 10, pendente: 20, peso: 240 },
  ],
  retornos: [{ id: 5, item_remessa_id: 11, material_codigo: 'CHP-3MM', quantidade: 10, nota_fiscal: 'NF-1' }],
};

// Encerrada por PERDA: o servico grava `quantidade_retornada = quantidade` para zerar a pendencia,
// mas NADA voltou (retornos vazio). E a armadilha que a Task 7 deixou nomeada para esta tela.
const DETALHE_3 = {
  ...LISTA[2],
  encerramento_destino: 'PERDA_NO_TERCEIRO',
  encerramento_justificativa: 'sumiu no banho de zinco',
  itens: [
    { id: 31, material_id: 101, material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', unidade: 'PC',
      quantidade: 30, quantidade_retornada: 30, pendente: 0, peso: 240 },
  ],
  retornos: [],
};

// Lista desatualizada: o retorno total ja encerrou a remessa no servidor, mas a linha em memoria
// ainda diz ENVIADA. O detalhe (recem-carregado) nao tem pendencia nenhuma.
const DETALHE_4 = {
  ...LISTA[3],
  itens: [
    { id: 41, material_id: 102, material_codigo: 'TUB-2', material_nome: 'Tubo 2"', unidade: 'M',
      quantidade: 12, quantidade_retornada: 12, pendente: 0, peso: null },
  ],
  retornos: [{ id: 9, item_remessa_id: 41, material_codigo: 'TUB-2', quantidade: 12, nota_fiscal: 'NF-9' }],
};

const MATERIAIS = [
  { id: 101, codigo: 'CHP-3MM', nome: 'Chapa 3mm', unidade: 'PC', proprietario_cliente_id: null },
  { id: 102, codigo: 'TUB-2', nome: 'Tubo 2"', unidade: 'M', proprietario_cliente_id: null },
  { id: 201, codigo: 'CHP-CLI', nome: 'Chapa do cliente', unidade: 'PC',
    proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Chapa LTDA' },
];
const FORNECEDORES = [{ id: 3, razao_social: 'Galvanizadora Sul LTDA', cnpj: '00.000.000/0001-00' }];

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url.startsWith('/almoxarifado/remessas-terceiros/1')) return Promise.resolve({ data: DETALHE_1 });
    if (url.startsWith('/almoxarifado/remessas-terceiros/3')) return Promise.resolve({ data: DETALHE_3 });
    if (url.startsWith('/almoxarifado/remessas-terceiros/4')) return Promise.resolve({ data: DETALHE_4 });
    if (url.startsWith('/almoxarifado/remessas-terceiros')) return Promise.resolve({ data: LISTA });
    if (url.startsWith('/almoxarifado/materiais')) return Promise.resolve({ data: MATERIAIS });
    if (url.startsWith('/almoxarifado/recebimentos-aux/fornecedores')) return Promise.resolve({ data: FORNECEDORES });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  api.put.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter><RemessasTerceirosAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
/** So as linhas da LISTA — o detalhe e o modal tambem usam `.almox-table`. */
const linhas = () => [...container.querySelectorAll('.almox-remessa-lista tbody tr')];
const linhaDe = (numero) => linhas().find((tr) => tr.textContent.includes(numero));
const linhasDetalhe = () => [...container.querySelectorAll('.almox-remessa-detalhe tbody tr')];
const celula = (tr, col) => tr.querySelector(`[data-col="${col}"]`);
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
// O prototipo tem de casar com a TAG: chamar o setter de HTMLInputElement num <textarea> estoura
// com "'set value' called on an object that is not a valid instance of HTMLInputElement" — e
// justificativa e motivo sao textarea.
const PROTOTIPO = {
  SELECT: () => window.HTMLSelectElement.prototype,
  TEXTAREA: () => window.HTMLTextAreaElement.prototype,
};
function preencher(el, valor) {
  const proto = (PROTOTIPO[el.tagName] || (() => window.HTMLInputElement.prototype))();
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const campo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo))
  ?.querySelector('input, textarea, select');

describe('RemessasTerceirosAlmoxarifado', () => {
  test('lista as remessas com numero, terceiro e status', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(LISTA.length);
    expect(texto()).toContain('REM-1');
    expect(texto()).toContain('Galvanizadora Sul');
    expect(texto()).toContain('Usinagem Norte');
  });

  test('remessa vencida ganha destaque e a que esta no prazo NAO ganha', async () => {
    // Controle positivo bilateral: destacar todas viraria ruido e o operador pararia de olhar.
    await renderizar();
    expect(linhaDe('REM-1').querySelector('.almox-badge-vencida')).toBeTruthy();
    expect(linhaDe('REM-2').querySelector('.almox-badge-vencida')).toBeNull();
  });

  test('o badge de status usa uma classe que EXISTE no CSS do modulo', async () => {
    // Classe inventada sai sem cor nenhuma e nenhum teste de comportamento pega — aconteceu na
    // Etapa 7. Este teste ve o DOM; o teste do arquivo CSS, mais abaixo, ve a regra.
    await renderizar();
    const badge = linhaDe('REM-1').querySelector('.almox-badge-enviada');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toContain('ENVIADA');
  });

  test('as CINCO classes de status (mais a de vencida) existem no Almoxarifado.css, com cor', () => {
    // O unico teste da suite que olha estilo. JSDOM nao valida CSS: sem ler o arquivo, apagar as
    // regras nao derruba teste nenhum e o selo vai para producao sem fundo nem cor.
    const css = fs.readFileSync(path.join(__dirname, 'Almoxarifado.css'), 'utf8');
    for (const cls of ['aberta', 'enviada', 'retorno_parcial', 'encerrada', 'cancelada', 'vencida']) {
      const regra = css.match(new RegExp(`\\.almox-badge-${cls}\\s*\\{[^}]*\\}`));
      if (!regra) throw new Error(`falta a regra .almox-badge-${cls} em Almoxarifado.css`);
      expect(regra[0]).toMatch(/color\s*:/);
      expect(regra[0]).toMatch(/background\s*:/);
    }
  });

  test('o selo de propriedade nomeia o cliente so na remessa que e de cliente', async () => {
    await renderizar();
    expect(linhaDe('REM-2').querySelector('.almox-badge-cliente').textContent).toContain('Cliente Chapa LTDA');
    expect(linhaDe('REM-1').querySelector('.almox-badge-cliente')).toBeNull();
  });

  test('abrir a remessa carrega os itens e mostra o pendente', async () => {
    await renderizar();
    await clicar(botao('Abrir', linhaDe('REM-1')));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/1');
    expect(texto()).toContain('CHP-3MM');
    expect(texto()).toContain('NF-1');
  });

  test('as acoes seguem o status: ABERTA envia, ENVIADA recebe retorno, ENCERRADA nao age', async () => {
    await renderizar();
    const enviada = linhaDe('REM-1');
    const aberta = linhaDe('REM-2');
    const encerrada = linhaDe('REM-3');
    expect(botao('Enviar', aberta)).toBeTruthy();
    expect(botao('Enviar', enviada)).toBeFalsy();
    expect(botao('Retorno', enviada)).toBeTruthy();
    expect(botao('Retorno', aberta)).toBeFalsy();
    expect(botao('Encerrar', encerrada)).toBeFalsy();
    expect(botao('Cancelar', encerrada)).toBeFalsy();
  });

  test('enviar chama a rota certa e recarrega a lista', async () => {
    await renderizar();
    const antes = api.get.mock.calls.length;
    await clicar(botao('Enviar', linhaDe('REM-2')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/2/enviar', {});
    expect(api.get.mock.calls.length).toBeGreaterThan(antes);
  });

  test('encerrar com pendencia exige destino E justificativa antes de chamar o servidor', async () => {
    await renderizar();
    await clicar(botao('Encerrar', linhaDe('REM-1')));
    await clicar(botao('Confirmar encerramento'));
    expect(api.put).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test('encerrar com destino e justificativa manda os dois campos', async () => {
    await renderizar();
    await clicar(botao('Encerrar', linhaDe('REM-1')));
    preencher(campo('Destino'), 'PERDA_NO_TERCEIRO');
    preencher(campo('Justificativa'), 'perdida no banho de zinco');
    await clicar(botao('Confirmar encerramento'));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/1/encerrar', {
      destino: 'PERDA_NO_TERCEIRO', justificativa: 'perdida no banho de zinco',
    });
  });

  test('[CONTROLE POSITIVO] remessa SEM pendencia encerra sem destino nenhum', async () => {
    // A outra metade da exigencia: cobrar destino sempre obrigaria o operador a inventar uma perda
    // que nao houve — e passaria em todos os testes de recusa acima.
    await renderizar();
    await clicar(botao('Abrir', linhaDe('REM-4')));
    await clicar(botao('Encerrar', linhaDe('REM-4')));
    await clicar(botao('Confirmar encerramento'));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/4/encerrar', {});
  });

  test('o erro do servidor aparece para o operador, com a mensagem do backend', async () => {
    // O backend nomeia a quantidade pendente; engolir isso num "erro ao encerrar" generico apagaria
    // justamente o numero que o operador precisa.
    api.put.mockRejectedValueOnce({ response: { data: { error: 'A remessa REM-1 tem 20 PC que nunca voltaram' } } });
    await renderizar();
    await clicar(botao('Encerrar', linhaDe('REM-1')));
    preencher(campo('Destino'), 'PERDA_NO_TERCEIRO');
    preencher(campo('Justificativa'), 'x');
    await clicar(botao('Confirmar encerramento'));
    expect(toast.error).toHaveBeenCalledWith('A remessa REM-1 tem 20 PC que nunca voltaram');
  });

  test('cancelar exige motivo e manda o motivo digitado', async () => {
    await renderizar();
    await clicar(botao('Cancelar', linhaDe('REM-1')));
    await clicar(botao('Confirmar cancelamento'));
    expect(api.put).not.toHaveBeenCalled();
    preencher(campo('Motivo'), 'terceiro recusou a carga');
    await clicar(botao('Confirmar cancelamento'));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/1/cancelar',
      { motivo: 'terceiro recusou a carga' });
  });

  test('o retorno manda o item e a quantidade recebidos', async () => {
    await renderizar();
    await clicar(botao('Retorno', linhaDe('REM-1')));
    preencher(campo('Item retornado'), '11');
    preencher(campo('Quantidade'), '5');
    preencher(campo('Nota fiscal'), 'NF-7');
    await clicar(botao('Confirmar retorno'));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/remessas-terceiros/1/retornos', {
      nota_fiscal: 'NF-7', itens: [{ item_remessa_id: 11, quantidade: 5 }],
    });
  });

  test('o PDF recebe a remessa aberta com os itens carregados', async () => {
    await renderizar();
    await clicar(botao('Abrir', linhaDe('REM-1')));
    await clicar(botao('PDF da remessa'));
    expect(gerarRemessaPDF).toHaveBeenCalled();
    const dados = gerarRemessaPDF.mock.calls[0][0];
    expect(dados.remessa.numero).toBe('REM-1');
    expect(dados.itens).toHaveLength(1);
    expect(dados.geradoEm).toBeTruthy();
  });

  test('lista vazia mostra estado vazio, nao tabela em branco', async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: [] }));
    await renderizar();
    expect(linhas()).toHaveLength(0);
    expect(texto()).toMatch(/nenhuma remessa/i);
  });

  test('falha ao carregar avisa por toast', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('boom')));
    await renderizar();
    expect(toast.error).toHaveBeenCalled();
  });

  // ── O que voltou x o que foi baixado ──────────────────────────────────────────────────────────
  // Encerrar com destino grava `quantidade_retornada = quantidade` para zerar a pendencia
  // (thirdPartyService.encerrarRemessa). Ali isso quer dizer LIQUIDADO, nao "voltou": um item
  // perdido no terceiro fica com pendente zero SEM ter retornado nada. A verdade do que voltou esta
  // em retornos_remessa_item_almoxarifado, e o destino, no cabecalho.

  test('item LIQUIDADO por perda nao aparece como retornado — aparece como baixa, com o destino', async () => {
    await renderizar();
    await clicar(botao('Abrir', linhaDe('REM-3')));
    const linha = linhasDetalhe()[0];
    expect(celula(linha, 'retornado').textContent.trim()).toBe('0');
    expect(celula(linha, 'baixado').textContent).toContain('30');
    expect(texto().toLowerCase()).toContain('perda no terceiro');
  });

  test('[CONTROLE POSITIVO] item que voltou DE VERDADE aparece como retornado, e sem baixa', async () => {
    // A metade que falta: uma tela que chamasse tudo de "baixado" passaria no teste acima e
    // esconderia o material que realmente voltou para a prateleira.
    await renderizar();
    await clicar(botao('Abrir', linhaDe('REM-1')));
    const linha = linhasDetalhe()[0];
    expect(celula(linha, 'retornado').textContent.trim()).toBe('10');
    expect(celula(linha, 'baixado').textContent.trim()).toBe('—');
  });

  // ── Criar a remessa ───────────────────────────────────────────────────────────────────────────

  test('criar remessa manda terceiro, prazo e itens', async () => {
    await renderizar();
    await clicar(botao('Nova remessa'));
    preencher(campo('Nome do terceiro'), 'Galvanizadora Sul LTDA');
    preencher(campo('Tipo de serviço'), 'Galvanizacao');
    preencher(campo('Prazo previsto'), '2026-09-30');
    preencher(campo('Material'), '101');
    preencher(campo('Quantidade do item'), '30');
    await clicar(botao('Adicionar item'));
    await clicar(botao('Criar remessa'));
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/almoxarifado/remessas-terceiros');
    expect(body.fornecedor_nome).toBe('Galvanizadora Sul LTDA');
    expect(body.tipo_servico).toBe('Galvanizacao');
    expect(body.prazo_previsto).toBe('2026-09-30');
    expect(body.itens).toEqual([{ material_id: 101, quantidade: 30 }]);
  });

  test('criar remessa sem item nenhum nao chama o servidor', async () => {
    await renderizar();
    await clicar(botao('Nova remessa'));
    preencher(campo('Nome do terceiro'), 'Galvanizadora Sul LTDA');
    await clicar(botao('Criar remessa'));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test('a tela recusa juntar donos diferentes, mas aceita dois materiais do MESMO dono', async () => {
    // Controle bilateral: o servidor recusa a mistura (resolverProprietario) porque o documento
    // nomeia UM proprietario. Uma tela que recusasse o segundo item sempre passaria na metade da
    // recusa e impediria a remessa normal de duas chapas nossas.
    await renderizar();
    await clicar(botao('Nova remessa'));
    preencher(campo('Material'), '101');
    preencher(campo('Quantidade do item'), '10');
    await clicar(botao('Adicionar item'));
    preencher(campo('Material'), '102');
    preencher(campo('Quantidade do item'), '5');
    await clicar(botao('Adicionar item'));
    expect(container.querySelectorAll('.almox-remessa-novos-itens tbody tr')).toHaveLength(2);

    preencher(campo('Material'), '201');
    preencher(campo('Quantidade do item'), '1');
    await clicar(botao('Adicionar item'));
    expect(container.querySelectorAll('.almox-remessa-novos-itens tbody tr')).toHaveLength(2);
    expect(toast.error).toHaveBeenCalled();
  });
});
