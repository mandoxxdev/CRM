/**
 * Etapa 29, Task 3 — componente `HistoricoInspecoes` (aba Histórico da tela de Inspeções)
 * contra os contratos congelados C1/C2 do plano
 * (docs/superpowers/plans/2026-08-29-almoxarifado-etapa29-tela-das-medidas.md, RN-06).
 *
 * Os endpoints têm teste de rota no servidor (inspecaoHistorico.api.test.js) — não duplicado
 * aqui. O alvo desta suíte é o que só o componente pode errar: a contagem "N (k fora)" lida
 * do servidor (nunca recontada), expandir chamando C2 UMA vez por inspeção, linha sem medida
 * NÃO chamando C2, o filtro de material indo como `material_id`, e — Global Constraint 6 — a
 * faixa exibida como `[nominal + desvio_inferior ; nominal + desvio_superior]` COM SINAL e com
 * as casas decimais do plano: `10, +0.005/+0.021` tem de virar `[10.005 ; 10.021]`, e
 * `nominal − |inf|` (que daria 9.995) é o erro que este teste existe para pegar.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false -- HistoricoInspecoes
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import HistoricoInspecoes, { formatarFaixa } from './HistoricoInspecoes';
import { casasDecimais } from './faixaTolerancia';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// Leitura sem gate novo (D6): o componente não consulta perfil, mas o mock fica pelo padrão do
// módulo caso a Task 3b monte a aba dentro de InspecoesAlmoxarifado.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

// Fixture no shape C1. A 7 tem 2 medidas (1 fora); a 8 não tem nenhuma — e por isso não pode
// gerar chamada ao C2.
const HISTORICO = [
  {
    id: 7, recebimento_numero: 'REC-2026-055', nota_fiscal: 'NF-999',
    material_codigo: 'ALM-0010', material_nome: 'Eixo Retificado 10mm', material_unidade: 'PC',
    quantidade_aprovada: 8, quantidade_reprovada: 2, conforme: 0,
    divergencia_quantidade: 0, divergencia_dimensional: 1, certificado_ausente: 0,
    dano_fisico: 0, material_incorreto: 0, encaminhamento: 'DEVOLVER',
    observacoes: 'Diametro fora', responsavel_nome: 'Carlos Lima',
    data_inspecao: '2026-08-28T14:30:00Z', medidas_total: 2, medidas_nao_conformes: 1,
  },
  {
    id: 8, recebimento_numero: 'REC-2026-056', nota_fiscal: null,
    material_codigo: 'ALM-0033', material_nome: 'Chapa Aço 3mm', material_unidade: 'KG',
    quantidade_aprovada: 50, quantidade_reprovada: 0, conforme: 1,
    divergencia_quantidade: 0, divergencia_dimensional: 0, certificado_ausente: 0,
    dano_fisico: 0, material_incorreto: 0, encaminhamento: null,
    observacoes: null, responsavel_nome: 'Maria Souza',
    data_inspecao: '2026-08-27T09:00:00Z', medidas_total: 0, medidas_nao_conformes: 0,
  },
];

// Fixture no shape C2 — plano unilateral `+0.005/+0.021` sobre 10 (o caso que derruba
// `nominal − |inf|`). `valor_medido` é string crua do servidor e tem de aparecer como veio.
const MEDIDAS_7 = [
  {
    id: 101, plano_id: 3, caracteristica: 'Diâmetro', unidade: 'mm',
    valor_nominal: 10, desvio_inferior: 0.005, desvio_superior: 0.021,
    valor_medido: '10.012', conforme: 1, ferramenta_id: 9, ferramenta_nome: 'Micrômetro 0-25',
    created_at: '2026-08-28 14:30:00',
  },
  {
    id: 102, plano_id: 4, caracteristica: 'Comprimento', unidade: 'mm',
    valor_nominal: 120.5, desvio_inferior: -0.2, desvio_superior: 0.2,
    valor_medido: '120.9', conforme: 0, ferramenta_id: null, ferramenta_nome: null,
    created_at: '2026-08-28 14:30:00',
  },
];

let container; let root; let historicoDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  historicoDoBanco = HISTORICO;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/inspecoes/historico') return Promise.resolve({ data: historicoDoBanco });
    if (url === '/almoxarifado/inspecoes/7/medidas') return Promise.resolve({ data: MEDIDAS_7 });
    if (url === '/almoxarifado/inspecoes/8/medidas') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar(props = {}) {
  await act(async () => {
    root.render(<MemoryRouter><HistoricoInspecoes materialFilter="" {...props} /></MemoryRouter>);
  });
  await esperarEfeitos();
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
const linha = (id) => container.querySelector(`[data-testid="historico-linha-${id}"]`);
const detalhe = (id) => container.querySelector(`[data-testid="historico-medidas-${id}"]`);
const chamadasMedidas = (id) => api.get.mock.calls.filter(([url]) => url === `/almoxarifado/inspecoes/${id}/medidas`);

test('(1) lista as inspecoes decididas com a contagem "N (k fora)" vinda do servidor', async () => {
  await renderizar();

  expect(api.get).toHaveBeenCalledWith('/almoxarifado/inspecoes/historico', { params: {} });
  expect(linha(7)).not.toBeNull();
  expect(linha(8)).not.toBeNull();
  expect(linha(7).textContent).toContain('Eixo Retificado 10mm');
  expect(linha(7).textContent).toContain('Carlos Lima');
  expect(linha(7).textContent).toContain('2 (1 fora)');
  // Flags como badges curtos: a 7 só tem divergência dimensional marcada.
  const badges7 = [...linha(7).querySelectorAll('.almox-badge')].map((b) => b.textContent.trim());
  expect(badges7).toContain('Dimensional');
  expect(badges7).not.toContain('Quantidade');
  // Nada expandido antes do clique, e nenhuma chamada a C2 ao montar.
  expect(detalhe(7)).toBeNull();
  expect(chamadasMedidas(7)).toHaveLength(0);
});

test('(2) expandir chama C2 e mostra caracteristica, faixa somada COM SINAL, medido, conforme e instrumento', async () => {
  await renderizar();
  await clicar(linha(7));

  expect(chamadasMedidas(7)).toHaveLength(1);
  const det = detalhe(7);
  expect(det).not.toBeNull();
  // `det` é um <tr> dentro do tbody EXTERNO, então `tbody tr` casaria até o thead da tabela
  // aninhada — por isso as linhas vêm do tBodies da tabela interna.
  const linhasMedidas = [...det.querySelector('table').tBodies[0].rows];
  expect(linhasMedidas).toHaveLength(2);

  const [diametro, comprimento] = linhasMedidas.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent.trim()));
  // característica | nominal | faixa | medido | conforme | instrumento
  expect(diametro[0]).toContain('Diâmetro');
  expect(diametro[1]).toBe('10');
  expect(diametro[2]).toBe('[10.005 ; 10.021]');
  expect(diametro[3]).toBe('10.012');
  expect(diametro[4]).toBe('Conforme');
  expect(diametro[5]).toBe('Micrômetro 0-25');

  expect(comprimento[0]).toContain('Comprimento');
  expect(comprimento[2]).toBe('[120.3 ; 120.7]');
  expect(comprimento[3]).toBe('120.9');
  expect(comprimento[4]).toBe('Não conforme');
  expect(comprimento[5]).toBe('—');
});

test('(3) inspecao com medidas_total === 0 mostra "Sem medidas registradas" e NAO chama C2', async () => {
  await renderizar();
  expect(linha(8).textContent).toContain('Sem medidas registradas');

  await clicar(linha(8));
  expect(chamadasMedidas(8)).toHaveLength(0);
  expect(detalhe(8)).toBeNull();
});

test('(4) materialFilter vai como material_id na chamada, e mudar a prop recarrega', async () => {
  await renderizar({ materialFilter: '10' });
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/inspecoes/historico', { params: { material_id: '10' } });

  await renderizar({ materialFilter: '33' });
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/inspecoes/historico', { params: { material_id: '33' } });
  const chamadasHistorico = api.get.mock.calls.filter(([url]) => url === '/almoxarifado/inspecoes/historico');
  expect(chamadasHistorico).toHaveLength(2);
});

test('(5) sem inspecao decidida mostra o estado vazio', async () => {
  historicoDoBanco = [];
  await renderizar();
  expect(container.textContent).toContain('Nenhuma inspeção decidida ainda.');
  expect(container.querySelector('[data-testid^="historico-linha-"]')).toBeNull();
});

test('(6) expandir, recolher e expandir de novo chama C2 UMA vez (cache por id)', async () => {
  await renderizar();
  await clicar(linha(7));
  expect(detalhe(7)).not.toBeNull();
  await clicar(linha(7));
  expect(detalhe(7)).toBeNull();
  await clicar(linha(7));
  expect(detalhe(7)).not.toBeNull();
  expect(chamadasMedidas(7)).toHaveLength(1);
});

/*
 * O titulo deste teste dizia "sem virar lista vazia em silencio" e afirmava SO o toast — a
 * propria alegacao do titulo nao estava ancorada, e a revisao adversarial da Etapa 29 mediu o
 * componente renderizando "Nenhuma inspecao decidida ainda." no erro, indistinguivel de "nao ha
 * inspecoes" depois de o toast sumir. E o mesmo pecado que a RN-08 evita no modal.
 */
