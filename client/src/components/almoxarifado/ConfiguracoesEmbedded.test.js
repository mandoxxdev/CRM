/**
 * Etapa 36, T3 (RN-36.04) — `ConfiguracoesAlmoxarifado` com e sem `embedded`.
 *
 * A tela passa a ser renderizada DENTRO da aba "Almoxarifado" de /configuracoes. Embutida, ela
 * nao pode trazer o proprio cabecalho (h1 + paragrafo + selo "Somente Administradores") nem o
 * wrapper `.almox-page` (24px de padding, max-width e 72px de rodape no celular) — senao a
 * pagina de configuracoes ganha dois titulos e dois paddings. A barra das 11 abas internas, essa
 * FICA: e ela que da acesso as configuracoes do modulo.
 *
 * O segundo assunto deste arquivo e um achado da revisao do plano: a tela lia `?tab=` UMA vez
 * (no `useState` inicial) e o clique so fazia `setTab` — a URL nunca era escrita. Clicar em
 * "Localizacoes" e dar F5 voltava para "Tipos". Embutida numa pagina cuja aba de modulo ja
 * vive na URL, isso ficaria ainda mais visivel. Por isso a URL vira a FONTE DA VERDADE da aba
 * interna, nos dois modos: lida de `searchParams` e escrita no clique. O componente-espiao
 * abaixo le `location.search` de dentro do MemoryRouter para provar a escrita.
 *
 * Os 3 testes existentes que montam esta tela (Categorias, ConfiguracoesGerais, PerfisAcesso)
 * so leem `?tab=` e nao passam prop — sao o controle de regressao e tem de continuar verdes
 * sem alteracao.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/ConfiguracoesEmbedded --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// `useAuth` LANCA sem provider — o mock e obrigatorio, nao conveniencia.
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

// GET /almoxarifado/configuracoes devolve um MAPA por chave; as demais listas devolvem array.
const CONFIGURACOES = {
  aprovacao_automatica: { valor: '1', descricao: 'Aprovar requisições automaticamente', id: 1 },
  permite_saldo_negativo_global: { valor: '1', descricao: 'Permitir saldo negativo (global)', id: 2 },
};

let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/configuracoes') return Promise.resolve({ data: CONFIGURACOES });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// Le `location.search` de DENTRO do router: e a unica forma de provar que o clique escreveu a URL.
const Espiao = () => {
  const location = useLocation();
  return <span data-testid="espiao-url">{location.search}</span>;
};

async function render({ url = '/almoxarifado/configuracoes', embedded } = {}) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[url]}>
        <Espiao />
        {embedded ? <ConfiguracoesAlmoxarifado embedded /> : <ConfiguracoesAlmoxarifado />}
      </MemoryRouter>
    );
  });
}

const urlAtual = () => container.querySelector('[data-testid="espiao-url"]').textContent;

const wrapper = () => container.querySelector('[data-testid="espiao-url"]').nextElementSibling;

const botaoDaAba = (rotulo) => [...container.querySelectorAll('button')]
  .find(b => b.textContent.trim() === rotulo);

const barraDeAbas = () => botaoDaAba('Tipos de Material').parentElement;

test('sem a prop, a tela e a de hoje: h1 proprio, selo e wrapper .almox-page', async () => {
  await render();

  const h1 = container.querySelector('h1');
  expect(h1).not.toBeNull();
  expect(h1.textContent).toContain('Configurações do Almoxarifado');
  expect(container.querySelector('.almox-header')).not.toBeNull();
  expect(container.textContent).toContain('Somente Administradores');
  expect(wrapper().classList.contains('almox-page')).toBe(true);
  expect(container.querySelector('.almox-embedded')).toBeNull();
  // Sem ?tab= cai na primeira aba.
  expect(botaoDaAba('Novo Tipo de Material')).not.toBeUndefined();
});

test('com embedded, some o cabecalho e o wrapper vira .almox-embedded — mas a barra de abas fica', async () => {
  await render({ embedded: true });

  expect(container.querySelector('h1')).toBeNull();
  expect(container.querySelector('.almox-header')).toBeNull();
  expect(container.textContent).not.toContain('Configurações do Almoxarifado');
  expect(container.textContent).not.toContain('Somente Administradores');
  expect(wrapper().classList.contains('almox-embedded')).toBe(true);
  expect(container.querySelector('.almox-page')).toBeNull();
  // A barra das 11 abas internas e o que da acesso as configuracoes — ela FICA.
  expect(botaoDaAba('Tipos de Material')).not.toBeUndefined();
  expect(botaoDaAba('Localizações')).not.toBeUndefined();
  expect(botaoDaAba('Configurações Gerais')).not.toBeUndefined();
});

test('embedded com ?tab=geral abre a aba Configuracoes Gerais', async () => {
  await render({ url: '/configuracoes?modulo=almoxarifado&tab=geral', embedded: true });

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/configuracoes');
  expect(botaoDaAba('Novo Tipo de Material')).toBeUndefined();
  expect([...container.querySelectorAll('button')].some(b => /Salvar Configurações/.test(b.textContent))).toBe(true);
});

test('clicar numa aba interna escreve ?tab=<id> na URL (modo embedded) e troca o conteudo', async () => {
  await render({ url: '/configuracoes?modulo=almoxarifado', embedded: true });
  expect(urlAtual()).toBe('?modulo=almoxarifado');

  await act(async () => { botaoDaAba('Categorias').click(); });

  const params = new URLSearchParams(urlAtual());
  expect(params.get('tab')).toBe('categorias');
  // Os outros parametros sobrevivem — e o `?modulo=` que mantem a aba de modulo aberta.
  expect(params.get('modulo')).toBe('almoxarifado');
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias?todos=1');
  expect(botaoDaAba('Nova Categoria')).not.toBeUndefined();
  expect(botaoDaAba('Novo Tipo de Material')).toBeUndefined();
});

test('clicar numa aba interna escreve ?tab=<id> na URL tambem na rota antiga (sem embedded)', async () => {
  await render();
  expect(urlAtual()).toBe('');

  await act(async () => { botaoDaAba('Localizações').click(); });
  expect(new URLSearchParams(urlAtual()).get('tab')).toBe('localizacoes');

  await act(async () => { botaoDaAba('Categorias').click(); });
  expect(new URLSearchParams(urlAtual()).get('tab')).toBe('categorias');
  expect(botaoDaAba('Nova Categoria')).not.toBeUndefined();
});

test('?tab= invalido cai em Tipos de Material', async () => {
  await render({ url: '/almoxarifado/configuracoes?tab=nao-existe' });

  expect(botaoDaAba('Novo Tipo de Material')).not.toBeUndefined();
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/tipos-material');
});

test('a barra interna rola de lado em vez de quebrar linha ou sumir atras do overflow-x do mobile', async () => {
  await render({ embedded: true });

  const barra = barraDeAbas();
  expect(barra.style.overflowX).toBe('auto');
  expect(barra.style.flexWrap).toBe('nowrap');
  expect(barra.style.whiteSpace).toBe('nowrap');
  // Nos dois modos — a rota antiga tem o mesmo defeito no celular.
  await act(() => root.unmount());
  container.remove();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await render();
  expect(barraDeAbas().style.overflowX).toBe('auto');
});
