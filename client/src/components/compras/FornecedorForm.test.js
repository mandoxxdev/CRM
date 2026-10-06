/**
 * Etapa 34 — tela própria do fornecedor (/compras/fornecedores/novo e /editar/:id) contra o
 * contrato congelado da seção 4 do design
 * (docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md).
 *
 * O servidor é mockado na fronteira HTTP (`services/api`) — as rotas têm teste próprio em
 * comprasFornecedor.api.test.js e cep.api.test.js. O alvo aqui é o que só a tela pode errar:
 * o corpo EXATO do POST/PUT (13 chaves, + status na edição), a razão vazia barrando o POST,
 * o CNPJ e o CEP preenchendo os campos (e, na edição, NÃO sobrescrevendo o que já estava),
 * a máscara dos telefones e o erro do servidor indo para um `role="alert"`.
 *
 * `react-toastify` é a única lib de toast de `main` (package.json) — mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=FornecedorForm
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FornecedorForm from './FornecedorForm';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() }),
}));

const GRUPOS = [{ id: 1, nome: 'Insumos' }, { id: 2, nome: 'Peças' }];

// Resposta do proxy /api/cnpj: `{success, source, data}` — a tela lê `resp.data.data`.
const CNPJ_VALIDO = '11222333000181';
const RESPOSTA_CNPJ = {
  success: true, source: 'brasilapi',
  data: {
    razao_social: 'ACME INDUSTRIA LTDA', nome_fantasia: 'ACME',
    logradouro: 'RUA DAS FLORES', numero: '100', complemento: '', bairro: 'CENTRO',
    municipio: 'CAMPINAS', cidade: 'CAMPINAS', uf: 'SP', estado: 'SP',
    cep: '13010000', telefone: '1932223333', email: 'acme@acme.com.br',
  },
};

const RESPOSTA_CEP = { cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', cidade: 'São Paulo', estado: 'SP' };

// Linha do GET /compras/fornecedores/:id (contrato): telefone SEM máscara, como o banco antigo tem.
const FORNECEDOR_7 = {
  id: 7, razao_social: 'TECNOPAR FIXADORES LTDA', nome_fantasia: 'TECNOPAR', cnpj: '54.984.382/0001-64',
  inscricao_estadual: '799850123110', contato: 'Carlos', email: 'contato@tecnopar.com.br',
  telefone: '1141772311', telefone_vendedor: null, celular: null,
  endereco: 'AV. WINSTON CHURCHILL, 596', cidade: 'SAO BERNARDO DO CAMPO', estado: 'SP', cep: '09614-000',
  status: 'ativo', grupo_id: 2, foto: null, created_at: '2026-01-01 10:00:00', updated_at: '2026-01-01 10:00:00',
};

let container;
let root;

const respostaPadrao = (url) => {
  if (url === '/compras/grupos') return Promise.resolve({ data: GRUPOS });
  if (url === '/compras/fornecedores/7') return Promise.resolve({ data: { ...FORNECEDOR_7 } });
  if (url === `/cnpj/${CNPJ_VALIDO}`) return Promise.resolve({ data: RESPOSTA_CNPJ });
  if (url === '/cep/01310100') return Promise.resolve({ data: RESPOSTA_CEP });
  return Promise.reject(new Error(`GET inesperado: ${url}`));
};

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation(respostaPadrao);
  api.post.mockResolvedValue({ data: { id: 99, razao_social: 'X', nome_fantasia: null, grupo_id: null } });
  api.put.mockResolvedValue({ data: { message: 'Fornecedor atualizado' } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = () => new Promise((r) => setTimeout(r, 0));

async function renderEm(caminho) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[caminho]}>
        <Routes>
          <Route path="/compras/fornecedores" element={<div data-testid="lista">LISTA</div>} />
          <Route path="/compras/fornecedores/novo" element={<FornecedorForm />} />
          <Route path="/compras/fornecedores/editar/:id" element={<FornecedorForm />} />
        </Routes>
      </MemoryRouter>
    );
    await flush();
  });
}

const campo = (nome) => container.querySelector(`[data-testid="fornecedor-${nome}"]`);

const setNative = (el, valor) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
};

async function digitar(nome, valor) {
  const el = campo(nome);
  if (!el) throw new Error(`campo fornecedor-${nome} nao existe`);
  await act(async () => {
    setNative(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    await flush();
  });
}

async function sairDoCampo(nome) {
  const el = campo(nome);
  await act(async () => {
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await flush();
  });
}

async function clicar(seletor) {
  const el = container.querySelector(seletor);
  if (!el) throw new Error(`botao ${seletor} nao existe`);
  await act(async () => {
    el.click();
    await flush();
  });
}

async function submeter() {
  const form = container.querySelector('form.fornecedor-form');
  await act(async () => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await flush();
  });
}

const alerta = () => container.querySelector('[role="alert"]');

const CAMPOS = ['razao', 'fantasia', 'cnpj', 'ie', 'contato', 'email', 'telefone', 'telefone-vendedor',
  'endereco', 'cidade', 'estado', 'cep', 'grupo'];

describe('FornecedorForm — (a) estrutura', () => {
  test('/novo renderiza as tres secoes, os 13 campos, o grupo com as opcoes do servidor e SEM status', async () => {
    await renderEm('/compras/fornecedores/novo');
    expect(container.querySelector('h1').textContent).toMatch(/Novo fornecedor/i);
    const titulos = [...container.querySelectorAll('form.fornecedor-form .form-section > h2')].map((h) => h.textContent.trim());
    expect(titulos).toEqual(['Identificação', 'Contato', 'Endereço']);
    CAMPOS.forEach((c) => expect(campo(c)).not.toBeNull());
    expect(campo('status')).toBeNull();
    const opcoesGrupo = [...campo('grupo').querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoesGrupo).toEqual(['Sem grupo', 'Insumos', 'Peças']);
    expect(api.get).toHaveBeenCalledWith('/compras/grupos');
    // rotulos da RN-34.02
    const labels = [...container.querySelectorAll('label')].map((l) => l.textContent);
    expect(labels.some((t) => /Nome do vendedor/.test(t))).toBe(true);
    expect(labels.some((t) => /Telefone da empresa/.test(t))).toBe(true);
    expect(labels.some((t) => /Telefone do vendedor/.test(t))).toBe(true);
    // 27 UFs no select de estado (+ opcao vazia)
    expect(campo('estado').querySelectorAll('option').length).toBe(28);
  });
});

describe('FornecedorForm — (b) razao obrigatoria', () => {
  test('submit sem razao mostra role="alert" com a literal e NAO faz POST', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('fantasia', 'Sem razao');
    await submeter();
    expect(alerta()).not.toBeNull();
    expect(alerta().textContent).toMatch(/Razão social é obrigatória/);
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('FornecedorForm — (c) POST exato', () => {
  test('POST com as 13 chaves (grupo_id "" = Sem grupo), toast "Fornecedor salvo" e navega para a lista', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('razao', 'ACME INDUSTRIA LTDA');
    await digitar('fantasia', 'ACME');
    await digitar('cnpj', '11222333000181');
    await digitar('ie', '123456');
    await digitar('contato', 'Joana');
    await digitar('email', 'joana@acme.com');
    await digitar('telefone', '1932223333');
    await digitar('telefone-vendedor', '19999998888');
    await digitar('endereco', 'Rua A, 1');
    await digitar('cidade', 'Campinas');
    await digitar('estado', 'SP');
    await digitar('cep', '13010000');
    await submeter();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/compras/fornecedores', {
      razao_social: 'ACME INDUSTRIA LTDA',
      nome_fantasia: 'ACME',
      cnpj: '11.222.333/0001-81',
      inscricao_estadual: '123456',
      contato: 'Joana',
      email: 'joana@acme.com',
      telefone: '(19) 3222-3333',
      telefone_vendedor: '(19) 99999-8888',
      endereco: 'Rua A, 1',
      cidade: 'Campinas',
      estado: 'SP',
      cep: '13010-000',
      grupo_id: '',
    });
    expect(toast.success).toHaveBeenCalledWith('Fornecedor salvo');
    expect(container.querySelector('[data-testid="lista"]')).not.toBeNull();
  });

  test('grupo escolhido vai como grupo_id da opcao', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('razao', 'X');
    await digitar('grupo', '2');
    await submeter();
    expect(api.post.mock.calls[0][1].grupo_id).toBe('2');
  });
});

describe('FornecedorForm — (d) edicao', () => {
  test('GET /compras/fornecedores/7 preenche os campos (telefone mascarado), mostra status e PUT manda 13 + status', async () => {
    await renderEm('/compras/fornecedores/editar/7');
    expect(api.get).toHaveBeenCalledWith('/compras/fornecedores/7');
    expect(container.querySelector('h1').textContent).toMatch(/Editar fornecedor/i);
    expect(campo('razao').value).toBe('TECNOPAR FIXADORES LTDA');
    expect(campo('cnpj').value).toBe('54.984.382/0001-64');
    expect(campo('telefone').value).toBe('(11) 4177-2311');
    expect(campo('telefone-vendedor').value).toBe('');
    expect(campo('cidade').value).toBe('SAO BERNARDO DO CAMPO');
    expect(campo('estado').value).toBe('SP');
    expect(campo('grupo').value).toBe('2');
    expect(campo('status')).not.toBeNull();
    expect(campo('status').value).toBe('ativo');

    await digitar('telefone-vendedor', '11987654321');
    await digitar('status', 'inativo');
    await submeter();
    expect(api.post).not.toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledWith('/compras/fornecedores/7', {
      razao_social: 'TECNOPAR FIXADORES LTDA',
      nome_fantasia: 'TECNOPAR',
      cnpj: '54.984.382/0001-64',
      inscricao_estadual: '799850123110',
      contato: 'Carlos',
      email: 'contato@tecnopar.com.br',
      telefone: '(11) 4177-2311',
      telefone_vendedor: '(11) 98765-4321',
      endereco: 'AV. WINSTON CHURCHILL, 596',
      cidade: 'SAO BERNARDO DO CAMPO',
      estado: 'SP',
      cep: '09614-000',
      grupo_id: '2',
      status: 'inativo',
    });
    expect(toast.success).toHaveBeenCalledWith('Fornecedor salvo');
    expect(container.querySelector('[data-testid="lista"]')).not.toBeNull();
  });
});

describe('FornecedorForm — (e)(f) CNPJ', () => {
  test('/novo: sair do campo com 14 digitos validos consulta /cnpj e preenche razao, fantasia, endereco, cidade, estado, CEP, telefone, email', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('cnpj', '11.222.333/0001-81');
    await sairDoCampo('cnpj');
    expect(api.get).toHaveBeenCalledWith(`/cnpj/${CNPJ_VALIDO}`);
    expect(campo('razao').value).toBe('ACME INDUSTRIA LTDA');
    expect(campo('fantasia').value).toBe('ACME');
    expect(campo('endereco').value).toBe('RUA DAS FLORES, 100, CENTRO');
    expect(campo('cidade').value).toBe('CAMPINAS');
    expect(campo('estado').value).toBe('SP');
    expect(campo('cep').value).toBe('13010-000');
    expect(campo('telefone').value).toBe('(19) 3222-3333');
    expect(campo('email').value).toBe('acme@acme.com.br');
  });

  test('/novo: sair do campo com CNPJ de digito errado NAO consulta', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('cnpj', '11.222.333/0001-82');
    await sairDoCampo('cnpj');
    expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/cnpj\//));
  });

  test('edicao: a lupa consulta e preenche SO os vazios — a cidade ja digitada nao muda', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/compras/fornecedores/7') {
        return Promise.resolve({ data: { ...FORNECEDOR_7, cnpj: '', endereco: '', cep: '', telefone: '', email: '' } });
      }
      return respostaPadrao(url);
    });
    await renderEm('/compras/fornecedores/editar/7');
    await digitar('cnpj', '11222333000181');
    // na edicao, sair do campo NAO consulta sozinho (RN-34.03)
    await sairDoCampo('cnpj');
    expect(api.get).not.toHaveBeenCalledWith(`/cnpj/${CNPJ_VALIDO}`);
    await clicar('button.btn-buscar-cnpj');
    expect(api.get).toHaveBeenCalledWith(`/cnpj/${CNPJ_VALIDO}`);
    expect(campo('cidade').value).toBe('SAO BERNARDO DO CAMPO');
    expect(campo('razao').value).toBe('TECNOPAR FIXADORES LTDA');
    expect(campo('endereco').value).toBe('RUA DAS FLORES, 100, CENTRO');
    expect(campo('cep').value).toBe('13010-000');
    expect(campo('telefone').value).toBe('(19) 3222-3333');
    expect(campo('email').value).toBe('acme@acme.com.br');
  });

  test('(f) consulta rejeitada -> toast "Não foi possível consultar o CNPJ" e campos intactos', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/cnpj/')) return Promise.reject(new Error('Network Error'));
      return respostaPadrao(url);
    });
    await renderEm('/compras/fornecedores/novo');
    await digitar('razao', 'JA DIGITADA');
    await digitar('cnpj', '11222333000181');
    await sairDoCampo('cnpj');
    expect(toast.error).toHaveBeenCalledWith('Não foi possível consultar o CNPJ');
    expect(campo('razao').value).toBe('JA DIGITADA');
    expect(campo('cidade').value).toBe('');
    expect(campo('cnpj').value).toBe('11.222.333/0001-81');
  });
});

describe('FornecedorForm — (g) CEP', () => {
  test('sair do campo com 01310-100 consulta /cep/01310100 e preenche endereco "Avenida Paulista, Bela Vista", cidade e estado', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('cep', '01310-100');
    await sairDoCampo('cep');
    expect(api.get).toHaveBeenCalledWith('/cep/01310100');
    expect(campo('endereco').value).toBe('Avenida Paulista, Bela Vista');
    expect(campo('cidade').value).toBe('São Paulo');
    expect(campo('estado').value).toBe('SP');
  });

  test('CEP com endereco ja digitado: so os vazios mudam', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('endereco', 'Meu endereco, 10');
    await digitar('cep', '01310100');
    await sairDoCampo('cep');
    expect(campo('endereco').value).toBe('Meu endereco, 10');
    expect(campo('cidade').value).toBe('São Paulo');
  });

  test('CEP 404 -> toast "CEP não encontrado"', async () => {
    api.get.mockImplementation((url) => {
      if (url.startsWith('/cep/')) return Promise.reject({ response: { status: 404, data: { error: 'CEP não encontrado' } } });
      return respostaPadrao(url);
    });
    await renderEm('/compras/fornecedores/novo');
    await digitar('cep', '99999-999');
    await sairDoCampo('cep');
    expect(toast.error).toHaveBeenCalledWith('CEP não encontrado');
    expect(campo('endereco').value).toBe('');
  });

  test('CEP com menos de 8 digitos nao consulta', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('cep', '0131');
    await sairDoCampo('cep');
    expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/cep\//));
  });
});

describe('FornecedorForm — (h) mascaras', () => {
  test('telefone do vendedor: 11987654321 vira (11) 98765-4321; empresa: 1141772311 vira (11) 4177-2311; CNPJ e CEP mascaram', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('telefone-vendedor', '11987654321');
    expect(campo('telefone-vendedor').value).toBe('(11) 98765-4321');
    await digitar('telefone', '1141772311');
    expect(campo('telefone').value).toBe('(11) 4177-2311');
    await digitar('cnpj', '54984382000164');
    expect(campo('cnpj').value).toBe('54.984.382/0001-64');
    await digitar('cep', '09614000');
    expect(campo('cep').value).toBe('09614-000');
  });
});

describe('FornecedorForm — (i) erro do servidor', () => {
  test('400 do servidor no submit vai para role="alert" e nao navega', async () => {
    api.post.mockRejectedValue({ response: { status: 400, data: { error: 'Grupo inválido' } } });
    await renderEm('/compras/fornecedores/novo');
    await digitar('razao', 'X');
    await submeter();
    expect(alerta()).not.toBeNull();
    expect(alerta().textContent).toMatch(/Grupo inválido/);
    expect(container.querySelector('[data-testid="lista"]')).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('GET da edicao falha -> role="alert" e nada de PUT', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/compras/fornecedores/7') return Promise.reject({ response: { status: 404, data: { error: 'Fornecedor não encontrado' } } });
      return respostaPadrao(url);
    });
    await renderEm('/compras/fornecedores/editar/7');
    expect(alerta()).not.toBeNull();
    expect(alerta().textContent).toMatch(/Fornecedor não encontrado/);
  });
});

describe('FornecedorForm — (j) achados da revisao adversarial (F1, F2)', () => {
  test('F1: editar fornecedor com CNPJ legado "ISENTO" e so clicar Salvar mantem "ISENTO" no PUT', async () => {
    api.get.mockImplementation((url) => (
      url === '/compras/fornecedores/8'
        ? Promise.resolve({ data: { ...FORNECEDOR_7, id: 8, cnpj: 'ISENTO' } })
        : respostaPadrao(url)
    ));
    await renderEm('/compras/fornecedores/editar/8');
    expect(campo('cnpj').value).toBe('ISENTO');
    await submeter();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1].cnpj).toBe('ISENTO');
  });

  test('F1: CNPJ gravado com 14 digitos sem mascara abre mascarado', async () => {
    api.get.mockImplementation((url) => (
      url === '/compras/fornecedores/9'
        ? Promise.resolve({ data: { ...FORNECEDOR_7, id: 9, cnpj: '54984382000164' } })
        : respostaPadrao(url)
    ));
    await renderEm('/compras/fornecedores/editar/9');
    expect(campo('cnpj').value).toBe('54.984.382/0001-64');
  });

  test('F2: no cadastro novo, sair de novo do MESMO CNPJ nao re-consulta nem sobrepoe o endereco corrigido', async () => {
    await renderEm('/compras/fornecedores/novo');
    await digitar('cnpj', '11.222.333/0001-81');
    await sairDoCampo('cnpj');
    const consultas = () => api.get.mock.calls.filter(([u]) => u === `/cnpj/${CNPJ_VALIDO}`).length;
    expect(consultas()).toBe(1);
    await digitar('endereco', 'RUA DAS FLORES, 100 - SALA 2, CENTRO');
    await sairDoCampo('cnpj');
    expect(consultas()).toBe(1);
    expect(campo('endereco').value).toBe('RUA DAS FLORES, 100 - SALA 2, CENTRO');
  });
});
