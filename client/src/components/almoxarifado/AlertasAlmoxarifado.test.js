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
    // Etapa 39: a 12a entrada do registro, e a PRIMEIRA que lê tabela CORE (`pedidos_compra`).
    //
    // ⚠️ CORREÇÃO DE COMENTÁRIO (Etapa 42, T4): este comentário dizia "a linha é `SELECT p.*` +
    // `fornecedor_nome`". Era VERDADE só até a onda F3 da Etapa 39, que trocou o `p.*` por
    // colunas nomeadas exatamente para o `valor_total`/`observacoes`/`fornecedor_id` de pedido
    // CORE pararem de viajar para a central (`alertRegistry.js`, o SELECT da entrada
    // `PEDIDO_COMPRA_ATRASADO`: `p.id, p.numero, p.status, p.previsao_entrega,
    // f.razao_social AS fornecedor_nome`). A afirmação fica À VISTA em vez de apagada em
    // silêncio (regra 5 do CLAUDE.md). A fixture abaixo MANTÉM os campos extras de propósito:
    // ela prova que, se um dia voltarem, a tela não os desenha.
    //
    // Sem entrada em COLUNAS_POR_CHAVE o fallback genérico mostraria `id`, `fornecedor_id` e
    // `valor_total` crus. `fornecedor_nome` null de propósito na 2a linha: pedido órfão de
    // fornecedor TAMBÉM atrasa (LEFT JOIN, R9) e não pode virar "null" na tela.
    {
      chave: 'PEDIDO_COMPRA_ATRASADO', titulo: 'Pedido de compra atrasado',
      descricao: 'Pedidos de compra com previsão de entrega vencida e ainda não recebidos.',
      dias: null, total: 2,
      linhas: [
        {
          id: 31, numero: 'PC-2026-031', fornecedor_id: 4, fornecedor_nome: 'Aços Vale',
          valor_total: 12500, data_pedido: '2026-09-01', previsao_entrega: '2026-09-25',
          status: 'pendente', atrasado: 1, dias_atraso: 3,
        },
        {
          id: 32, numero: 'PC-2026-032', fornecedor_id: null, fornecedor_nome: null,
          valor_total: 800, data_pedido: '2026-09-02', previsao_entrega: '2026-09-20',
          status: 'aprovado', atrasado: 1, dias_atraso: 8,
        },
      ],
    },
    // Etapa 42 (T4): a 13a entrada, NO FIM da fixture porque é a posição em que o servidor a
    // devolve (a ordem do ALERT_REGISTRY, depois de PEDIDO_COMPRA_ATRASADO). A linha é a que
    // `situacaoDosPedidosCompra` projeta (T1): { id, numero, status, previsao_entrega,
    // fornecedor_nome, quantidade_pedida, quantidade_recebida, saldo_pendente,
    // situacao_recebimento }.
    //
    // A 2a linha é o pedido SEM fornecedor (LEFT JOIN, F6 — órfão TEM de vir) e SEM previsão
    // (a população do parcial não filtra previsão, ao contrário da do atrasado): as duas
    // células têm de sair `—`, nunca "null" nem "Invalid Date".
    {
      chave: 'PEDIDO_COMPRA_PARCIAL', titulo: 'Pedido de compra recebido parcialmente',
      descricao: 'Pedidos de compra com entrega parcial e saldo ainda pendente.',
      dias: null, total: 2,
      linhas: [
        {
          id: 91, numero: 'PC-2026-071', status: 'pendente', previsao_entrega: '2026-10-02',
          fornecedor_nome: 'Aços Vale', quantidade_pedida: 120, quantidade_recebida: 45,
          saldo_pendente: 75, situacao_recebimento: 'PARCIAL',
        },
        {
          id: 92, numero: 'PC-2026-072', status: 'aprovado', previsao_entrega: null,
          fornecedor_nome: null, quantidade_pedida: 7.5, quantidade_recebida: 2.5,
          saldo_pendente: 5, situacao_recebimento: 'PARCIAL',
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
    'alerta-card-PEDIDO_COMPRA_ATRASADO',
    // Etapa 42: a 13a entrada entra AQUI, no fim — é a posição do ALERT_REGISTRY no servidor.
    // Esta lista é intencionalmente a lista INTEIRA (não um `toContain`): ela é a única prova de
    // que a tela não reordena, e por isso a chave nova compartilha a CENTRAL_FIXTURE em vez de
    // ganhar fixture própria (F9 — fixture separada perderia exatamente esta medição).
    'alerta-card-PEDIDO_COMPRA_PARCIAL',
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

test('PEDIDO_COMPRA_ATRASADO: pedido, fornecedor, previsao e dias de atraso — nao os campos crus', async () => {
  await renderizar();
  await expandir('PEDIDO_COMPRA_ATRASADO');

  expect(cabecalhos('PEDIDO_COMPRA_ATRASADO')).toEqual([
    'Pedido', 'Fornecedor', 'Previsão', 'Dias de atraso',
  ]);
  const t = card('PEDIDO_COMPRA_ATRASADO').textContent;
  expect(t).toContain('PC-2026-031');
  expect(t).toContain('Aços Vale');
  // ⚠️ `formatData` deste arquivo imprime ANO COM DOIS DÍGITOS (`year: '2-digit'`, :68-78) — a
  // célula da aba Pedidos mostra `25/09/2026`, a central mostra `25/09/26`. A diferença é
  // PRÉ-EXISTENTE (vale para as 11 entradas anteriores) e está declarada; não é bug desta etapa.
  expect(t).toContain('25/09/26');
  expect(t).toContain('3');
  // Pedido órfão de fornecedor entra no alerta (LEFT JOIN, R9) e a tela mostra o travessão.
  expect(t).toContain('PC-2026-032');
  expect(t).not.toMatch(/null/);
  // O fallback genérico mostraria as chaves cruas do SELECT p.* nos primeiros 6 campos.
  expect(t).not.toMatch(/fornecedor id/i);
  expect(t).not.toMatch(/valor total/i);
});

/**
 * Etapa 42, T4 — cartão da 13a chave, `PEDIDO_COMPRA_PARCIAL`, contra o contrato congelado 2.6 do
 * plano (docs/superpowers/plans/2026-09-27-almoxarifado-etapa42-recebimento-fecha-pedido.md):
 * `Pedido` · `Fornecedor` · `Pedida` · `Recebida` · `Saldo pendente` · `Previsão`, nesta ordem.
 *
 * Os rótulos do cartão são CURTOS e DIFERENTES das frases do corpo do e-mail (o e-mail diz
 * "Quantidade pedida:", o cartão diz "Pedida") — intencional, mesmo padrão do cartão irmão
 * (`Previsão`/`Dias de atraso` no cartão, frases inteiras no e-mail). Não unificar: a seção 2.4 do
 * plano apagou a frase "o e-mail e o cartão citam as mesmas" justamente porque era o contrato
 * ambíguo que T3 e T4 dividiriam (F5).
 *
 * Sem entrada em COLUNAS_POR_CHAVE o cartão NÃO some (o fallback genérico existe de propósito),
 * mas mostra `id`, `status` e a ordem do SELECT — e o cartão só existe para pedido PARCIAL, então
 * repetir a situação na tabela seria ruído.
 */
const celulasTodas = (chave) => [...card(chave).querySelectorAll('tbody td')].map((td) => td.textContent);

test('PEDIDO_COMPRA_PARCIAL: cartao existe com o titulo do servidor e o badge do total', async () => {
  await renderizar();

  const c = card('PEDIDO_COMPRA_PARCIAL');
  expect(c).not.toBeNull();
  expect(c.textContent).toContain('Pedido de compra recebido parcialmente');
  expect(c.textContent).toContain('Pedidos de compra com entrega parcial e saldo ainda pendente.');
  expect(badgeTotal('PEDIDO_COMPRA_PARCIAL').textContent).toContain('2');
  // configDias: null no registro — o cartao nao inventa janela.
  expect(c.textContent).not.toMatch(/\d+ dias/);
});

test('PEDIDO_COMPRA_PARCIAL: os 6 cabecalhos do contrato 2.6, na ordem', async () => {
  await renderizar();
  await expandir('PEDIDO_COMPRA_PARCIAL');

  expect(cabecalhos('PEDIDO_COMPRA_PARCIAL')).toEqual([
    'Pedido', 'Fornecedor', 'Pedida', 'Recebida', 'Saldo pendente', 'Previsão',
  ]);
});

test('PEDIDO_COMPRA_PARCIAL: numero, fornecedor, as tres quantidades e a previsao formatada', async () => {
  await renderizar();
  await expandir('PEDIDO_COMPRA_PARCIAL');

  // Celula a celula, na ordem de 2.6 — `toContain` no texto do cartao inteiro deixaria a coluna
  // trocada passar (Pedida/Recebida sao o par mais facil de inverter).
  expect(celulasTodas('PEDIDO_COMPRA_PARCIAL').slice(0, 6)).toEqual([
    'PC-2026-071', 'Aços Vale', '120', '45', '75', '02/10/26',
  ]);
});

test('PEDIDO_COMPRA_PARCIAL: sem fornecedor e sem previsao viram travessao, e o cartao nao quebra', async () => {
  await renderizar();
  await expandir('PEDIDO_COMPRA_PARCIAL');

  // 2a linha: fornecedor_nome null (LEFT JOIN, F6) e previsao_entrega null (a populacao do
  // parcial nao filtra previsao). formatNum/`—` sao os mesmos helpers das entradas vizinhas.
  expect(celulasTodas('PEDIDO_COMPRA_PARCIAL').slice(6, 12)).toEqual([
    'PC-2026-072', '—', '7,5', '2,5', '5', '—',
  ]);
  expect(card('PEDIDO_COMPRA_PARCIAL').textContent).not.toMatch(/null|undefined|Invalid Date|NaN/);
});

test('PEDIDO_COMPRA_PARCIAL: nenhum campo cru no cartao (id, status, situacao_recebimento)', async () => {
  await renderizar();
  await expandir('PEDIDO_COMPRA_PARCIAL');

  const cabecalhosMinusculos = cabecalhos('PEDIDO_COMPRA_PARCIAL').map((h) => h.toLowerCase());
  expect(cabecalhosMinusculos).not.toContain('id');
  expect(cabecalhosMinusculos).not.toContain('status');
  expect(cabecalhosMinusculos).not.toContain('situacao recebimento');

  // O fallback generico desenharia os 6 primeiros campos do objeto: id, numero, status,
  // previsao_entrega, fornecedor_nome, quantidade_pedida — o `id` e o `status` crus entrariam
  // como CELULA. (`not.toContain('pendente')` no texto do cartao seria um teste vazio: a palavra
  // ja esta na descricao e no cabecalho "Saldo pendente".)
  const cels = celulasTodas('PEDIDO_COMPRA_PARCIAL');
  expect(cels).not.toContain('91');
  expect(cels).not.toContain('92');
  expect(cels).not.toContain('pendente');
  expect(cels).not.toContain('aprovado');
  // O cartao SO existe para pedido parcial — repetir a situacao seria ruido.
  expect(card('PEDIDO_COMPRA_PARCIAL').textContent).not.toContain('PARCIAL');
});

test('gate visual: sem ver_alertas o painel de sem-permissao aparece sem nem chamar o GET', async () => {
  mockPode = (acao) => acao !== 'ver_alertas';
  await renderizar();

  expect(api.get).not.toHaveBeenCalled();
  expect(texto()).toMatch(/Sem permissão/);
  expect(texto()).not.toMatch(/[Nn]enhum alerta/);
});
