/**
 * Etapa 125 (C259, RN-15..RN-17; B808) — a aba Famílias fica SOMENTE LEITURA para quem o servidor recusa.
 *
 * O administrador do sistema (`role: 'admin'`) sem perfil do almoxarifado abre Configurações (o `canConfigureAlmox` do cliente
 * aceita o administrador do sistema), mas as rotas de família (`denyUnlessAlmoxAdmin`) recusam com 403. Antes ele via *Nova
 * Família*, *Editar*, *Inativar* e *Reativar*, e cada clique respondia "Acesso restrito". Agora a aba mostra a árvore sem os gestos
 * de FAMÍLIA, com uma frase que diz de quem é; os gestos de MATERIAL (*Adicionar item*, *Cadastrar primeiro item*, editar o item)
 * ficam — o servidor deixa (Fase 2, I1).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/FamiliasSomenteLeitura --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import api from '../../services/api';
import { podeGravarConfigAlmox, canConfigureAlmox } from '../../utils/systemPermissions';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
let mockUser = null;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const ADMIN_SISTEMA = { id: 5, nome: 'Admin do sistema', role: 'admin' };
const ADM_PERFIL = { id: 4, nome: 'Adm', role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' };
const ADM_MODULO = { id: 6, nome: 'Adm do modulo', role: 'user', admin_modulos: '["almoxarifado"]' };
const SUPER = { id: 1, nome: 'Super', role: 'admin', is_superadmin: 1 };
const FRASE = 'Somente leitura — cadastrar, editar, inativar e reativar famílias é do Administrador do almoxarifado ou do '
  + 'Super Administrador; peça a um deles.';

const ROL = { id: 1, codigo: 'ROL', nome: 'Rolamentos', descricao: '', parent_id: null, tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };
const ESF = { id: 3, codigo: 'ROL-ESF', nome: 'Esferas', descricao: '', parent_id: 1, tipo_uso: 'ambos', ativo: 1, qtd_itens: 1 };
const VED = { id: 20, codigo: 'VED', nome: 'Vedações', descricao: '', parent_id: null, tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
const AGU = { id: 22, codigo: 'ROL-AGU', nome: 'Agulhas', descricao: '', parent_id: 1, tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
// a orfa: sub ATIVA sob raiz inativa (so por escrita fora das rotas) — o bloco proprio tambem tem Editar/Inativar
const ORF = { id: 23, codigo: 'VED-PLA', nome: 'Planas', descricao: '', parent_id: 20, parent_nome: 'Vedações', tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };
const ITENS_ESF = [{ id: 10, codigo: 'ROL-001', nome: 'Rolamento', quantidade_atual: 5, unidade: 'UN', localizacao: null }];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: [ROL, ESF, VED, AGU, ORF] });
    if (url === '/almoxarifado/familias/3/itens') return Promise.resolve({ data: ITENS_ESF });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function renderAba(user) {
  mockUser = user;
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=familias']}><ConfiguracoesAlmoxarifado /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}
const botoes = (titulo) => container.querySelectorAll(`button[title="${titulo}"]`);
const porTexto = (seletor, regex) => [...container.querySelectorAll(seletor)].filter((b) => regex.test(b.textContent));
const clicar = async (el) => { await act(async () => { el.click(); }); };

describe('C259 (Etapa 125) — RN-15: quem o servidor deixa gravar família', () => {
  test('o administrador do sistema sem perfil: abre a tela (canConfigureAlmox) mas não grava (podeGravarConfigAlmox)', () => {
    expect(canConfigureAlmox(ADMIN_SISTEMA)).toBe(true);
    expect(podeGravarConfigAlmox(ADMIN_SISTEMA)).toBe(false);
  });
  test('Super Administrador, administrador do módulo e perfil Administrador gravam; o resto não', () => {
    expect(podeGravarConfigAlmox(SUPER)).toBe(true);
    expect(podeGravarConfigAlmox(ADM_MODULO)).toBe(true);
    expect(podeGravarConfigAlmox(ADM_PERFIL)).toBe(true);
    expect(podeGravarConfigAlmox({ id: 9, role: 'user', perfil_almoxarifado: 'ALMOXARIFE' })).toBe(false);
    expect(podeGravarConfigAlmox(null)).toBe(false);
  });
});

describe('C259 (Etapa 125) — RN-16/RN-17: a aba Famílias', () => {
  test('[RN-16] administrador do sistema: a árvore sem os gestos de família, com a frase', async () => {
    await renderAba(ADMIN_SISTEMA);
    // metade positiva: a árvore está lá (ativas, inativas, a órfã)
    for (const nome of ['Rolamentos', 'Esferas', 'Vedações', 'Agulhas', 'Planas']) expect(container.textContent).toContain(nome);
    expect(container.textContent).toContain(FRASE);
    expect(porTexto('button', /Nova Família/)).toHaveLength(0);
    expect(porTexto('button', /Nova subfamília/)).toHaveLength(0);
    expect(botoes('Editar')).toHaveLength(0);
    expect(botoes('Inativar')).toHaveLength(0);
    expect(botoes('Reativar')).toHaveLength(0);
  });

  test('[RN-16, Fase 2 I1] administrador do sistema: os gestos de MATERIAL ficam (Adicionar item, editar o item)', async () => {
    await renderAba(ADMIN_SISTEMA);
    // os dois links, o da raiz ativa e o da sub ativa (a inativa e a orfa nao tem — o de sempre)
    expect(porTexto('a', /Adicionar item/)).toHaveLength(2);
    expect(container.querySelector('a[href="/almoxarifado/materiais/novo?familia_id=1"]')).not.toBeNull();
    expect(container.querySelector('a[href="/almoxarifado/materiais/novo?familia_id=1&subfamilia_id=3"]')).not.toBeNull();
    await clicar(container.querySelector('button[title="Itens da subfamília"]'));
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('a[href="/almoxarifado/materiais/editar/10"]')).not.toBeNull();
    // a raiz sem itens, expandida: "Cadastrar primeiro item" continua
    await clicar(container.querySelector('.almox-familia-cabecalho'));
    await act(async () => { await Promise.resolve(); });
    expect(porTexto('a', /Cadastrar primeiro item/)).toHaveLength(1);
  });

  test('[RN-17] perfil Administrador: a aba como antes (os botões, sem a frase)', async () => {
    await renderAba(ADM_PERFIL);
    expect(container.textContent).not.toContain(FRASE);
    expect(porTexto('button', /Nova Família/)).toHaveLength(1);
    expect(porTexto('button', /Nova subfamília/).length).toBeGreaterThan(0);
    expect(botoes('Editar').length).toBeGreaterThan(0);
    expect(botoes('Inativar').length).toBeGreaterThan(0);
    expect(botoes('Reativar').length).toBeGreaterThan(0);
  });
});
