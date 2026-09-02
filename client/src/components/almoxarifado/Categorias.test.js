/**
 * Aba "Categorias" (`TabCategorias` em ConfiguracoesAlmoxarifado.js) — o cadastro de categorias
 * de material, entregue pela Etapa 26.
 *
 * Um arquivo de teste por aba e a convencao deste diretorio (foi o que a Etapa 24 estabeleceu ao
 * criar `PerfisAcesso.test.js`): `ConfiguracoesAlmoxarifado.test.js` nao existe, e nao deve
 * passar a existir — as abas sao independentes e um arquivo unico misturaria fixtures.
 *
 * O contrato HTTP e congelado por `server/tests/api/categoriasCrud.api.test.js` (Task 1). O que
 * SO o cliente consegue provar, e por que cada cenario existe:
 *
 *   - a aba pede `?todos=1`. Sem esse parametro o GET devolve so as ativas, e a categoria que
 *     acabou de ser desativada SOME da unica tela que poderia reativa-la — "desativar nao apaga"
 *     vira promessa vazia. E o motivo pelo qual a Task 1 acrescentou o parametro (C1);
 *   - renomear manda `PUT` SEM `ativo`. A rota preserva o valor atual quando o campo e omitido
 *     (decisao da Task 1), entao mandar `ativo: 1` no rename RESSUSCITARIA em silencio uma
 *     categoria que alguem desativou. O cenario le o corpo e exige `ativo` ausente;
 *   - reativar manda `PUT { nome, ativo: 1 }`. E a outra metade da mesma decisao: como omitir
 *     preserva, um `PUT` sem `ativo` na reativacao seria um no-op silencioso — a tela mostraria
 *     "reativada" e a categoria continuaria inativa;
 *   - o erro aparece com a MENSAGEM DO SERVIDOR. A colisao de nome e detectada pelo indice
 *     UNIQUE do banco, e o servidor devolve uma frase que diz o que houve; trocar isso por
 *     "Erro ao salvar" faria o usuario tentar de novo sem saber que o nome ja existe;
 *   - RN-05: renomear NAO reescreve `materiais.categoria` (a coluna e texto livre, nao chave
 *     estrangeira). Sem o aviso na tela o usuario renomeia achando que reclassificou o acervo.
 *
 * Cuidado deliberado com o mock: o `api.get` responde por URL e o catch-all devolve `[]`, entao
 * todo cenario negativo carrega a METADE POSITIVA no mesmo teste (a chamada saiu, com o corpo
 * certo) — senao ele passaria com a lista vazia, provando nada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/Categorias --watchAll=false
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

// FORMA REAL de GET /api/almoxarifado/categorias?todos=1 (routes/almoxarifado/extended.js):
// linhas cruas de `categorias_material_almoxarifado`, `ORDER BY nome`, ATIVAS E INATIVAS
// juntas. A coluna `parent_id` vem no SELECT * e e sempre null — esta aqui de proposito, para
// documentar que a aba a IGNORA: a taxonomia e plana (a coluna e heranca da modelagem original,
// sem uso), e tratar categoria como arvore foi explicitamente descartado no design.
const CATEGORIAS_DO_SERVIDOR = [
  { id: 7, nome: 'Aço carbono', parent_id: null, ativo: 1, created_at: '2026-08-01 10:00:00' },
  { id: 3, nome: 'Consumível', parent_id: null, ativo: 1, created_at: '2026-08-01 10:00:00' },
  { id: 9, nome: 'Obsoleta', parent_id: null, ativo: 0, created_at: '2026-08-01 10:00:00' },
];

const AVISO_RN05 = /renomear.*n(ã|a)o reclassifica/i;

let container;
let root;
let confirmOriginal;

const respostaPorUrl = (url) => {
  if (String(url).startsWith('/almoxarifado/categorias')) {
    return Promise.resolve({ data: CATEGORIAS_DO_SERVIDOR });
  }
  return Promise.resolve({ data: [] });
};

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockImplementation(respostaPorUrl);
  api.post.mockResolvedValue({ data: { id: 42, nome: 'Elétrico', ativo: 1 } });
  api.put.mockResolvedValue({ data: { id: 3, nome: 'Consumíveis', ativo: 1 } });
  api.delete.mockResolvedValue({ data: { success: true } });
  confirmOriginal = window.confirm;
  window.confirm = jest.fn(() => true);
});

afterEach(() => {
  window.confirm = confirmOriginal;
  act(() => root.unmount());
  container.remove();
});

async function renderAbaCategorias() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=categorias']}>
        <ConfiguracoesAlmoxarifado />
      </MemoryRouter>
    );
  });
}

const linhaDa = (nome) => [...container.querySelectorAll('tbody tr')]
  .find(tr => tr.querySelector('td')?.textContent.trim() === nome);

const botaoDaLinha = (nome, rotulo) => {
  const tr = linhaDa(nome);
  if (!tr) return null;
  return [...tr.querySelectorAll('button')]
    .find(b => new RegExp(rotulo, 'i').test(b.getAttribute('title') || b.textContent)) || null;
};

const botaoPorTexto = (regex) => [...container.querySelectorAll('button')]
  .find(b => regex.test(b.textContent)) || null;

const preencher = (el, valor) => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

const inputNome = () => container.querySelector('input.almox-input');

async function abrirFormularioNovo() {
  await act(async () => { botaoPorTexto(/Nova Categoria/).click(); });
}

/* ── Listar ── */

