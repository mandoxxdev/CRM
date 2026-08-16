/**
 * Etapa 9, Task 8 — tela "Sobras e Retalhos".
 *
 * O alvo aqui e o que SO a tela pode errar: o payload de POST /sobras/gerar-retalho (os dois modos
 * do design, decisao 2 — `baixar_original` sem default, os campos de vinculo aparecendo/sumindo
 * junto com o checkbox), e o atalho de criar o material do retalho herdando familia/dono/categoria
 * do material de origem. O motor (compensacao, guarda de dono, guarda de serie) ja tem teste de
 * servico e de rota no servidor (retalhoGeracao.api.test.js, sobras.api.test.js).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/Sobras --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SobrasAlmoxarifado from './SobrasAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// Permissoes: por padrao tudo liberado. Etapa 9, Task 9: os testes de visibilidade dos botoes de
// aprovar/rejeitar/destino (que dependem de `pode()`) trocam `mockPode` em runtime — mesmo padrao
// de RemessasTerceirosTransformacao.test.js. O gate REAL continua sendo do servidor.
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
// Etapa 9, Task 9: esconder "Aprovar" do proprio solicitante compara `solicitante_id` com o
// usuario logado — mesmo padrao de `RequisicoesList.js` (useAuth + comparacao de id).
let mockUser = { id: 1, nome: 'Admin' };
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('./ExtratoMaterialModal', () => ({ __esModule: true, default: () => null }));

// material_id da sobra e a ORIGEM (o que foi retalhado); material_retalho_id e o material que
// representa o pedaco no catalogo. GET /sobras nao faz JOIN com materiais (so com localizacoes) —
// a tela resolve codigo/nome/dono pelo catalogo que ela mesma carrega, mesmo padrao de
// materiaisPorId em MovimentacoesAlmoxarifado.js.
const SOBRAS = [
  { id: 1, material_id: 101, material_retalho_id: 201, dimensoes_originais: '1800x400',
    dimensoes_restantes: '900x400', peso_aproximado: 12.5, localizacao_id: 5,
    localizacao_codigo: 'A-01', status: 'DISPONIVEL', reutilizavel: 1, norma: 'A36',
    criado_por_nome: 'Maria' },
  { id: 2, material_id: 101, material_retalho_id: 202, dimensoes_restantes: '500x300',
    peso_aproximado: 5, localizacao_id: null, localizacao_codigo: null, status: 'SUCATEADA',
    reutilizavel: 0, criado_por_nome: 'João' },
];

const MATERIAIS = [
  { id: 101, codigo: 'CHP-3MM', nome: 'Chapa 3mm', unidade: 'PC', familia_id: 9,
    categoria: 'Chapas', controle_lote: 0, controle_serie: 0, proprietario_cliente_id: null },
  { id: 201, codigo: 'RET-1', nome: 'Retalho chapa 3mm', unidade: 'PC', proprietario_cliente_id: null },
  { id: 202, codigo: 'RET-2', nome: 'Retalho chapa 3mm 2', unidade: 'PC', proprietario_cliente_id: null },
  { id: 103, codigo: 'MAT-LOTE', nome: 'Material com controle de lote', unidade: 'UN',
    controle_lote: 1, controle_serie: 0, proprietario_cliente_id: null },
];

// Etapa 9, Task 9 — fila de sucateamento (GET /sucateamentos). Formato real de
// scrapDisposalService.listar: `s.*` + material_codigo/nome/unidade + proprietario_cliente_id +
// lote_codigo. `solicitante_id: 50` e DIFERENTE do usuario logado nos testes (`mockUser.id: 1`)
// de proposito — e o caso comum (aprovador != solicitante); os testes que verificam "escondido
// para o proprio solicitante" trocam `mockUser` para 50 em runtime.
const SUCATEAMENTOS = [
  { id: 501, material_id: 101, lote_id: null, sobra_id: null, quantidade: 5,
    classificacao: 'aço carbono', peso_estimado: 12, justificativa: 'Corroído pela umidade',
    status: 'SOLICITADO', solicitante_id: 50, solicitante_nome: 'Pedro Produção',
    aprovador_almox_id: null, aprovador_almox_nome: null,
    aprovador_gestao_id: null, aprovador_gestao_nome: null,
    material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', material_unidade: 'PC',
    proprietario_cliente_id: null },
  { id: 502, material_id: 101, lote_id: null, sobra_id: null, quantidade: 2,
    classificacao: 'inox', justificativa: 'Amassado no transporte',
    status: 'APROVADO', solicitante_id: 50, solicitante_nome: 'Pedro Produção',
    aprovador_almox_id: 1, aprovador_almox_nome: 'Admin',
    aprovador_gestao_id: 60, aprovador_gestao_nome: 'Gestora Teste',
    material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', material_unidade: 'PC',
    proprietario_cliente_id: null },
  // Uma perna JA assinada (almoxarifado), a outra (gestao) ainda aberta — o caso em que
  // "Aprovar gestão" e o clique que FECHA as duas assinaturas e emite a baixa.
  { id: 503, material_id: 101, lote_id: null, sobra_id: null, quantidade: 1,
    classificacao: 'misto', justificativa: 'Sobra pequena demais',
    status: 'SOLICITADO', solicitante_id: 50, solicitante_nome: 'Pedro Produção',
    aprovador_almox_id: 1, aprovador_almox_nome: 'Admin',
    aprovador_gestao_id: null, aprovador_gestao_nome: null,
    material_codigo: 'CHP-3MM', material_nome: 'Chapa 3mm', material_unidade: 'PC',
    proprietario_cliente_id: null },
];

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  mockUser = { id: 1, nome: 'Admin' };
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/sobras') return Promise.resolve({ data: SOBRAS });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/sucateamentos') return Promise.resolve({ data: SUCATEAMENTOS });
    if (url.startsWith('/almoxarifado/proximo-codigo')) return Promise.resolve({ data: { codigo: 'RET-9' } });
    if (url.startsWith('/almoxarifado/materiais/103/lotes')) {
      return Promise.resolve({ data: [{ id: 900, codigo: 'LT-1', saldo: 5 }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: { id: 301, codigo: 'RET-9', nome: 'Retalho novo', unidade: 'UN' } });
    }
    if (url === '/almoxarifado/sucateamentos') {
      return Promise.resolve({ data: { ...SUCATEAMENTOS[0], id: 503 } });
    }
    if (url.endsWith('/aprovar-almoxarifado')) {
      return Promise.resolve({
        data: { sucateamento: { ...SUCATEAMENTOS[0], aprovador_almox_id: 1 }, baixa_emitida: false, movimentacao_sucata_id: null },
      });
    }
    if (url.endsWith('/aprovar-gestao')) {
      return Promise.resolve({
        data: { sucateamento: { ...SUCATEAMENTOS[1], status: 'APROVADO' }, baixa_emitida: true, movimentacao_sucata_id: 77 },
      });
    }
    if (url.endsWith('/rejeitar')) return Promise.resolve({ data: { ...SUCATEAMENTOS[0], status: 'REJEITADO' } });
    if (url.endsWith('/destino')) return Promise.resolve({ data: { ...SUCATEAMENTOS[1], status: 'VENDIDA' } });
    if (url.endsWith('/cancelar')) return Promise.resolve({ data: { ...SUCATEAMENTOS[0], status: 'CANCELADO' } });
    return Promise.resolve({ data: { sobra: { id: 3 }, movimentacao_baixa_id: 55, movimentacao_entrada_id: 56 } });
  });
  api.put.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar(rota = '/almoxarifado/sobras') {
  await act(async () => { root.render(<MemoryRouter initialEntries={[rota]}><SobrasAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const linhas = () => [...container.querySelectorAll('.almox-sobra-lista tbody tr')];
const linhasSuc = () => [...container.querySelectorAll('.almox-sucateamento-lista tbody tr')];
/** Molde de LotesAlmoxarifado.test.js:99 — o destaque de deep-link e `style` inline. */
const temDestaque = (tr) => /79,\s*172,\s*254/.test(tr.getAttribute('style') || '');
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
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
// Checkbox: React detecta o toggle pelo evento 'click' (nao 'change') — mesmo padrao usado em
// ConfiguracoesGerais.test.js:126-128 para o switch de config.
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

