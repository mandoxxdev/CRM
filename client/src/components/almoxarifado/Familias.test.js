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
 *  - expandir uma subfamília pede `/familias/<sub>/itens`. (O "Adicionar item" da sub, que levava o par
 *    `familia_id=<raiz>&subfamilia_id=<sub>` ao form de material, saiu na Etapa 193 — o cadastro de material e so do Compras;
 *    o item listado tem "Ver", a ficha so para leitura.)
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
    if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: FAMILIAS });
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
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/familias?ativo=all');

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
    expect(api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/familias?ativo=all')).toHaveLength(2);
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
    // Etapa 126 (RN-29): o Editar leva também o que LEU (campos_lidos) — o corpo da 37 mais a chave nova.
    expect(corpo).toEqual({
      nome: 'Esferas de aço', descricao: 'Rolamentos de esferas', tipo_uso: 'industrial',
      campos_lidos: { nome: 'Esferas', tipo_uso: 'industrial', descricao: 'Rolamentos de esferas' },
    });
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
    expect(api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/familias?ativo=all')).toHaveLength(2);
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

describe('TabFamilias — Etapa 193 (RN-193.01): o cadastro de material saiu da aba', () => {
  // Ate a 192 havia "Adicionar item" na raiz e na sub (com familia_id/subfamilia_id na URL) e um lapis "Editar" em cada item.
  test('(f) nem a raiz nem a sub ativas oferecem "Adicionar item"; o item da sub tem "Ver" (a ficha só para leitura)', async () => {
    await renderAbaFamilias();
    const rol = cartaoDe('ROL');
    const adicionar = (el) => [...el.querySelectorAll('a')].filter((a) => /Adicionar item/.test(a.textContent));
    expect(adicionar(rol.querySelector('.almox-familia-cabecalho'))).toHaveLength(0);
    expect(adicionar(subDe(rol, 'ROL-ESF'))).toHaveLength(0);
    expect(container.querySelector('a[href^="/almoxarifado/materiais/novo"]')).toBeNull();
    await clicar(subDe(rol, 'ROL-ESF').querySelector('button[title="Itens da subfamília"]'));
    const ver = container.querySelector('[data-testid="ver-item-10"]');
    expect(ver).not.toBeNull();
    expect(ver.getAttribute('href')).toBe('/almoxarifado/materiais/ver/10');
    expect(ver.getAttribute('title')).toBe('Ver');
    expect(container.querySelector('a[href^="/almoxarifado/materiais/editar"]')).toBeNull();
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

describe('TabFamilias — revisão da Etapa 37 (F3): subfamília cujo pai não está na lista', () => {
  test('aparece no bloco "Subfamílias sem família ativa", não como cartão nem dentro de uma raiz', async () => {
    const ORFA = { id: 9, codigo: 'RAO-SUB', nome: 'Sub Orfa', descricao: '', parent_id: 13, parent_nome: 'Raiz Orfa', tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: [...FAMILIAS, ORFA] });
      return Promise.resolve({ data: [] });
    });
    await renderAbaFamilias();
    const bloco = container.querySelector('.almox-familia-orfas');
    expect(bloco).not.toBeNull();
    expect(bloco.textContent).toMatch(/Subfamílias sem família ativa \(1\)/);
    expect(bloco.textContent).toMatch(/RAO-SUB/);
    expect(bloco.textContent).toMatch(/Raiz Orfa/);
    // continua com os 2 cartões de raiz, e a órfã não está em nenhum deles
    expect(cartoes().length).toBe(2);
    expect(cartoes().every((c) => !c.textContent.includes('RAO-SUB'))).toBe(true);
  });

  test('[controle] sem órfã o bloco não existe', async () => {
    await renderAbaFamilias();
    expect(container.querySelector('.almox-familia-orfas')).toBeNull();
  });
});

/**
 * Etapa 124 (RN-16..RN-19, Fase 2 C1) — a aba lista as INATIVAS e as reativa. Antes ela pedia só as ativas e não tinha
 * Reativar: a recusa da requisição de material inativo mandava reativar a família "em Configurações → Famílias", e nenhuma
 * tela fazia isso — nem para o Administrador.
 */
describe('TabFamilias — Etapa 124: as inativas aparecem e se reativam', () => {
  const VEDACOES = { id: 20, codigo: 'VED', nome: 'Vedações', descricao: '', parent_id: null, parent_nome: null, tipo_uso: 'ambos', ativo: 0, qtd_itens: 2 };
  const ORINGS = { id: 21, codigo: 'VED-ORI', nome: 'O-rings', descricao: '', parent_id: 20, parent_nome: 'Vedações', tipo_uso: 'ambos', ativo: 0, qtd_itens: 1 };
  const AGULHAS = { id: 22, codigo: 'ROL-AGU', nome: 'Agulhas', descricao: '', parent_id: 1, parent_nome: 'Rolamentos', tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
  const COM_INATIVAS = [...FAMILIAS, VEDACOES, ORINGS, AGULHAS];
  const mock = (lista = COM_INATIVAS) => api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: lista });
    return Promise.resolve({ data: [] });
  });
  const selo = (el) => [...el.querySelectorAll('.almox-selo-inativa')];
  const linkAdicionar = (el) => [...el.querySelectorAll('a')].find((a) => /Adicionar item/.test(a.textContent));

  test('[RN-16] pede ?ativo=all e mostra a raiz inativa como cartão e a sub inativa dentro da raiz certa, com o selo "Inativa"', async () => {
    mock();
    await renderAbaFamilias();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/familias?ativo=all');
    expect(api.get.mock.calls.some((c) => c[0] === '/almoxarifado/familias')).toBe(false);
    const ved = cartaoDe('VED');
    expect(ved).toBeTruthy();
    expect(selo(ved.querySelector('.almox-familia-cabecalho')).map((s) => s.textContent)).toEqual(['Inativa']);
    expect(subDe(ved, 'VED-ORI')).toBeTruthy();
    const agu = subDe(cartaoDe('ROL'), 'ROL-AGU');
    expect(selo(agu).map((s) => s.textContent)).toEqual(['Inativa']);
    // metade positiva: a ativa nao tem selo
    expect(selo(cartaoDe('PAR'))).toHaveLength(0);
    expect(selo(subDe(cartaoDe('ROL'), 'ROL-ESF'))).toHaveLength(0);
  });

  test('[RN-17][RN-12 da 125] Reativar a raiz manda PUT {ativo: 1} (sem o nome da lista), toast "Família reativada" e recarrega', async () => {
    mock();
    await renderAbaFamilias();
    await clicar(cartaoDe('VED').querySelector('.almox-familia-cabecalho button[title="Reativar"]'));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/familias/20', { ativo: 1 });
    expect(toast.success).toHaveBeenCalledWith('Família reativada');
    expect(api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/familias?ativo=all')).toHaveLength(2);
  });

  test('[RN-17] Reativar a sub: "Subfamília reativada"; a recusa do servidor vai para o toast com a literal', async () => {
    mock();
    await renderAbaFamilias();
    await clicar(subDe(cartaoDe('ROL'), 'ROL-AGU').querySelector('button[title="Reativar"]'));
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/familias/22', { ativo: 1 });
    expect(toast.success).toHaveBeenCalledWith('Subfamília reativada');
    const LIT = 'Não é possível reativar: a família principal desta subfamília está inativa — reative a família principal antes';
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: LIT } } });
    await clicar(subDe(cartaoDe('VED'), 'VED-ORI').querySelector('button[title="Reativar"]'));
    expect(toast.error).toHaveBeenCalledWith(LIT);
  });

  test('[RN-18] a inativa nao oferece Adicionar item, Nova subfamília nem Inativar; oferece Editar e Reativar', async () => {
    mock();
    await renderAbaFamilias();
    const ved = cartaoDe('VED');
    const cab = ved.querySelector('.almox-familia-cabecalho');
    expect(linkAdicionar(cab)).toBeUndefined();
    expect(cab.querySelector('button[title="Inativar"]')).toBeNull();
    expect(cab.querySelector('button[title="Editar"]')).not.toBeNull();
    expect(botaoPorTexto(ved, /Nova subfamília/)).toBeUndefined();
    const agu = subDe(cartaoDe('ROL'), 'ROL-AGU');
    expect(linkAdicionar(agu)).toBeUndefined();
    expect(agu.querySelector('button[title="Inativar"]')).toBeNull();
    expect(agu.querySelector('button[title="Reativar"]')).not.toBeNull();
  });

  test('[RN-18] o Editar da inativa continua sem `ativo` (nao reativa calado)', async () => {
    mock();
    await renderAbaFamilias();
    await clicar(cartaoDe('VED').querySelector('.almox-familia-cabecalho button[title="Editar"]'));
    preencher(inputNome(), 'Vedações e juntas');
    await clicar(botaoSalvar());
    const [rota, corpo] = api.put.mock.calls[0];
    expect(rota).toBe('/almoxarifado/familias/20');
    expect(corpo).not.toHaveProperty('ativo');
  });

  // Etapa 193 (RN-193.01): "Adicionar item" saiu de todas (o cadastro de material e so do Compras) — a ativa nao o tem mais.
  test('[RN-19] as ativas continuam como hoje: Nova subfamília e Inativar, sem Reativar (e, desde a 193, sem Adicionar item)', async () => {
    mock();
    await renderAbaFamilias();
    const rol = cartaoDe('ROL');
    const cab = rol.querySelector('.almox-familia-cabecalho');
    expect(linkAdicionar(cab)).toBeUndefined();
    expect(cab.querySelector('button[title="Inativar"]')).not.toBeNull();
    expect(cab.querySelector('button[title="Reativar"]')).toBeNull();
    expect(botaoPorTexto(rol, /Nova subfamília/)).toBeTruthy();
    expect(subDe(rol, 'ROL-ESF').querySelector('button[title="Reativar"]')).toBeNull();
  });

  test('[RN-19] sub ATIVA sob raiz inativa vai para o bloco das órfãs, não para dentro do cartão', async () => {
    const ATIVA_SOB_INATIVA = { ...ORINGS, id: 23, codigo: 'VED-PLA', nome: 'Planas', ativo: 1 };
    mock([...COM_INATIVAS, ATIVA_SOB_INATIVA]);
    await renderAbaFamilias();
    const bloco = container.querySelector('.almox-familia-orfas');
    expect(bloco).not.toBeNull();
    expect(bloco.textContent).toMatch(/VED-PLA/);
    expect(bloco.textContent).not.toMatch(/VED-ORI/);
    expect(subDe(cartaoDe('VED'), 'VED-PLA')).toBeUndefined();
    expect(subDe(cartaoDe('VED'), 'VED-ORI')).toBeTruthy();
  });
});

