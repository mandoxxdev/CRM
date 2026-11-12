/**
 * Etapa 212 (RN-212.01 a RN-212.04) — a seção "Fornecedores deste material" (Compras → Materiais → editar).
 * O servidor é mockado SÓ na fronteira HTTP (contrato do plano): GET/POST/PUT/DELETE `/compras/materiais/cadastro/:id/fornecedores`.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FornecedoresDoMaterial from './FornecedoresDoMaterial';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const LINHAS = [
  { id: 11, fornecedor_id: 1, fornecedor_nome: 'Alfa', codigo: 'INX-001', descricao: 'CHAPA 304', unidade: 'KG', preco: 45.9 },
  { id: 12, fornecedor_id: 2, fornecedor_nome: 'Beta Metais SA', codigo: 'CH-304', descricao: 'CHAPA INOX', unidade: 'KG', preco: 0 },
];
const FORNECEDORES = [
  { id: 1, razao_social: 'Aços Alfa Ltda', nome_fantasia: 'Alfa', status: 'ativo' },
  { id: 2, razao_social: 'Beta Metais SA', nome_fantasia: '', status: 'ativo' },
  { id: 3, razao_social: 'Gama Inox', nome_fantasia: null, status: null },
  { id: 4, razao_social: 'Delta Parado', nome_fantasia: null, status: 'inativo' },
];

let container; let root;
const tick = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await tick(); };
const digitar = async (el, v) => {
  const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
};
const $ = (sel) => container.querySelector(sel);

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/cadastro/7/fornecedores') return Promise.resolve({ data: LINHAS });
    if (url === '/compras/fornecedores') return Promise.resolve({ data: FORNECEDORES });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 99 } });
  api.put.mockResolvedValue({ data: {} });
  api.delete.mockResolvedValue({ data: { ok: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function render(props = {}) {
  await act(async () => { root.render(<FornecedoresDoMaterial materialId={7} {...props} />); });
  await tick();
}

describe('FornecedoresDoMaterial — Etapa 212', () => {
  test('[RN-212.01] lista as linhas do material: fornecedor, código, descrição, unidade e preço', async () => {
    await render();
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/cadastro/7/fornecedores');
    const l = $('[data-testid="fornecedor-do-material-11"]').textContent;
    expect(l).toContain('Alfa');
    expect(l).toContain('INX-001');
    expect(l).toContain('CHAPA 304');
    expect(l).toMatch(/45,90/);
    expect($('[data-testid="fornecedor-do-material-12"]').textContent).toContain('Beta Metais SA');
  });

  test('[RN-212.01] vincular: a lista de escolha tira os já vinculados e o inativo; o POST leva o fornecedor e os campos', async () => {
    await render();
    await clicar($('[data-testid="vincular-fornecedor"]'));
    const opcoes = [...$('#fdm-fornecedor').options].map((o) => o.textContent);
    expect(opcoes).toEqual(['Selecione...', 'Gama Inox']);
    await digitar($('#fdm-fornecedor'), '3');
    await digitar($('#fdm-codigo'), '45879');
    await digitar($('#fdm-preco'), '12,50');
    await clicar($('[data-testid="salvar-fornecedor-do-material"]'));
    expect(api.post).toHaveBeenCalledWith('/compras/materiais/cadastro/7/fornecedores',
      { codigo: '45879', descricao: '', unidade: '', preco: '12,50', fornecedor_id: 3 });
    expect(toast.success).toHaveBeenCalledWith('Fornecedor vinculado ao material');
    expect(api.get.mock.calls.filter((c) => c[0] === '/compras/materiais/cadastro/7/fornecedores')).toHaveLength(2);
  });

  test('[RN-212.02] sem fornecedor recusa antes do POST; a recusa do servidor vai para o toast com a literal', async () => {
    await render();
    await clicar($('[data-testid="vincular-fornecedor"]'));
    await clicar($('[data-testid="salvar-fornecedor-do-material"]'));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Escolha o fornecedor.');
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Este fornecedor já está vinculado a este material.' } } });
    await digitar($('#fdm-fornecedor'), '3');
    await clicar($('[data-testid="salvar-fornecedor-do-material"]'));
    expect(toast.error).toHaveBeenLastCalledWith('Este fornecedor já está vinculado a este material.');
    expect($('[data-testid="form-fornecedor-do-material"]')).not.toBeNull(); // o formulário fica com o digitado
  });

  test('[RN-212.01] editar manda PUT sem o fornecedor; remover pede confirmação e manda DELETE', async () => {
    await render();
    await clicar($('[data-testid="editar-fornecedor-11"]'));
    expect($('#fdm-fornecedor')).toBeNull(); // o fornecedor não muda
    await digitar($('#fdm-preco'), '50');
    await clicar($('[data-testid="salvar-fornecedor-do-material"]'));
    expect(api.put).toHaveBeenCalledWith('/compras/materiais/cadastro/7/fornecedores/11',
      { codigo: 'INX-001', descricao: 'CHAPA 304', unidade: 'KG', preco: '50' });
    const confirm = jest.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    await clicar($('[data-testid="remover-fornecedor-12"]'));
    expect(api.delete).not.toHaveBeenCalled();
    await clicar($('[data-testid="remover-fornecedor-12"]'));
    expect(api.delete).toHaveBeenCalledWith('/compras/materiais/cadastro/7/fornecedores/12');
    confirm.mockRestore();
  });

  test('[RN-212.04] o texto antigo aparece para vincular à mão; sem texto, não aparece (e a lista está lá)', async () => {
    await render({ textoAntigo: { fornecedor: 'Fornecedor X', codigo: 'X-9' } });
    expect($('[data-testid="fornecedor-texto-antigo"]').textContent).toContain('Fornecedor informado antes (texto livre): Fornecedor X · código X-9');
    await act(async () => { root.render(<FornecedoresDoMaterial materialId={7} textoAntigo={{ fornecedor: '', codigo: '' }} />); });
    await tick();
    expect($('[data-testid="fornecedor-texto-antigo"]')).toBeNull();
    expect($('[data-testid="fornecedor-do-material-11"]')).not.toBeNull();
  });

  test('[Fase 5] dentro do <form> do material: Enter num campo da seção salva o fornecedor e NÃO envia o material', async () => {
    const enviar = jest.fn((e) => e.preventDefault());
    await act(async () => { root.render(<form onSubmit={enviar}><FornecedoresDoMaterial materialId={7} /></form>); });
    await tick();
    await clicar($('[data-testid="vincular-fornecedor"]'));
    await digitar($('#fdm-fornecedor'), '3');
    await digitar($('#fdm-codigo'), 'G-1');
    const ev = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => { $('#fdm-codigo').dispatchEvent(ev); });
    await tick();
    expect(ev.defaultPrevented).toBe(true); // o navegador nao faz o envio implicito do formulario do material
    expect(api.post).toHaveBeenCalledWith('/compras/materiais/cadastro/7/fornecedores', expect.objectContaining({ fornecedor_id: 3, codigo: 'G-1' }));
    expect(enviar).not.toHaveBeenCalled();
  });

  test('somente leitura: sem Vincular, Editar e Remover (a lista continua)', async () => {
    await render({ somenteLeitura: true });
    expect($('[data-testid="fornecedor-do-material-11"]')).not.toBeNull();
    expect($('[data-testid="vincular-fornecedor"]')).toBeNull();
    expect($('[data-testid="editar-fornecedor-11"]')).toBeNull();
  });
});
