/**
 * Etapa 22, Task 3 — tela "/almoxarifado/auditoria" contra os contratos congelados C1 e C2 do
 * plano (docs/superpowers/plans/2026-08-28-almoxarifado-etapa22-tela-de-auditoria.md; design
 * docs/superpowers/specs/2026-08-28-almoxarifado-etapa22-tela-de-auditoria-design.md).
 *
 * Os filtros, a validação de data, a janela de fuso e o de/para têm teste de rota e de unidade
 * no servidor (auditLabels.api.test.js / auditoriaFiltros.api.test.js) — não duplicados aqui.
 * O alvo desta suíte é o que SÓ a tela pode errar:
 *   - mandar `acao` como ARRAY (achado A5 do plano: api.js é um axios.create() sem
 *     paramsSerializer, então array vira `acao[]=A&acao[]=B` e o backend responde 500);
 *   - traduzir rótulo ou recalcular de/para no cliente (achado A9: os dois vêm PRONTOS do
 *     servidor em `acao_rotulo`/`entidade_rotulo`/`alteracoes`);
 *   - ler o `created_at` do SQLite sem o sufixo 'Z' e mostrar o DIA ERRADO (achado A3);
 *   - dizer "não há registros" quando o certo é "nenhum registro PARA OS FILTROS APLICADOS";
 *   - engolir `truncado: true` (a Etapa 18 fez a rota declarar o corte para a tela avisar);
 *   - desmascarar segredo (RN-08 — o que vem '(alterado)' é exibido assim).
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=AuditoriaAlmoxarifado
 */

// Fuso FIXADO antes de qualquer Date: o cenário do created_at só distingue o certo do errado
// num fuso != UTC (em UTC as duas leituras coincidem e o teste passaria provando nada — o
// "teste vazio" que o CLAUDE.md manda desconfiar). Node reconfigura o V8 ao setar process.env.TZ.
process.env.TZ = 'America/Sao_Paulo';

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AuditoriaAlmoxarifado from './AuditoriaAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'GESTOR',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao, ev) => {
      if (mockPode(acao)) return true;
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    },
    loading: false,
  }),
}));

// ── Fixture C2. `MOVIMENTO_ESTRANHO` entra com o rótulo = o próprio verbo (contrato C2: verbo
// sem rótulo NUNCA some da lista — sumir esconderia atos).
const OPCOES = {
  entidades: [
    { valor: 'material', rotulo: 'Material' },
    { valor: 'configuracao', rotulo: 'Configuração' },
    { valor: 'recebimento', rotulo: 'Recebimento' },
  ],
  acoes: [
    { rotulo: 'Criação', verbos: ['CRIACAO', 'CRIAR'] },
    { rotulo: 'Edição', verbos: ['EDICAO', 'ATUALIZACAO', 'ATUALIZAR'] },
    { rotulo: 'MOVIMENTO_ESTRANHO', verbos: ['MOVIMENTO_ESTRANHO'] },
  ],
  usuarios: [
    { id: 7, nome: 'Admin Foto' },
    { id: 9, nome: 'Maria Souza' },
  ],
};