describe('SobrasAlmoxarifado — lista', () => {
  test('lista as sobras com origem, retalho, dimensoes e status', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(SOBRAS.length);
    expect(texto()).toContain('CHP-3MM');
    expect(texto()).toContain('RET-1');
    expect(texto()).toContain('900x400');
    expect(texto()).toContain('A-01');
  });

  test('lista vazia mostra estado vazio, nao tabela em branco', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/sobras' ? Promise.resolve({ data: [] }) : Promise.resolve({ data: [] })));
    await renderizar();
    expect(linhas()).toHaveLength(0);
    expect(texto()).toMatch(/nenhuma sobra/i);
  });

  test('falha ao carregar avisa por toast', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/sobras' ? Promise.reject(new Error('boom')) : Promise.resolve({ data: [] })));
    await renderizar();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('SobrasAlmoxarifado — modal de gerar retalho', () => {
  test('abre o modal com os campos de material de origem e do retalho', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    expect(texto()).toContain('Gerar retalho');
    expect(campo('Material de origem')).toBeTruthy();
    expect(campo('Material do retalho')).toBeTruthy();
  });

  test('baixar_original comeca desmarcado e SEM os campos de vinculo da baixa', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    const checkbox = campo('Baixar o material de origem');
    expect(checkbox.checked).toBe(false);
    expect(campo('Quantidade baixada')).toBeFalsy();
  });

  test('marcar baixar_original MOSTRA quantidade baixada, e desmarcar ESCONDE de novo', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    const checkbox = campo('Baixar o material de origem');
    marcar(checkbox, true);
    expect(campo('Quantidade baixada')).toBeTruthy();
    marcar(checkbox, false);
    expect(campo('Quantidade baixada')).toBeFalsy();
  });

  test('gerar retalho no modo SEM baixa manda baixar_original:false e nao manda quantidade_baixa', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sobras/gerar-retalho', expect.objectContaining({
      material_origem_id: 101, material_retalho_id: 201, baixar_original: false,
    }));
    const body = api.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('quantidade_baixa');
  });

  test('gerar retalho no modo COM baixa manda baixar_original:true e a quantidade baixada', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    marcar(campo('Baixar o material de origem'), true);
    preencher(campo('Quantidade baixada'), '30');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sobras/gerar-retalho', expect.objectContaining({
      material_origem_id: 101, material_retalho_id: 201, baixar_original: true, quantidade_baixa: 30,
    }));
  });

  test('baixar_original ligado sem quantidade baixada nao chama o servidor', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    marcar(campo('Baixar o material de origem'), true);
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test('as dimensoes preenchidas entram no payload', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    preencher(campo('Dimensões restantes'), '900x400');
    preencher(campo('Norma'), 'ASTM A36');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sobras/gerar-retalho', expect.objectContaining({
      dimensoes_restantes: '900x400', norma: 'ASTM A36',
    }));
  });

  test('o erro do servidor aparece para o operador, com a mensagem do backend', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'O material X tem controle de serie...' } } });
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(toast.error).toHaveBeenCalledWith('O material X tem controle de serie...');
  });

  test('criar material do retalho herda familia, dono e categoria do material de origem', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    await clicar(botao('Criar material do retalho'));
    preencher(campo('Nome do novo material'), 'Retalho novo');
    await clicar(botao('Cadastrar e usar'));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/proximo-codigo?familia_id=9');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais', expect.objectContaining({
      codigo: 'RET-9', codigo_auto: 1, nome: 'Retalho novo', familia_id: 9,
      proprietario_cliente_id: null, categoria: 'Chapas',
    }));
  });
});