describe('TabFamilias — Etapa 124 (Fase 5): a inativa expandida não oferece o cadastro', () => {
  const VEDACOES = { id: 20, codigo: 'VED', nome: 'Vedações', descricao: '', parent_id: null, parent_nome: null, tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
  // Etapa 193 (RN-193.01): "Cadastrar primeiro item" saiu tambem da ativa — a metade positiva virou "nenhuma oferece".
  test('[RN-18] expandir a raiz sem itens: "Nenhum item nesta família." sem "Cadastrar primeiro item" — inativa e, desde a 193, ativa', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: [...FAMILIAS, VEDACOES] });
      return Promise.resolve({ data: [] });
    });
    await renderAbaFamilias();
    await clicar(cartaoDe('VED').querySelector('.almox-familia-cabecalho'));
    const ved = cartaoDe('VED');
    expect(ved.textContent).toMatch(/Nenhum item nesta família\./);
    expect([...ved.querySelectorAll('a')].some((a) => /Cadastrar primeiro item/.test(a.textContent))).toBe(false);
    // a ativa sem itens (PAR): a mesma frase, e tambem sem o link (Etapa 193)
    await clicar(cartaoDe('PAR').querySelector('.almox-familia-cabecalho'));
    expect(cartaoDe('PAR').textContent).toMatch(/Nenhum item nesta família./);
    expect([...cartaoDe('PAR').querySelectorAll('a')].some((a) => /Cadastrar primeiro item/.test(a.textContent))).toBe(false);
  });
});