// ── Fixture C1. Os três campos derivados (`acao_rotulo`, `entidade_rotulo`, `alteracoes`) vêm
// PRONTOS — de propósito eles contradizem qualquer mapa que a tela tentasse manter sozinha.
// - 101: created_at '2026-08-29 01:30:00' UTC = 28/08 22:30 em Brasília (o dia errado é 29).
// - 102: os DOIS lados do segredo valem '(alterado)' (Etapa 19) — a chave tem de APARECER.
// - 103: `alteracoes: []` (há call sites que não gravam nenhum dos dois lados) e verbo sem
//   rótulo (`acao_rotulo` === `acao`).
const LISTA = {
  total: 3,
  limite: 200,
  offset: 0,
  truncado: false,
  itens: [
    {
      id: 101,
      entidade: 'material', entidade_id: 3, entidade_rotulo: 'Material',
      acao: 'CRIAR', acao_rotulo: 'Criação',
      usuario_id: 7, usuario_nome: 'Admin Foto',
      dados_anteriores: null, dados_novos: '{"codigo":"ALM-0003","nome":"Parafuso M8"}',
      justificativa: null,
      created_at: '2026-08-29 01:30:00',
      alteracoes: [
        { campo: 'codigo', de: null, para: 'ALM-0003' },
        { campo: 'nome', de: null, para: 'Parafuso M8' },
      ],
    },
    {
      id: 102,
      entidade: 'configuracao', entidade_id: 1, entidade_rotulo: 'Configuração',
      acao: 'ATUALIZACAO', acao_rotulo: 'Edição',
      usuario_id: 9, usuario_nome: 'Maria Souza',
      dados_anteriores: '{"smtp_senha":"(alterado)","alertas_dias":30}',
      dados_novos: '{"smtp_senha":"(alterado)","alertas_dias":45}',
      justificativa: 'ajuste do SMTP',
      created_at: '2026-08-28 12:00:00',
      alteracoes: [
        { campo: 'smtp_senha', de: '(alterado)', para: '(alterado)' },
        { campo: 'alertas_dias', de: 30, para: 45 },
      ],
    },
    {
      id: 103,
      entidade: 'recebimento', entidade_id: 11, entidade_rotulo: 'Recebimento',
      acao: 'MOVIMENTO_ESTRANHO', acao_rotulo: 'MOVIMENTO_ESTRANHO',
      usuario_id: 7, usuario_nome: 'Admin Foto',
      dados_anteriores: null, dados_novos: null,
      justificativa: null,
      created_at: '2026-08-27 09:00:00',
      alteracoes: [],
    },
  ],
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  api.get.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/auditoria/opcoes')) {
      return Promise.resolve({ data: OPCOES });
    }
    return Promise.resolve({ data: LISTA });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/auditoria']}><AuditoriaAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
}
const texto = () => container.textContent;
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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
const porTestId = (id) => container.querySelector(`[data-testid="${id}"]`);
const linha = (id) => porTestId(`auditoria-linha-${id}`);
/** Última chamada de LISTAGEM (a de /opcoes é outra rota e não pode ser confundida com ela). */
const ultimaBusca = () => [...api.get.mock.calls].reverse()
  .find(([url]) => url === '/almoxarifado/auditoria');
async function expandir(id) {
  const botao = [...linha(id).querySelectorAll('button')].find((b) => /Detalhes|Alterações/i.test(b.textContent));
  expect(botao).not.toBeUndefined();
  await clicar(botao);
}

test('a tela EXIBE o rotulo pronto do servidor — nao mantem mapa de traducao propria', async () => {
  await renderizar();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/auditoria/opcoes');
  expect(ultimaBusca()).not.toBeUndefined();

  // acao_rotulo / entidade_rotulo vêm do C1. Se a tela traduzisse sozinha, o verbo sem rótulo
  // (103) apareceria como '—' ou sumiria — e é justamente o que não pode acontecer.
  expect(linha(101).textContent).toContain('Criação');
  expect(linha(101).textContent).toContain('Material');
  expect(linha(102).textContent).toContain('Edição');
  expect(linha(102).textContent).toContain('Configuração');
  expect(linha(103).textContent).toContain('MOVIMENTO_ESTRANHO');
  expect(linha(102).textContent).toContain('Maria Souza');
  expect(linha(102).textContent).toContain('ajuste do SMTP');
});

test('RN-06: o verbo CRU aparece como legenda secundaria — a tela nao esconde o vocabulario inconsistente', async () => {
  await renderizar();

  // O grupo "Criação" junta CRIACAO+CRIAR; a linha 101 foi gravada com CRIAR e isso continua
  // visível, senão a tela apagaria a inconsistência em vez de expô-la.
  expect(linha(101).textContent).toContain('CRIAR');
  expect(linha(102).textContent).toContain('ATUALIZACAO');
});