test('a aba lista ativas e inativas juntas, distinguiveis, pedindo ?todos=1', async () => {
  await renderAbaCategorias();

  // A METADE que faz o cenario valer: sem `?todos=1` a inativa nem chega, e o resto do arquivo
  // (reativar) seria intestavel.
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias?todos=1');

  expect(linhaDa('Aço carbono')).not.toBeUndefined();
  expect(linhaDa('Consumível')).not.toBeUndefined();
  expect(linhaDa('Obsoleta')).not.toBeUndefined();

  // Distinguiveis: a inativa e marcada, as ativas nao. Sem isso a lista misturaria o catalogo
  // vigente com o que foi aposentado, e o usuario reintroduziria a categoria morta.
  expect(linhaDa('Obsoleta').textContent).toMatch(/Inativa/);
  expect(linhaDa('Aço carbono').textContent).not.toMatch(/Inativa/);
  expect(linhaDa('Consumível').textContent).not.toMatch(/Inativa/);
});

/* ── Criar ── */

test('criar manda POST { nome } e recarrega a lista', async () => {
  await renderAbaCategorias();
  api.get.mockClear();

  await abrirFormularioNovo();
  await act(async () => { preencher(inputNome(), 'Elétrico'); });
  await act(async () => { botaoPorTexto(/Salvar Categoria/).click(); });

  expect(api.post).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.post.mock.calls[0];
  expect(rota).toBe('/almoxarifado/categorias');
  expect(corpo.nome).toBe('Elétrico');
  // Recarrega SEMPRE com `?todos=1` — recarregar sem o parametro apagaria as inativas da tela
  // depois da primeira escrita, e o bug so apareceria no segundo uso da aba.
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias?todos=1');
});

test('criar com nome vazio nem chega a chamar o POST', async () => {
  await renderAbaCategorias();

  await abrirFormularioNovo();
  await act(async () => { botaoPorTexto(/Salvar Categoria/).click(); });

  expect(api.post).not.toHaveBeenCalled();
  // Metade positiva: o formulario existe e o botao foi mesmo clicado — o toast prova que o
  // caminho rodou ate a validacao, e nao que o botao nao foi achado.
  expect(toast.error).toHaveBeenCalledWith('Nome é obrigatório');
});

/* ── Renomear (RN-05) ── */

test('renomear manda PUT SEM `ativo` — omitir preserva, mandar 1 ressuscitaria uma inativa', async () => {
  await renderAbaCategorias();

  await act(async () => { botaoDaLinha('Consumível', 'Renomear').click(); });
  // Metade positiva: o formulario abriu JA com o nome atual — sem isso o teste abaixo poderia
  // estar preenchendo um formulario de criacao e passando pelo motivo errado.
  expect(inputNome().value).toBe('Consumível');

  await act(async () => { preencher(inputNome(), 'Consumíveis'); });
  await act(async () => { botaoPorTexto(/Salvar Categoria/).click(); });

  expect(api.put).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.put.mock.calls[0];
  expect(rota).toBe('/almoxarifado/categorias/3');
  expect(corpo.nome).toBe('Consumíveis');
  expect(corpo.ativo).toBeUndefined();
  expect(api.post).not.toHaveBeenCalled();
});