// Etapa 9, Task 9 — a aba Sucateamentos e a etiqueta de retalho com QR (paga a pendencia da 6c).
async function abrirAbaSucateamentos() {
  await clicar(botao('Sucateamentos'));
}

describe('SobrasAlmoxarifado — retalhos: etiqueta e deep-link', () => {
  test('?sobra_id= destaca so a linha apontada pelo QR (deep-link), one-shot', async () => {
    await renderizar('/almoxarifado/sobras?sobra_id=2');
    const [linha1, linha2] = linhas(); // SOBRAS[0].id=1, SOBRAS[1].id=2
    expect(temDestaque(linha1)).toBe(false);
    expect(temDestaque(linha2)).toBe(true);
  });

  test('sem ?sobra_id= nenhuma linha destaca', async () => {
    await renderizar();
    expect(linhas().some(temDestaque)).toBe(false);
  });

  test('botao Etiqueta na linha do retalho abre o modal de etiquetas com 1 etiqueta pronta', async () => {
    await renderizar();
    await clicar(botao('Etiqueta', linhas()[0]));
    expect(texto()).toContain('Imprimir etiquetas');
    expect(texto()).toMatch(/1 etiqueta/);
  });

  test('gerar retalho com sucesso oferece a etiqueta do retalho recem-criado', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(texto()).toContain('Imprimir etiquetas');
  });
});

