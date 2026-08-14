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
const RESPOSTA_DO_SERVIDOR = {
  aprovacao_automatica: { valor: '1', descricao: 'Aprovar requisições automaticamente', id: 1 },
  permite_saldo_negativo_global: { valor: '1', descricao: 'Permitir saldo negativo (global)', id: 2 },
  alertas_smtp_pass: { valor: 'segredo', descricao: 'Senha SMTP', id: 3 },
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
