/**
 * Etapa 216 (RN-216.01/02) — o Tipo de Material do formulário de material é escolhido da lista do cadastro de tipos
 * (`GET /compras/materiais/aux/tipos-material` no Compras). O gravado que casa sem acento e sem caixa mostra o item da lista; o que
 * não casa entra rotulado "(fora da lista)"; salvar sem mexer manda o gravado.
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
const TIPOS = [{ id: 1, nome: 'Consumível', ativo: 1 }, { id: 2, nome: 'EPI', ativo: 1 }];
let material;

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  material = { id: 77, codigo: 'CHP-002', nome: 'Chapa inox 304', familia_id: 5, unidade: 'KG', categoria: 'Chapas', quantidade_atual: 0, tipo_material: 'CONSUMÍVEL' };
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/cadastro/77') return Promise.resolve({ data: material });
    if (url === '/compras/materiais/aux/tipos-material') return Promise.resolve({ data: TIPOS });
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
async function abrir() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/compras/materiais/editar/77']}>
        <Routes><Route path="/compras/materiais/editar/:id" element={<MaterialAlmoxarifadoForm rotas={ROTAS_COMPRAS} />} /></Routes>
      </MemoryRouter>,
    );
  });
  await esperar();
}
const select = () => container.querySelector('#material-tipo-material');
const opcoes = () => [...select().options].map((o) => o.textContent);
const salvar = async () => {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
};

describe('Tipo de Material de uma lista — Etapa 216', () => {
  test('[RN-216.01] é um select com os tipos do cadastro, lidos pela porta do Compras; o gravado que casa sem acento/caixa fica selecionado', async () => {
    await abrir();
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/aux/tipos-material');
    expect(select()).not.toBeNull();
    expect(opcoes()).toEqual(['Selecione…', 'Consumível', 'EPI']);
    expect(select().value).toBe('Consumível');
  });

  test('[RN-216.01] escolher outro tipo manda o nome da lista no PUT', async () => {
    await abrir();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(select(), 'EPI');
      select().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await salvar();
    expect(api.put).toHaveBeenCalled();
    expect(api.put.mock.calls[0][1].tipo_material).toBe('EPI');
  });

  test('[RN-216.02] gravado fora da lista: aparece rotulado e selecionado; salvar sem mexer mantém o gravado', async () => {
    material.tipo_material = 'Chapa grossa';
    await abrir();
    expect(opcoes()).toEqual(['Selecione…', 'Consumível', 'EPI', 'Chapa grossa (fora da lista)']);
    expect(select().value).toBe('Chapa grossa');
    await salvar();
    expect(api.put.mock.calls[0][1].tipo_material).toBe('Chapa grossa');
  });
});