describe('SobrasAlmoxarifado — sucateamento: lista e visibilidade dos botoes', () => {
  test('lista os sucateamentos com material, classificacao, status e solicitante', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    expect(linhasSuc()).toHaveLength(SUCATEAMENTOS.length);
    expect(texto()).toContain('CHP-3MM');
    expect(texto()).toContain('aço carbono');
    expect(texto()).toContain('Pedro Produção');
  });

  test('lista vazia mostra estado vazio', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/sucateamentos' ? Promise.resolve({ data: [] }) : Promise.resolve({ data: [] })));
    await renderizar();
    await abrirAbaSucateamentos();
    expect(linhasSuc()).toHaveLength(0);
  });

  test('Aprovar (almoxarifado/gestao) aparecem para quem NAO e o solicitante, com as pernas abertas', async () => {
    await renderizar(); // mockUser.id = 1, solicitante de SUCATEAMENTOS[0] e 50
    await abrirAbaSucateamentos();
    const linhaSolicitado = linhasSuc()[0]; // id 501, SOLICITADO, as duas pernas em aberto
    expect(botao('Aprovar almoxarifado', linhaSolicitado)).toBeTruthy();
    expect(botao('Aprovar gestão', linhaSolicitado)).toBeTruthy();
  });

  test('Aprovar some para o proprio solicitante — o backend barraria de qualquer jeito', async () => {
    mockUser = { id: 50, nome: 'Pedro Produção' }; // o solicitante de SUCATEAMENTOS[0]
    await renderizar();
    await abrirAbaSucateamentos();
    const linhaSolicitado = linhasSuc()[0];
    expect(botao('Aprovar almoxarifado', linhaSolicitado)).toBeFalsy();
    expect(botao('Aprovar gestão', linhaSolicitado)).toBeFalsy();
  });

  test('Aprovar (almoxarifado) some quando pode("aprovar_sucateamento") e false, gestao continua', async () => {
    mockPode = (acao) => acao !== 'aprovar_sucateamento';
    await renderizar();
    await abrirAbaSucateamentos();
    const linhaSolicitado = linhasSuc()[0];
    expect(botao('Aprovar almoxarifado', linhaSolicitado)).toBeFalsy();
    expect(botao('Aprovar gestão', linhaSolicitado)).toBeTruthy();
  });

  test('a perna JA assinada nao mostra o botao de novo (linha APROVADO tem as duas pernas fechadas)', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    const linhaAprovado = linhasSuc()[1]; // id 502, APROVADO, as duas pernas ja assinadas
    expect(botao('Aprovar almoxarifado', linhaAprovado)).toBeFalsy();
    expect(botao('Aprovar gestão', linhaAprovado)).toBeFalsy();
  });

  test('Rejeitar aparece so em SOLICITADO para quem aprova alguma perna', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    expect(botao('Rejeitar', linhasSuc()[0])).toBeTruthy(); // SOLICITADO
    expect(botao('Rejeitar', linhasSuc()[1])).toBeFalsy(); // APROVADO
  });

  test('Rejeitar some quando o perfil nao aprova NENHUMA das duas pernas', async () => {
    mockPode = () => false;
    await renderizar();
    await abrirAbaSucateamentos();
    expect(botao('Rejeitar', linhasSuc()[0])).toBeFalsy();
  });

  test('Registrar destino aparece so em APROVADO', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    expect(botao('Registrar destino', linhasSuc()[0])).toBeFalsy(); // SOLICITADO
    expect(botao('Registrar destino', linhasSuc()[1])).toBeTruthy(); // APROVADO
  });

  test('Cancelar aparece so para o proprio solicitante, em SOLICITADO', async () => {
    await renderizar(); // mockUser.id = 1, solicitante = 50: nao aparece
    await abrirAbaSucateamentos();
    expect(botao('Cancelar', linhasSuc()[0])).toBeFalsy();
    mockUser = { id: 50, nome: 'Pedro Produção' };
  });

  test('Cancelar aparece para o proprio solicitante', async () => {
    mockUser = { id: 50, nome: 'Pedro Produção' };
    await renderizar();
    await abrirAbaSucateamentos();
    expect(botao('Cancelar', linhasSuc()[0])).toBeTruthy();
  });
});

