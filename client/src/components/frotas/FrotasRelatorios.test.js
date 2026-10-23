/**
 * Frota Etapa 4 (T2) — tela Relatorios (RN-F4.12) e coluna Km/L da lista de Abastecimentos (RN-F4.09, Fase 2 achados 5/6/7).
 * Contrato congelado: docs/superpowers/plans/2026-10-23-frotas-etapa4-relatorios.md. So a fronteira HTTP (`api`) e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasRelatorios --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import FrotasRelatorios from './FrotasRelatorios';
import { ENTITY_CONFIGS, fmtConsumo } from './frotasEntityConfigs';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const URL_CUSTO = '/frotas/relatorios/custos-por-veiculo';
const URL_CONSUMO = '/frotas/relatorios/consumo';

const CARRO = {
  id: 1, placa: 'ABC1D23', modelo: 'Strada', marca: 'Fiat', setor_responsavel: 'Comercial',
  custo_manutencao: 100, custo_combustivel: 200.5, custo_multas: 50, custo_total: 350.5,
  km_atual: 1800, tipo_medicao: 'km', horimetro_atual: null,
};
const MAQUINA = {
  id: 2, placa: 'EMP0001', modelo: 'Empilhadeira', marca: 'Hyster', setor_responsavel: 'Producao',
  custo_manutencao: 1000, custo_combustivel: 300, custo_multas: 0, custo_total: 1300,
  km_atual: 0, tipo_medicao: 'horimetro', horimetro_atual: 125,
};
const MAQUINA_SEM_HORIMETRO = { ...MAQUINA, id: 3, placa: 'EMP0002', horimetro_atual: null };
const CARRO_SEM_KM = { ...CARRO, id: 4, placa: 'XYZ9K99', km_atual: null };

const CONSUMO = [
  { veiculo_id: 1, placa: 'ABC1D23', tipo_medicao: 'km', consumo_medio: 10.5, consumo_litros_hora: null, total_litros: 80, total_gasto: 200.5, abastecimentos: 3 },
  { veiculo_id: 2, placa: 'EMP0001', tipo_medicao: 'horimetro', consumo_medio: null, consumo_litros_hora: 5, total_litros: 90, total_gasto: 300, abastecimentos: 2 },
];

let container; let root;
let respostas;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  respostas = {
    [URL_CUSTO]: () => Promise.resolve({ data: [CARRO, MAQUINA] }),
    [URL_CONSUMO]: () => Promise.resolve({ data: CONSUMO }),
  };
  api.get.mockImplementation((url) => (respostas[url] ? respostas[url]() : Promise.resolve({ data: [] })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const limpo = (s) => (s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
const texto = () => limpo(container.textContent);

async function render() {
  await act(async () => { root.render(<MemoryRouter><FrotasRelatorios /></MemoryRouter>); });
}

async function setarData(i, valor) {
  const el = container.querySelectorAll('input[type="date"]')[i];
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function secao(titulo) {
  const s = [...container.querySelectorAll('.frotas-section')].find((x) => limpo(x.querySelector('h2')?.textContent) === titulo);
  if (!s) throw new Error(`secao ${titulo} nao encontrada`);
  return s;
}
const cabecalhos = (s) => [...s.querySelectorAll('thead th')].map((th) => limpo(th.textContent));
const celulas = (tr) => [...tr.querySelectorAll('td')].map((td) => limpo(td.textContent));
function linhaDa(s, primeira) {
  const tr = [...s.querySelectorAll('tbody tr, tfoot tr')].find((x) => celulas(x)[0] === primeira);
  if (!tr) throw new Error(`linha ${primeira} nao encontrada`);
  return celulas(tr);
}
const ultimaChamada = (url) => {
  const chamadas = api.get.mock.calls.filter(([u]) => u === url);
  return chamadas[chamadas.length - 1];
};

describe('RN-F4.12 periodo: vai com o que estiver preenchido, para o custo E para o consumo', () => {
  test('nenhuma data: as duas rotas sem periodo e "Periodo: tudo"', async () => {
    await render();
    expect(ultimaChamada(URL_CUSTO)[1]).toEqual({ params: {} });
    expect(ultimaChamada(URL_CONSUMO)[1]).toEqual({ params: {} });
    expect(texto()).toContain('Período: tudo');
  });

  test('so o inicio: data_inicio nas duas rotas e "Periodo: a partir de"', async () => {
    await render();
    await setarData(0, '2026-10-01');
    expect(ultimaChamada(URL_CUSTO)[1]).toEqual({ params: { data_inicio: '2026-10-01' } });
    expect(ultimaChamada(URL_CONSUMO)[1]).toEqual({ params: { data_inicio: '2026-10-01' } });
    expect(texto()).toContain('Período: a partir de 01/10/2026');
    expect(texto()).not.toContain('Período: tudo');
  });

  test('so o fim: data_fim nas duas rotas e "Periodo: ate"', async () => {
    await render();
    await setarData(1, '2026-10-31');
    expect(ultimaChamada(URL_CUSTO)[1]).toEqual({ params: { data_fim: '2026-10-31' } });
    expect(ultimaChamada(URL_CONSUMO)[1]).toEqual({ params: { data_fim: '2026-10-31' } });
    expect(texto()).toContain('Período: até 31/10/2026');
  });

  test('as duas datas: as duas rotas com o periodo inteiro e "Periodo: X a Y"', async () => {
    await render();
    await setarData(0, '2026-10-01');
    await setarData(1, '2026-10-31');
    const esperado = { params: { data_inicio: '2026-10-01', data_fim: '2026-10-31' } };
    expect(ultimaChamada(URL_CUSTO)[1]).toEqual(esperado);
    expect(ultimaChamada(URL_CONSUMO)[1]).toEqual(esperado);
    expect(texto()).toContain('Período: 01/10/2026 a 31/10/2026');
  });
});

describe('RN-F4.12 custo por veiculo', () => {
  test('nota das multas, coluna KM / Horimetro (maquina em h, carro em km, nulo "-")', async () => {
    respostas[URL_CUSTO] = () => Promise.resolve({ data: [CARRO, MAQUINA, MAQUINA_SEM_HORIMETRO, CARRO_SEM_KM] });
    await render();
    expect(texto()).toContain('Multas pela data da infração (sem ela, pelo dia do lançamento); contestadas não entram.');
    const s = secao('Custos por veículo');
    const cab = cabecalhos(s);
    expect(cab[cab.length - 1]).toBe('KM / Horímetro');
    expect(linhaDa(s, 'ABC1D23')[7]).toBe('1.800 km');
    expect(linhaDa(s, 'EMP0001')[7]).toBe('125 h');
    expect(linhaDa(s, 'EMP0002')[7]).toBe('-');
    expect(linhaDa(s, 'XYZ9K99')[7]).toBe('-');
  });

  test('linha Total soma Manutencao, Combustivel, Multas e Total; Modelo/Setor/KM vazias', async () => {
    await render();
    const total = linhaDa(secao('Custos por veículo'), 'Total');
    expect(total).toEqual(['Total', '', '', 'R$ 1.100,00', 'R$ 500,50', 'R$ 50,00', 'R$ 1.650,50', '']);
  });
});

describe('RN-F4.12 consumo medio', () => {
  test('colunas e valores formatados (km/L e L/h com 2 casas, "-" sem valor)', async () => {
    await render();
    const s = secao('Consumo médio');
    expect(cabecalhos(s)).toEqual(['Placa', 'Km/L', 'L/h (máquina)', 'Total litros', 'Total gasto', 'Abastecimentos']);
    const carro = linhaDa(s, 'ABC1D23');
    expect(carro[1]).toBe('10,50 km/L');
    expect(carro[2]).toBe('-');
    expect(carro[5]).toBe('3');
    const maq = linhaDa(s, 'EMP0001');
    expect(maq[1]).toBe('-');
    expect(maq[2]).toBe('5,00 L/h');
  });

  test('vazio: "Sem abastecimentos no periodo"', async () => {
    respostas[URL_CONSUMO] = () => Promise.resolve({ data: [] });
    await render();
    expect(limpo(secao('Consumo médio').querySelector('tbody').textContent)).toBe('Sem abastecimentos no período');
  });
});

describe('RN-F4.12 + achado 7: os dois GET independentes', () => {
  test('custo falha com mensagem do servidor: toast com ela, custo vazio, consumo fica', async () => {
    respostas[URL_CUSTO] = () => Promise.reject({ response: { status: 500, data: { error: 'Banco ocupado' } } });
    await render();
    expect(toast.error).toHaveBeenCalledWith('Banco ocupado');
    expect([...secao('Custos por veículo').querySelectorAll('tbody tr')].some((tr) => celulas(tr)[0] === 'ABC1D23')).toBe(false);
    expect(linhaDa(secao('Consumo médio'), 'EMP0001')[2]).toBe('5,00 L/h');
  });

  test('consumo falha sem mensagem: toast generico, consumo vazio, custo fica', async () => {
    respostas[URL_CONSUMO] = () => Promise.reject(new Error('Network Error'));
    await render();
    expect(toast.error).toHaveBeenCalledWith('Não foi possível carregar os relatórios');
    expect(limpo(secao('Consumo médio').querySelector('tbody').textContent)).toBe('Sem abastecimentos no período');
    expect(linhaDa(secao('Custos por veículo'), 'EMP0001')[7]).toBe('125 h');
  });

  test('as duas respondem: nenhum toast', async () => {
    await render();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('RN-F4.09 + achados 5/6: coluna Km/L da lista de Abastecimentos', () => {
  const coluna = ENTITY_CONFIGS.abastecimentos.columns.find((c) => c.label === 'Km/L');

  test('os dois, so um, nenhum', () => {
    expect(coluna.format({ consumo_medio: 10.5, consumo_litros_hora: 5 })).toBe('10,50 km/L · 5,00 L/h');
    expect(coluna.format({ consumo_medio: 10.5, consumo_litros_hora: null })).toBe('10,50 km/L');
    expect(coluna.format({ consumo_medio: null, consumo_litros_hora: 4 })).toBe('4,00 L/h');
    expect(coluna.format({ consumo_medio: null, consumo_litros_hora: null })).toBe('-');
    expect(coluna.format({})).toBe('-');
  });

  test('a coluna usa o mesmo formatador exportado (um so, achado 6)', () => {
    const r = { consumo_medio: 8.123, consumo_litros_hora: 12.5 };
    expect(coluna.format(r)).toBe(fmtConsumo(r));
    expect(fmtConsumo(r)).toBe('8,12 km/L · 12,50 L/h');
  });
});
