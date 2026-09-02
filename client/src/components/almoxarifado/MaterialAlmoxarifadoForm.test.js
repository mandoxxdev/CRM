/**
 * Seção "Propriedade" do cadastro de material (Etapa 8, Task 5 — decisão 8 do design).
 *
 * É AQUI que o material de cliente nasce: não existe tela separada de "material de cliente", ele
 * é material normal com dono (`proprietario_cliente_id`). O que este teste prende:
 *
 *  1. `proprietario_cliente_id` é NÚMERO ou null, nunca uma flag. O padrão `=== 1` / `!!valor`
 *     usado nos checkboxes de controle deste mesmo formulário NÃO vale aqui — e o teste usa de
 *     propósito um cliente de id 1 na edição, que é exatamente o valor onde a confusão passaria
 *     despercebida.
 *  2. O payload manda `null` explícito, nunca `''`, quando o usuário escolhe "GMP (estoque
 *     próprio)". `''` cai no ramo "ausente" da coerção do servidor (numFromForm) e o PUT
 *     PRESERVARIA o dono antigo — ou seja, tirar o dono de um material não funcionaria, em
 *     silêncio, que é o oposto do que o usuário pediu.
 *
 * As duas metades andam juntas: só provar que escolher um cliente manda o número aprovaria uma
 * implementação que nunca consegue limpar o dono.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MaterialAlmoxarifadoForm --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MaterialAlmoxarifadoForm from './MaterialAlmoxarifadoForm';
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
  useAuth: () => ({ user: { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1 } }),
}));

const FAMILIA = { id: 5, codigo: 'CHP', nome: 'Chapas', parent_id: null, ativo: 1 };
// Cliente de id 1 de propósito: é o valor que uma comparação `=== 1` (o padrão das flags deste
// formulário) trataria como "ligado" e faria o select cair no ramo errado.
const CLIENTE_UM = { id: 1, razao_social: 'Cliente Alfa LTDA', nome_fantasia: 'Alfa' };
const CLIENTE_DOIS = { id: 2, razao_social: 'Cliente Beta SA', nome_fantasia: 'Beta' };

const MATERIAL_DO_CLIENTE = {
  id: 77, codigo: 'CHP-002', nome: 'Chapa 3mm do cliente', familia_id: 5,
  unidade: 'PC', categoria: 'CONSUMÍVEL', quantidade_atual: 10,
  proprietario_cliente_id: 1,
};

// Etapa 26 — o catálogo do cliente (GET /almoxarifado/categorias). `Aço carbono` é a primeira
// em ordem alfabética DE PROPÓSITO: é a opção que o <select> exibiria por conta própria se o
// valor gravado no material não estivesse entre as opções (ver o describe da RN-04).
const CATALOGO = [
  { id: 1, nome: 'Aço carbono', parent_id: null, ativo: 1 },
  { id: 2, nome: 'Chapas', parent_id: null, ativo: 1 },
  { id: 3, nome: 'Ferramentas', parent_id: null, ativo: 1 },
];

// Material legado com categoria que não está NEM na lista hardcoded antiga NEM no catálogo —
// é o cenário onde a mentira da tela é visível hoje, sem depender de nenhuma implementação.
const MATERIAL_CATEGORIA_LEGADA = {
  id: 78, codigo: 'CHP-003', nome: 'Eletrodo revestido', familia_id: 5,
  unidade: 'KG', categoria: 'MATERIAL DE SOLDA', quantidade_atual: 4,
  proprietario_cliente_id: null,
};

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/clientes') return Promise.resolve({ data: [CLIENTE_UM, CLIENTE_DOIS] });
    if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
    if (url === '/almoxarifado/proximo-codigo') return Promise.resolve({ data: { codigo: 'CHP-999' } });
    if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
    if (url === '/almoxarifado/materiais/78') return Promise.resolve({ data: MATERIAL_CATEGORIA_LEGADA });
    if (url.startsWith('/almoxarifado/materiais/')) return Promise.resolve({ data: MATERIAL_DO_CLIENTE });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 99 } });
  api.put.mockResolvedValue({ data: { id: 77 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function esperarEfeitos() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function renderizarNovo() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/materiais/novo?familia_id=5']}>
        <Routes><Route path="/almoxarifado/materiais/novo" element={<MaterialAlmoxarifadoForm />} /></Routes>
      </MemoryRouter>,
    );
  });
  await esperarEfeitos();
}

async function renderizarEdicao(id = 77) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/almoxarifado/materiais/${id}/editar`]}>
        <Routes><Route path="/almoxarifado/materiais/:id/editar" element={<MaterialAlmoxarifadoForm />} /></Routes>
      </MemoryRouter>,
    );
  });
  await esperarEfeitos();
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const proprietario = () => container.querySelector('#material-proprietario');

// Localiza o <select> de Categoria pelo rótulo da própria seção — funciona igual antes e depois
// da Etapa 26, então o vermelho do TDD é de asserção, não de seletor que não existe ainda.
function categoriaSelect() {
  const campo = [...container.querySelectorAll('.almox-field')]
    .find((d) => d.querySelector('.almox-label')?.textContent.trim() === 'Categoria');
  return campo ? campo.querySelector('select') : null;
}
const categoriaOpcoes = () => [...categoriaSelect().querySelectorAll('option')].map((o) => o.textContent.trim());
const categoriaValores = () => [...categoriaSelect().querySelectorAll('option')].map((o) => o.value);
const opcaoSelecionada = () => [...categoriaSelect().querySelectorAll('option')]
  .find((o) => o.value === categoriaSelect().value);

async function submeter() {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

async function preencherObrigatorios() {
  preencher(container.querySelector('input[placeholder="PAR-001"]'), 'CHP-100');
  preencher(container.querySelector('input[placeholder="Nome completo do material"]'), 'Chapa 3mm');
  // Etapa 26/RN-07: categoria deixou de ter default e passou a ser obrigatória (o servidor
  // grava 'OUTROS' quando recebe vazio — materialService.js:179 —, e 'OUTROS' também está fora
  // do catálogo). Sem escolher aqui, os testes de Propriedade abaixo nem chegariam ao POST.
  preencher(categoriaSelect(), 'Chapas');
}

describe('MaterialAlmoxarifadoForm — seção Propriedade', () => {
  test('a seção existe, o default é GMP e os clientes carregados viram opções', async () => {
    await renderizarNovo();
    expect(container.textContent).toContain('Propriedade');
    const select = proprietario();
    expect(select).not.toBeNull();
    expect(select.value).toBe('');
    const opcoes = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes[0]).toContain('GMP');
    expect(opcoes).toContain('Cliente Alfa LTDA');
    expect(opcoes).toContain('Cliente Beta SA');
  });

  test('sem escolher dono, o payload manda null explicito (nunca string vazia)', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    await submeter();
    expect(api.post).toHaveBeenCalled();
    const payload = api.post.mock.calls[0][1];
    expect(payload.proprietario_cliente_id).toBeNull();
    expect(payload.proprietario_cliente_id).not.toBe('');
  });

  test('escolhido um cliente, o payload manda o id como NUMERO', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    preencher(proprietario(), '2');
    await submeter();
    const payload = api.post.mock.calls[0][1];
    expect(payload.proprietario_cliente_id).toBe(2);
  });

  test('a falha ao carregar /clientes nao quebra o cadastro — sobra so a opcao GMP', async () => {
    // /clientes e rota core, fora do modulo: quem nao tem acesso a Clientes ainda precisa
    // conseguir cadastrar material proprio.
    api.get.mockImplementation((url) => {
      if (url === '/clientes') return Promise.reject(new Error('403'));
      if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
      if (url === '/almoxarifado/proximo-codigo') return Promise.resolve({ data: { codigo: 'CHP-999' } });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
      return Promise.resolve({ data: [] });
    });
    await renderizarNovo();
    expect([...proprietario().querySelectorAll('option')]).toHaveLength(1);
    await preencherObrigatorios();
    await submeter();
    expect(api.post).toHaveBeenCalled();
  });
});

describe('MaterialAlmoxarifadoForm — edição de material com dono', () => {
  test('o select carrega o cliente do material (id 1 nao vira booleano)', async () => {
    await renderizarEdicao();
    expect(proprietario().value).toBe('1');
  });

  test('trocar para GMP manda null explicito no PUT — e o que LIMPA o dono', async () => {
    // Com '' em vez de null, o servidor trata a chave como ausente (numFromForm) e PRESERVA o
    // dono antigo: o material continuaria sendo do cliente, sem nenhum erro na tela.
    await renderizarEdicao();
    preencher(proprietario(), '');
    await submeter();
    expect(api.put).toHaveBeenCalled();
    expect(api.put.mock.calls[0][1].proprietario_cliente_id).toBeNull();
  });

  test('trocar de cliente manda o novo id no PUT', async () => {
    await renderizarEdicao();
    preencher(proprietario(), '2');
    await submeter();
    expect(api.put.mock.calls[0][1].proprietario_cliente_id).toBe(2);
  });
});

/**
 * Etapa 26, Task 2 — a categoria do material deixa de ser lista hardcoded no front.
 *
 * Por que cada metade existe:
 *
 *  - Toda asserção NEGATIVA aqui vem acompanhada da POSITIVA no mesmo teste. O mock deste
 *    arquivo termina em `Promise.resolve({ data: [] })` como catch-all, então "a lista não tem
 *    CONSUMÍVEL" seria satisfeito por uma lista VAZIA — um verde que não prova nada.
 *  - O cenário da RN-04 mira a metade VISÍVEL. A asserção de payload já passava antes da
 *    implementação (o state nunca foi trocado; o <select> é controlado e o React não dispara
 *    onChange para valor ausente das opções), então ela entra como NÃO-REGRESSÃO. O que a
 *    implementação muda é o que o usuário VÊ.
 */