describe('SobrasAlmoxarifado — sucateamento: aprovar, rejeitar, destino, cancelar (acoes)', () => {
  test('aprovar a perna do almoxarifado chama a rota certa (sem baixa emitida ainda)', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Aprovar almoxarifado', linhasSuc()[0]));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sucateamentos/501/aprovar-almoxarifado', {});
    expect(toast.success).toHaveBeenCalled();
  });

  test('aprovar a perna que fecha as duas assinaturas avisa que a baixa foi emitida', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    // id 503: SOLICITADO com a perna do almoxarifado JA assinada — "Aprovar gestão" e a que fecha.
    await clicar(botao('Aprovar gestão', linhasSuc()[2]));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sucateamentos/503/aprovar-gestao', {});
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/baixa/i));
  });

  test('erro do servidor ao aprovar chega ao operador com a mensagem literal', async () => {
    api.post.mockImplementationOnce(() => Promise.reject({ response: { data: { error: 'Voce ja assinou a outra perna' } } }));
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Aprovar almoxarifado', linhasSuc()[0]));
    expect(toast.error).toHaveBeenCalledWith('Voce ja assinou a outra perna');
  });

  test('rejeitar exige motivo antes de chamar o servidor', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Rejeitar', linhasSuc()[0]));
    await clicar(botao('Rejeitar', container.querySelector('.almox-modal-footer')));
    expect(api.post).not.toHaveBeenCalledWith('/almoxarifado/sucateamentos/501/rejeitar', expect.anything());
    expect(toast.error).toHaveBeenCalled();
  });

  test('rejeitar com motivo manda o motivo no corpo', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Rejeitar', linhasSuc()[0]));
    preencher(campo('Motivo'), 'Material ainda serve');
    await clicar(botao('Rejeitar', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sucateamentos/501/rejeitar', { motivo: 'Material ainda serve' });
  });

  test('registrar destino VENDIDA sem valor nao chama o servidor', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Registrar destino', linhasSuc()[1]));
    preencher(campo('Destino'), 'VENDIDA');
    await clicar(botao('Confirmar destino', container.querySelector('.almox-modal-footer')));
    expect(api.post).not.toHaveBeenCalledWith('/almoxarifado/sucateamentos/502/destino', expect.anything(), expect.anything());
    expect(toast.error).toHaveBeenCalled();
  });

  test('registrar destino VENDIDA com valor manda multipart com destino e valor_venda', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Registrar destino', linhasSuc()[1]));
    preencher(campo('Destino'), 'VENDIDA');
    preencher(campo('Valor'), '1500.50');
    await clicar(botao('Confirmar destino', container.querySelector('.almox-modal-footer')));
    const chamada = api.post.mock.calls.find((c) => c[0] === '/almoxarifado/sucateamentos/502/destino');
    expect(chamada).toBeTruthy();
    const [, corpo, config] = chamada;
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('destino')).toBe('VENDIDA');
    expect(corpo.get('valor_venda')).toBe('1500.50');
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  test('registrar destino DESCARTADA nao exige valor', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Registrar destino', linhasSuc()[1]));
    preencher(campo('Destino'), 'DESCARTADA');
    await clicar(botao('Confirmar destino', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sucateamentos/502/destino', expect.any(FormData), expect.anything());
  });

  test('cancelar pede confirmacao e chama a rota certa', async () => {
    window.confirm = jest.fn(() => true);
    mockUser = { id: 50, nome: 'Pedro Produção' };
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Cancelar', linhasSuc()[0]));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sucateamentos/501/cancelar', {});
  });

  test('cancelar sem confirmar nao chama o servidor', async () => {
    window.confirm = jest.fn(() => false);
    mockUser = { id: 50, nome: 'Pedro Produção' };
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Cancelar', linhasSuc()[0]));
    expect(api.post).not.toHaveBeenCalledWith('/almoxarifado/sucateamentos/501/cancelar', expect.anything());
  });
});