test('RN-05: ao renomear a tela avisa que os materiais ja classificados mantem o nome antigo', async () => {
  await renderAbaCategorias();

  // O aviso nao pode ser decoracao permanente da aba: criar nao tem esse efeito colateral, e um
  // aviso que aparece sempre o usuario para de ler.
  expect(container.textContent).not.toMatch(AVISO_RN05);
  await abrirFormularioNovo();
  expect(container.textContent).not.toMatch(AVISO_RN05);

  await act(async () => { botaoPorTexto(/Cancelar/).click(); });
  await act(async () => { botaoDaLinha('Consumível', 'Renomear').click(); });

  // Metade positiva: e mesmo o formulario de renomear que esta aberto.
  expect(inputNome().value).toBe('Consumível');
  expect(container.textContent).toMatch(AVISO_RN05);
  // E o aviso tem de dizer O QUE acontece, nao so que "algo" nao muda: os materiais ficam com
  // o nome ANTIGO. `materiais.categoria` e texto livre — renomear a linha do catalogo nao
  // propaga, e essa e a unica tela onde o usuario descobre isso antes de agir.
  expect(container.textContent).toMatch(/nome antigo/i);
});

/* ── Desativar ── */

test('desativar manda DELETE, pede confirmacao e recarrega com ?todos=1', async () => {
  await renderAbaCategorias();
  api.get.mockClear();

  await act(async () => { botaoDaLinha('Consumível', 'Desativar').click(); });

  expect(window.confirm).toHaveBeenCalledTimes(1);
  expect(api.delete).toHaveBeenCalledWith('/almoxarifado/categorias/3');
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias?todos=1');
});

test('a inativa nao oferece desativar de novo — oferece Reativar', async () => {
  await renderAbaCategorias();

  expect(botaoDaLinha('Obsoleta', 'Desativar')).toBeNull();
  // Metade positiva: a linha existe e TEM botao — o `toBeNull` acima nao passou por linha ausente.
  expect(botaoDaLinha('Obsoleta', 'Reativar')).not.toBeNull();
  expect(botaoDaLinha('Consumível', 'Desativar')).not.toBeNull();
});

/* ── Reativar ── */

test('reativar manda PUT { nome, ativo: 1 } — sem `ativo` seria no-op silencioso', async () => {
  await renderAbaCategorias();
  api.get.mockClear();

  await act(async () => { botaoDaLinha('Obsoleta', 'Reativar').click(); });

  expect(api.put).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.put.mock.calls[0];
  expect(rota).toBe('/almoxarifado/categorias/9');
  expect(corpo.ativo).toBe(1);
  // `nome` vai junto porque a rota exige nome nao-vazio; mandar so `{ ativo: 1 }` funcionaria
  // (a rota preserva o nome), mas o corpo explicito e o que o contrato descreve.
  expect(corpo.nome).toBe('Obsoleta');
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/categorias?todos=1');
});

/* ── Erro do servidor ── */

test('o erro do servidor aparece com a mensagem DO SERVIDOR, nao com uma generica', async () => {
  await renderAbaCategorias();

  // Literal exato do servidor (CATEGORIA_DUPLICADA em extended.js), devolvido no POST e no PUT.
  const DUPLICADA = 'Já existe uma categoria com este nome';
  api.post.mockRejectedValueOnce({ response: { data: { error: DUPLICADA } } });

  await abrirFormularioNovo();
  await act(async () => { preencher(inputNome(), 'Consumível'); });
  await act(async () => { botaoPorTexto(/Salvar Categoria/).click(); });

  // Metade positiva: a chamada SAIU com o nome digitado — sem isto, uma tela que nunca submete
  // passaria neste cenario por nao ter mostrado mensagem generica nenhuma.
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][1].nome).toBe('Consumível');

  expect(toast.error).toHaveBeenCalledWith(DUPLICADA);
  expect(toast.error).not.toHaveBeenCalledWith('Erro ao salvar');
});

test('o erro do servidor no renomear tambem chega cru ao usuario', async () => {
  await renderAbaCategorias();

  const DUPLICADA = 'Já existe uma categoria com este nome';
  api.put.mockRejectedValueOnce({ response: { data: { error: DUPLICADA } } });

  await act(async () => { botaoDaLinha('Consumível', 'Renomear').click(); });
  await act(async () => { preencher(inputNome(), 'Aço carbono'); });
  await act(async () => { botaoPorTexto(/Salvar Categoria/).click(); });

  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put.mock.calls[0][1].nome).toBe('Aço carbono');
  expect(toast.error).toHaveBeenCalledWith(DUPLICADA);
  expect(toast.error).not.toHaveBeenCalledWith('Erro ao salvar');
});