describe('MaterialAlmoxarifadoForm — RN-01: a lista de categorias vem do catálogo', () => {
  test('as opções são as do endpoint, e as antigas hardcoded sumiram', async () => {
    await renderizarNovo();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias');
    const opcoes = categoriaOpcoes();
    // Metade positiva — sem ela, um catálogo vazio satisfaria as três linhas seguintes.
    expect(opcoes).toContain('Aço carbono');
    expect(opcoes).toContain('Chapas');
    expect(opcoes).toContain('Ferramentas');
    // Metade negativa: a lista genérica de 11 itens não existe mais no front.
    expect(opcoes).not.toContain('CONSUMÍVEL');
    expect(opcoes).not.toContain('FERRAMENTA');
    expect(opcoes).not.toContain('HIDRÁULICO');
  });

  test('trocar o catálogo do mock troca as opções — não é constante do front', async () => {
    // Se as opções continuassem as mesmas com o mock trocado, a tela estaria lendo constante.
    api.get.mockImplementation((url) => {
      if (url === '/clientes') return Promise.resolve({ data: [CLIENTE_UM] });
      if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
      if (url === '/almoxarifado/proximo-codigo') return Promise.resolve({ data: { codigo: 'CHP-999' } });
      if (url === '/almoxarifado/categorias') {
        return Promise.resolve({ data: [{ id: 9, nome: 'Rolamentos', ativo: 1 }, { id: 10, nome: 'Tubos', ativo: 1 }] });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizarNovo();
    const opcoes = categoriaOpcoes();
    expect(opcoes).toContain('Rolamentos');
    expect(opcoes).toContain('Tubos');
    expect(opcoes).not.toContain('Aço carbono');
    expect(opcoes).not.toContain('Chapas');
  });
});

describe('MaterialAlmoxarifadoForm — RN-07: material novo nasce sem categoria de mentira', () => {
  test('o campo nasce VAZIO, com "Selecione", e não com uma categoria escolhida por acidente', async () => {
    await renderizarNovo();
    expect(categoriaSelect().value).toBe('');
    expect(categoriaOpcoes()[0]).toMatch(/Selecione/i);
    // Metade positiva: nascer vazio porque o catálogo não carregou não vale.
    expect(categoriaOpcoes()).toContain('Aço carbono');
    // Nem o default antigo ('CONSUMÍVEL', fora do catálogo) nem a 1ª do catálogo por ordenação.
    expect(categoriaSelect().value).not.toBe('CONSUMÍVEL');
    expect(categoriaSelect().value).not.toBe('Aço carbono');
  });

  test('salvar sem escolher categoria NÃO cria material — o servidor gravaria "OUTROS"', async () => {
    // materialService.js:179 faz `categoria: categoria || 'OUTROS'`. Deixar o campo opcional
    // trocaria "nasce CONSUMÍVEL" por "nasce OUTROS": as duas fora do catálogo, e a segunda
    // ainda por cima invisível na tela. Por isso o vazio é barrado ANTES do POST.
    await renderizarNovo();
    preencher(container.querySelector('input[placeholder="PAR-001"]'), 'CHP-100');
    preencher(container.querySelector('input[placeholder="Nome completo do material"]'), 'Chapa 3mm');
    await submeter();
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
    expect(toast.error.mock.calls.map((c) => String(c[0])).join(' ')).toMatch(/categoria/i);
  });

  test('escolhida uma categoria do catálogo, é ela que vai no payload', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    preencher(categoriaSelect(), 'Ferramentas');
    await submeter();
    expect(api.post).toHaveBeenCalled();
    expect(api.post.mock.calls[0][1].categoria).toBe('Ferramentas');
  });
});

describe('MaterialAlmoxarifadoForm — RN-04: categoria fora do catálogo aparece na tela', () => {
  test('material gravado com CONSUMÍVEL mostra CONSUMÍVEL, marcado como fora de catálogo', async () => {
    // CONSUMÍVEL é o valor REAL dos materiais no banco (medido na Fase 0). Sem a opção extra,
    // o <select> exibe a primeira do catálogo ('Aço carbono') enquanto o state — e o payload —
    // seguem com CONSUMÍVEL: a tela mente sobre o que está no banco.
    await renderizarEdicao(77);
    expect(categoriaSelect().value).toBe('CONSUMÍVEL');
    expect(opcaoSelecionada().textContent).toMatch(/fora de catálogo/i);
    // Metade positiva: o catálogo continua ali para o usuário poder reclassificar.
    expect(categoriaOpcoes().some((o) => o.includes('Aço carbono'))).toBe(true);
    expect(categoriaOpcoes().some((o) => o.includes('Chapas'))).toBe(true);
    // E o valor fora de catálogo entra UMA vez só, sem duplicar nenhuma do catálogo.
    expect(categoriaValores().filter((v) => v === 'CONSUMÍVEL')).toHaveLength(1);
  });

  test('categoria legada fora das duas listas também aparece — hoje a tela exibiria outra', async () => {
    await renderizarEdicao(78);
    expect(categoriaSelect().value).toBe('MATERIAL DE SOLDA');
    expect(opcaoSelecionada().textContent).toMatch(/fora de catálogo/i);
    expect(categoriaOpcoes()).toContain('Chapas');
  });

  test('[não-regressão] salvar sem tocar no campo mantém a categoria gravada', async () => {
    // Esta asserção JÁ PASSAVA antes da Etapa 26 — o state nunca foi trocado. Ela está aqui
    // para prender o que a correção não pode quebrar, NÃO como o teste-que-falha.
    await renderizarEdicao(77);
    await submeter();
    expect(api.put).toHaveBeenCalled();
    expect(api.put.mock.calls[0][1].categoria).toBe('CONSUMÍVEL');
  });

  test('a categoria fora do catálogo pode ser trocada por uma do catálogo', async () => {
    await renderizarEdicao(77);
    preencher(categoriaSelect(), 'Chapas');
    await submeter();
    expect(api.put.mock.calls[0][1].categoria).toBe('Chapas');
  });
});
