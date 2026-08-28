/**
 * Aba "Configurações Gerais" — o que a tela lê e o que ela manda de volta.
 *
 * ESTE ARQUIVO EXISTE POR UM DEFEITO REAL. A aba estava inteiramente inerte, em três camadas:
 *
 *   1. `loadConfigs` fazia `res.data.forEach(...)` numa resposta que é um MAPA
 *      `{ chave: { valor } }`, não um array. Estourava TypeError em toda abertura, caía no
 *      `catch` e mostrava "Erro ao carregar configurações" — nenhum valor gravado aparecia.
 *   2. `handleSalvar` mandava `{ configuracoes: [{ chave, valor }] }`, e a rota lê o corpo
 *      achatado `{ chave: valor }`. Resultado: uma linha de chave 'configuracoes' com
 *      "[object Object]" e nenhuma configuração salva — com toast de sucesso.
 *   3. As chaves divergiam das que o servidor semeia/lê (`permitir_saida_saldo_negativo`
 *      contra `permite_saldo_negativo_global`, entre outras).
 *
 * A amarração chave-da-tela ↔ chave-do-servidor mora do lado do servidor, em
 * `server/tests/api/configuracoesGerais.api.test.js`, que é quem tem `initSchema` e banco para
 * conferir contra. O que só o cliente consegue provar é o FORMATO: que a tela sabe consumir a
 * resposta que a rota realmente devolve e sabe montar o corpo que a rota realmente aceita.
 * Por isso os mocks abaixo imitam a rota REAL — trocar essa forma aqui por conveniência
 * devolveria o bug.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/ConfiguracoesGerais --watchAll=false
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

// FORMA REAL de GET /api/almoxarifado/configuracoes (routes/almoxarifado.js): mapa por chave,
// com valor/descricao/id — e não um array de linhas.
// As tres chaves `reposicao_*` estao SEMPRE semeadas no servidor real (schema.js) com valor
// padrao valido — sem elas aqui, o guard novo do achado 6 (handleSalvar recusa reposicao_*
// invalida) via `configs[chave]` undefined como NaN e barraria os testes de salvar que nao tem
// nada a ver com reposicao. Valores de fixture arbitrarios, mas validos (inteiro >= 1).
//
// Etapa 12 (RN-09): as 10 chaves novas da fila de notificacoes tem a MESMA obrigacao — as
// numericas (`notificacoes_worker_intervalo_min`, `notificacoes_max_tentativas`,
// `alerta_lote_vencendo_dias`) entram no MESMO guard client-side (agora com dois conjuntos de
// prefixo/mensagem — achado 8 da Fase 2 do design) e, sem fixture valida aqui, qualquer teste de
// "Salvar" que nem toque nelas cairia por causa de NaN vindo de `configs[chave]` undefined.
const RESPOSTA_DO_SERVIDOR = {
  aprovacao_automatica: { valor: '1', descricao: 'Aprovar requisições automaticamente', id: 1 },
  permite_saldo_negativo_global: { valor: '1', descricao: 'Permitir saldo negativo (global)', id: 2 },
  alertas_smtp_pass: { valor: 'segredo', descricao: 'Senha SMTP', id: 3 },
  reposicao_janela_consumo_dias: { valor: '90', descricao: 'Janela do consumo médio', id: 4 },
  reposicao_dias_sem_consumo: { valor: '180', descricao: 'Dias sem saída (estoque parado)', id: 5 },
  reposicao_horizonte_solicitacao_dias: { valor: '60', descricao: 'Horizonte da solicitação', id: 6 },
  notificar_movimentacoes: { valor: '0', descricao: 'Notificar movimentações por e-mail', id: 7 },
  notificacoes_worker_intervalo_min: { valor: '5', descricao: 'Intervalo do worker (min)', id: 8 },
  notificacoes_max_tentativas: { valor: '5', descricao: 'Máx. tentativas de envio', id: 9 },
  alerta_lote_vencendo_dias: { valor: '30', descricao: 'Alerta de lote vencendo (dias)', id: 10 },
  notificacoes_dest_entradas: { valor: '', descricao: 'Destinatários — entradas', id: 11 },
  notificacoes_dest_saidas: { valor: '', descricao: 'Destinatários — saídas', id: 12 },
  notificacoes_dest_ajustes: { valor: '', descricao: 'Destinatários — ajustes', id: 13 },
  notificacoes_dest_terceiros: { valor: '', descricao: 'Destinatários — terceiros', id: 14 },
  notificacoes_dest_compras: { valor: '', descricao: 'Destinatários — compras', id: 15 },
  // Etapa 16 (C4): as 3 chaves de dias dos alertas novos — mesma obrigacao das reposicao_*:
  // sem fixture valida aqui, o guard client-side veria undefined como NaN e derrubaria os
  // testes de Salvar que nem tocam nelas.
  alerta_calibracao_dias: { valor: '30', descricao: 'Alerta de calibração (dias)', id: 16 },
  alerta_quarentena_dias: { valor: '7', descricao: 'Alerta de quarentena parada (dias)', id: 17 },
  alerta_reserva_parada_dias: { valor: '30', descricao: 'Alerta de reserva parada (dias)', id: 18 },
  // Etapa 17 (C3): a janela unica dos 3 alertas de EVENTO (reprovado, divergencia de
  // recebimento, divergencia de inventario). Mesma obrigacao das anteriores — sem fixture
  // valida, o guard client-side veria undefined como NaN e derrubaria os testes de Salvar.
  alerta_eventos_janela_dias: { valor: '7', descricao: 'Janela dos alertas de evento (dias)', id: 19 },
};

let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockResolvedValue({ data: RESPOSTA_DO_SERVIDOR });
  api.put.mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderAbaGeral() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=geral']}>
        <ConfiguracoesAlmoxarifado />
      </MemoryRouter>
    );
  });
}

const switchDoCampo = (rotulo) => {
  const bloco = [...container.querySelectorAll('div')]
    .find(d => d.textContent.trim().startsWith(rotulo) && d.querySelector('input[type="checkbox"]'));
  return bloco ? bloco.querySelector('input[type="checkbox"]') : null;
};

test('a aba carrega o valor gravado no servidor em vez de "Erro ao carregar"', async () => {
  await renderAbaGeral();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/configuracoes');
  expect(container.textContent).not.toMatch(/Carregando/);
  // O sintoma do bug: com o parse errado a aba nunca saía do catch e todo switch ficava
  // desligado, mostrando "desligado" para uma opção que estava ligada no banco.
  const negativo = switchDoCampo('Permitir Saída com Saldo Negativo');
  expect(negativo).not.toBeNull();
  expect(negativo.checked).toBe(true);
});

test('salvar manda o corpo achatado { chave: valor } que a rota aceita', async () => {
  await renderAbaGeral();

  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));
  expect(botao).not.toBeNull();
  await act(async () => { botao.click(); });

  expect(api.put).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.put.mock.calls[0];
  expect(rota).toBe('/almoxarifado/configuracoes');
  expect(corpo.configuracoes).toBeUndefined();   // envelope antigo: a rota gravava lixo
  expect(Array.isArray(corpo)).toBe(false);
  expect(corpo.permite_saldo_negativo_global).toBe('1');
  // Chave que a tela nem oferece não pode ir junto: `configs` carrega tudo o que o GET trouxe,
  // e reenviar isso reescreveria segredo de SMTP configurado noutra aba.
  expect(corpo.alertas_smtp_pass).toBeUndefined();
  // E a chave morta da versão antiga não pode voltar por descuido.
  expect(corpo.permitir_saida_saldo_negativo).toBeUndefined();
});

test('desligar o switch manda "0" — o valor que o motor de estoque compara', async () => {
  await renderAbaGeral();

  const negativo = switchDoCampo('Permitir Saída com Saldo Negativo');
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')
      .set.call(negativo, false);
    negativo.dispatchEvent(new Event('click', { bubbles: true }));
  });

  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));
  await act(async () => { botao.click(); });

  expect(api.put.mock.calls[0][1].permite_saldo_negativo_global).toBe('0');
});

/**
 * Etapa 11, Task 3 — as tres chaves novas do motor de reposicao (purchaseService,
 * calcularSugestoes/estoqueParado). Semeadas em schema.js e com leitor real (Task 1/2), mas a
 * tela renderiza uma LISTA FIXA (`CAMPOS`) — chave fora dela e ineditavel pela UI (achado da
 * Fase 2 do design, mesma licao do defeito que originou este arquivo). Este teste prova as duas
 * pontas do lado do cliente: os tres campos aparecem e entram no payload do Salvar.
 */