describe('TabFamilias — Etapa 124 (Fase 5, sabotagem): NULL, a ordem e a órfã inativa', () => {
  const mock = (lista) => api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: lista });
    return Promise.resolve({ data: [] });
  });
  const codigosDosCartoes = () => cartoes().map((c) => c.querySelector('.almox-familia-cabecalho span').textContent);

  test('[RN-16] ativo NULL é inativa (a leitura do servidor): selo e Reativar, sem Inativar', async () => {
    const NULA = { id: 30, codigo: 'NUL', nome: 'Nula', descricao: '', parent_id: null, parent_nome: null, tipo_uso: 'ambos', ativo: null, qtd_itens: 0 };
    mock([...FAMILIAS, NULA]);
    await renderAbaFamilias();
    const cab = cartaoDe('NUL').querySelector('.almox-familia-cabecalho');
    expect(cab.querySelector('.almox-selo-inativa')).not.toBeNull();
    expect(cab.querySelector('button[title="Reativar"]')).not.toBeNull();
    expect(cab.querySelector('button[title="Inativar"]')).toBeNull();
  });

  test('[RN-16] as inativas vão depois das ativas: a raiz inativa "Aaa" é o último cartão; a sub inativa, a última linha', async () => {
    const AAA = { id: 31, codigo: 'AAA', nome: 'Aaa', descricao: '', parent_id: null, parent_nome: null, tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
    const AAA_SUB = { id: 32, codigo: 'ROL-AAA', nome: 'Aaa sub', descricao: '', parent_id: 1, parent_nome: 'Rolamentos', tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
    mock([...FAMILIAS, AAA, AAA_SUB]);
    await renderAbaFamilias();
    expect(codigosDosCartoes()).toEqual(['PAR', 'ROL', 'AAA']);
    const linhas = subsDoCartao(cartaoDe('ROL')).map((r) => r.querySelector('span').textContent);
    expect(linhas).toEqual(['ROL-ESF', 'ROL-ROL', 'ROL-AAA']);
  });

  test('[RN-19] órfã INATIVA (pai fora da lista): no bloco, com o selo e Reativar, sem Inativar', async () => {
    const ORFA_INATIVA = { id: 33, codigo: 'ZER-SUB', nome: 'Pai zero', descricao: '', parent_id: 0, parent_nome: null, tipo_uso: 'ambos', ativo: 0, qtd_itens: 0 };
    mock([...FAMILIAS, ORFA_INATIVA]);
    await renderAbaFamilias();
    const bloco = container.querySelector('.almox-familia-orfas');
    expect(bloco).not.toBeNull();
    const linha = [...bloco.querySelectorAll('.almox-subfamilia-row')].find((r) => r.textContent.includes('ZER-SUB'));
    expect(linha.querySelector('.almox-selo-inativa')).not.toBeNull();
    expect(linha.querySelector('button[title="Reativar"]')).not.toBeNull();
    expect(linha.querySelector('button[title="Inativar"]')).toBeNull();
  });
});
