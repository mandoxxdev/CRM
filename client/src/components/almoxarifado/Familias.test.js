/**
 * Aba "Famílias" — subfamílias cadastráveis na própria aba (Etapa 37, T2).
 *
 * Até a Etapa 36 a aba era uma lista PLANA: `GET /almoxarifado/familias` já devolvia `parent_id`,
 * mas a tela desenhava raiz e subfamília como cartões irmãos, sem indicação nenhuma — e criar uma
 * subfamília "ainda não tinha tela própria — só via API" (guia do almoxarifado). Este arquivo
 * prende a árvore de dois níveis desenhada na aba (RN-37.01 a RN-37.04 e RN-37.08):
 *
 *  - só as RAÍZES viram cartões; as subfamílias aparecem DENTRO do cartão da raiz certa;
 *  - "Nova subfamília" no cartão da raiz abre o mesmo formulário com o pai TRAVADO e o POST leva
 *    `parent_id`; editar manda PUT SEM `parent_id` (o servidor preserva); inativar passa pelo
 *    `confirm` + DELETE, e o 400 do servidor vira toast com a literal;
 *  - expandir uma subfamília pede `/familias/<sub>/itens`; "Adicionar item" da sub leva o par
 *    `familia_id=<raiz>&subfamilia_id=<sub>` na URL — é o que o form de material lê (T3).
 *
 * O `api` é mockado com a FORMA REAL da rota (`parent_id`, `qtd_itens`, `codigo`, `tipo_uso`): a
 * contagem da subfamília vem do servidor (T1), a tela só exibe. Fixture com DUAS raízes, uma com
 * duas subs e outra sem — com uma raiz só, "sub dentro da raiz certa" não prova nada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/Familias --watchAll=false
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

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

// FORMA REAL de GET /api/almoxarifado/familias: `f.*` + `parent_nome` + `qtd_itens`.
const ROLAMENTOS = { id: 1, codigo: 'ROL', nome: 'Rolamentos', descricao: 'Rolamentos em geral', parent_id: null, parent_nome: null, tipo_uso: 'industrial', ativo: 1, qtd_itens: 3 };
const PARAFUSOS = { id: 2, codigo: 'PAR', nome: 'Parafusos', descricao: '', parent_id: null, parent_nome: null, tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };
const ESFERAS = { id: 3, codigo: 'ROL-ESF', nome: 'Esferas', descricao: 'Rolamentos de esferas', parent_id: 1, parent_nome: 'Rolamentos', tipo_uso: 'industrial', ativo: 1, qtd_itens: 2 };
const ROLOS = { id: 4, codigo: 'ROL-ROL', nome: 'Rolos', descricao: '', parent_id: 1, parent_nome: 'Rolamentos', tipo_uso: 'administrativo', ativo: 1, qtd_itens: 1 };
const FAMILIAS = [ROLAMENTOS, PARAFUSOS, ESFERAS, ROLOS];

const ITENS_ESFERAS = [
  { id: 10, codigo: 'ROL-001', nome: 'Rolamento 6205 ZZ', quantidade_atual: 5, unidade: 'UN', localizacao: 'A-01', almoxarifado_codigo: 'ALM1' },
];

const LITERAL_400 = 'Não é possível remover: família possui 1 item(ns) ativo(s)';

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/familias') return Promise.resolve({ data: FAMILIAS });
    if (url === '/almoxarifado/familias/3/itens') return Promise.resolve({ data: ITENS_ESFERAS });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 50 } });
  api.put.mockResolvedValue({ data: { success: true } });
  api.delete.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function renderAbaFamilias() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=familias']}>
        <ConfiguracoesAlmoxarifado />
      </MemoryRouter>
    );
  });
}

const cartoes = () => [...container.querySelectorAll('.almox-familia-card')];
const cartaoDe = (codigo) => cartoes().find((c) => c.querySelector('.almox-familia-cabecalho')?.textContent.includes(codigo));
const subsDoCartao = (cartao) => [...cartao.querySelectorAll('.almox-subfamilia-row')];
const subDe = (cartao, codigo) => subsDoCartao(cartao).find((r) => r.textContent.includes(codigo));
const botaoPorTexto = (escopo, regex) => [...escopo.querySelectorAll('button')].find((b) => regex.test(b.textContent));

function preencher(el, valor) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setValue.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const clicar = async (el) => { await act(async () => { el.click(); }); };
const inputNome = () => container.querySelector('input[placeholder="Ex: Parafusos e Porcas"]');
const botaoSalvar = () => botaoPorTexto(container, /^\s*Salvar/);

describe('TabFamilias — RN-37.01: a árvore é desenhada na própria aba', () => {
  test('(a) só raízes viram cartões; as subs aparecem dentro da raiz certa com a contagem da fixture', async () => {
    await renderAbaFamilias();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/familias');

    // Quatro famílias na fixture, DOIS cartões: subfamília não é cartão irmão.
    expect(cartoes()).toHaveLength(2);
    const rol = cartaoDe('ROL');
    const par = cartaoDe('PAR');
    expect(rol).toBeDefined();
    expect(par).toBeDefined();
    // Nenhum cartão tem uma sub como cabeçalho.
    expect(cartoes().some((c) => /ROL-ESF|ROL-ROL/.test(c.querySelector('.almox-familia-cabecalho').textContent))).toBe(false);

    // As duas subs estão DENTRO de Rolamentos, com o `qtd_itens` que o servidor mandou.
    const subs = subsDoCartao(rol);
    expect(subs).toHaveLength(2);
    const esferas = subDe(rol, 'ROL-ESF');
    const rolos = subDe(rol, 'ROL-ROL');
    expect(esferas.textContent).toContain('Esferas');
    expect(esferas.textContent).toContain('2 itens');
    expect(rolos.textContent).toContain('Rolos');
    expect(rolos.textContent).toContain('1 item');
    // Selo de tipo de uso só quando ≠ ambos.
    expect(rolos.textContent).toContain('ADM');
    expect(esferas.textContent).toContain('IND');

    // A raiz sem sub diz isso — e não tem linha de sub nenhuma.
    expect(subsDoCartao(par)).toHaveLength(0);
    expect(par.textContent).toContain('Nenhuma subfamília');
    expect(rol.textContent).not.toContain('Nenhuma subfamília');
    // A contagem da raiz continua a dela (inclui as das subs — Pontos de atenção do plano).
    expect(rol.querySelector('.almox-familia-cabecalho').textContent).toContain('3 itens');
  });
});

describe('TabFamilias — RN-37.02: "Nova subfamília" no cartão da raiz', () => {
  test('(b) abre o form com o pai travado e o POST leva parent_id da raiz', async () => {
    await renderAbaFamilias();
    const rol = cartaoDe('ROL');
    const btn = botaoPorTexto(rol, /Nova subfamília/);
    expect(btn).toBeDefined();
    await clicar(btn);

    expect(container.textContent).toContain('Nova subfamília de ROL — Rolamentos');
    // Sem campo de pai editável: nenhum <select> oferece outra raiz como opção.
    const selects = [...container.querySelectorAll('select')];
    expect(selects.some((s) => [...s.options].some((o) => /Parafusos|Rolamentos/.test(o.textContent)))).toBe(false);
    // O pai aparece como informação, não como campo.
    expect(container.textContent).toMatch(/Subfamília de:\s*ROL — Rolamentos/);

    preencher(inputNome(), 'Agulhas');
    await clicar(botaoSalvar());

    expect(api.post).toHaveBeenCalledTimes(1);
    const [rota, corpo] = api.post.mock.calls[0];
    expect(rota).toBe('/almoxarifado/familias');
    expect(corpo).toEqual({ nome: 'Agulhas', descricao: '', codigo: '', tipo_uso: 'ambos', parent_id: 1 });
    expect(toast.success).toHaveBeenCalledWith('Subfamília criada!');
    // A lista recarrega (o GET inicial + o de depois do POST).
    expect(api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/familias')).toHaveLength(2);
  });

  test('(b2) "Nova subfamília" na OUTRA raiz trava o pai dela — não é a primeira da lista', async () => {
    await renderAbaFamilias();
    await clicar(botaoPorTexto(cartaoDe('PAR'), /Nova subfamília/));
    expect(container.textContent).toContain('Nova subfamília de PAR — Parafusos');
    preencher(inputNome(), 'Sextavados');
    await clicar(botaoSalvar());
    expect(api.post.mock.calls[0][1].parent_id).toBe(2);
  });

  test('(b3) nome vazio recusa antes do POST', async () => {
    await renderAbaFamilias();
    await clicar(botaoPorTexto(cartaoDe('ROL'), /Nova subfamília/));
    await clicar(botaoSalvar());
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Nome é obrigatório');
  });
});

describe('TabFamilias — RN-37.03: editar subfamília', () => {
  test('(c) o PUT vai SEM parent_id (o servidor preserva) e o toast nomeia a subfamília', async () => {
    await renderAbaFamilias();
    const esferas = subDe(cartaoDe('ROL'), 'ROL-ESF');
    await clicar(esferas.querySelector('button[title="Editar"]'));

    expect(inputNome().value).toBe('Esferas');
    expect(container.textContent).toMatch(/Subfamília de:\s*ROL — Rolamentos/);
    preencher(inputNome(), 'Esferas de aço');
    await clicar(botaoSalvar());

    expect(api.put).toHaveBeenCalledTimes(1);
    const [rota, corpo] = api.put.mock.calls[0];
    expect(rota).toBe('/almoxarifado/familias/3');
    expect(corpo).toEqual({ nome: 'Esferas de aço', descricao: 'Rolamentos de esferas', tipo_uso: 'industrial' });
    expect(corpo).not.toHaveProperty('parent_id');
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Subfamília atualizada!');
  });
});

describe('TabFamilias — RN-37.04: inativar subfamília', () => {
  test('(d) confirm com o nome + DELETE; o 400 do servidor vira toast com a literal', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockRejectedValueOnce({ response: { data: { error: LITERAL_400 } } });
    await renderAbaFamilias();

    await clicar(subDe(cartaoDe('ROL'), 'ROL-ESF').querySelector('button[title="Inativar"]'));

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('Esferas');
    expect(api.delete).toHaveBeenCalledWith('/almoxarifado/familias/3');
    expect(toast.error).toHaveBeenCalledWith(LITERAL_400);
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('(d2) DELETE que passa: toast de sucesso e a lista recarrega', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await renderAbaFamilias();
    await clicar(subDe(cartaoDe('ROL'), 'ROL-ROL').querySelector('button[title="Inativar"]'));
    expect(api.delete).toHaveBeenCalledWith('/almoxarifado/familias/4');
    expect(toast.success).toHaveBeenCalledWith('Subfamília inativada');
    expect(api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/familias')).toHaveLength(2);
  });

  test('(d3) [controle] cancelar no confirm NÃO chama o DELETE', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    await renderAbaFamilias();
    await clicar(subDe(cartaoDe('ROL'), 'ROL-ESF').querySelector('button[title="Inativar"]'));
    expect(api.delete).not.toHaveBeenCalled();
  });
});

describe('TabFamilias — RN-37.08: expandir subfamília', () => {
  test('(e) expandir a sub pede /familias/<sub>/itens e mostra os itens dela', async () => {
    await renderAbaFamilias();
    const rol = cartaoDe('ROL');
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/familias/3/itens');

    await clicar(subDe(rol, 'ROL-ESF').querySelector('button[title="Itens da subfamília"]'));

    expect(api.get).toHaveBeenCalledWith('/almoxarifado/familias/3/itens');
    // E NÃO o da raiz: expandir a sub não é expandir o cartão (o cabeçalho da raiz é clicável).
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/familias/1/itens');
    expect(rol.textContent).toContain('ROL-001');
    expect(rol.textContent).toContain('Rolamento 6205 ZZ');
  });

  test('(e2) clicar numa ação da sub NÃO expande a raiz (a sub-lista fica fora do cabeçalho clicável)', async () => {
    await renderAbaFamilias();
    const rol = cartaoDe('ROL');
    await clicar(subDe(rol, 'ROL-ESF').querySelector('button[title="Editar"]'));
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/familias/1/itens');
  });
});

describe('TabFamilias — "Adicionar item" da subfamília', () => {
  test('(f) o link leva familia_id da raiz E subfamilia_id da sub', async () => {
    await renderAbaFamilias();
    const rol = cartaoDe('ROL');
    const link = [...subDe(rol, 'ROL-ESF').querySelectorAll('a')].find((a) => /Adicionar item/.test(a.textContent));
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('/almoxarifado/materiais/novo?familia_id=1&subfamilia_id=3');
    // O da raiz continua só com familia_id.
    const linkRaiz = [...rol.querySelector('.almox-familia-cabecalho').querySelectorAll('a')].find((a) => /Adicionar item/.test(a.textContent));
    expect(linkRaiz.getAttribute('href')).toBe('/almoxarifado/materiais/novo?familia_id=1');
  });
});

describe('TabFamilias — RN-37.02 (g): criar família raiz continua igual', () => {
  test('(g) "Nova Família" → POST sem parent_id e toast "Família criada!"', async () => {
    await renderAbaFamilias();
    await clicar(botaoPorTexto(container, /Nova Família/));
    expect(container.textContent).toContain('Nova Família de Material');
    expect(container.textContent).not.toContain('Subfamília de:');
    preencher(inputNome(), 'Mangueiras');
    await clicar(botaoSalvar());

    expect(api.post).toHaveBeenCalledTimes(1);
    const corpo = api.post.mock.calls[0][1];
    expect(corpo).toEqual({ nome: 'Mangueiras', descricao: '', codigo: '', tipo_uso: 'ambos' });
    expect(corpo).not.toHaveProperty('parent_id');
    expect(toast.success).toHaveBeenCalledWith('Família criada!');
  });
});