const inputDoCampo = (rotulo) => {
  const bloco = [...container.querySelectorAll('div')]
    .find(d => d.textContent.trim().startsWith(rotulo) && d.querySelector('input[type="number"]'));
  return bloco ? bloco.querySelector('input[type="number"]') : null;
};

test('as tres chaves de reposicao (Etapa 11) aparecem e entram no payload do salvar', async () => {
  await renderAbaGeral();

  expect(container.textContent).toContain('Janela do Consumo Médio (dias)');
  expect(container.textContent).toContain('Dias Sem Consumo (estoque parado)');
  expect(container.textContent).toContain('Horizonte da Solicitação (dias)');

  const inputJanela = inputDoCampo('Janela do Consumo Médio (dias)');
  const inputParado = inputDoCampo('Dias Sem Consumo (estoque parado)');
  const inputHorizonte = inputDoCampo('Horizonte da Solicitação (dias)');
  expect(inputJanela).not.toBeNull();
  expect(inputParado).not.toBeNull();
  expect(inputHorizonte).not.toBeNull();

  const preencher = (el, valor) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => {
    preencher(inputJanela, '120');
    preencher(inputParado, '200');
    preencher(inputHorizonte, '45');
  });

  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));
  await act(async () => { botao.click(); });

  expect(api.put).toHaveBeenCalledTimes(1);
  const corpo = api.put.mock.calls[0][1];
  expect(corpo.reposicao_janela_consumo_dias).toBe('120');
  expect(corpo.reposicao_dias_sem_consumo).toBe('200');
  expect(corpo.reposicao_horizonte_solicitacao_dias).toBe('45');
});

