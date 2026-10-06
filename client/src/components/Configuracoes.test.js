/**
 * /configuracoes em duas camadas (Etapa 36): barra de MODULOS (Geral + um por modulo que o
 * usuario configura) e, dentro de cada modulo, as abas que ele ja tinha.
 *
 * O que so o cliente consegue provar, e e o que esta aqui:
 *   - quem ve qual modulo (RN-36.01) — `canConfigureModule`, a mesma regua do menu lateral;
 *   - a URL e a fonte da verdade (RN-36.07): `?modulo=` e `?tab=` sobrevivem a F5, modulo
 *     invalido/nao permitido cai em Geral, `?tab=` fora do mapa cai na primeira aba do modulo,
 *     trocar de modulo limpa `?tab=`, e o `location.state.tab` legado (PropostasList.js:180)
 *     vira `?modulo=comercial&tab=template-proposta`;
 *   - a aba Geral continua salvando a cada tecla por PUT /configuracoes/:chave (RN-36.02);
 *   - as telas do almoxarifado e da producao sao embutidas com `embedded` (RN-36.04/05) — aqui
 *     elas sao STUBS: o contrato de `embedded` esta congelado no plano e e testado nas telas
 *     reais pela T3 (`almoxarifado/ConfiguracoesEmbedded.test.js`, `producao/ConfiguracoesProducao.test.js`).
 *   - modulo sem tela propria mostra o painel curto (RN-36.06).
 *
 * As tres telas do Comercial tambem sao stubs: `ConfigTemplateProposta` usa `axios` cru (nao o
 * `api` mockado) e as outras duas disparam 3-4 GETs na montagem — o que importa para esta
 * tela e QUAL componente abre em qual aba, nao o que ele faz por dentro.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/Configuracoes.test --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Configuracoes, { ABAS_POR_MODULO, modulosConfiguraveis } from './Configuracoes';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// `useAuth` lanca sem provider; o usuario de cada cenario entra por esta variavel.
let mockUsuarioLogado = null;
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUsuarioLogado, loading: false }),
}));

jest.mock('../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
  getCachedUserPermissions: () => null,
}));

// Stubs das telas embutidas. A factory do jest.mock e icada acima dos imports, por isso o
// `require('react')` DENTRO dela; `__esModule` + `default` e o que o React.lazy exige.
jest.mock('./almoxarifado/ConfiguracoesAlmoxarifado', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ embedded }) => React.createElement('div', {
      'data-testid': 'stub-almox', 'data-embedded': String(embedded),
    }, 'stub almoxarifado'),
  };
});

jest.mock('./producao/ConfiguracoesProducao', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ embedded }) => React.createElement('div', {
      'data-testid': 'stub-producao', 'data-embedded': String(embedded),
    }, 'stub producao'),
  };
});

jest.mock('./ConfigTemplateProposta', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ embedded }) => React.createElement('div', {
      'data-testid': 'stub-template-proposta', 'data-embedded': String(embedded),
    }, 'stub template'),
  };
});

jest.mock('./OpcoesPorFamilia', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('div', { 'data-testid': 'stub-opcoes-familia' }, 'stub opcoes'),
  };
});

jest.mock('./VariaveisTecnicas', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: () => React.createElement('div', { 'data-testid': 'stub-variaveis-tecnicas' }, 'stub variaveis'),
  };
});

const ADMIN = { id: 1, nome: 'Admin', role: 'admin' };
const GESTOR_COMERCIAL = { id: 2, nome: 'Gestor', role: 'user', admin_modulos: ['comercial'], modulos: ['administrativo', 'comercial'] };

const RESPOSTA_GET = {
  empresa: { empresa_nome: 'GMP Industriais', empresa_telefone: '1140001000' },
  sistema: { moeda: 'BRL' },
  email: { email_smtp_host: 'smtp.gmp', email_smtp_pass: '********' },
  backup: { backup_automatico: true },
};

let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  mockUsuarioLogado = ADMIN;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockResolvedValue({ data: RESPOSTA_GET });
  api.put.mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// Le a URL de dentro do router — e o unico jeito de provar que `?modulo=`/`?tab=` foram escritos.
const EspiaoDeUrl = () => {
  const location = useLocation();
  return (
    <div
      data-testid="url-espiao"
      data-search={location.search}
      data-state-tab={location.state?.tab ?? ''}
    />
  );
};

async function render(entrada = '/configuracoes') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[entrada]}>
        <Configuracoes />
        <EspiaoDeUrl />
      </MemoryRouter>
    );
  });
  // Suspense das telas embutidas (React.lazy) — uma volta extra do loop de eventos.
  await act(async () => {});
}

const urlAtual = () => container.querySelector('[data-testid="url-espiao"]').getAttribute('data-search');
const barraDeModulos = () => container.querySelector('[role="tablist"][aria-label="Módulos"]');
const barraInterna = () => container.querySelector('[role="tablist"][aria-label="Abas do módulo"]');
const rotulos = (tablist) => [...tablist.querySelectorAll('[role="tab"]')].map(t => t.textContent.trim());
const abaAtiva = (tablist) => tablist.querySelector('[role="tab"][aria-selected="true"]')?.textContent.trim();
const abaPorRotulo = (tablist, rotulo) => [...tablist.querySelectorAll('[role="tab"]')].find(t => t.textContent.trim() === rotulo);

// ---------------------------------------------------------------------------------------------
// (a) admin do sistema
// ---------------------------------------------------------------------------------------------
test('(a) admin do sistema ve Geral + os 8 modulos na ordem de MODULOS_ORDEM, sem admin/todolist', async () => {
  mockUsuarioLogado = ADMIN;
  await render();

  expect(barraDeModulos()).not.toBeNull();
  expect(rotulos(barraDeModulos())).toEqual([
    'Geral', 'Comercial', 'Compras', 'Financeiro', 'Operacional',
    'Cálculos de Engenharia', 'Engenharia / Projetos', 'Almoxarifado', 'Frota',
  ]);
  expect(container.textContent).not.toMatch(/TODOLIST/);
  expect(rotulos(barraDeModulos())).not.toContain('Admin');
  expect(abaAtiva(barraDeModulos())).toBe('Geral');
});

test('modulosConfiguraveis(): admin ve todos menos admin/todolist/administrativo; sem usuario, nenhum', () => {
  expect(modulosConfiguraveis(ADMIN)).toEqual([
    'comercial', 'compras', 'financeiro', 'operacional', 'engenharia',
    'engenharia_projetos', 'almoxarifado', 'frota',
  ]);
  expect(modulosConfiguraveis(null)).toEqual([]);
  expect(modulosConfiguraveis(GESTOR_COMERCIAL)).toEqual(['comercial']);
});

// ---------------------------------------------------------------------------------------------
// (b) admin de um modulo so
// ---------------------------------------------------------------------------------------------
test('(b) usuario com admin_modulos=[comercial] ve so Geral + Comercial', async () => {
  mockUsuarioLogado = GESTOR_COMERCIAL;
  await render();

  expect(rotulos(barraDeModulos())).toEqual(['Geral', 'Comercial']);
});

// ---------------------------------------------------------------------------------------------
// (c) Geral: 4 abas internas, salvar a cada tecla
// ---------------------------------------------------------------------------------------------
test('(c) Geral abre com Empresa/Sistema/E-mail/Backup e o nome da empresa salva por PUT /configuracoes/:chave', async () => {
  await render();

  expect(api.get).toHaveBeenCalledWith('/configuracoes');
  expect(rotulos(barraInterna())).toEqual(['Empresa', 'Sistema', 'E-mail', 'Backup']);
  expect(abaAtiva(barraInterna())).toBe('Empresa');
  expect(ABAS_POR_MODULO.administrativo.map(a => a.id)).toEqual(['empresa', 'sistema', 'email', 'backup']);

  const label = [...container.querySelectorAll('label')].find(l => l.textContent.trim() === 'Nome da Empresa');
  expect(label).toBeDefined();
  const input = label.parentElement.querySelector('input');
  expect(input.value).toBe('GMP Industriais');

  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, 'GMP Industriais Ltda');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(api.put).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.put.mock.calls[0];
  expect(rota).toBe('/configuracoes/empresa_nome');
  expect(corpo).toMatchObject({ valor: 'GMP Industriais Ltda', categoria: 'empresa' });
  expect(container.textContent).toMatch(/Configuração salva com sucesso/);
  // O botao Atualizar e da Geral — existe aqui.
  expect([...container.querySelectorAll('button')].some(b => /Atualizar/.test(b.textContent))).toBe(true);
});

test('Geral: trocar a aba interna escreve ?tab= e a aba E-mail mostra a senha SMTP como configurada', async () => {
  await render();

  await act(async () => { abaPorRotulo(barraInterna(), 'E-mail').click(); });

  expect(abaAtiva(barraInterna())).toBe('E-mail');
  expect(urlAtual()).toBe('?modulo=administrativo&tab=email');
  const senha = container.querySelector('input[type="password"]');
  expect(senha).not.toBeNull();
  expect(senha.value).toBe('');
  expect(senha.placeholder).toMatch(/Senha configurada/);
});

test('?modulo=administrativo&tab=geral (tab fora do mapa) cai em Empresa, a primeira aba', async () => {
  await render('/configuracoes?modulo=administrativo&tab=geral');

  expect(abaAtiva(barraDeModulos())).toBe('Geral');
  expect(abaAtiva(barraInterna())).toBe('Empresa');
  expect([...container.querySelectorAll('label')].some(l => l.textContent.trim() === 'Nome da Empresa')).toBe(true);
});

// ---------------------------------------------------------------------------------------------
// (d) almoxarifado embutido
// ---------------------------------------------------------------------------------------------
test('(d) ?modulo=almoxarifado&tab=geral renderiza o stub com embedded="true" e a URL mantem tab=geral', async () => {
  await render('/configuracoes?modulo=almoxarifado&tab=geral');

  expect(abaAtiva(barraDeModulos())).toBe('Almoxarifado');
  const stub = container.querySelector('[data-testid="stub-almox"]');
  expect(stub).not.toBeNull();
  expect(stub.getAttribute('data-embedded')).toBe('true');
  expect(urlAtual()).toBe('?modulo=almoxarifado&tab=geral');
  // A barra interna da Geral/Comercial nao aparece: quem desenha as abas do almox e ele mesmo.
  expect(barraInterna()).toBeNull();
  // RN-36.10: card dentro de card — o conteudo perde fundo/sombra quando o modulo e embutido.
  expect(container.querySelector('.configuracoes-content').classList.contains('configuracoes-content--embutido')).toBe(true);
  // O botao Atualizar e da Geral — nao aparece aqui.
  expect([...container.querySelectorAll('button')].some(b => /Atualizar/.test(b.textContent))).toBe(false);
  expect(container.querySelector('[data-testid="stub-producao"]')).toBeNull();
});

// ---------------------------------------------------------------------------------------------
// (e) operacional embutido
// ---------------------------------------------------------------------------------------------
test('(e) ?modulo=operacional renderiza o stub da producao com embedded="true"', async () => {
  await render('/configuracoes?modulo=operacional');

  expect(abaAtiva(barraDeModulos())).toBe('Operacional');
  const stub = container.querySelector('[data-testid="stub-producao"]');
  expect(stub).not.toBeNull();
  expect(stub.getAttribute('data-embedded')).toBe('true');
  expect(container.querySelector('[data-testid="stub-almox"]')).toBeNull();
  expect(container.querySelector('.configuracoes-content--embutido')).not.toBeNull();
});

// ---------------------------------------------------------------------------------------------
// (f) modulo sem configuracao propria
// ---------------------------------------------------------------------------------------------
test('(f) ?modulo=compras mostra o painel "ainda não tem configurações próprias" com o nome do modulo', async () => {
  await render('/configuracoes?modulo=compras');

  expect(abaAtiva(barraDeModulos())).toBe('Compras');
  expect(container.textContent).toMatch(/O módulo Compras ainda não tem configurações próprias/);
  expect(barraInterna()).toBeNull();
  expect(container.querySelector('.configuracoes-content--embutido')).toBeNull();
});

// ---------------------------------------------------------------------------------------------
// (g) state.tab legado (PropostasList -> "Config. template")
// ---------------------------------------------------------------------------------------------
test('(g) state.tab="template-proposta" sem ?modulo vira ?modulo=comercial&tab=template-proposta e abre o template', async () => {
  await render({ pathname: '/configuracoes', state: { tab: 'template-proposta' } });

  expect(abaAtiva(barraDeModulos())).toBe('Comercial');
  expect(rotulos(barraInterna())).toEqual(['Template de proposta', 'Opções por família', 'Variáveis técnicas']);
  expect(abaAtiva(barraInterna())).toBe('Template de proposta');
  const stub = container.querySelector('[data-testid="stub-template-proposta"]');
  expect(stub).not.toBeNull();
  expect(stub.getAttribute('data-embedded')).toBe('true');
  expect(urlAtual()).toBe('?modulo=comercial&tab=template-proposta');
  // O replace derruba o state: o efeito nao roda de novo e F5 cai na URL, nao no state.
  expect(container.querySelector('[data-testid="url-espiao"]').getAttribute('data-state-tab')).toBe('');
});

test('state.tab legado NAO sobrepoe um ?modulo= presente na URL', async () => {
  await render({ pathname: '/configuracoes', search: '?modulo=compras', state: { tab: 'template-proposta' } });

  expect(abaAtiva(barraDeModulos())).toBe('Compras');
  expect(urlAtual()).toBe('?modulo=compras');
});

test('(g2) Comercial: ?tab=opcoes-familia abre Opções por família; ?tab=inexistente cai no Template', async () => {
  await render('/configuracoes?modulo=comercial&tab=opcoes-familia');
  expect(container.querySelector('[data-testid="stub-opcoes-familia"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="stub-template-proposta"]')).toBeNull();

  act(() => root.unmount());
  root = createRoot(container);
  await render('/configuracoes?modulo=comercial&tab=inexistente');
  expect(abaAtiva(barraInterna())).toBe('Template de proposta');
  expect(container.querySelector('[data-testid="stub-template-proposta"]')).not.toBeNull();
});

// ---------------------------------------------------------------------------------------------
// (h) modulo nao permitido / invalido
// ---------------------------------------------------------------------------------------------
test('(h) ?modulo=frota para quem nao configura frota cai em Geral e a aba Frota nem existe', async () => {
  mockUsuarioLogado = GESTOR_COMERCIAL;
  await render('/configuracoes?modulo=frota');

  expect(rotulos(barraDeModulos())).toEqual(['Geral', 'Comercial']);
  expect(abaAtiva(barraDeModulos())).toBe('Geral');
  expect(abaAtiva(barraInterna())).toBe('Empresa');
});

test('?modulo=nao-existe cai em Geral mesmo para o admin', async () => {
  await render('/configuracoes?modulo=nao-existe');
  expect(abaAtiva(barraDeModulos())).toBe('Geral');
});

test('?modulo=admin e ?modulo=todolist nao abrem nada: caem em Geral', async () => {
  await render('/configuracoes?modulo=todolist');
  expect(abaAtiva(barraDeModulos())).toBe('Geral');
  act(() => root.unmount());
  root = createRoot(container);
  await render('/configuracoes?modulo=admin');
  expect(abaAtiva(barraDeModulos())).toBe('Geral');
});

// ---------------------------------------------------------------------------------------------
// (i) trocar de modulo pela barra
// ---------------------------------------------------------------------------------------------
test('(i) trocar de modulo pela barra escreve ?modulo= e limpa ?tab=', async () => {
  await render('/configuracoes?modulo=administrativo&tab=email');
  expect(abaAtiva(barraInterna())).toBe('E-mail');

  await act(async () => { abaPorRotulo(barraDeModulos(), 'Almoxarifado').click(); });

  expect(urlAtual()).toBe('?modulo=almoxarifado');
  expect(container.querySelector('[data-testid="stub-almox"]')).not.toBeNull();

  await act(async () => { abaPorRotulo(barraDeModulos(), 'Comercial').click(); });
  expect(urlAtual()).toBe('?modulo=comercial');
  expect(abaAtiva(barraInterna())).toBe('Template de proposta');

  await act(async () => { abaPorRotulo(barraDeModulos(), 'Geral').click(); });
  expect(urlAtual()).toBe('?modulo=administrativo');
  expect(abaAtiva(barraInterna())).toBe('Empresa');
});

// ---------------------------------------------------------------------------------------------
// RN-36.07: a barra de modulos renderiza fora do `loading` — o GET da Geral nao segura o almox
// ---------------------------------------------------------------------------------------------
test('a barra de modulos aparece antes do GET /configuracoes resolver', async () => {
  let resolver;
  api.get.mockImplementation(() => new Promise((res) => { resolver = res; }));

  await render('/configuracoes?modulo=almoxarifado');

  expect(barraDeModulos()).not.toBeNull();
  expect(container.querySelector('[data-testid="stub-almox"]')).not.toBeNull();
  expect(container.textContent).not.toMatch(/Carregando configurações/);

  await act(async () => { resolver({ data: RESPOSTA_GET }); });
});

test('na Geral, enquanto o GET nao resolve, o spinner fica so no conteudo e a barra ja esta la', async () => {
  let resolver;
  api.get.mockImplementation(() => new Promise((res) => { resolver = res; }));

  await render('/configuracoes');

  expect(barraDeModulos()).not.toBeNull();
  expect(container.textContent).toMatch(/Carregando configurações/);

  await act(async () => { resolver({ data: RESPOSTA_GET }); });
  expect(container.textContent).not.toMatch(/Carregando configurações/);
  expect([...container.querySelectorAll('label')].some(l => l.textContent.trim() === 'Nome da Empresa')).toBe(true);
});

test('acessibilidade (revisao da Etapa 36): todo aria-controls aponta para um id que existe e o painel e rotulado pela aba ativa', async () => {
  await render('/configuracoes?modulo=administrativo&tab=email');

  const controles = [...container.querySelectorAll('[aria-controls]')].map(t => t.getAttribute('aria-controls'));
  expect(controles.length).toBeGreaterThan(0);
  controles.forEach((id) => expect(container.querySelector(`#${id}`)).not.toBeNull());

  const painel = container.querySelector('[role="tabpanel"]');
  expect(painel.getAttribute('aria-labelledby')).toBe('ui-tab-email');
  expect(container.querySelector('#ui-tab-email')).not.toBeNull();
});

test('acessibilidade: em modulo embutido (sem barra interna) o painel e rotulado pela aba do modulo', async () => {
  await render('/configuracoes?modulo=almoxarifado');

  const painel = container.querySelector('[role="tabpanel"]');
  expect(painel.getAttribute('aria-labelledby')).toBe('ui-tab-almoxarifado');
  expect(container.querySelector('#ui-tab-almoxarifado')).not.toBeNull();
  [...container.querySelectorAll('[aria-controls]')].forEach((t) => {
    expect(container.querySelector(`#${t.getAttribute('aria-controls')}`)).not.toBeNull();
  });
});
