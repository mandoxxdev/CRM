/**
 * Etapa 126 (D (125), RN-29; B815, B816) — o *Editar* da aba Famílias manda o que LEU (`campos_lidos`).
 *
 * Antes o *Editar* mandava só `{nome, descricao, tipo_uso}` do formulário — a mudança que outro Administrador fez depois de a lista
 * carregar era desfeita calada. Agora o `PUT` leva `campos_lidos` com o nome, o tipo de uso e a descrição CRUS da família da lista
 * (`null` fica `null`), o servidor recusa (409) desfazer o que mudou, e a tela mostra a literal no toast, mantém o formulário com o
 * digitado e recarrega a lista.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/FamiliasEditarLidos --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' } }),
}));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

// FORMA REAL de GET /api/almoxarifado/familias (f.* cru): a descricao e o tipo de uso podem vir NULL (legado).
const ROL = { id: 1, codigo: 'ROL', nome: 'Rolamentos', descricao: 'Rolamentos em geral', parent_id: null, tipo_uso: 'industrial', ativo: 1, qtd_itens: 0 };
const LEG = { id: 2, codigo: 'LEG', nome: 'Legado', descricao: null, parent_id: null, tipo_uso: null, ativo: 1, qtd_itens: 0 };
const ESF = { id: 3, codigo: 'ROL-ESF', nome: 'Esferas', descricao: '', parent_id: 1, tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };
const VED = { id: 20, codigo: 'VED', nome: 'Vedações', descricao: 'v', parent_id: null, tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
const L409 = 'O campo "Descrição" da família ROL foi mudado por outra pessoa depois que você abriu a edição — salvar desfaria essa '
  + 'mudança, e nada foi gravado. Recarregue a lista e edite de novo.';

let container; let root; let lista;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  lista = [ROL, LEG, ESF, VED];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: lista });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: { id: 50 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function renderAba() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=familias']}><ConfiguracoesAlmoxarifado /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}
const cartaoDe = (codigo) => [...container.querySelectorAll('.almox-familia-card')]
  .find((c) => c.querySelector('.almox-familia-cabecalho')?.textContent.includes(codigo));
const clicar = async (el) => { await act(async () => { el.click(); }); };
const botaoPorTexto = (regex) => [...container.querySelectorAll('button')].find((b) => regex.test(b.textContent));
const inputNome = () => container.querySelector('input[placeholder="Ex: Parafusos e Porcas"]');
const inputDescricao = () => container.querySelector('input[placeholder="Descrição breve da família"]');
function preencher(el, valor) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setValue.call(el, valor); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const editar = async (codigo) => clicar(cartaoDe(codigo).querySelector('.almox-familia-cabecalho button[title="Editar"]'));
const salvar = async () => { await clicar(botaoPorTexto(/^\s*Salvar/)); await act(async () => { await Promise.resolve(); }); };

describe('D (125) (Etapa 126) — RN-29: o Editar manda o que leu', () => {
  test('o PUT leva campos_lidos com nome, tipo de uso e descrição CRUS da lista, mesmo depois de editar', async () => {
    await renderAba();
    await editar('ROL');
    preencher(inputNome(), 'Rolamentos e mancais');
    preencher(inputDescricao(), 'outra');
    await salvar();
    expect(api.put).toHaveBeenCalledTimes(1);
    const [rota, corpo] = api.put.mock.calls[0];
    expect(rota).toBe('/almoxarifado/familias/1');
    expect(corpo).toEqual({
      nome: 'Rolamentos e mancais', descricao: 'outra', tipo_uso: 'industrial',
      campos_lidos: { nome: 'Rolamentos', tipo_uso: 'industrial', descricao: 'Rolamentos em geral' },
    });
  });

  test('o legado (descrição e tipo de uso NULL) vai null nos lidos — não o "" e o "ambos" do formulário', async () => {
    await renderAba();
    await editar('LEG');
    await salvar();
    const [, corpo] = api.put.mock.calls[0];
    expect(corpo.descricao).toBe('');
    expect(corpo.tipo_uso).toBe('ambos');
    expect(corpo.campos_lidos).toEqual({ nome: 'Legado', tipo_uso: null, descricao: null });
  });

  test('chave ausente na família da lista vai null', async () => {
    const { descricao, tipo_uso, ...semAs } = ROL; // eslint-disable-line no-unused-vars
    lista = [semAs];
    await renderAba();
    await editar('ROL');
    await salvar();
    expect(api.put.mock.calls[0][1].campos_lidos).toEqual({ nome: 'Rolamentos', tipo_uso: null, descricao: null });
  });

  test('a subfamília também leva os lidos dela (não os da raiz)', async () => {
    await renderAba();
    const sub = [...cartaoDe('ROL').querySelectorAll('.almox-subfamilia-row')].find((r) => r.textContent.includes('ROL-ESF'));
    await clicar(sub.querySelector('button[title="Editar"]'));
    await salvar();
    const [rota, corpo] = api.put.mock.calls[0];
    expect(rota).toBe('/almoxarifado/familias/3');
    expect(corpo.campos_lidos).toEqual({ nome: 'Esferas', tipo_uso: 'ambos', descricao: '' });
    expect(corpo).not.toHaveProperty('parent_id');
  });

  test('Nova família, Nova subfamília e Reativar NÃO levam campos_lidos', async () => {
    await renderAba();
    await clicar(botaoPorTexto(/Nova Família/));
    preencher(inputNome(), 'Nova');
    await salvar();
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('campos_lidos');
    await clicar(botaoPorTexto(/Nova subfamília/));
    preencher(inputNome(), 'Nova sub');
    await salvar();
    expect(api.post.mock.calls[1][1]).not.toHaveProperty('campos_lidos');
    await clicar(cartaoDe('VED').querySelector('button[title="Reativar"]'));
    await act(async () => { await Promise.resolve(); });
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/familias/20', { ativo: 1 });
  });

  test('editar outra família depois de cancelar leva os lidos da NOVA', async () => {
    await renderAba();
    await editar('ROL');
    await clicar(botaoPorTexto(/^\s*Cancelar/));
    await editar('LEG');
    await salvar();
    expect(api.put.mock.calls[0][0]).toBe('/almoxarifado/familias/2');
    expect(api.put.mock.calls[0][1].campos_lidos.nome).toBe('Legado');
  });
});

describe('D (125) (Etapa 126) — RN-29: o 409', () => {
  test('o 409: toast com a literal, o formulário FICA com o digitado e a lista recarrega', async () => {
    api.put.mockRejectedValueOnce({ response: { status: 409, data: { error: L409 } } });
    await renderAba();
    const chamadasLista = () => api.get.mock.calls.filter(([u]) => u === '/almoxarifado/familias?ativo=all').length;
    const antes = chamadasLista();
    await editar('ROL');
    preencher(inputNome(), 'Meu nome novo');
    await salvar();
    expect(toast.error).toHaveBeenCalledWith(L409);
    expect(toast.success).not.toHaveBeenCalled();
    expect(inputNome()).not.toBeNull();
    expect(inputNome().value).toBe('Meu nome novo');
    expect(chamadasLista()).toBe(antes + 1);
  });

  test('[Fase 2, I2] o segundo Salvar depois do 409 manda os MESMOS lidos (não os da lista recarregada)', async () => {
    api.put.mockRejectedValue({ response: { status: 409, data: { error: L409 } } });
    await renderAba();
    await editar('ROL');
    lista = [{ ...ROL, descricao: 'mudada pelo outro' }, LEG, ESF, VED];
    await salvar();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Rolamentos');
    await salvar();
    expect(api.put).toHaveBeenCalledTimes(2);
    expect(api.put.mock.calls[1][1].campos_lidos).toEqual({ nome: 'Rolamentos', tipo_uso: 'industrial', descricao: 'Rolamentos em geral' });
    // o próximo Editar lê de novo (da lista recarregada)
    api.put.mockResolvedValue({ data: {} });
    await clicar(botaoPorTexto(/^s*Cancelar/));
    await editar('ROL');
    await salvar();
    expect(api.put.mock.calls[2][1].campos_lidos.descricao).toBe('mudada pelo outro');
  });

  test('[controle] o 400 (outra recusa) continua: toast com a literal, sem recarregar a lista', async () => {
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Nome é obrigatório' } } });
    await renderAba();
    const chamadasLista = () => api.get.mock.calls.filter(([u]) => u === '/almoxarifado/familias?ativo=all').length;
    const antes = chamadasLista();
    await editar('ROL');
    await salvar();
    expect(toast.error).toHaveBeenCalledWith('Nome é obrigatório');
    expect(inputNome()).not.toBeNull();
    expect(chamadasLista()).toBe(antes);
  });
});