test('(7) falha no C1 vai ao toast com a mensagem do servidor E mostra estado de ERRO, nunca "nenhuma inspecao decidida"', async () => {
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/inspecoes/historico') {
      return Promise.reject({ response: { data: { error: 'Sem acesso ao módulo' } } });
    }
    return Promise.resolve({ data: [] });
  });
  await renderizar();
  expect(toast.error).toHaveBeenCalledWith('Sem acesso ao módulo');
  // A metade positiva: o que TEM de estar na tela.
  expect(container.textContent).toContain('Não foi possível carregar o histórico de inspeções.');
  expect(container.textContent).toContain('Sem acesso ao módulo');
  expect(container.textContent).toContain('Tentar de novo');
  // E o que NAO pode estar: a frase que faz o operador concluir que o historico esta vazio.
  expect(container.textContent).not.toContain('Nenhuma inspeção decidida ainda.');
});

test('(8) "Tentar de novo" refaz a chamada e a lista aparece', async () => {
  let falhar = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/inspecoes/historico') {
      if (falhar) return Promise.reject({ response: { data: { error: 'Sem acesso ao módulo' } } });
      return Promise.resolve({ data: HISTORICO });
    }
    if (/\/inspecoes\/\d+\/medidas$/.test(url)) return Promise.resolve({ data: MEDIDAS });
    return Promise.resolve({ data: [] });
  });
  await renderizar();
  falhar = false;
  const botao = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Tentar de novo');
  await clicar(botao);
  expect(container.textContent).not.toContain('Não foi possível carregar');
  expect(linha(7)).not.toBeNull();
});

