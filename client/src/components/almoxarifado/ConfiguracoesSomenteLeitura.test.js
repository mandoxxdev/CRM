/**
 * Etapa 126 (C261, RN-01..RN-10; B811..B814) — as abas de Configurações que o servidor recusa ficam SOMENTE LEITURA (ou restritas)
 * para quem não grava a configuração do almoxarifado.
 *
 * O administrador do sistema (`role: 'admin'`) sem perfil e sem administrador do módulo abre Configurações (o `canConfigureAlmox` do
 * cliente o aceita), mas as rotas de gravação dessas abas (`denyUnlessAlmoxAdmin`) recusam com 403 — medido na Fase 0 da 126. Antes
 * ele via os botões de cada aba e cada clique respondia "Acesso restrito"; Alertas, Regras de aprovação e Configurações gerais nem
 * abriam (toast de erro e a aba vazia). Agora: as que leem mostram o conteúdo sem os gestos de gravação, com uma frase de quem é; as
 * que nem leem mostram a frase no lugar e não chamam a rota. O molde é a aba Famílias (Etapa 125, B808).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/ConfiguracoesSomenteLeitura --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import MapaLocalizacoesAlmoxarifado from './MapaLocalizacoesAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
let mockUser = null;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
let mockEfetivo;
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => (mockEfetivo !== undefined ? mockEfetivo : u) }));

const ADMIN_SISTEMA = { id: 5, nome: 'Admin do sistema', role: 'admin' };
const ADM_PERFIL = { id: 4, nome: 'Adm', role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' };
const ADM_MODULO = { id: 6, nome: 'Adm do modulo', role: 'user', admin_modulos: '["almoxarifado"]' };
const SUPER = { id: 1, nome: 'Super', role: 'admin', is_superadmin: 1 };

const DE_QUEM = ' é do Administrador do almoxarifado ou do Super Administrador; peça a um deles.';
const F = (oQue) => `Somente leitura — ${oQue}${DE_QUEM}`;
const R = (oQue) => `Restrito — ${oQue}${DE_QUEM}`;
const F_TIPOS = F('cadastrar, editar e excluir tipos de material');
const F_ESTOQUES = F('mudar estoque mínimo, estoque máximo, ponto de pedido e prazo de reposição');
const F_SETORES = F('cadastrar, editar e inativar setores e áreas');
const F_LOCALIZACOES = F('cadastrar, editar, mover e excluir localizações');
const F_LIBERACAO = F('mudar a liberação por valor e os aprovadores');
const R_ALERTAS = R('ver e mudar os alertas de estoque');
const R_REGRAS = R('ver e mudar as regras de aprovação');
const R_GERAL = R('ver e mudar as configurações gerais do almoxarifado');
const F_FAMILIAS_125 = 'Somente leitura — cadastrar, editar, inativar e reativar famílias é do Administrador do almoxarifado ou do '
  + 'Super Administrador; peça a um deles.';
const TODAS = [F_TIPOS, F_ESTOQUES, F_SETORES, F_LOCALIZACOES, F_LIBERACAO, R_ALERTAS, R_REGRAS, R_GERAL, F_FAMILIAS_125];

const DADOS = {
  '/almoxarifado/tipos-material': [{ id: 1, nome: 'EPI Teste', descricao: 'proteção', icone: '🛡️', cor: '#e74c3c', is_epi: 1 }],
  '/almoxarifado/materiais': [{ id: 10, codigo: 'M-001', nome: 'Parafuso M8', quantidade_atual: 5, unidade: 'UN', quantidade_minima: 2,
    quantidade_maxima: 9, ponto_pedido: 3, prazo_reposicao_dias: 4 },
  { id: 11, codigo: 'M-002', nome: 'Porca M8', quantidade_atual: 1, unidade: 'UN', quantidade_minima: 0, quantidade_maxima: 0,
    ponto_pedido: 0, prazo_reposicao_dias: 0 }],
  '/almoxarifado/setores?all=1': [{ id: 1, nome: 'Corredor A', codigo_prefixo: 'A', tipo: 'corredor', ordem: 1, qtd_localizacoes: 0, ativo: 1 }],
  '/almoxarifado/almoxarifados?todos=1': [{ id: 1, codigo: 'ALM-GERAL', nome: 'Almoxarifado Geral', descricao: '', ativo: 1 }],
  '/almoxarifado/localizacoes': [{ id: 5, codigo: 'A-01', descricao: 'Prateleira um', tipo: 'Prateleira', setor: 'Corredor A', parent_id: null }],
  '/almoxarifado/configuracoes/liberacao-valor': { ativo: true, limite: 800, aprovadorIds: [7] },
  '/usuarios': [{ id: 7, nome: 'Aprovador Um', email: 'a1@x.com', ativo: 1 }, { id: 8, nome: 'Outra Pessoa', email: 'o@x.com', ativo: 1 }],
  '/almoxarifado/configuracoes/alertas-estoque': { notificarEmail: true, emails: ['alerta@x.com'], smtpHost: 'smtp.x.com' },
  '/almoxarifado/regras-aprovacao': [],
  '/almoxarifado/configuracoes': { prazo_padrao: { valor: '5', descricao: 'Prazo' } },
  '/almoxarifado/categorias?todos=1': [{ id: 1, nome: 'Categoria Um', ativo: 1 }],
  '/almoxarifado/mapa/localizacoes': [{ id: 3, codigo: 'PRT-01', setor: 'Corredor', tipo: 'Prateleira', almoxarifado_id: 1,
    quantidade_total: 0, itens_criticos: 0, itens_baixo_minimo: 0, parent_id: null }],
  '/almoxarifado/meta/tipos-material': { localizacoes_tipos: ['Prateleira'], tipos: [], areas_especiais: [] },
  '/almoxarifado/almoxarifados': [{ id: 1, codigo: 'ALM-01', nome: 'Geral', ativo: 1 }],
};

let container; let root; let dados;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  dados = { ...DADOS };
  api.get.mockImplementation((url) => Promise.resolve({ data: url in dados ? dados[url] : [] }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); mockEfetivo = undefined; });

const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderAba(user, tab) {
  mockUser = user;
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[`/almoxarifado/configuracoes?tab=${tab}`]}><ConfiguracoesAlmoxarifado /></MemoryRouter>);
  });
  await flush();
}
async function renderMapa(user) {
  mockUser = user;
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/mapa']}><MapaLocalizacoesAlmoxarifado /></MemoryRouter>);
  });
  await flush();
}
const botoesTexto = (regex, escopo = container) => [...escopo.querySelectorAll('button')].filter((b) => regex.test(b.textContent));
const botoesTitulo = (titulo, escopo = container) => escopo.querySelectorAll(`button[title="${titulo}"]`);
const chamou = (url) => api.get.mock.calls.some(([u]) => u === url);
const frasesNaTela = () => TODAS.filter((f) => container.textContent.includes(f));

describe('C261 (Etapa 126) — RN-01: Tipos de material', () => {
  test('[RN-01] administrador do sistema: os cartões sem Novo/Editar/Excluir, com a frase', async () => {
    await renderAba(ADMIN_SISTEMA, 'tipos');
    expect(container.textContent).toContain('EPI Teste');
    expect(frasesNaTela()).toEqual([F_TIPOS]);
    expect(botoesTexto(/Novo Tipo de Material/)).toHaveLength(0);
    expect(botoesTitulo('Editar')).toHaveLength(0);
    expect(botoesTitulo('Excluir')).toHaveLength(0);
  });
  test('[RN-08] perfil Administrador: Novo, Editar e Excluir, sem frase', async () => {
    await renderAba(ADM_PERFIL, 'tipos');
    expect(frasesNaTela()).toEqual([]);
    expect(botoesTexto(/Novo Tipo de Material/)).toHaveLength(1);
    expect(botoesTitulo('Editar')).toHaveLength(1);
    expect(botoesTitulo('Excluir')).toHaveLength(1);
  });
});

describe('C261 (Etapa 126) — RN-02: Estoques mínimos', () => {
  const camposDaLinha = (codigo) => {
    const tr = [...container.querySelectorAll('tbody tr')].find((t) => t.textContent.includes(codigo));
    return [...tr.querySelectorAll('input')];
  };
  test('[RN-02] administrador do sistema: os valores nos campos desabilitados, sem Salvar, o filtro funciona, com a frase', async () => {
    await renderAba(ADMIN_SISTEMA, 'estoques');
    const campos = camposDaLinha('M-001');
    expect(campos.map((i) => i.value)).toEqual(['2', '9', '3', '4']);
    expect(campos.every((i) => i.disabled)).toBe(true);
    expect(botoesTexto(/Salvar Alterações/)).toHaveLength(0);
    expect(frasesNaTela()).toEqual([F_ESTOQUES]);
    const filtro = container.querySelector('input[placeholder="Filtrar materiais..."]');
    expect(filtro.disabled).toBe(false);
    const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => { setValue.call(filtro, 'Porca'); filtro.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(container.textContent).toContain('Porca M8');
    expect(container.textContent).not.toContain('Parafuso M8');
  });
  test('[RN-08] perfil Administrador: campos habilitados e Salvar Alterações, sem frase', async () => {
    await renderAba(ADM_PERFIL, 'estoques');
    expect(camposDaLinha('M-001').every((i) => !i.disabled)).toBe(true);
    expect(botoesTexto(/Salvar Alterações/)).toHaveLength(1);
    expect(frasesNaTela()).toEqual([]);
  });
});

describe('C261 (Etapa 126) — RN-03: Setores e Áreas', () => {
  const setores = () => container.querySelector('.almox-setores-tabela');
  const almoxarifados = () => container.querySelector('.almox-almoxarifados-tabela');
  test('[RN-03] administrador do sistema: setores sem Novo/Editar/Inativar com a frase; o bloco Almoxarifados como hoje', async () => {
    await renderAba(ADMIN_SISTEMA, 'setores');
    expect(setores().textContent).toContain('Corredor A');
    expect(botoesTexto(/Novo Setor ou Área/)).toHaveLength(0);
    expect(botoesTitulo('Editar', setores())).toHaveLength(0);
    expect(botoesTitulo('Inativar', setores())).toHaveLength(0);
    expect(frasesNaTela()).toEqual([F_SETORES]);
    // RN-09: o servidor deixa os almoxarifados
    expect(almoxarifados().textContent).toContain('ALM-GERAL');
    expect(botoesTexto(/Novo Almoxarifado/)).toHaveLength(1);
    expect(botoesTitulo('Editar', almoxarifados())).toHaveLength(1);
    expect(botoesTitulo('Inativar', almoxarifados())).toHaveLength(1);
  });
  test('[RN-08] perfil Administrador: setores com Novo, Editar e Inativar, sem frase', async () => {
    await renderAba(ADM_PERFIL, 'setores');
    expect(botoesTexto(/Novo Setor ou Área/)).toHaveLength(1);
    expect(botoesTitulo('Editar', setores())).toHaveLength(1);
    expect(botoesTitulo('Inativar', setores())).toHaveLength(1);
    expect(frasesNaTela()).toEqual([]);
  });
});

describe('C261 (Etapa 126) — RN-04: Localizações', () => {
  test('[RN-04] administrador do sistema: a lista sem Nova/Editar/Mover/Excluir; Etiqueta, Etiquetas e o Mapa ficam; com a frase', async () => {
    await renderAba(ADMIN_SISTEMA, 'localizacoes');
    expect(container.textContent).toContain('A-01');
    expect(botoesTexto(/Nova Localização/)).toHaveLength(0);
    expect(botoesTitulo('Editar')).toHaveLength(0);
    expect(botoesTitulo('Mover')).toHaveLength(0);
    expect(botoesTitulo('Excluir')).toHaveLength(0);
    expect(botoesTitulo('Etiqueta')).toHaveLength(1);
    expect(botoesTexto(/Etiquetas \(1\)/)).toHaveLength(1);
    expect(container.querySelector('a[href="/almoxarifado/mapa"]')).not.toBeNull();
    expect(frasesNaTela()).toEqual([F_LOCALIZACOES]);
  });
  test('[RN-08] perfil Administrador: Nova, Editar, Mover e Excluir, sem frase', async () => {
    await renderAba(ADM_PERFIL, 'localizacoes');
    expect(botoesTexto(/Nova Localização/)).toHaveLength(1);
    expect(botoesTitulo('Editar')).toHaveLength(1);
    expect(botoesTitulo('Mover')).toHaveLength(1);
    expect(botoesTitulo('Excluir')).toHaveLength(1);
    expect(frasesNaTela()).toEqual([]);
  });
});

describe('C261 (Etapa 126) — RN-05: Liberação por valor', () => {
  const caixa = (nome) => [...container.querySelectorAll('label')].find((l) => l.textContent.includes(nome)).querySelector('input');
  test('[RN-05] administrador do sistema: a chave, o limite e as caixas desabilitados com o gravado; busca funciona; sem Salvar; frase', async () => {
    await renderAba(ADMIN_SISTEMA, 'liberacao-valor');
    const chave = container.querySelector('label.switch input[type="checkbox"]');
    expect(chave.checked).toBe(true);
    expect(chave.disabled).toBe(true);
    const limite = container.querySelector('input[type="number"]');
    expect(limite.value).toBe('800');
    expect(limite.disabled).toBe(true);
    expect(caixa('Aprovador Um').checked).toBe(true);
    expect(caixa('Aprovador Um').disabled).toBe(true);
    expect(caixa('Outra Pessoa').disabled).toBe(true);
    expect(container.querySelector('input[placeholder="Buscar usuário..."]').disabled).toBe(false);
    expect(botoesTexto(/Salvar Configurações/)).toHaveLength(0);
    expect(frasesNaTela()).toEqual([F_LIBERACAO]);
  });
  test('[RN-08] perfil Administrador: tudo habilitado e Salvar Configurações, sem frase', async () => {
    await renderAba(ADM_PERFIL, 'liberacao-valor');
    expect(container.querySelector('label.switch input[type="checkbox"]').disabled).toBe(false);
    expect(caixa('Aprovador Um').disabled).toBe(false);
    expect(botoesTexto(/Salvar Configurações/)).toHaveLength(1);
    expect(frasesNaTela()).toEqual([]);
  });
});

describe('C261 (Etapa 126) — RN-06: as que nem leem', () => {
  const CASOS = [
    ['alertas', '/almoxarifado/configuracoes/alertas-estoque', R_ALERTAS],
    ['regras-aprovacao', '/almoxarifado/regras-aprovacao', R_REGRAS],
    ['geral', '/almoxarifado/configuracoes', R_GERAL],
  ];
  for (const [tab, url, frase] of CASOS) {
    test(`[RN-06] ${tab}, administrador do sistema: a frase no lugar, o GET ${url} não é chamado, nenhum toast de erro`, async () => {
      await renderAba(ADMIN_SISTEMA, tab);
      expect(frasesNaTela()).toEqual([frase]);
      expect(chamou(url)).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
      // metade positiva: a barra de abas está lá (a tela abriu)
      expect(container.textContent).toContain('Tipos de Material');
    });
    test(`[RN-08] ${tab}, perfil Administrador: o GET é chamado e não há frase`, async () => {
      await renderAba(ADM_PERFIL, tab);
      expect(chamou(url)).toBe(true);
      expect(frasesNaTela()).toEqual([]);
    });
  }
});

describe('C261 (Etapa 126) — RN-07: Mapa de Áreas', () => {
  test('[RN-07] administrador do sistema: o mapa sem Editar Posições; o link Localizações fica', async () => {
    await renderMapa(ADMIN_SISTEMA);
    expect(container.textContent).toContain('PRT-01');
    expect(botoesTexto(/Editar Posições/)).toHaveLength(0);
    // Fase 2, M4: o link abre a aba Localizações (antes ia sem ?tab e abria Tipos)
    expect(container.querySelector('a[href="/almoxarifado/configuracoes?tab=localizacoes"]')).not.toBeNull();
  });
  test('[RN-07] administrador do sistema, sem localização: sem Cadastrar localizações', async () => {
    dados['/almoxarifado/mapa/localizacoes'] = [];
    await renderMapa(ADMIN_SISTEMA);
    expect(container.textContent).toContain('Nenhuma localização cadastrada');
    expect([...container.querySelectorAll('a')].filter((a) => /Cadastrar localizações/.test(a.textContent))).toHaveLength(0);
  });
  test('[RN-08] perfil Administrador: Editar Posições e, sem localização, Cadastrar localizações', async () => {
    await renderMapa(ADM_PERFIL);
    expect(botoesTexto(/Editar Posições/)).toHaveLength(1);
    act(() => root.unmount());
    root = createRoot(container);
    dados['/almoxarifado/mapa/localizacoes'] = [];
    await renderMapa(ADM_PERFIL);
    expect([...container.querySelectorAll('a')].filter((a) => /Cadastrar localizações/.test(a.textContent))).toHaveLength(1);
  });
});

describe('C261 (Etapa 126) — RN-09/RN-10', () => {
  test('[RN-09] Categorias para o administrador do sistema: Nova Categoria lá, sem frase', async () => {
    await renderAba(ADMIN_SISTEMA, 'categorias');
    expect(container.textContent).toContain('Categoria Um');
    expect(botoesTexto(/Nova Categoria/)).toHaveLength(1);
    expect(frasesNaTela()).toEqual([]);
  });
  test('[RN-08] administrador do módulo e Super Administrador gravam (Tipos)', async () => {
    for (const u of [ADM_MODULO, SUPER]) {
      act(() => root.unmount());
      root = createRoot(container);
      await renderAba(u, 'tipos');
      expect(botoesTexto(/Novo Tipo de Material/)).toHaveLength(1);
      expect(frasesNaTela()).toEqual([]);
    }
  });
  test('[RN-10] o usuário EFETIVO decide: logado Administrador, efetivo administrador do sistema -> somente leitura e restrita', async () => {
    mockEfetivo = ADMIN_SISTEMA;
    await renderAba(ADM_PERFIL, 'tipos');
    expect(frasesNaTela()).toEqual([F_TIPOS]);
    act(() => root.unmount());
    root = createRoot(container);
    await renderAba(ADM_PERFIL, 'alertas');
    expect(frasesNaTela()).toEqual([R_ALERTAS]);
    expect(chamou('/almoxarifado/configuracoes/alertas-estoque')).toBe(false);
  });
  test('[RN-09] a aba Famílias continua com a frase da 125, literal igual', async () => {
    dados['/almoxarifado/familias?ativo=all'] = [{ id: 1, codigo: 'ROL', nome: 'Rolamentos', parent_id: null, tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 }];
    await renderAba(ADMIN_SISTEMA, 'familias');
    expect(frasesNaTela()).toEqual([F_FAMILIAS_125]);
  });
});
