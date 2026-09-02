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
    // ── Etapa 17 (Task 3): as 4 chaves novas, com os campos que o `listar` do servidor
    // REALMENTE devolve (server/services/almoxarifado/alertRegistry.js, entradas
    // MATERIAL_REPROVADO / DIVERGENCIA_RECEBIMENTO / DIVERGENCIA_INVENTARIO /
    // LOTE_SEM_CERTIFICADO) — não os que o plano descreve de memória. Sem entrada em
    // COLUNAS_POR_CHAVE elas caem no fallback genérico e a central mostra `inspecao_id`,
    // `item_id` e `conferencia_id` crus no lugar da história.
    {
      chave: 'MATERIAL_REPROVADO', titulo: 'Material reprovado',
      descricao: 'Inspeções de recebimento com quantidade reprovada na janela configurada.',
      dias: 7, total: 1,
      linhas: [
        {
          inspecao_id: 5, material_codigo: 'ALM-0021', material_nome: 'Parafuso M8',
          quantidade_reprovada: 3, encaminhamento: 'DEVOLUCAO',
          recebimento_numero: 'REC-2026-011', nota_fiscal: '12345',
          data_inspecao: '2026-08-27 14:30:00', responsavel_nome: 'Carlos Lima',
        },
      ],
    },
    {
      chave: 'DIVERGENCIA_RECEBIMENTO', titulo: 'Divergência de recebimento',
      descricao: 'Itens recebidos com quantidade diferente da esperada na janela configurada.',
      dias: 7, total: 1,
      // nota_fiscal null de propósito: o recebimento aparece sem o sufixo "(NF ...)".
      linhas: [
        {
          item_id: 88, recebimento_id: 11, material_codigo: 'ALM-0033',
          material_nome: 'Chapa Aço 3mm', quantidade_esperada: 10, quantidade_recebida: 8,
          divergencia: -2, recebimento_numero: 'REC-2026-012', nota_fiscal: null,
        },
      ],
    },
    {
      chave: 'DIVERGENCIA_INVENTARIO', titulo: 'Divergência de inventário',
      descricao: 'Conferências concluídas com itens divergentes na janela configurada.',
      dias: 7, total: 1,
      // Linha AGREGADA (RN-05) e SEM impacto_financeiro — o servidor não seleciona o valor
      // (B30) e a central não pode inventar coluna que o e-mail não tem.
      linhas: [
        { conferencia_id: 4, numero: 'CONF-2026-004', data_fim: '2026-08-26 09:15:00', itens_divergentes: 2 },
      ],
    },
    {
      chave: 'LOTE_SEM_CERTIFICADO', titulo: 'Lote sem certificado',
      descricao: 'Lotes com saldo de material que exige certificado e sem arquivo anexado.',
      dias: null, total: 1,
      // Linha AGREGADA { total, lotes } — o servidor passou a resumir (revisão adversarial:
      // 1 e-mail por lote dava 1000 e-mails/mês). status BLOQUEADO é o caso PRINCIPAL (o lote
      // sem certificado nasce bloqueado) e aparece no resumo para o almoxarife entender por
      // que o lote está travado.
      linhas: [
        {
          total: 2,
          lotes: [
            {
              id: 70, codigo: 'LOTE-70', status: 'BLOQUEADO', material_id: 3,
              material_codigo: 'ALM-0044', material_nome: 'Barra Inox', material_unidade: 'KG',
              saldo: 25,
            },
            {
              id: 71, codigo: 'LOTE-71', status: 'ATIVO', material_id: 3,
              material_codigo: 'ALM-0044', material_nome: 'Barra Inox', material_unidade: 'KG',
              saldo: 4,
            },
          ],
        },
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
    'alerta-card-MATERIAL_REPROVADO',
    'alerta-card-DIVERGENCIA_RECEBIMENTO',
    'alerta-card-DIVERGENCIA_INVENTARIO',
    'alerta-card-LOTE_SEM_CERTIFICADO',
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

/**
 * Etapa 17, Task 3 — colunas amigáveis das 4 chaves novas (contrato C2). Sem entrada em
 * COLUNAS_POR_CHAVE o cartão NÃO some (o fallback genérico existe de propósito), mas mostra
 * `inspecao_id`/`item_id`/`conferencia_id` crus e corta em 6 campos na ordem do SELECT — a
 * central contaria uma história diferente da do e-mail que o MESMO alerta manda. Estes testes
 * amarram cada chave aos campos que o `listar` do servidor realmente devolve, e o assert
 * negativo (`não` mostrar o nome cru da coluna) é o que denuncia a volta ao genérico.
 */
const cabecalhos = (chave) => [...card(chave).querySelectorAll('th')].map((th) => th.textContent);
async function expandir(chave) {
  const botao = [...card(chave).querySelectorAll('button')]
    .find((b) => /Detalhes|Ver linhas/i.test(b.textContent));
  expect(botao).not.toBeUndefined();
  await clicar(botao);
}

test('MATERIAL_REPROVADO: colunas da inspecao reprovada, nao os campos crus', async () => {
  await renderizar();
  await expandir('MATERIAL_REPROVADO');

  expect(cabecalhos('MATERIAL_REPROVADO')).toEqual([
    'Material', 'Qtd. reprovada', 'Encaminhamento', 'Recebimento', 'Inspeção em', 'Responsável',
  ]);
  const t = card('MATERIAL_REPROVADO').textContent;
  expect(t).toContain('ALM-0021 — Parafuso M8');
  expect(t).toContain('3');
  expect(t).toContain('DEVOLUCAO');
  expect(t).toContain('REC-2026-011 (NF 12345)');
  expect(t).toContain('Carlos Lima');
  // data_inspecao é DATETIME UTC do SQLite ("YYYY-MM-DD HH:MM:SS") — formatData põe o 'Z'.
  expect(t).toContain('27/08/26');
  // Fallback genérico mostraria a chave crua da primeira coluna do SELECT.
  expect(t).not.toMatch(/inspecao id/i);
});

test('DIVERGENCIA_RECEBIMENTO: esperada, recebida e a divergencia calculada pelo servidor', async () => {
  await renderizar();
  await expandir('DIVERGENCIA_RECEBIMENTO');

  expect(cabecalhos('DIVERGENCIA_RECEBIMENTO')).toEqual([
    'Material', 'Qtd. esperada', 'Qtd. recebida', 'Divergência', 'Recebimento',
  ]);
  const t = card('DIVERGENCIA_RECEBIMENTO').textContent;
  expect(t).toContain('ALM-0033 — Chapa Aço 3mm');
  expect(t).toContain('-2');
  expect(t).toContain('REC-2026-012');
  // nota_fiscal null: nada de "(NF null)" na tela.
  expect(t).not.toMatch(/NF null/);
  expect(t).not.toMatch(/item id/i);
});

test('DIVERGENCIA_INVENTARIO: linha agregada por conferencia, sem impacto financeiro', async () => {
  await renderizar();
  await expandir('DIVERGENCIA_INVENTARIO');

  expect(cabecalhos('DIVERGENCIA_INVENTARIO')).toEqual([
    'Conferência', 'Concluída em', 'Itens divergentes',
  ]);
  const t = card('DIVERGENCIA_INVENTARIO').textContent;
  expect(t).toContain('CONF-2026-004');
  expect(t).toContain('26/08/26');
  expect(t).toContain('2');
  // B30: o valor do inventário é gateado por `inventario` no relatório — a central não o expõe
  // (e o servidor nem o seleciona).
  expect(t).not.toMatch(/impacto/i);
  expect(t).not.toMatch(/conferencia id/i);
});

test('LOTE_SEM_CERTIFICADO: resumo agregado com o total e os lotes, com o status BLOQUEADO', async () => {
  await renderizar();
  await expandir('LOTE_SEM_CERTIFICADO');

  expect(cabecalhos('LOTE_SEM_CERTIFICADO')).toEqual([
    'Lotes sem certificado', 'Primeiros lotes',
  ]);
  const t = card('LOTE_SEM_CERTIFICADO').textContent;
  expect(t).toContain('LOTE-70');
  expect(t).toContain('LOTE-71');
  expect(t).toContain('ALM-0044');
  expect(t).toContain('25');
  // O lote sem certificado NASCE bloqueado — esconder o status faria o alerta parecer sobre
  // um lote disponível.
  expect(t).toContain('BLOQUEADO');
  expect(t).not.toMatch(/material id/i);
});

test('gate visual: sem ver_alertas o painel de sem-permissao aparece sem nem chamar o GET', async () => {
  mockPode = (acao) => acao !== 'ver_alertas';
  await renderizar();

  expect(api.get).not.toHaveBeenCalled();
  expect(texto()).toMatch(/Sem permissão/);
  expect(texto()).not.toMatch(/[Nn]enhum alerta/);
});