test('filtro de periodo e de acao disparam nova busca com os params certos — `acao` STRING com virgulas, nunca array', async () => {
  await renderizar();
  const chamadasIniciais = api.get.mock.calls.length;

  preencher(porTestId('filtro-data-inicio'), '2026-08-01');
  await esperarEfeitos();
  preencher(porTestId('filtro-data-fim'), '2026-08-28');
  await esperarEfeitos();
  preencher(porTestId('filtro-acao'), 'Criação');
  await esperarEfeitos();
  preencher(porTestId('filtro-usuario'), '9');
  await esperarEfeitos();
  preencher(porTestId('filtro-entidade'), 'material');
  await esperarEfeitos();

  expect(api.get.mock.calls.length).toBeGreaterThan(chamadasIniciais);

  const [, config] = ultimaBusca();
  expect(config && config.params).toBeTruthy();
  expect(config.params.data_inicio).toBe('2026-08-01');
  expect(config.params.data_fim).toBe('2026-08-28');
  expect(config.params.usuario_id).toBe('9');
  expect(config.params.entidade).toBe('material');

  // Achado A5, o coração deste teste: os DOIS verbos do grupo, num parâmetro só, separados por
  // vírgula. Array aqui viraria `acao[]=CRIACAO&acao[]=CRIAR` (api.js não tem paramsSerializer)
  // e o backend responderia 500.
  expect(Array.isArray(config.params.acao)).toBe(false);
  expect(config.params.acao).toBe('CRIACAO,CRIAR');
});

test('limpar filtros volta a buscar sem nenhum deles nos params', async () => {
  await renderizar();
  preencher(porTestId('filtro-data-inicio'), '2026-08-01');
  await esperarEfeitos();
  expect(ultimaBusca()[1].params.data_inicio).toBe('2026-08-01');

  await clicar(porTestId('auditoria-limpar'));

  const { params } = ultimaBusca()[1];
  expect(params.data_inicio).toBeUndefined();
  expect(params.acao).toBeUndefined();
  expect(params.usuario_id).toBeUndefined();
});

test('created_at do SQLite (UTC sem sufixo) mostra o DIA CERTO no fuso local', async () => {
  // Guarda contra o teste vazio: em UTC as duas leituras coincidem e o cenário não provaria nada.
  expect(new Date('2026-01-01T00:00:00Z').getTimezoneOffset()).not.toBe(0);

  await renderizar();

  // '2026-08-29 01:30:00' UTC == 28/08 22:30 em Brasília. Sem o 'Z' o V8 leria como hora local
  // e a linha diria 29/08 01:30 — o dia errado numa tela cuja pergunta é "quem mexeu ontem".
  const t = linha(101).textContent;
  expect(t).toContain('28/08/26');
  expect(t).toContain('22:30');
  expect(t).not.toContain('29/08/26');
  expect(t).not.toContain('01:30');
});

test('expandir a linha mostra o de/para PRONTO do servidor (campo, de, para)', async () => {
  await renderizar();

  expect(texto()).not.toContain('alertas_dias');
  await expandir(102);

  const detalhe = porTestId('auditoria-alteracoes-102');
  expect(detalhe).not.toBeNull();
  expect(detalhe.textContent).toContain('alertas_dias');
  expect(detalhe.textContent).toContain('30');
  expect(detalhe.textContent).toContain('45');
});

test('RN-08: segredo continua mascarado — a tela exibe `(alterado)` dos dois lados e nao desmascara', async () => {
  await renderizar();
  await expandir(102);

  const detalhe = porTestId('auditoria-alteracoes-102');
  // A Etapa 19 grava os dois lados como '(alterado)'. A entrada NÃO pode sumir (seria esconder
  // que a senha foi trocada) nem virar valor cru.
  expect(detalhe.textContent).toContain('smtp_senha');
  expect((detalhe.textContent.match(/\(alterado\)/g) || []).length).toBeGreaterThanOrEqual(2);
  expect(detalhe.textContent).not.toMatch(/senha.{0,40}(123|senha_real|s3cr3t)/i);
});