/**
 * Revisao final da Etapa 11 (achado 6, medido): o servidor recusa (400) as chaves
 * `reposicao_*` menores que 1 (rota PUT /almoxarifado/configuracoes, purchaseService le com
 * fallback silencioso). Sem guard no cliente, o "0" digitado disparava o PUT do mesmo jeito e
 * so voltava o 400 depois da ida ao servidor. Aqui prova a metade que so o cliente pode provar:
 * o clique NEM CHEGA a chamar `api.put` quando um campo de reposicao esta fora do intervalo, e
 * o toast reaproveita o MESMO literal que a rota devolveria.
 */
test('digitar 0 num campo de reposicao recusa salvar com toast, sem chamar o PUT', async () => {
  await renderAbaGeral();

  const inputJanela = inputDoCampo('Janela do Consumo Médio (dias)');
  const preencher = (el, valor) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => { preencher(inputJanela, '0'); });

  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));
  await act(async () => { botao.click(); });

  expect(api.put).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Configuração "reposicao_janela_consumo_dias" deve ser um número de dias maior que zero'
  );
});

/**
 * Etapa 12, Task 4 — as 10 chaves novas da fila de notificacoes (RN-09 do design). Mesma
 * obrigacao que a Etapa 11 estabeleceu para as `reposicao_*`: aparecer na tela E entrar no
 * payload do Salvar com o valor certo (boolean vira '0'/'1', numericas vao como string,
 * texto livre passa direto).
 */
const inputTextoDoCampo = (rotulo) => {
  const bloco = [...container.querySelectorAll('div')]
    .find(d => d.textContent.trim().startsWith(rotulo) && d.querySelector('input[type="text"]'));
  return bloco ? bloco.querySelector('input[type="text"]') : null;
};

