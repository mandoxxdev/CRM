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
// Etapa 35: LEGENDA_ABC é a constante exportada que a tela e o manual citam (RN-35.03).
import MaterialAlmoxarifadoForm, { LEGENDA_ABC } from './MaterialAlmoxarifadoForm';
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
// Etapa 37 (RN-37.07): uma sub DA raiz 5 e uma sub de OUTRA raiz (7, que nem está na lista) —
// a segunda é o caso "S fora de R" que a URL pode trazer e o form tem de ignorar.
const SUB_DE_CHAPAS = { id: 6, codigo: 'CHP-FIN', nome: 'Chapas finas', parent_id: 5, ativo: 1 };
const SUB_DE_OUTRA = { id: 8, codigo: 'TUB-RED', nome: 'Tubos redondos', parent_id: 7, ativo: 1 };
const FAMILIAS = [FAMILIA, SUB_DE_CHAPAS, SUB_DE_OUTRA];
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
    if (url === '/almoxarifado/familias') return Promise.resolve({ data: FAMILIAS });
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

async function renderizarNovo(query = '?familia_id=5') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/almoxarifado/materiais/novo${query}`]}>
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

/**
 * Etapa 35 — unidades e classe ABC (RN-35.01 a RN-35.03).
 *
 *  - RN-35.01: Unidade de Consumo e o fator dela SAEM da tela. As colunas ficam e o PUT do servidor
 *    preserva chave omitida — então a prova é no PAYLOAD: a chave não pode existir (nem como '').
 *    Controle positivo registrado no plano: antes da implementação o (b) falha porque o state
 *    nasce com `unidade_consumo: ''` e o spread `...form` leva a chave.
 *  - RN-35.02 (exemplo vivo "1 CX = 12 UN" + "o sistema não converte sozinho") foi SUBSTITUÍDA
 *    pela Etapa 38: o time não entendeu "fator"; o bloco RN-38 abaixo é o que prende a tela hoje.
 *  - RN-35.03: a legenda A/B/C vem da constante exportada LEGENDA_ABC (o manual cita a mesma).
 */
// Localiza um <select>/<input> pelo rótulo visível da seção, igual a categoriaSelect(): funciona
// antes e depois da etapa, então o vermelho do TDD é de asserção, não de seletor.
function campoPorRotulo(regex) {
  return [...container.querySelectorAll('.almox-field')]
    .find((d) => regex.test(d.querySelector('.almox-label')?.textContent.trim() || ''));
}
const selectUnidadeMedida = () => campoPorRotulo(/^Unidade de Medida$/i).querySelector('select');
// Etapa 38 (RN-38.02): o rótulo deixou de ser "Unidade de Compra" — é a pergunta que a pessoa faz.
const selectUnidadeCompra = () => campoPorRotulo(/^Como é comprado$/i).querySelector('select');
// Etapa 38: o número vive DENTRO da frase "1 CX contém [ 12 ] UN", não num campo com rótulo.
const inputQtdPorCompra = () => container.querySelector('[data-testid="material-qtd-por-compra"]');
const rotulos = () => [...container.querySelectorAll('.almox-label')].map((l) => l.textContent.trim());

// Material gravado ANTES da etapa, com unidade de consumo preenchida pela API/tela antiga.
const MATERIAL_COM_CONSUMO = {
  id: 79, codigo: 'CHP-004', nome: 'Cabo de aco', familia_id: 5,
  unidade: 'M', categoria: 'Chapas', quantidade_atual: 100,
  unidade_compra: 'ROLO', fator_conversao_compra: 50,
  unidade_consumo: 'M', fator_conversao_consumo: 1,
  proprietario_cliente_id: null,
};

describe('MaterialAlmoxarifadoForm — RN-35.01: unidade de consumo sai da tela e do payload', () => {
  test('(a) nao existe mais "Unidade de Consumo" nem "Fator de Conversão (Consumo)"', async () => {
    await renderizarNovo();
    const labels = rotulos();
    // Metade positiva: a seção continua lá, com as unidades que ficaram (Etapa 38 renomeou a
    // de compra para "Como é comprado" e tirou o rótulo "Fator de conversão" — RN-38.01/02).
    expect(labels).toContain('Unidade de Medida');
    expect(labels).toContain('Como é comprado');
    expect(labels.some((l) => /fator|convers/i.test(l))).toBe(false);
    // Metade negativa.
    expect(labels).not.toContain('Unidade de Consumo');
    expect(labels.some((l) => /Consumo\)/i.test(l))).toBe(false);
    expect(container.textContent).not.toMatch(/Unidade de Consumo/i);
  });

  test('(b) salvar o minimo: o POST nao leva unidade_consumo nem fator_conversao_consumo', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    await submeter();
    expect(api.post).toHaveBeenCalled();
    const payload = api.post.mock.calls[0][1];
    // Metade positiva: os campos que FICARAM continuam indo (o spread do form não sumiu).
    expect(payload).toHaveProperty('unidade', 'UN');
    expect(payload).toHaveProperty('unidade_compra');
    expect(payload).toHaveProperty('fator_conversao_compra');
    // Controle positivo: hoje a chave vai como '' — a asserção abaixo diz qual valor foi.
    expect(payload).not.toHaveProperty('unidade_consumo');
    expect(payload).not.toHaveProperty('fator_conversao_consumo');
  });

  test('(c) editar material com unidade_consumo gravada: o PUT nao manda a chave (servidor preserva)', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/clientes') return Promise.resolve({ data: [CLIENTE_UM] });
      if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
      if (url === '/almoxarifado/materiais/79') return Promise.resolve({ data: MATERIAL_COM_CONSUMO });
      return Promise.resolve({ data: [] });
    });
    await renderizarEdicao(79);
    // Metade positiva: o que a tela ainda mostra foi carregado do GET.
    expect(selectUnidadeMedida().value).toBe('M');
    expect(selectUnidadeCompra().value).toBe('ROLO');
    expect(inputQtdPorCompra().value).toBe('50');
    await submeter();
    expect(api.put).toHaveBeenCalled();
    const payload = api.put.mock.calls[0][1];
    expect(payload.unidade_compra).toBe('ROLO');
    expect(payload).not.toHaveProperty('unidade_consumo');
    expect(payload).not.toHaveProperty('fator_conversao_consumo');
  });
});

/**
 * Etapa 38 (RN-38.01 a RN-38.04) — "1 CX contém 12 UN": a unidade de compra vira frase.
 *
 * Origem: o André respondeu à D-35b que o sistema NÃO deve converter e que o time achou as
 * legendas confusas — "fator de conversão" é linguagem de sistema. A coluna e o Zod ficam; a
 * etapa muda só COMO a tela pergunta. O que este bloco prende:
 *
 *  - RN-38.01: nenhum texto da tela contém "fator" nem "conversão" (com e sem unidade de compra).
 *  - RN-38.02: rótulo "Como é comprado", opção vazia "— na própria unidade de medida (⟨UN⟩) —";
 *    escolher uma unidade mostra a frase com o número DENTRO (input inline com aria-label e
 *    data-testid) e a nota "O estoque conta sempre em ⟨UN⟩…". Sem unidade escolhida, nada disso
 *    aparece — nem a antiga "Só se aplica…".
 *  - RN-38.03: o payload não muda — a chave continua `fator_conversao_compra` e `unidade_compra`.
 *    O form manda o que o input tem (string, como a Etapa 35 já mandava); `numFromForm` no
 *    servidor coage. Por isso a asserção compara via Number(), não `toBe(12)` cru.
 *  - RN-38.04: sem o número, toast "Informe quantas ⟨UN⟩ há em 1 ⟨CX⟩" e nenhum POST.
 *
 * Controle positivo (vermelho antes da implementação): (a) falha porque o rótulo "Fator de
 * conversão" está na tela; (b)/(d)/(e) falham porque o input `material-qtd-por-compra` não existe.
 */
describe('MaterialAlmoxarifadoForm — RN-38: a unidade de compra vira frase, sem "fator"', () => {
  const textoDaTela = () => container.textContent;

  test('(a) RN-38.01: nenhum texto da tela diz "fator" ou "conversão", com e sem unidade de compra', async () => {
    await renderizarNovo();
    // Metade positiva: a seção e o campo renomeado estão lá.
    expect(textoDaTela()).toMatch(/Unidades e Custos/);
    expect(rotulos()).toContain('Como é comprado');
    expect(textoDaTela()).not.toMatch(/fator|convers/i);
    preencher(selectUnidadeCompra(), 'CX');
    expect(textoDaTela()).toMatch(/contém/);
    expect(textoDaTela()).not.toMatch(/fator|convers/i);
  });

  test('(b) RN-38.02: a opção vazia nomeia a unidade de medida e acompanha a troca dela', async () => {
    await renderizarNovo();
    const vazia = () => selectUnidadeCompra().querySelector('option[value=""]').textContent.trim();
    expect(selectUnidadeMedida().value).toBe('UN');
    expect(vazia()).toBe('— na própria unidade de medida (UN) —');
    preencher(selectUnidadeMedida(), 'M');
    expect(vazia()).toBe('— na própria unidade de medida (M) —');
    // Sem unidade de compra: nem frase, nem input, nem a antiga "Só se aplica".
    expect(inputQtdPorCompra()).toBeNull();
    expect(textoDaTela()).not.toMatch(/contém/);
    expect(textoDaTela()).not.toMatch(/Só se aplica/i);
  });

  test('(c) RN-38.02/03: escolher CX mostra "1 CX contém [ ] UN" e a nota; digitar 12 vai como fator_conversao_compra', async () => {
    await renderizarNovo();
    preencher(selectUnidadeCompra(), 'CX');
    const input = inputQtdPorCompra();
    expect(input).not.toBeNull();
    expect(input.getAttribute('aria-label')).toBe('Quantidade de UN em 1 CX');
    expect(textoDaTela()).toMatch(/1 CX contém/);
    expect(textoDaTela()).toMatch(/O estoque conta sempre em UN; este número é só informação para quem compra./);
    // A frase é montada com o que está escolhido, não texto fixo.
    preencher(selectUnidadeMedida(), 'M');
    preencher(selectUnidadeCompra(), 'ROLO');
    expect(textoDaTela()).toMatch(/1 ROLO contém/);
    expect(textoDaTela()).toMatch(/O estoque conta sempre em M;/);
    expect(inputQtdPorCompra().getAttribute('aria-label')).toBe('Quantidade de M em 1 ROLO');
    preencher(selectUnidadeMedida(), 'UN');
    preencher(selectUnidadeCompra(), 'CX');
    preencher(inputQtdPorCompra(), '12');
    await preencherObrigatorios();
    await submeter();
    expect(api.post).toHaveBeenCalledTimes(1);
    const payload = api.post.mock.calls[0][1];
    expect(payload.unidade_compra).toBe('CX');
    expect(Number(payload.fator_conversao_compra)).toBe(12);
    expect(payload).not.toHaveProperty('qtd_por_compra');
  });

  test('(d) RN-38.03: editar material com ROLO/50 mostra "1 ROLO contém [50] M"', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/clientes') return Promise.resolve({ data: [CLIENTE_UM] });
      if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
      if (url === '/almoxarifado/materiais/79') return Promise.resolve({ data: MATERIAL_COM_CONSUMO });
      return Promise.resolve({ data: [] });
    });
    await renderizarEdicao(79);
    expect(selectUnidadeCompra().value).toBe('ROLO');
    expect(inputQtdPorCompra().value).toBe('50');
    expect(textoDaTela()).toMatch(/1 ROLO contém/);
    expect(textoDaTela()).toMatch(/O estoque conta sempre em M;/);
    expect(textoDaTela()).not.toMatch(/fator|convers/i);
    await submeter();
    expect(api.put).toHaveBeenCalledTimes(1);
    const payload = api.put.mock.calls[0][1];
    expect(payload.unidade_compra).toBe('ROLO');
    expect(Number(payload.fator_conversao_compra)).toBe(50);
  });

  test('(e) RN-38.04: CX sem número (vazio ou zero) → toast "Informe quantas UN há em 1 CX" e nenhum POST', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    preencher(selectUnidadeCompra(), 'CX');
    await submeter();
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Informe quantas UN há em 1 CX');
    expect(toast.error.mock.calls.flat().join(' ')).not.toMatch(/fator|convers/i);
    toast.error.mockClear();
    preencher(inputQtdPorCompra(), '0');
    await submeter();
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Informe quantas UN há em 1 CX');
    // Controle: com o número, o POST sai e a mensagem não aparece.
    toast.error.mockClear();
    preencher(inputQtdPorCompra(), '12');
    await submeter();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('MaterialAlmoxarifadoForm — RN-35.03: a classe ABC tem legenda', () => {
  test('(f) a legenda traz A, B e C e diz que é classificação manual', async () => {
    await renderizarNovo();
    const legenda = container.querySelector('.almox-legenda-abc');
    expect(legenda).not.toBeNull();
    const texto = legenda.textContent;
    expect(texto).toMatch(/A —/);
    expect(texto).toMatch(/B —/);
    expect(texto).toMatch(/C —/);
    expect(texto).toMatch(/classificação manual/i);
    // A constante exportada é a MESMA que a tela mostra (e a que o manual cita).
    expect(Object.keys(LEGENDA_ABC)).toEqual(['A', 'B', 'C']);
    expect(texto).toContain(LEGENDA_ABC.A);
    expect(texto).toContain(LEGENDA_ABC.B);
    expect(texto).toContain(LEGENDA_ABC.C);
    // O select continua lá, com as três classes.
    const select = campoPorRotulo(/^Classe ABC$/).querySelector('select');
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual(['', 'A', 'B', 'C']);
  });
});

/**
 * Etapa 37 (RN-37.07) — `/almoxarifado/materiais/novo?familia_id=R&subfamilia_id=S` abre o form
 * com família R E subfamília S selecionadas. É o link "Adicionar item" da subfamília (aba
 * Famílias, T2); até aqui o form só lia `?familia_id`, e o material nascia sem subfamília.
 *
 * A metade perigosa é "S fora de R → ignorada": a exibição do <select> JÁ parece certa hoje
 * (mostra "— nenhuma —" porque S não está nas opções), mas o state guardaria S e o submit
 * mandaria `subfamilia_id: 8` → 400 "Subfamília inválida". Por isso as asserções são no PAYLOAD,
 * não no que o select exibe — a exibição aprovaria a implementação errada.
 */
const selectSubfamilia = () => campoPorRotulo(/^Subfamília$/).querySelector('select');

describe('MaterialAlmoxarifadoForm — RN-37.07: ?subfamilia_id na URL', () => {
  test('(i) ?familia_id=5&subfamilia_id=6 (sub da raiz) → select mostra 6 e o POST manda subfamilia_id: 6', async () => {
    await renderizarNovo('?familia_id=5&subfamilia_id=6');
    // Metade positiva: a sub da raiz é opção do select e está selecionada.
    expect([...selectSubfamilia().options].map((o) => o.value)).toContain('6');
    expect(selectSubfamilia().value).toBe('6');
    await preencherObrigatorios();
    await submeter();
    expect(api.post).toHaveBeenCalled();
    const payload = api.post.mock.calls[0][1];
    expect(payload.familia_id).toBe(5);
    expect(payload.subfamilia_id).toBe(6);
  });

  test('(ii) ?familia_id=5&subfamilia_id=8 (sub de OUTRA raiz) → o POST manda subfamilia_id: null, sem erro', async () => {
    await renderizarNovo('?familia_id=5&subfamilia_id=8');
    // A sub 8 não é filha de 5: nem aparece como opção...
    expect([...selectSubfamilia().options].map((o) => o.value)).not.toContain('8');
    await preencherObrigatorios();
    await submeter();
    // ...e, o que importa, NÃO vai no payload (hoje iria: o state guarda o que veio da URL).
    expect(api.post).toHaveBeenCalled();
    const payload = api.post.mock.calls[0][1];
    expect(payload.familia_id).toBe(5);
    expect(payload.subfamilia_id).toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('(iii) [não-regressão] só ?familia_id=5 → subfamilia_id: null e a sub continua escolhível', async () => {
    await renderizarNovo();
    expect(selectSubfamilia().value).toBe('');
    expect([...selectSubfamilia().options].map((o) => o.value)).toContain('6');
    await preencherObrigatorios();
    await submeter();
    expect(api.post.mock.calls[0][1].subfamilia_id).toBeNull();
  });
});

describe('MaterialAlmoxarifadoForm — revisão da Etapa 37 (F1): subfamília em EDIÇÃO', () => {
  const MATERIAL_COM_SUB_ATIVA = { ...MATERIAL_DO_CLIENTE, id: 80, familia_id: 5, subfamilia_id: 6 };
  const MATERIAL_COM_SUB_INATIVA = { ...MATERIAL_DO_CLIENTE, id: 81, familia_id: 5, subfamilia_id: 9 };
  const mockComMateriais = () => {
    api.get.mockImplementation((url) => {
      if (url === '/clientes') return Promise.resolve({ data: [CLIENTE_UM, CLIENTE_DOIS] });
      if (url === '/almoxarifado/familias') return Promise.resolve({ data: FAMILIAS });
      if (url === '/almoxarifado/categorias') return Promise.resolve({ data: CATALOGO });
      if (url === '/almoxarifado/materiais/80') return Promise.resolve({ data: MATERIAL_COM_SUB_ATIVA });
      if (url === '/almoxarifado/materiais/81') return Promise.resolve({ data: MATERIAL_COM_SUB_INATIVA });
      return Promise.resolve({ data: [] });
    });
  };
  const selectSub = () => [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent === '— nenhuma —'));

  test('sub ATIVA (6): o select mostra 6 e o PUT preserva subfamilia_id 6 (fecha a sabotagem iv da revisão)', async () => {
    mockComMateriais();
    await renderizarEdicao(80);
    expect(selectSub().value).toBe('6');
    expect(selectSub().disabled).toBe(false);
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await esperarEfeitos();
    expect(api.put).toHaveBeenCalled();
    expect(api.put.mock.calls[0][1].subfamilia_id).toBe(6);
  });

  test('sub INATIVADA depois (9, fora da lista): o select diz "(subfamília inativa)", fica habilitado e o PUT preserva 9', async () => {
    mockComMateriais();
    await renderizarEdicao(81);
    const sel = selectSub();
    expect(sel.value).toBe('9');
    expect(sel.disabled).toBe(false);
    expect([...sel.options].some((o) => /subfamília inativa/.test(o.textContent))).toBe(true);
    expect(container.textContent).not.toMatch(/não tem subfamílias cadastradas/);
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await esperarEfeitos();
    expect(api.put).toHaveBeenCalled();
    expect(api.put.mock.calls[0][1].subfamilia_id).toBe(9);
  });

  test('sub inativada: o usuário consegue LIMPAR (— nenhuma —) e o PUT manda null', async () => {
    mockComMateriais();
    await renderizarEdicao(81);
    const sel = selectSub();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, '');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await esperarEfeitos();
    expect(api.put.mock.calls[0][1].subfamilia_id).toBeNull();
  });
});

describe('MaterialAlmoxarifadoForm — revisão da Etapa 38 (número órfão, própria unidade, obrigatório)', () => {
  test('voltar "Como é comprado" para a própria unidade depois de digitar 12 → o POST manda fator_conversao_compra null (não 12 órfão)', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    preencher(selectUnidadeCompra(), 'CX');
    preencher(inputQtdPorCompra(), '12');
    preencher(selectUnidadeCompra(), '');
    expect(inputQtdPorCompra()).toBeNull();
    await submeter();
    expect(api.post).toHaveBeenCalled();
    const payload = api.post.mock.calls[0][1];
    expect(payload.unidade_compra).toBe('');
    expect(payload.fator_conversao_compra).toBeNull();
  });

  test('o select "Como é comprado" não oferece a própria unidade de medida', async () => {
    await renderizarNovo();
    preencher(selectUnidadeMedida(), 'M');
    const opcoes = [...selectUnidadeCompra().options].map((o) => o.value);
    expect(opcoes).not.toContain('M');
    expect(opcoes).toContain('CX');
  });

  test('o número da frase é marcado como obrigatório (aria-required) e a nota diz "Obrigatório"', async () => {
    await renderizarNovo();
    preencher(selectUnidadeCompra(), 'CX');
    expect(inputQtdPorCompra().getAttribute('aria-required')).toBe('true');
    expect(container.textContent).toMatch(/Obrigatório\. O estoque conta sempre em/);
  });
});
