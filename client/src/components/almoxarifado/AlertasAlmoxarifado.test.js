/**
 * Etapa 16, Task 3 — tela "/almoxarifado/alertas" contra o contrato congelado C1 do plano
 * (docs/superpowers/plans/2026-08-28-almoxarifado-etapa16-alertas.md; design
 * docs/superpowers/specs/2026-08-28-almoxarifado-etapa16-alertas-design.md, "Central no front").
 *
 * O registro, a varredura e o GET da central têm teste de rota no servidor
 * (alertaRegistro.api.test.js / alertaCentral.api.test.js) — não duplicado aqui. O alvo desta
 * suíte é o que só a tela pode errar: um cartão por alerta NA ORDEM do array (a ordem é a do
 * ALERT_REGISTRY, o front não reordena), badge com o `total` do servidor (nunca
 * `linhas.length` — o C1 corta linhas em 50 com total cheio), janela de dias só quando
 * não-null, expandir mostrando as linhas cruas, entrada `erro:true` virando aviso visível
 * (nunca sumindo do painel — decisão "central parcial honesta" do C1), e — a lição do
 * Critical da Etapa 11, herdada por Notificações — um 403 de perfil NUNCA vira "nenhum
 * alerta".
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=AlertasAlmoxarifado
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import AlertasAlmoxarifado from './AlertasAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() }),
}));
// Permissoes: por padrao tudo liberado. mockPode troca em runtime (mesmo padrao de
// ReposicaoAlmoxarifado.test.js / NotificacoesAlmoxarifado.test.js) — o gate REAL continua no
// servidor (requirePermission('ver_alertas')).
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

// Fixture no shape C1 — ordem DELIBERADAMENTE verificável (a tela não pode reordenar) e
// `total` de REQUISICAO_ATRASADA (60) DIFERENTE de linhas.length (2): o C1 corta `linhas` em
// 50 mantendo o total cheio, então badge lendo linhas.length seria bug real. QUARENTENA_PARADA
// vem como a entrada de erro do C1 ({ chave, titulo, erro:true, total:0, linhas:[] }) — tem de
// aparecer com aviso, não sumir. Linha é o objeto CRU da condição (campos variam por chave).
const CENTRAL_FIXTURE = {
  alertas: [
    {
      chave: 'CALIBRACAO_VENCENDO', titulo: 'Calibração vencendo',
      descricao: 'Ferramentas com calibração vencida ou vencendo na janela configurada.',
      dias: 30, total: 2,
      linhas: [
        { id: 9, nome: 'Paquímetro Digital', codigo_patrimonio: 'PAT-009', data_validade: '2026-08-10', dias_restantes: -18 },
        { id: 12, nome: 'Torquímetro', codigo_patrimonio: 'PAT-012', data_validade: null, dias_restantes: null },
      ],
    },
    {
      chave: 'ESTOQUE_EXCESSIVO', titulo: 'Estoque excessivo',
      descricao: 'Materiais com saldo acima da quantidade máxima cadastrada.',
      dias: null, total: 0, linhas: [],
    },
    {
      chave: 'QUARENTENA_PARADA', titulo: 'Quarentena parada',
      erro: true, total: 0, linhas: [],
    },
    {
      chave: 'REQUISICAO_ATRASADA', titulo: 'Requisição atrasada',
      descricao: 'Requisições com data de necessidade vencida e ainda não entregues.',
      dias: null, total: 60,
      linhas: [
        { id: 41, numero: 'REQ-2026-041', solicitante_nome: 'João da Silva', status: 'APROVADO', data_necessidade: '2026-08-01' },
        { id: 42, numero: 'REQ-2026-042', solicitante_nome: 'Maria Souza', status: 'AGUARDANDO_COMPRA', data_necessidade: '2026-08-05' },
      ],
    },
    {
      chave: 'RESERVA_PARADA', titulo: 'Reserva parada',
      descricao: 'Reservas ativas paradas há mais dias que o configurado ou já expiradas.',
      dias: 45, total: 1,
      linhas: [
        { id: 7, material_codigo: 'ALM-0070', material_nome: 'Chapa Inox 2mm', quantidade: 3, material_unidade: 'PC', created_at: '2026-07-01 10:00:00', expira_em: null },
      ],
    },
  ],
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  api.get.mockResolvedValue({ data: CENTRAL_FIXTURE });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/alertas']}><AlertasAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
}
const texto = () => container.textContent;
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
const card = (chave) => container.querySelector(`[data-testid="alerta-card-${chave}"]`);
const badgeTotal = (chave) => container.querySelector(`[data-testid="alerta-total-${chave}"]`);

test('um cartao por alerta, na ordem do array do C1 (a tela nao reordena)', async () => {
  await renderizar();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/alertas/central');
  const cards = [...container.querySelectorAll('[data-testid^="alerta-card-"]')];
  expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual([
    'alerta-card-CALIBRACAO_VENCENDO',
    'alerta-card-ESTOQUE_EXCESSIVO',
    'alerta-card-QUARENTENA_PARADA',
    'alerta-card-REQUISICAO_ATRASADA',
    'alerta-card-RESERVA_PARADA',
  ]);
  expect(texto()).toContain('Calibração vencendo');
  expect(texto()).toContain('Requisição atrasada');
});

test('badge mostra o `total` do servidor, nunca linhas.length (C1 corta linhas em 50)', async () => {
  await renderizar();

  // total 60 com só 2 linhas na fixture — linhas.length aqui seria "2", bug real.
  expect(badgeTotal('REQUISICAO_ATRASADA').textContent).toContain('60');
  expect(badgeTotal('CALIBRACAO_VENCENDO').textContent).toContain('2');
  expect(badgeTotal('ESTOQUE_EXCESSIVO').textContent).toContain('0');
});

test('janela de dias aparece quando nao-null e fica de fora quando null', async () => {
  await renderizar();

  expect(card('CALIBRACAO_VENCENDO').textContent).toMatch(/30 dias/);
  expect(card('RESERVA_PARADA').textContent).toMatch(/45 dias/);
  // dias: null — o cartao nao inventa janela.
  expect(card('REQUISICAO_ATRASADA').textContent).not.toMatch(/\d+ dias/);
  expect(card('ESTOQUE_EXCESSIVO').textContent).not.toMatch(/\d+ dias/);
});

test('expandir o cartao mostra as linhas cruas da condicao', async () => {
  await renderizar();

  // Antes de expandir, o conteudo das linhas nao esta na tela.
  expect(texto()).not.toContain('REQ-2026-041');

  const botao = [...card('REQUISICAO_ATRASADA').querySelectorAll('button')]
    .find((b) => /Detalhes|Ver linhas/i.test(b.textContent));
  expect(botao).not.toBeUndefined();
  await clicar(botao);

  expect(texto()).toContain('REQ-2026-041');
  expect(texto()).toContain('João da Silva');
  expect(texto()).toContain('REQ-2026-042');
});

test('data DATE pura formata em UTC — nunca o dia anterior no fuso do Brasil', async () => {
  // Achado Major da revisao da etapa: '2026-08-10' lido como meia-noite UTC e exibido no
  // fuso local (UTC-3) virava 09/08/26. O formatData deve fixar timeZone:'UTC' para DATE puro.
  await renderizar();
  const botao = [...card('CALIBRACAO_VENCENDO').querySelectorAll('button')]
    .find((b) => /Detalhes|Ver linhas/i.test(b.textContent));
  await clicar(botao);
  expect(texto()).toContain('10/08/26');
  expect(texto()).not.toContain('09/08/26');
});

test('entrada com erro:true mostra aviso no cartao — nao some da central', async () => {
  await renderizar();

  const c = card('QUARENTENA_PARADA');
  expect(c).not.toBeNull();
  expect(c.textContent).toContain('Quarentena parada');
  expect(c.textContent).toMatch(/Não foi possível avaliar/i);
});

test('403 de perfil renderiza painel de sem-permissao — NUNCA "nenhum alerta"', async () => {
  const mensagem = 'Sem permissão para ver a central de alertas — seu perfil é Produção. Solicite acesso a um administrador.';
  api.get.mockRejectedValue({ response: { status: 403, data: { error: mensagem } } });
  await renderizar();

  expect(texto()).toContain('Dados indisponíveis no momento');
  expect(texto()).toContain(mensagem);
  // O Critical da Etapa 11: o 403 nao pode virar o estado vazio operacional.
  expect(texto()).not.toMatch(/[Nn]enhum alerta/);
  expect(container.querySelector('[data-testid^="alerta-card-"]')).toBeNull();
});

test('gate visual: sem ver_alertas o painel de sem-permissao aparece sem nem chamar o GET', async () => {
  mockPode = (acao) => acao !== 'ver_alertas';
  await renderizar();

  expect(api.get).not.toHaveBeenCalled();
  expect(texto()).toMatch(/Sem permissão/);
  expect(texto()).not.toMatch(/[Nn]enhum alerta/);
});