test('as 10 chaves de notificacoes (Etapa 12) renderizam e entram no payload do salvar', async () => {
  await renderAbaGeral();

  expect(container.textContent).toContain('Notificar Movimentações por E-mail');
  expect(container.textContent).toContain('Intervalo do Worker (min)');
  expect(container.textContent).toContain('Máx. Tentativas de Envio');
  expect(container.textContent).toContain('Alerta de Lote Vencendo (dias)');
  expect(container.textContent).toContain('Destinatários — Entradas');
  expect(container.textContent).toContain('Destinatários — Saídas');
  expect(container.textContent).toContain('Destinatários — Ajustes');
  expect(container.textContent).toContain('Destinatários — Terceiros');
  expect(container.textContent).toContain('Destinatários — Compras');

  // Notificar Movimentações nasce '0' na fixture (D1 do design) — liga o switch.
  const switchNotificar = switchDoCampo('Notificar Movimentações por E-mail');
  expect(switchNotificar).not.toBeNull();
  expect(switchNotificar.checked).toBe(false);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked')
      .set.call(switchNotificar, true);
    switchNotificar.dispatchEvent(new Event('click', { bubbles: true }));
  });

  const inputIntervalo = inputDoCampo('Intervalo do Worker (min)');
  const inputMaxTentativas = inputDoCampo('Máx. Tentativas de Envio');
  const inputLoteDias = inputDoCampo('Alerta de Lote Vencendo (dias)');
  const inputDestEntradas = inputTextoDoCampo('Destinatários — Entradas');
  expect(inputIntervalo).not.toBeNull();
  expect(inputMaxTentativas).not.toBeNull();
  expect(inputLoteDias).not.toBeNull();
  expect(inputDestEntradas).not.toBeNull();

  const preencher = (el, valor) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => {
    preencher(inputIntervalo, '10');
    preencher(inputMaxTentativas, '3');
    preencher(inputLoteDias, '15');
    preencher(inputDestEntradas, 'compras@gmp.com,almox@gmp.com');
  });

  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));
  await act(async () => { botao.click(); });

  expect(api.put).toHaveBeenCalledTimes(1);
  const corpo = api.put.mock.calls[0][1];
  expect(corpo.notificar_movimentacoes).toBe('1');
  expect(corpo.notificacoes_worker_intervalo_min).toBe('10');
  expect(corpo.notificacoes_max_tentativas).toBe('3');
  expect(corpo.alerta_lote_vencendo_dias).toBe('15');
  expect(corpo.notificacoes_dest_entradas).toBe('compras@gmp.com,almox@gmp.com');
});

/**
 * Etapa 12 (RN-09, Fase 2 do design, achado 8): a mensagem de validação NÃO pode reaproveitar
 * "número de dias" para tentativas/minutos — mentiria. Prova o par: `alerta_lote_vencendo_dias`
 * (prefixo de DIAS, mesma mensagem da Etapa 11) e `notificacoes_max_tentativas` (prefixo
 * INTEIRO, mensagem nova) — cada um recusa o PUT com o literal certo, sem chamar `api.put`.
 */
test('config de dias novo (alerta_lote_vencendo_dias) invalido usa a mensagem "dias"', async () => {
  await renderAbaGeral();

  const inputLoteDias = inputDoCampo('Alerta de Lote Vencendo (dias)');
  const preencher = (el, valor) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => { preencher(inputLoteDias, '0'); });

  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));
  await act(async () => { botao.click(); });

  expect(api.put).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Configuração "alerta_lote_vencendo_dias" deve ser um número de dias maior que zero'
  );
});

test('config inteira nova (notificacoes_max_tentativas) invalida usa a mensagem "numero inteiro", NAO "dias"', async () => {
  await renderAbaGeral();

  const inputMaxTentativas = inputDoCampo('Máx. Tentativas de Envio');
  const preencher = (el, valor) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  await act(async () => { preencher(inputMaxTentativas, '0'); });

  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));
  await act(async () => { botao.click(); });

  expect(api.put).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Configuração "notificacoes_max_tentativas" deve ser um número inteiro maior que zero'
  );
  expect(toast.error).not.toHaveBeenCalledWith(
    expect.stringContaining('notificacoes_max_tentativas" deve ser um número de dias')
  );
});

/**
 * Etapa 16, Task 3 (C4/RN-06) — as 3 chaves de dias dos alertas novos (alerta_calibracao_dias,
 * alerta_quarentena_dias, alerta_reserva_parada_dias). Semeadas em schema.js com leitor real
 * (alertRegistry.resolverDias, Task 1), mas a tela renderiza a LISTA FIXA `CAMPOS` — fora dela
 * a chave e ineditavel pela UI. O guard do handleSalvar valida por PREFIXO, e o espelho client
 * era `'alerta_lote_'` — as chaves novas NAO cairiam nele (achado da revisao do plano): o front
 * deixaria o "0" ir ao servidor e a RN-06 "nos dois lados" falharia. A correcao e o prefixo
 * unico `'alerta_'` (mesma decisao do C4 no servidor; `alertas_*` nao casa com `alerta_`, o
 * `_` na 7ª posicao nao e `s`). Este teste prova, campo a campo, que o 0 recusa ANTES do
 * submit com o literal do 400 — e no fim que os tres valores validos entram no payload.
 */
