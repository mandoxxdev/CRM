/**
 * Etapa 12, Task 4 — tela "/almoxarifado/notificacoes" contra o contrato congelado do design
 * (docs/superpowers/specs/2026-08-24-almoxarifado-etapa12-notificacoes-design.md).
 *
 * O motor da fila (enfileirar/dedupe/backoff/RN-01..RN-09) tem teste de rota no servidor
 * (notificacaoFila.api.test.js e afins) — não duplicado aqui. O alvo desta suíte é o que só a
 * tela pode errar: badges por status, `destinatarios`/`payload` chegando como STRING JSON
 * (parseList com try/catch), filtros refazendo a chamada com a query certa, reenviar/processar
 * chamando o endpoint certo e recarregando, e — a lição do Critical da Etapa 11 (achado 1,
 * medido pelos dois revisores) — um 403 de perfil NUNCA pode virar a lista vazia "nenhuma
 * notificação".
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=NotificacoesAlmoxarifado
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import NotificacoesAlmoxarifado from './NotificacoesAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
// Permissoes: por padrao tudo liberado. mockPode troca em runtime (mesmo padrao de
// ReposicaoAlmoxarifado.test.js) — o gate REAL continua no servidor.
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao, ev) => {
      if (mockPode(acao)) return true;
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    },
    loading: false,
  }),
}));

// 3 linhas com evento/status/tentativas DISTINTOS (pega troca de coluna) — id 5 PENDENTE,
// id 6 FALHA (ultimo_erro longo para o truncamento), id 7 ENVIADO (reenvio com confirm —
// decisão M5 da revisão: RN-08 prevalece). destinatarios/payload chegam como STRING JSON.
// As datas do id 7 cruzam a MEIA-NOITE UTC de propósito (revisão I1): em qualquer fuso a
// oeste de UTC, ler '2026-08-18 01:00:00' como hora local em vez de UTC muda o DIA exibido.
const ITENS_FIXTURE = [
  {
    id: 5, evento: 'MOVIMENTACAO', destinatarios: '["compras@gmp.com","almox@gmp.com"]',
    assunto: '[Almoxarifado] ENTRADA — MAT-01', status: 'PENDENTE', tentativas: 0,
    ultimo_erro: null, enviado_em: null, created_at: '2026-08-20 10:00:00',
    payload: '{"movimentacao_id":5}',
  },
  {
    id: 6, evento: 'LOTE_VENCENDO', destinatarios: '[]',
    assunto: '[Almoxarifado] Lote vencendo — MAT-02', status: 'FALHA', tentativas: 5,
    ultimo_erro: 'SMTP não configurado — host de e-mail ausente na configuração do módulo, tentativa esgotada',
    enviado_em: null, created_at: '2026-08-19 08:00:00', payload: '{}',
  },
  {
    id: 7, evento: 'SOLICITACAO_COMPRA', destinatarios: '["compras@gmp.com"]',
    assunto: '[Almoxarifado] Solicitação de compra gerada', status: 'ENVIADO', tentativas: 1,
    ultimo_erro: null, enviado_em: '2026-08-18 01:30:00', created_at: '2026-08-18 01:00:00',
    payload: '{}',
  },
];

// Resumo é do CONJUNTO INTEIRO (RN-08) — números DELIBERADAMENTE diferentes das 3 linhas acima
// (que têm 1 PENDENTE, 1 FALHA, 1 ENVIADO), para pegar card com valor hardcoded/copiado da
// contagem local em vez do payload do servidor.
const RESUMO_FIXTURE = { pendentes: 11, enviadas: 22, falhas: 33 };

let container; let root;

const mockarApi = (overrides = {}) => {
  api.get.mockImplementation(() => Promise.resolve({
    data: { itens: overrides.itens ?? ITENS_FIXTURE, resumo: overrides.resumo ?? RESUMO_FIXTURE },
  }));
};

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  mockarApi();
  api.post.mockResolvedValue({ data: { success: true, status: 'PENDENTE' } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/almoxarifado/notificacoes']}><NotificacoesAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')]
    .find((b) => b.textContent.trim().includes(t) || (b.title && b.title.includes(t)));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
function preencherSelect(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const linhaNotificacao = (assuntoParcial) => [...container.querySelectorAll('.almox-table tbody tr')]
  .find((tr) => tr.textContent.includes(assuntoParcial));

describe('NotificacoesAlmoxarifado — lista e badges', () => {
  test('lista renderiza evento, assunto, destinatarios (parseados), status e tentativas por celula', async () => {
    await renderizar();

    const linha = linhaNotificacao('ENTRADA — MAT-01');
    expect(linha).toBeTruthy();
    const tds = linha.querySelectorAll('td');
    // colunas: 0 evento, 1 assunto, 2 destinatarios, 3 status, 4 tentativas, 5 ultimo_erro,
    // 6 criada em, 7 enviada em, 8 acoes.
    expect(tds[0].textContent).toBe('MOVIMENTACAO');
    expect(tds[1].textContent).toBe('[Almoxarifado] ENTRADA — MAT-01');
    // destinatarios chega como STRING JSON — a tela faz JSON.parse e junta por vírgula.
    expect(tds[2].textContent).toBe('compras@gmp.com, almox@gmp.com');
    expect(tds[4].textContent).toBe('0');

    const badgePendente = linha.querySelector('.almox-badge');
    expect(badgePendente.textContent).toBe('PENDENTE');
    expect(badgePendente.className).toContain('almox-badge-baixo');
  });

  test('badge de FALHA e ENVIADO usam classes distintas da de PENDENTE', async () => {
    await renderizar();

    const linhaFalha = linhaNotificacao('Lote vencendo');
    const badgeFalha = linhaFalha.querySelector('.almox-badge');
    expect(badgeFalha.textContent).toBe('FALHA');
    expect(badgeFalha.className).toContain('almox-badge-critico');

    const linhaEnviado = linhaNotificacao('Solicitação de compra');
    const badgeEnviado = linhaEnviado.querySelector('.almox-badge');
    expect(badgeEnviado.textContent).toBe('ENVIADO');
    expect(badgeEnviado.className).toContain('almox-badge-ok');
  });

  test('destinatarios "[]" (fila vazia) mostra traço, nunca o texto literal "[]"', async () => {
    await renderizar();
    const linha = linhaNotificacao('Lote vencendo');
    const tds = linha.querySelectorAll('td');
    expect(tds[2].textContent).toBe('—');
    expect(tds[2].textContent).not.toContain('[]');
  });

  test('ultimo_erro truncado tem o texto completo no title do elemento', async () => {
    await renderizar();
    const linha = linhaNotificacao('Lote vencendo');
    const tds = linha.querySelectorAll('td');
    const celulaErro = tds[5];
    expect(celulaErro.getAttribute('title')).toBe(
      'SMTP não configurado — host de e-mail ausente na configuração do módulo, tentativa esgotada',
    );
  });

  test('Reenviar aparece em TODAS as linhas; ENVIADO exige confirm (decisao M5 — RN-08 prevalece)', async () => {
    // RN-08 (emenda da Task 1): reenviar ENVIADO e o UNICO caminho de reemissao de e-mail
    // perdido apos o aceite do SMTP. A secao "Front — tela" do design dizia "so em
    // FALHA/PENDENTE" e ESTAVA ERRADA (conflito interno). Protecao: confirm no ENVIADO.
    api.post.mockResolvedValue({ data: { success: true, status: 'PENDENTE' } });
    await renderizar();

    expect(botao('Reenviar', linhaNotificacao('ENTRADA — MAT-01'))).toBeTruthy();
    expect(botao('Reenviar', linhaNotificacao('Lote vencendo'))).toBeTruthy();
    const btnEnviada = botao('Reenviar', linhaNotificacao('Solicitação de compra'));
    expect(btnEnviada).toBeTruthy();

    // Confirm recusado -> NENHUM POST (o clique acidental nao reemite e-mail).
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await clicar(btnEnviada);
    expect(api.post).not.toHaveBeenCalled();

    // Confirm aceito -> POST do id certo.
    confirmSpy.mockReturnValue(true);
    await clicar(botao('Reenviar', linhaNotificacao('Solicitação de compra')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/notificacoes/7/reenviar');

    // PENDENTE reenvia SEM confirm.
    confirmSpy.mockClear();
    await clicar(botao('Reenviar', linhaNotificacao('ENTRADA — MAT-01')));
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/notificacoes/5/reenviar');
    confirmSpy.mockRestore();
  });

  test('datas Criada em/Enviada em por celula, UTC-safe e sem troca de coluna (revisao I1)', async () => {
    await renderizar();
    const linha = linhaNotificacao('Solicitação de compra');
    const tds = linha.querySelectorAll('td');

    // Esperado ancorado em UTC (o 'Z' que formatDataHora acrescenta). Se a mutacao tirar o
    // 'Z', o V8 le como hora local: em qualquer fuso != UTC o texto diverge (aqui as horas
    // cruzam a meia-noite UTC, entao ate o DIA muda a oeste de UTC).
    const fmt = { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' };
    const esperadoCriada = new Date('2026-08-18T01:00:00Z').toLocaleString('pt-BR', fmt);
    const esperadoEnviada = new Date('2026-08-18T01:30:00Z').toLocaleString('pt-BR', fmt);
    expect(tds[6].textContent).toBe(esperadoCriada);
    expect(tds[7].textContent).toBe(esperadoEnviada);
    // Pega troca de coluna (created_at <-> enviado_em): os dois valores sao distintos.
    expect(tds[6].textContent).not.toBe(tds[7].textContent);
    // Guarda anti-hora-local: so e vacua se o runner estiver em UTC (na maquina do projeto,
    // America/Sao_Paulo, ela morde).
    const errado = new Date('2026-08-18T01:00:00').toLocaleString('pt-BR', fmt);
    if (errado !== esperadoCriada) expect(tds[6].textContent).not.toBe(errado);
  });

  test('celulas nulas mostram travessao: ultimo_erro e enviado_em da linha PENDENTE (revisao M2)', async () => {
    await renderizar();
    const tds = linhaNotificacao('ENTRADA — MAT-01').querySelectorAll('td');
    expect(tds[5].textContent).toBe('—');
    expect(tds[7].textContent).toBe('—');
  });

  test('destinatarios legado em virgula (nao-JSON) renderiza, nunca tela branca (revisao M1)', async () => {
    // O try/catch do parseListaExibicao e a unica defesa: o design chegou a dizer "lista por
    // virgula" (corrigido na revisao da Task 1) — linha de build antigo ou UPDATE manual de
    // suporte cai aqui. Sem o catch, JSON.parse derruba o render inteiro (sem error boundary).
    mockarApi({
      itens: [{ ...ITENS_FIXTURE[0], id: 9, assunto: '[Almoxarifado] LEGADO — MAT-09', destinatarios: 'a@b.com, c@d.com' }],
    });
    await renderizar();
    const linha = linhaNotificacao('LEGADO — MAT-09');
    expect(linha).toBeTruthy();
    expect(linha.querySelectorAll('td')[2].textContent).toBe('a@b.com, c@d.com');
  });
});

describe('NotificacoesAlmoxarifado — resumo (conjunto inteiro)', () => {
  test('cards de resumo mostram os numeros do payload, nao uma contagem local dos itens exibidos', async () => {
    await renderizar();

    expect(container.querySelector('[data-testid="kpi-pendentes"]').textContent).toBe('11');
    expect(container.querySelector('[data-testid="kpi-enviadas"]').textContent).toBe('22');
    expect(container.querySelector('[data-testid="kpi-falhas"]').textContent).toBe('33');
  });
});

describe('NotificacoesAlmoxarifado — filtros refazem a chamada', () => {
  test('filtro de status manda ?status= certo', async () => {
    await renderizar();
    api.get.mockClear();

    const selectStatus = container.querySelector('#notif-filtro-status');
    preencherSelect(selectStatus, 'FALHA');
    await esperarEfeitos();

    expect(api.get).toHaveBeenCalledWith('/almoxarifado/notificacoes', { params: { status: 'FALHA' } });
  });

  test('filtro de evento manda ?evento= certo', async () => {
    await renderizar();
    api.get.mockClear();

    const selectEvento = container.querySelector('#notif-filtro-evento');
    preencherSelect(selectEvento, 'LOTE_VENCENDO');
    await esperarEfeitos();

    expect(api.get).toHaveBeenCalledWith('/almoxarifado/notificacoes', { params: { evento: 'LOTE_VENCENDO' } });
  });

  test('status vazio (Todos) nao manda o parametro', async () => {
    await renderizar();
    const selectStatus = container.querySelector('#notif-filtro-status');
    preencherSelect(selectStatus, 'FALHA');
    await esperarEfeitos();
    api.get.mockClear();

    preencherSelect(selectStatus, '');
    await esperarEfeitos();

    expect(api.get).toHaveBeenCalledWith('/almoxarifado/notificacoes', { params: {} });
  });
});

describe('NotificacoesAlmoxarifado — reenviar', () => {
  test('reenviar chama o POST certo (por id) e recarrega a lista', async () => {
    await renderizar();
    const linha = linhaNotificacao('ENTRADA — MAT-01');
    api.get.mockClear();

    await clicar(botao('Reenviar', linha));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/notificacoes/5/reenviar');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/notificacoes', { params: {} });
    expect(toast.success).toHaveBeenCalled();
  });

  test('reenviar de item FALHA usa o id da linha certa, nao o de outra', async () => {
    await renderizar();
    const linhaFalha = linhaNotificacao('Lote vencendo');

    await clicar(botao('Reenviar', linhaFalha));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/notificacoes/6/reenviar');
  });

  test('404 do reenvio mostra o literal do servidor', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 404, data: { error: 'Notificação não encontrada' } } });
    await renderizar();
    const linha = linhaNotificacao('ENTRADA — MAT-01');

    await clicar(botao('Reenviar', linha));

    expect(toast.error).toHaveBeenCalledWith('Notificação não encontrada');
  });

  test('reenviar e gateado por gerenciar_notificacoes', async () => {
    mockPode = () => false;
    await renderizar();
    const linha = linhaNotificacao('ENTRADA — MAT-01');

    await clicar(botao('Reenviar', linha));

    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('NotificacoesAlmoxarifado — processar fila', () => {
  test('processar chama o POST certo e recarrega a lista', async () => {
    api.post.mockResolvedValueOnce({ data: { processadas: 3, enviadas: 1, falharam: 2 } });
    await renderizar();
    api.get.mockClear();

    await clicar(botao('Processar fila agora'));

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/notificacoes/processar');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/notificacoes', { params: {} });
    expect(toast.success).toHaveBeenCalledWith('3 processada(s): 1 enviada(s), 2 falha(s)');
  });

  test('processar desabilita o botao enquanto a chamada esta em voo (revisao M4 — duplo clique)', async () => {
    // O servidor tem claim (Task 1), mas a UI nao deve nem emitir o segundo POST.
    let resolver;
    api.post.mockImplementationOnce(() => new Promise((res) => { resolver = res; }));
    await renderizar();

    const btn = botao('Processar fila agora');
    await act(async () => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const btnEmVoo = botao('Processando...');
    expect(btnEmVoo).toBeTruthy();
    expect(btnEmVoo.disabled).toBe(true);
    expect(api.post).toHaveBeenCalledTimes(1);

    await act(async () => { resolver({ data: { processadas: 0, enviadas: 0, falharam: 0 } }); });
    expect(botao('Processar fila agora').disabled).toBe(false);
  });

  test('erro no processar mostra toast de erro, nao silencio (revisao M4)', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'Erro interno' } } });
    await renderizar();

    await clicar(botao('Processar fila agora'));

    expect(toast.error).toHaveBeenCalled();
    expect(botao('Processar fila agora').disabled).toBe(false);
  });

  test('processar e gateado por gerenciar_notificacoes', async () => {
    mockPode = () => false;
    await renderizar();

    await clicar(botao('Processar fila agora'));

    expect(api.post).not.toHaveBeenCalled();
  });

  // Sabotagem-alvo: trocar o POST de "Processar fila agora" pelo endpoint de reenviar (ou
  // vice-versa) faz este par de asserts (URL exata de cada botão) cair.
  test('reenviar e processar usam URLs diferentes (nao podem ser trocadas por engano)', async () => {
    api.post.mockClear();
    await renderizar();
    const linha = linhaNotificacao('ENTRADA — MAT-01');

    await clicar(botao('Reenviar', linha));
    const urlReenviar = api.post.mock.calls[0][0];

    api.post.mockClear();
    await clicar(botao('Processar fila agora'));
    const urlProcessar = api.post.mock.calls[0][0];

    expect(urlReenviar).toBe('/almoxarifado/notificacoes/5/reenviar');
    expect(urlProcessar).toBe('/almoxarifado/notificacoes/processar');
    expect(urlReenviar).not.toBe(urlProcessar);
  });
});

describe('NotificacoesAlmoxarifado — 403 legivel do backend (achado 1 da Etapa 11)', () => {
  // Sabotagem-alvo: remover o `erro ? <PainelErroCarga/> : (...)` e deixar só a lista faz este
  // teste cair — o 403 viraria "Nenhuma notificação encontrada", exatamente o sintoma medido.
  test('painel de erro substitui KPIs e tabela — nunca o estado vazio', async () => {
    api.get.mockImplementation(() => Promise.reject({
      response: { status: 403, data: { error: 'Sem permissão para gerenciar notificações' } },
    }));
    await renderizar();

    expect(toast.error).toHaveBeenCalledWith('Sem permissão para gerenciar notificações');
    expect(texto()).toContain('Dados indisponíveis no momento');
    expect(texto()).toContain('Sem permissão para gerenciar notificações');
    // O sintoma do achado 1: NAO pode aparecer o estado vazio nem os cards de resumo.
    expect(texto()).not.toContain('Nenhuma notificação encontrada');
    expect(container.querySelector('[data-testid="kpi-pendentes"]')).toBeNull();

    // "Tentar novamente" refaz a chamada.
    api.get.mockClear();
    mockarApi();
    await clicar(botao('Tentar novamente'));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/notificacoes', { params: {} });
    expect(container.querySelector('[data-testid="kpi-pendentes"]')).toBeTruthy();
  });
});

describe('NotificacoesAlmoxarifado — erro de rede nao e lista vazia', () => {
  test('falha sem response (rede fora do ar) mostra o painel de erro com mensagem generica', async () => {
    api.get.mockImplementation(() => Promise.reject(new Error('Network Error')));
    await renderizar();

    expect(texto()).toContain('Dados indisponíveis no momento');
    expect(texto()).toContain('Não foi possível carregar as notificações');
    expect(texto()).not.toContain('Nenhuma notificação encontrada');
    expect(container.querySelector('[data-testid="kpi-pendentes"]')).toBeNull();
  });
});

describe('NotificacoesAlmoxarifado — estado vazio de verdade', () => {
  test('itens vazios (sem erro) mostra o estado vazio, nao explode em undefined/NaN', async () => {
    mockarApi({ itens: [], resumo: { pendentes: 0, enviadas: 0, falhas: 0 } });
    await renderizar();

    expect(texto()).toContain('Nenhuma notificação encontrada');
    expect(texto()).not.toMatch(/undefined|NaN/);
  });
});
