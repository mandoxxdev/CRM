/**
 * Etapa 238 (RN-238.01/02/03) — o Nº e a Validade do CA aparecem só para material EPI (as marcas da RN-178.01: tipo com `is_epi`,
 * tipo escrito "EPI", categoria "EPIs", ou o `tipo_material_id` gravado de um tipo EPI), com a explicação do que é o CA. Fora disso
 * os campos somem, mas o valor gravado vai no salvar como estava.
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

const EXPLICACAO = 'CA é o Certificado de Aprovação do EPI (equipamento de proteção individual): o número e a data de validade que '
  + 'constam no certificado. Só vale para material do tipo EPI.';
const FAMILIA = { id: 5, codigo: 'EPI', nome: 'Proteção', parent_id: null, ativo: 1 };
// "Luvas e mangotes" tem a marca EPI com outro nome: prova que a regra lê a marca, não só o nome "EPI".
const TIPOS = [
  { id: 1, nome: 'Consumível', ativo: 1, is_epi: 0 },
  { id: 2, nome: 'EPI', ativo: 1, is_epi: 1 },
  { id: 3, nome: 'Luvas e mangotes', ativo: 1, is_epi: 1 },
];
let material;

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  material = {
    id: 77, codigo: 'EPI-001', nome: 'Luva de raspa', familia_id: 5, unidade: 'PR', categoria: 'Chapas', quantidade_atual: 0,
    tipo_material: 'Consumível', tipo_material_id: null, ca_numero: '12345', ca_validade: '2027-03-31',
  };
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/cadastro/77') return Promise.resolve({ data: material });
    if (url === '/compras/materiais/aux/tipos-material') return Promise.resolve({ data: TIPOS });
    if (url.endsWith('/familias')) return Promise.resolve({ data: [FAMILIA] });
    if (url.endsWith('/categorias')) return Promise.resolve({ data: [{ id: 2, nome: 'Chapas', ativo: 1 }, { id: 3, nome: 'EPIs', ativo: 1 }] });
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
const numero = () => container.querySelector('#material-ca-numero');
const validade = () => container.querySelector('#material-ca-validade');
const explicacao = () => container.querySelector('#material-ca-explicacao');
const escolher = async (id, valor) => {
  const el = container.querySelector(id);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const salvar = async () => {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
};

describe('CA só para EPI — Etapa 238', () => {
  test('[RN-238.01/02] tipo EPI: os dois campos aparecem com a explicação do CA e o valor gravado', async () => {
    material.tipo_material = 'EPI';
    await abrir();
    expect(numero()).not.toBeNull();
    expect(numero().value).toBe('12345');
    expect(validade().value).toBe('2027-03-31');
    expect(explicacao()).not.toBeNull();
    expect(explicacao().textContent).toBe(EXPLICACAO);
  });

  test('[RN-238.02] tipo sem marca EPI: os campos e a explicação não aparecem (o resto do formulário sim)', async () => {
    await abrir();
    expect(container.querySelector('#material-tipo-material').value).toBe('Consumível');
    expect(numero()).toBeNull();
    expect(validade()).toBeNull();
    expect(explicacao()).toBeNull();
  });

  test('[RN-238.02] trocar o tipo na tela faz aparecer e sumir; a marca vale com outro nome', async () => {
    await abrir();
    expect(numero()).toBeNull();
    await escolher('#material-tipo-material', 'Luvas e mangotes');
    expect(numero()).not.toBeNull();
    expect(explicacao()).not.toBeNull();
    await escolher('#material-tipo-material', 'Consumível');
    expect(numero()).toBeNull();
  });

  test('[RN-238.02] categoria EPIs também é EPI', async () => {
    await abrir();
    expect(numero()).toBeNull();
    await escolher('#material-categoria', 'EPIs');
    expect(numero()).not.toBeNull();
  });

  test('[RN-238.02] material ligado a um tipo EPI pelo cadastro (tipo_material_id) é EPI mesmo com o tipo escrito comum', async () => {
    material.tipo_material_id = 3;
    await abrir();
    expect(numero()).not.toBeNull();
    expect(numero().value).toBe('12345');
  });

  test('[RN-238.03] campos escondidos: salvar manda o CA gravado como estava', async () => {
    await abrir();
    expect(numero()).toBeNull();
    await salvar();
    expect(api.put).toHaveBeenCalled();
    expect(api.put.mock.calls[0][1].ca_numero).toBe('12345');
    expect(api.put.mock.calls[0][1].ca_validade).toBe('2027-03-31');
  });

  test('[RN-238.03] digitado como EPI e trocado para Consumível: o valor some da tela mas vai no salvar', async () => {
    material.tipo_material = 'EPI';
    material.ca_numero = '';
    material.ca_validade = '';
    await abrir();
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(numero(), '999');
      numero().dispatchEvent(new Event('input', { bubbles: true }));
    });
    await escolher('#material-tipo-material', 'Consumível');
    expect(numero()).toBeNull();
    await salvar();
    expect(api.put.mock.calls[0][1].ca_numero).toBe('999');
  });
});
