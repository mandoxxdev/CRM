/**
 * Etapa 212 (RN-212.01, RN-212.04) — o formulário de material e a seção "Fornecedores deste material".
 *  - No Compras, editando: a seção aparece e lê `/compras/materiais/cadastro/:id/fornecedores`, com o texto antigo do material.
 *  - No Compras, material novo: só a frase "Salve o material…" (o vínculo precisa do id).
 *  - No Almoxarifado: sem a seção.
 *  - Em todos: "Fornecedor Principal" e "Código no Fornecedor" saíram da tela — e o PUT continua mandando os dois valores lidos
 *    (nada gravado é apagado; a lista CAMPOS_LIDOS bate com a do servidor).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MaterialAlmoxarifadoForm from './MaterialAlmoxarifadoForm';
import { ROTAS_COMPRAS } from './rotasCadastroMaterial';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1 } }),
}));

const FAMILIA = { id: 5, codigo: 'CHP', nome: 'Chapas', parent_id: null, ativo: 1 };
const MATERIAL = {
  id: 77, codigo: 'CHP-002', nome: 'Chapa inox 304', familia_id: 5, unidade: 'KG', categoria: 'Chapas', quantidade_atual: 0,
  fornecedor_principal: 'Fornecedor Antigo', codigo_fornecedor: 'FA-1',
};
const LINHAS = [{ id: 11, fornecedor_id: 1, fornecedor_nome: 'Alfa', codigo: 'INX-001', descricao: 'CHAPA 304', unidade: 'KG', preco: 10 }];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/cadastro/77/fornecedores') return Promise.resolve({ data: LINHAS });
    if (url === '/compras/materiais/cadastro/77' || url === '/almoxarifado/materiais/77') return Promise.resolve({ data: MATERIAL });
    if (url.endsWith('/familias')) return Promise.resolve({ data: [FAMILIA] });
    if (url.endsWith('/categorias')) return Promise.resolve({ data: [{ id: 2, nome: 'Chapas', ativo: 1 }] });
    if (url.endsWith('/minhas-permissoes')) return Promise.resolve({ data: { perfil: 'COMPRAS', acoes: { criar_material: true, editar_material: true } } });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { id: 77 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperar = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function abrir(caminho, padrao, rotas) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[caminho]}>
        <Routes><Route path={padrao} element={<MaterialAlmoxarifadoForm rotas={rotas} />} /></Routes>
      </MemoryRouter>,
    );
  });
  await esperar();
}
const rotulos = () => [...container.querySelectorAll('label')].map((l) => l.textContent.trim());

describe('Formulário de material — Etapa 212', () => {
  test('[RN-212.01/04] Compras, editando: a seção lista os fornecedores e mostra o texto antigo; os dois campos antigos saíram', async () => {
    await abrir('/compras/materiais/editar/77', '/compras/materiais/editar/:id', ROTAS_COMPRAS);
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/cadastro/77/fornecedores');
    expect(container.querySelector('[data-testid="fornecedor-do-material-11"]').textContent).toContain('INX-001');
    expect(container.querySelector('[data-testid="fornecedor-texto-antigo"]').textContent).toContain('Fornecedor Antigo');
    expect(rotulos()).not.toContain('Fornecedor Principal');
    expect(rotulos()).not.toContain('Código no Fornecedor');
    expect(rotulos().some((r) => /Nome do Material/.test(r))).toBe(true); // metade positiva: o formulário está lá
  });

  test('[RN-212.01] Compras, material novo: só a frase de salvar antes; nenhuma leitura de fornecedores', async () => {
    await abrir('/compras/materiais/novo?familia_id=5', '/compras/materiais/novo', ROTAS_COMPRAS);
    expect(container.querySelector('[data-testid="fornecedores-depois-de-salvar"]').textContent)
      .toBe('Salve o material para vincular os fornecedores (cada um com o seu código).');
    expect(container.querySelector('[data-testid="fornecedores-do-material"]')).toBeNull();
    expect(api.get.mock.calls.some((c) => /\/fornecedores$/.test(c[0]))).toBe(false);
  });

  test('[RN-212.01] Almoxarifado: sem a seção (o cadastro é do Compras) e sem os dois campos antigos', async () => {
    await abrir('/almoxarifado/materiais/editar/77', '/almoxarifado/materiais/editar/:id', undefined);
    expect(rotulos().some((r) => /Nome do Material/.test(r))).toBe(true); // metade positiva
    expect(container.querySelector('[data-testid="fornecedores-do-material"]')).toBeNull();
    expect(container.querySelector('[data-testid="fornecedores-depois-de-salvar"]')).toBeNull();
    expect(rotulos()).not.toContain('Fornecedor Principal');
  });

  test('[RN-212.04] salvar o material no Compras continua mandando o fornecedor antigo lido (nada é apagado)', async () => {
    await abrir('/compras/materiais/editar/77', '/compras/materiais/editar/:id', ROTAS_COMPRAS);
    const form = container.querySelector('form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await esperar();
    expect(api.put).toHaveBeenCalled();
    const [url, corpo] = api.put.mock.calls[0];
    expect(url).toBe('/compras/materiais/cadastro/77');
    expect(corpo.fornecedor_principal).toBe('Fornecedor Antigo');
    expect(corpo.codigo_fornecedor).toBe('FA-1');
  });
});