// Mutante que sobreviveu a suite de 7: trocar `.toFixed(casas)` por `String(...)` em
// `formatarFaixa`. A fixture `10 +0.005/+0.021` e exatamente representavel; `1.1 ±0.1` nao e —
// `1.1 + 0.1` da 1.2000000000000002. E o par que ancora a formatacao.
test('(9) formatarFaixa arredonda pelas casas do plano: 1.1 ±0.1 vira [1.0 ; 1.2]', () => {
  expect(formatarFaixa(1.1, -0.1, 0.1)).toBe('[1.0 ; 1.2]');
  expect(formatarFaixa(10, 0.005, 0.021)).toBe('[10.005 ; 10.021]');
  expect(formatarFaixa('12.3', '-0.1', '0.1')).toBe('[12.2 ; 12.4]');
  // Numero que nao vem: a faixa nao pode ser INVENTADA tratando ausencia como zero — as duas
  // telas divergiam nisto antes de a formula ser unificada em `faixaTolerancia.js`.
  expect(formatarFaixa(10, null, 0.021)).toBe('—');
  expect(formatarFaixa(10, undefined, 0.021)).toBe('—');
  expect(formatarFaixa(null, -0.1, 0.1)).toBe('—');
});

/*
 * Etapa 30, fix-round da revisao adversarial: `faixaTolerancia.js` nasceu na Etapa 29 recebendo
 * NUMEROS do banco. A Etapa 30 passou a mandar TEXTO DE FORMULARIO por aqui, e dois casos que
 * nenhum teste cobria saiam errados na tela.
 */
test('(10) formatarFaixa aceita texto de formulario: espaco nas pontas e notacao cientifica', () => {
  // Copiar-e-colar de planilha traz espaco. Sem `trim`, o espaco da direita contava como casa
  // decimal e a faixa saia `[10.50 ; 10.50]` — largura zero, para um valor que ia como 10.5.
  expect(formatarFaixa(' 10,5 ', '-0,1', '0,1')).toBe('[10.4 ; 10.6]');
  expect(casasDecimais(' 10,5 ')).toBe(1);

  // Notacao cientifica nao tem ponto: caia em 0 casas e um plano `100 +-1e-3` exibia
  // `[100 ; 100]`, escondendo a tolerancia inteira.
  expect(formatarFaixa(100, '-1e-3', '1e-3')).toBe('[99.999 ; 100.001]');
  expect(casasDecimais('1e-3')).toBe(3);
  expect(casasDecimais('1.25e-3')).toBe(5);
  expect(casasDecimais('1e3')).toBe(0);
});