test('valor ausente de um lado aparece como travessao, nao como "null" cru', async () => {
  await renderizar();
  await expandir(101);

  const detalhe = porTestId('auditoria-alteracoes-101');
  expect(detalhe.textContent).toContain('codigo');
  expect(detalhe.textContent).toContain('ALM-0003');
  expect(detalhe.textContent).not.toContain('null');
});

test('alteracoes: [] mostra "sem detalhes registrados" — nunca uma area em branco', async () => {
  await renderizar();
  await expandir(103);

  const detalhe = porTestId('auditoria-alteracoes-103');
  expect(detalhe).not.toBeNull();
  expect(detalhe.textContent).toMatch(/sem detalhes registrados/i);
});

test('truncado: true mostra o aviso de corte com o total', async () => {
  api.get.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/auditoria/opcoes')) return Promise.resolve({ data: OPCOES });
    return Promise.resolve({ data: { ...LISTA, total: 4820, limite: 200, truncado: true } });
  });
  await renderizar();

  const aviso = porTestId('auditoria-truncado');
  expect(aviso).not.toBeNull();
  expect(aviso.textContent).toContain('4820');
  expect(aviso.textContent).toContain('200');
});

test('truncado: false nao mostra aviso de corte', async () => {
  await renderizar();
  // A metade positiva do par: as linhas TÊM de estar na tela, senão este cenário passaria
  // vazio (uma tela que não renderiza nada também não mostra aviso de corte).
  expect(linha(101)).not.toBeNull();
  expect(porTestId('auditoria-truncado')).toBeNull();
});

test('lista vazia diz "nenhum registro PARA OS FILTROS APLICADOS" — nunca "nao ha registros"', async () => {
  api.get.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/auditoria/opcoes')) return Promise.resolve({ data: OPCOES });
    return Promise.resolve({ data: { total: 0, limite: 200, offset: 0, truncado: false, itens: [] } });
  });
  await renderizar();

  const vazio = porTestId('auditoria-vazio');
  expect(vazio).not.toBeNull();
  expect(vazio.textContent).toMatch(/nenhum registro para os filtros aplicados/i);
  // A frase proibida: numa auditoria, "não há registros" soa como PROVA de que nada aconteceu.
  expect(texto()).not.toMatch(/n[ãa]o h[áa] registros/i);
});

test('400 de data invalida vira painel de erro com a mensagem do servidor — nunca o estado vazio', async () => {
  const mensagem = 'Data inválida: use uma data real no formato AAAA-MM-DD';
  api.get.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/auditoria/opcoes')) return Promise.resolve({ data: OPCOES });
    return Promise.reject({ response: { status: 400, data: { error: mensagem } } });
  });
  await renderizar();

  expect(texto()).toContain(mensagem);
  expect(porTestId('auditoria-vazio')).toBeNull();
  expect(texto()).not.toMatch(/nenhum registro/i);
});

test('403 de perfil renderiza painel de sem-permissao — NUNCA "nenhum registro"', async () => {
  const mensagem = 'Sem permissão para esta operação — seu perfil é Produção.';
  api.get.mockImplementation((url) => {
    if (typeof url === 'string' && url.includes('/auditoria/opcoes')) return Promise.resolve({ data: OPCOES });
    return Promise.reject({ response: { status: 403, data: { error: mensagem } } });
  });
  await renderizar();

  expect(texto()).toContain('Dados indisponíveis no momento');
  expect(texto()).toContain(mensagem);
  expect(texto()).not.toMatch(/nenhum registro/i);
  expect(container.querySelector('[data-testid^="auditoria-linha-"]')).toBeNull();
});

test('gate visual: sem `configurar` o painel de sem-permissao aparece sem nem chamar a rota', async () => {
  mockPode = (acao) => acao !== 'configurar';
  await renderizar();

  expect(api.get).not.toHaveBeenCalled();
  expect(texto()).toMatch(/Sem permissão/);
  expect(texto()).not.toMatch(/nenhum registro/i);
});