test('as 3 chaves de alerta (Etapa 16) aparecem e cada uma recusa 0 antes do submit', async () => {
  await renderAbaGeral();

  expect(container.textContent).toContain('Alerta de Calibração (dias)');
  expect(container.textContent).toContain('Alerta de Quarentena Parada (dias)');
  expect(container.textContent).toContain('Alerta de Reserva Parada (dias)');

  const inputCalibracao = inputDoCampo('Alerta de Calibração (dias)');
  const inputQuarentena = inputDoCampo('Alerta de Quarentena Parada (dias)');
  const inputReserva = inputDoCampo('Alerta de Reserva Parada (dias)');
  expect(inputCalibracao).not.toBeNull();
  expect(inputQuarentena).not.toBeNull();
  expect(inputReserva).not.toBeNull();

  const preencher = (el, valor) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));

  // Os tres em 0: o guard acha o primeiro invalido na ordem de CAMPOS e NEM chama o PUT.
  await act(async () => {
    preencher(inputCalibracao, '0');
    preencher(inputQuarentena, '0');
    preencher(inputReserva, '0');
  });
  await act(async () => { botao.click(); });
  expect(api.put).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Configuração "alerta_calibracao_dias" deve ser um número de dias maior que zero'
  );

  // Corrige o primeiro — o proximo invalido e a quarentena.
  await act(async () => { preencher(inputCalibracao, '15'); });
  await act(async () => { botao.click(); });
  expect(api.put).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Configuração "alerta_quarentena_dias" deve ser um número de dias maior que zero'
  );

  // Corrige a quarentena — sobra a reserva.
  await act(async () => { preencher(inputQuarentena, '10'); });
  await act(async () => { botao.click(); });
  expect(api.put).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Configuração "alerta_reserva_parada_dias" deve ser um número de dias maior que zero'
  );

  // Tudo valido: o PUT sai com as tres chaves no corpo achatado.
  await act(async () => { preencher(inputReserva, '60'); });
  await act(async () => { botao.click(); });
  expect(api.put).toHaveBeenCalledTimes(1);
  const corpo = api.put.mock.calls[0][1];
  expect(corpo.alerta_calibracao_dias).toBe('15');
  expect(corpo.alerta_quarentena_dias).toBe('10');
  expect(corpo.alerta_reserva_parada_dias).toBe('60');
});

/**
 * Etapa 17, Task 3 (C3) — `alerta_eventos_janela_dias`: a janela que os 3 alertas de EVENTO
 * (reprovado, divergência de recebimento, divergência de inventário) mostram na central e a
 * varredura de rede usa. Semeada em schema.js e lida por `alertRegistry.resolverDias` (Task 1),
 * mas a tela renderiza a LISTA FIXA `CAMPOS` — fora dela a chave existe no banco e é ineditável
 * pela UI, exatamente o defeito que originou este arquivo. O prefixo `'alerta_'` do guard já
 * cobre a chave nova nos dois lados (não há nada a mudar na validação): este teste prova que a
 * cobertura VALE para ela — 0 é recusado ANTES do submit com o literal do 400 — e que o valor
 * válido entra no corpo achatado do PUT.
 */
test('a chave de janela dos alertas de evento (Etapa 17) aparece, recusa 0 e entra no payload', async () => {
  await renderAbaGeral();

  expect(container.textContent).toContain('Alerta de Eventos (dias)');
  const inputEventos = inputDoCampo('Alerta de Eventos (dias)');
  expect(inputEventos).not.toBeNull();
  // A fixture do servidor manda '7' — a tela mostra o valor gravado, não um default local.
  expect(inputEventos.value).toBe('7');

  const preencher = (el, valor) => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const botao = [...container.querySelectorAll('button')]
    .find(b => /Salvar Configurações/.test(b.textContent));

  // Só esta chave inválida (as demais vêm válidas da fixture): o guard tem de pegá-la.
  await act(async () => { preencher(inputEventos, '0'); });
  await act(async () => { botao.click(); });
  expect(api.put).not.toHaveBeenCalled();
  expect(toast.error).toHaveBeenCalledWith(
    'Configuração "alerta_eventos_janela_dias" deve ser um número de dias maior que zero'
  );

  await act(async () => { preencher(inputEventos, '15'); });
  await act(async () => { botao.click(); });
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put.mock.calls[0][1].alerta_eventos_janela_dias).toBe('15');
});