describe('SobrasAlmoxarifado — sucateamento: solicitar', () => {
  test('abre o modal com material, quantidade e justificativa', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Solicitar sucateamento'));
    expect(campo('Material a sucatear')).toBeTruthy();
    expect(campo('Quantidade a sucatear')).toBeTruthy();
    expect(campo('Justificativa')).toBeTruthy();
  });

  test('sem justificativa nao chama o servidor', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Solicitar sucateamento'));
    preencher(campo('Material a sucatear'), '101');
    preencher(campo('Quantidade a sucatear'), '3');
    await clicar(botao('Solicitar sucateamento', container.querySelector('.almox-modal-footer')));
    expect(api.post).not.toHaveBeenCalledWith('/almoxarifado/sucateamentos', expect.anything());
    expect(toast.error).toHaveBeenCalled();
  });

  test('material com controle de lote exige o lote', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Solicitar sucateamento'));
    preencher(campo('Material a sucatear'), '103');
    await esperarEfeitos();
    preencher(campo('Quantidade a sucatear'), '3');
    preencher(campo('Justificativa'), 'Enferrujado');
    await clicar(botao('Solicitar sucateamento', container.querySelector('.almox-modal-footer')));
    expect(api.post).not.toHaveBeenCalledWith('/almoxarifado/sucateamentos', expect.anything());
    expect(toast.error).toHaveBeenCalled();
  });

  test('payload completo com lote, classificacao e peso', async () => {
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Solicitar sucateamento'));
    preencher(campo('Material a sucatear'), '103');
    await esperarEfeitos();
    preencher(campo('Lote'), '900');
    preencher(campo('Quantidade a sucatear'), '3');
    preencher(campo('Classificação'), 'inox');
    preencher(campo('Peso estimado'), '7.5');
    preencher(campo('Justificativa'), 'Enferrujado');
    await clicar(botao('Solicitar sucateamento', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sucateamentos', {
      material_id: 103, lote_id: 900, quantidade: 3, classificacao: 'inox',
      peso_estimado: 7.5, justificativa: 'Enferrujado',
    });
  });

  test('botao Sucatear na linha do retalho pre-preenche material e sobra_id', async () => {
    await renderizar();
    await clicar(botao('Sucatear', linhas()[0])); // SOBRAS[0]: id 1, material_retalho_id 201
    expect(campo('Material a sucatear').value).toBe('201');
    preencher(campo('Quantidade a sucatear'), '1');
    preencher(campo('Justificativa'), 'Sobrou pequeno demais para reaproveitar');
    await clicar(botao('Solicitar sucateamento', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sucateamentos', expect.objectContaining({
      material_id: 201, sobra_id: 1,
    }));
  });

  test('o erro do servidor aparece para o operador, com a mensagem do backend', async () => {
    api.post.mockImplementationOnce(() => Promise.reject({ response: { data: { error: 'Material de cliente exige projeto ou OS do dono' } } }));
    await renderizar();
    await abrirAbaSucateamentos();
    await clicar(botao('Solicitar sucateamento'));
    preencher(campo('Material a sucatear'), '101');
    preencher(campo('Quantidade a sucatear'), '3');
    preencher(campo('Justificativa'), 'Enferrujado');
    await clicar(botao('Solicitar sucateamento', container.querySelector('.almox-modal-footer')));
    expect(toast.error).toHaveBeenCalledWith('Material de cliente exige projeto ou OS do dono');
  });
});
