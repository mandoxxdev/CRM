/**
 * Etapa 68 (T5) — o Mapa conhece as áreas especiais.
 *
 * - Os dois tipos novos (`Área de sucata`, `Área de devoluções`) têm ícone e cor próprios — sem
 *   isso caíam no 📍 e no azul genérico, indistinguíveis de um tipo desconhecido.
 * - No painel da selecionada, a `descricao` da área vem de `areas_especiais` do meta
 *   (`data-testid="descricao-area"`), pela área EFETIVA: a própria localização, se for área, senão
 *   o ancestral mais próximo que for área (o assistente grava `Prateleira` nos filhos de uma área).
 * - Meta sem `areas_especiais` (servidor anterior, mocks antigos) não quebra: só não há descrição.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MapaAreasEspeciais --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MapaLocalizacoesAlmoxarifado from './MapaLocalizacoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Operador' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

// Frases do contrato (server/services/almoxarifado/schema.js, AREAS_ESPECIAIS).
const DESC_SUCATA = 'Guardar aqui não sucateia: o material continua no estoque até o sucateamento aprovado, que baixa daqui quando o saldo aqui cobre o sucateamento inteiro.';
const DESC_DEVOLUCOES = 'Guardar aqui não muda o estado do material: ele continua disponível.';

const TIPOS_LOC = [
  'Almoxarifado', 'Rua', 'Prateleira', 'Gaveta', 'Box', 'Área externa', 'Área de corte',
  'Área de montagem', 'Área de elétrica', 'Área de pintura', 'Área de expedição',
  'Área de materiais do cliente', 'Área de quarentena/inspeção', 'Área de sucata', 'Área de devoluções',
];
const AREAS = [
  { tipo: 'Área de quarentena/inspeção', chave: 'QUARENTENA', descricao: 'Guardar aqui não retém o material: ele continua disponível. Quem retém é a inspeção ou o bloqueio.' },
  { tipo: 'Área de expedição', chave: 'EXPEDICAO', descricao: 'A separação da requisição não usa este endereço: a entrega baixa da origem separada.' },
  { tipo: 'Área de materiais do cliente', chave: 'MATERIAIS_CLIENTE', descricao: 'Endereço para material de cliente. Material próprio guardado aqui gera aviso.' },
  { tipo: 'Área de sucata', chave: 'SUCATA', descricao: DESC_SUCATA },
  { tipo: 'Área de devoluções', chave: 'DEVOLUCOES', descricao: DESC_DEVOLUCOES },
];

const base = { almoxarifado_id: 1, quantidade_total: 0, itens_criticos: 0, itens_baixo_minimo: 0, parent_id: null };
const LOCS = [
  { ...base, id: 1, codigo: 'SUC-01', setor: 'Sucata', tipo: 'Área de sucata' },
  { ...base, id: 2, codigo: 'DEV-01', setor: 'Devolucoes', tipo: 'Área de devoluções' },
  { ...base, id: 3, codigo: 'PRT-01', setor: 'Corredor', tipo: 'Prateleira' },
  // Posição dentro da área de sucata: o assistente grava `Prateleira` no filho.
  { ...base, id: 4, codigo: 'SUC-01-A1', setor: 'Sucata', tipo: 'Prateleira', parent_id: 1, subgrupo: 'A1' },
  // Ciclo de parent_id (dado corrompido): a subida não pode travar.
  { ...base, id: 5, codigo: 'CIC-01', setor: 'Ciclo', tipo: 'Prateleira', parent_id: 6 },
  { ...base, id: 6, codigo: 'CIC-02', setor: 'Ciclo', tipo: 'Prateleira', parent_id: 5 },
];

let container;
let root;
let metaImpl;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  metaImpl = () => Promise.resolve({ data: { localizacoes_tipos: TIPOS_LOC, tipos: [], areas_especiais: AREAS } });
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/mapa/localizacoes') return Promise.resolve({ data: LOCS });
    if (url === '/almoxarifado/meta/tipos-material') return metaImpl();
    if (url === '/almoxarifado/almoxarifados') return Promise.resolve({ data: [{ id: 1, codigo: 'ALM-01', nome: 'Geral', ativo: 1 }] });
    return Promise.resolve({ data: [] });
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

async function renderMapa(query = '') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/almoxarifado/mapa${query}`]}>
        <MapaLocalizacoesAlmoxarifado />
      </MemoryRouter>
    );
  });
  await flush();
}

const descricaoArea = () => container.querySelector('[data-testid="descricao-area"]');
const tituloPainel = () => container.querySelector('.almox-mapa-detail h3');
// O <g> do mapa de uma localização, achado pelo código impresso nele.
const zona = (codigo) => [...container.querySelectorAll('svg g')]
  .find(g => [...g.querySelectorAll('.almox-mapa-zone-code')].some(t => t.textContent.endsWith(codigo)));

test('tipos novos têm ícone e cor próprios no mapa (não o 📍 e o azul genérico)', async () => {
  await renderMapa();
  const sucata = zona('SUC-01');
  const devol = zona('DEV-01');
  expect(sucata).toBeTruthy();
  expect(devol).toBeTruthy();
  const icone = (g) => g.querySelector('.almox-mapa-zone-icon').textContent.trim();
  const fill = (g) => g.querySelector('rect').getAttribute('fill');
  expect(icone(sucata)).not.toBe('📍');
  expect(icone(devol)).not.toBe('📍');
  expect(icone(sucata)).not.toBe(icone(devol));
  expect(fill(sucata)).not.toBe('#4facfe22');
  expect(fill(devol)).not.toBe('#4facfe22');
  expect(fill(sucata)).not.toBe(fill(devol));
});

test('selecionar a Área de sucata: o painel mostra a descrição da área vinda do meta', async () => {
  await renderMapa('?loc=1');
  expect(tituloPainel().textContent).not.toContain('📍');
  const el = descricaoArea();
  expect(el).toBeTruthy();
  expect(el.textContent).toContain(DESC_SUCATA);
});

test('selecionar a Área de devoluções: a descrição é a dela, não a da sucata', async () => {
  await renderMapa('?loc=2');
  expect(tituloPainel().textContent).not.toContain('📍');
  expect(descricaoArea().textContent).toContain(DESC_DEVOLUCOES);
  expect(descricaoArea().textContent).not.toContain(DESC_SUCATA);
});

test('metade positiva: Prateleira solta não mostra descrição de área', async () => {
  await renderMapa('?loc=3');
  expect(tituloPainel().textContent).toContain('PRT-01');
  expect(descricaoArea()).toBeNull();
});

test('posição dentro da área (tipo Prateleira): a área EFETIVA é a do pai, e o painel diz de onde vem', async () => {
  await renderMapa('?loc=4');
  const el = descricaoArea();
  expect(el).toBeTruthy();
  expect(el.textContent).toContain(DESC_SUCATA);
  expect(el.textContent).toContain('SUC-01');
});

test('ciclo de parent_id não trava e não inventa área', async () => {
  await renderMapa('?loc=5');
  expect(tituloPainel().textContent).toContain('CIC-01');
  expect(descricaoArea()).toBeNull();
});

test('meta sem areas_especiais (servidor anterior): mapa abre, ícone novo continua, sem descrição', async () => {
  metaImpl = () => Promise.resolve({ data: { localizacoes_tipos: [], tipos: [] } });
  await renderMapa('?loc=1');
  expect(zona('SUC-01')).toBeTruthy();
  expect(tituloPainel().textContent).toContain('SUC-01');
  expect(tituloPainel().textContent).not.toContain('📍');
  expect(descricaoArea()).toBeNull();
});
