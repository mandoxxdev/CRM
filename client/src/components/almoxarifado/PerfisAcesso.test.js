/**
 * Aba "Perfis de Acesso" (`TabPerfisAcesso` em ConfiguracoesAlmoxarifado.js) — a tela que decide
 * quem pode AGIR dentro do almoxarifado.
 *
 * ESTE ARQUIVO EXISTE PORQUE A ABA TINHA ZERO TESTE. A varredura da Etapa 24 nao achou nenhum
 * `.test.js` mencionando `TabPerfisAcesso` nem `perfis-usuario` — a tela que concede e revoga
 * acesso ao modulo era a unica sem rede. Quase tudo aqui cobre comportamento que JA FUNCIONA:
 * nao e redundancia, e a rede que faltava. A excecao e a RN-07, que nasceu vermelha.
 *
 * O que so o cliente consegue provar (o contrato HTTP e congelado por
 * `server/tests/api/perfisUsuario.api.test.js`, 14 cenarios):
 *   - que a tela SABE MOSTRAR A ORIGEM, e nao so o perfil efetivo — sem isso o administrador
 *     nao distingue "PRODUCAO porque escolhi" de "PRODUCAO porque e o padrao de quem nao tem
 *     perfil", e a coluna vira uma afirmacao sem sentido;
 *   - que ela NAO OFERECE o que o backend recusa (origem `forcado`, RN-03) nem o que o backend
 *     aceita mas nao deveria (`ADMINISTRADOR`, RN-07);
 *   - o FORMATO do que ela manda de volta: `PUT` na URL do usuario certo, com `{ perfil }`, e
 *     perfil VAZIO no "voltar ao padrao" (RN-04) — que e o que apaga a linha no servidor.
 *
 * RN-07 (a unica correcao de codigo desta task): `ADMINISTRADOR` vem em `data.perfis` porque a
 * rota devolve `PERFIS_VALIDOS` inteiro, mas a tela nao pode oferece-lo. Dois defeitos que se
 * somam, ambos medidos: (a) `hasAlmoxAdminPerfil` faz `canConfigureModule('almoxarifado')`
 * valer para quem tem `perfil_almoxarifado === 'ADMINISTRADOR'`, entao quem recebe o perfil por
 * ESTA tela passa a configurar o modulo e a promover outros — e `classificarPerfil` o marca como
 * `explicito`, nao `forcado`, entao o 409 nao protege; (b) `syncModuleAdminProfiles` roda em
 * todo save de usuario e apaga esse perfil quando `admin_modulos` nao contem `almoxarifado` —
 * a concessao evapora sozinha depois.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/PerfisAcesso --watchAll=false
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

// FORMA REAL de GET /api/almoxarifado/perfis-usuario (routes/almoxarifado/extended.js:247):
// `perfis` e `PERFIS_VALIDOS` inteiro — ADMINISTRADOR INCLUSIVE, e e de proposito que ele esta
// nesta fixture: a RN-07 e sobre a tela filtrar o que o servidor manda, nao sobre o servidor
// parar de mandar. QUALIDADE tambem vem daqui (Task 1) — se `PERFIS_INFO` regredir no client,
// o rotulo cai no teste da RN-02 abaixo.
const PERFIS_DO_SERVIDOR = [
  'ADMINISTRADOR', 'ALMOXARIFE', 'COMPRAS', 'PRODUCAO',
  'ENGENHARIA', 'GESTOR', 'CONSULTA', 'QUALIDADE',
];

// As TRES origens que `classificarPerfil` produz. `perfil_efetivo` e sempre preenchido (o
// fallback do servidor e PRODUCAO); `perfil_explicito` so existe quando alguem escolheu.
const USUARIOS = [
  { id: 11, nome: 'Marina Explicita', email: 'marina@ex.com', perfil_explicito: 'GESTOR', perfil_efetivo: 'GESTOR', origem: 'explicito' },
  { id: 22, nome: 'Paulo Padrao', email: 'paulo@ex.com', perfil_explicito: null, perfil_efetivo: 'PRODUCAO', origem: 'padrao' },
  { id: 33, nome: 'Fatima Forcada', email: 'fatima@ex.com', perfil_explicito: null, perfil_efetivo: 'ADMINISTRADOR', origem: 'forcado' },
];

// A literal do 409 (extended.js) — a tela tem de mostrar ESTA, nao uma generica, porque e ela
// que diz ONDE resolver (cadastro de usuario).
const MSG_409 = 'Este usuário já é administrador (superadmin, admin de sistema ou admin do módulo) e tem acesso total ao almoxarifado. Remova essa condição no cadastro de usuário antes de definir um perfil específico.';

let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockResolvedValue({ data: { perfis: PERFIS_DO_SERVIDOR, usuarios: USUARIOS } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAbaPerfis() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=perfis']}>
        <ConfiguracoesAlmoxarifado />
      </MemoryRouter>
    );
  });
}

// A linha da tabela daquele usuario, achada pelo e-mail (nome pode colidir com texto de ajuda).
const linhaDe = (email) => [...container.querySelectorAll('tbody tr')]
  .find((tr) => tr.textContent.includes(email)) || null;

const selectDe = (email) => {
  const tr = linhaDe(email);
  return tr ? tr.querySelector('select') : null;
};

const opcoesDe = (email) => {
  const sel = selectDe(email);
  return sel ? [...sel.querySelectorAll('option')].map((o) => ({ value: o.value, texto: o.textContent })) : [];
};

const escolher = async (email, valor) => {
  const sel = selectDe(email);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, valor);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

test('as tres origens aparecem, e a ORIGEM e visivel — nao so o perfil', async () => {
  await renderAbaPerfis();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/perfis-usuario');
  expect(container.textContent).not.toMatch(/Carregando/);

  // As tres linhas existem.
  expect(linhaDe('marina@ex.com')).not.toBeNull();
  expect(linhaDe('paulo@ex.com')).not.toBeNull();
  expect(linhaDe('fatima@ex.com')).not.toBeNull();

  // `explicito`: o select vem POSICIONADO no perfil escolhido. Se o value viesse vazio, a tela
  // mostraria "Produção (padrão)" para quem tem GESTOR gravado — mentira silenciosa.
  expect(selectDe('marina@ex.com').value).toBe('GESTOR');

  // `padrao`: o select vem vazio e a opcao vazia DIZ que e o padrao. Este e o ponto da origem:
  // sem a palavra "padrão", "Produção" aqui e indistinguivel de uma escolha deliberada.
  const padrao = selectDe('paulo@ex.com');
  expect(padrao.value).toBe('');
  const opcaoVazia = opcoesDe('paulo@ex.com').find((o) => o.value === '');
  expect(opcaoVazia).toBeDefined();
  expect(opcaoVazia.texto).toMatch(/padrão/i);

  // `forcado`: a origem aparece como um estado, com o rotulo de administrador.
  expect(linhaDe('fatima@ex.com').textContent).toMatch(/Administrador/);
});

test('RN-03: origem "forcado" nao ganha seletor, e a linha diz o motivo', async () => {
  await renderAbaPerfis();

  // A METADE NEGATIVA.
  expect(selectDe('fatima@ex.com')).toBeNull();

  // A METADE POSITIVA — sem ela, "nao ha seletor" passaria com a tabela vazia ou com a aba
  // quebrada, provando nada. As outras duas origens TEM seletor.
  expect(selectDe('marina@ex.com')).not.toBeNull();
  expect(selectDe('paulo@ex.com')).not.toBeNull();

  // E o motivo tem de estar na linha: tirar o seletor sem dizer por que vira tela quebrada aos
  // olhos de quem usa.
  expect(linhaDe('fatima@ex.com').textContent).toMatch(/remova a condição de administrador no cadastro de usuário/i);
});

test('escolher um perfil manda PUT { perfil } na URL do usuario certo', async () => {
  api.put.mockResolvedValue({ data: { usuario_id: 22, perfil_explicito: 'ALMOXARIFE', perfil_efetivo: 'ALMOXARIFE', origem: 'explicito' } });
  await renderAbaPerfis();

  await escolher('paulo@ex.com', 'ALMOXARIFE');

  expect(api.put).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.put.mock.calls[0];
  // O id na URL e o do usuario da LINHA, nao o do primeiro da lista nem o do usuario logado.
  expect(rota).toBe('/almoxarifado/perfis-usuario/22');
  expect(corpo).toEqual({ perfil: 'ALMOXARIFE' });

  // E a linha reflete a resposta do servidor sem precisar recarregar a aba.
  expect(selectDe('paulo@ex.com').value).toBe('ALMOXARIFE');
});

test('RN-04: "Produção (padrão)" manda perfil VAZIO — e o que apaga a linha no servidor', async () => {
  api.put.mockResolvedValue({ data: { usuario_id: 11, perfil_explicito: null, perfil_efetivo: 'PRODUCAO', origem: 'padrao' } });
  await renderAbaPerfis();

  // Marina tem GESTOR explicito; voltar ao padrao e escolher a opcao vazia.
  await escolher('marina@ex.com', '');

  expect(api.put).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.put.mock.calls[0];
  expect(rota).toBe('/almoxarifado/perfis-usuario/11');
  // VAZIO, nao 'PRODUCAO': o servidor apaga a linha quando o perfil e falsy. Mandar
  // 'PRODUCAO' gravaria um perfil explicito e a origem ficaria `explicito` para sempre.
  expect(corpo.perfil).toBe('');
  expect(corpo.perfil).not.toBe('PRODUCAO');

  expect(selectDe('marina@ex.com').value).toBe('');
});

test('409 mostra a MENSAGEM DO SERVIDOR, nao uma generica', async () => {
  api.put.mockRejectedValue({ response: { status: 409, data: { error: MSG_409 } } });
  await renderAbaPerfis();

  await escolher('paulo@ex.com', 'GESTOR');

  expect(toast.error).toHaveBeenCalledTimes(1);
  const mostrado = toast.error.mock.calls[0][0];
  // A literal do servidor e a unica que diz ONDE resolver.
  expect(mostrado).toBe(MSG_409);
  expect(mostrado).not.toBe('Erro ao alterar o perfil');
  // E o toast de sucesso nao pode ter disparado junto.
  expect(toast.success).not.toHaveBeenCalled();
});

test('RN-07: ADMINISTRADOR nao e oferecido, mesmo vindo em data.perfis', async () => {
  await renderAbaPerfis();

  const opcoes = opcoesDe('paulo@ex.com');

  // A METADE POSITIVA PRIMEIRO — "ADMINISTRADOR ausente" passaria com um seletor vazio, com a
  // fixture errada ou com a aba nem renderizada. O seletor TEM de estar cheio dos outros.
  const valores = opcoes.map((o) => o.value);
  expect(valores).toContain('ALMOXARIFE');
  expect(valores).toContain('GESTOR');
  expect(valores).toContain('QUALIDADE');
  expect(valores).toContain('CONSULTA');
  expect(valores).toContain('ENGENHARIA');
  expect(valores).toContain('COMPRAS');

  // A METADE NEGATIVA: nem como value nem como rotulo visivel.
  expect(PERFIS_DO_SERVIDOR).toContain('ADMINISTRADOR');   // o servidor mandou
  expect(valores).not.toContain('ADMINISTRADOR');          // a tela nao ofereceu
  expect(opcoes.some((o) => /Administrador/i.test(o.texto))).toBe(false);

  // PRODUCAO tambem nao aparece como opcao propria: quem quer Producao usa a opcao vazia
  // (RN-04), senao gravaria um perfil explicito igual ao padrao.
  expect(valores).not.toContain('PRODUCAO');

  // E o motivo fica visivel ao usuario, na propria aba — sem isso a ausencia parece bug.
  expect(container.textContent).toMatch(/administrador do módulo.*cadastro de usuário/i);
});

test('RN-02: o rotulo "Qualidade" aparece — o perfil novo nao sai como QUALIDADE cru', async () => {
  await renderAbaPerfis();

  const qualidade = opcoesDe('paulo@ex.com').find((o) => o.value === 'QUALIDADE');
  expect(qualidade).toBeDefined();
  // `PERFIS_INFO` e hardcodado no client: se a entrada regredir, a lista continua vindo do
  // servidor e a opcao aparece — com o enum cru. Este e o cenario que liga esta task a Task 1.
  expect(qualidade.texto).toBe('Qualidade');
  expect(qualidade.texto).not.toBe('QUALIDADE');
});
