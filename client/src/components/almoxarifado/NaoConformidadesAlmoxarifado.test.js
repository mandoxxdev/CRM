/**
 * Etapa 43, T5 — a tela do documento numerado de não conformidade.
 *
 * O que estes testes protegem, e por que cada um existe:
 *
 * - a lista mostra o que veio do servidor, com o FATO congelado (esperada/recebida/divergência)
 *   que é a razão de o documento existir;
 * - o filtro de status refaz a chamada com a query certa — e com `limite`, NUNCA `limit`: com o
 *   nome errado o parâmetro é ignorado em silêncio e o usuário recebe 100 achando que recebeu
 *   tudo (convenção medida do módulo, `inspectionService.js:455`);
 * - a justificativa é obrigatória: o POST não sai vazio (RN-06);
 * - o botão de decidir NÃO aparece em NC já encerrada (decidir de novo é 409);
 * - falha de carga mostra o painel de erro e NÃO deixa a lista anterior na tela — é o defeito
 *   que a Etapa 35 consertou nas telas irmãs e que aqui seria pior: uma tela de problemas que
 *   diz "não há problema" quando na verdade tomou 403.
 *
 * ⚠️ CADA CENÁRIO NEGATIVO TEM A METADE POSITIVA NO MESMO TESTE. "o botão não aparece" e "o POST
 * não saiu" passam com a tela vazia — é a forma de teste vazio que esta base já pagou três
 * vezes. Onde se afirma ausência, afirma-se também algo que TEM de estar lá.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/NaoConformidades --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import NaoConformidadesAlmoxarifado from './NaoConformidadesAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas: o alvo aqui é o comportamento da tela, e o gate real é do servidor (o
// hook falha ABERTO de propósito). O que esconde o botão de decidir nesta tela é o STATUS.
//
// ⚠️ Etapa 45: `executar_encaminhamento` é a ÚNICA ação desta tela que esconde botão por perfil
// (a plateia dela é COMPRAS, e não quem decide), então ela precisa ser controlável por cenário.
// O prefixo `mock` no nome não é estilo: é o que o jest permite referenciar dentro da fábrica.
//
// ⚠️ Etapa 46: `cancelar_nao_conformidade` é a SEGUNDA ação que esconde botão por perfil (a
// plateia dela é QUALIDADE/ADMINISTRADOR, e quem opera a fila não a tem), então ela também
// precisa ser controlável por cenário — ver (35).
let mockPodeExecutar = true;
let mockPodeCancelar = true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'QUALIDADE',
    pode: (acao) => {
      if (acao === 'executar_encaminhamento') return mockPodeExecutar;
      if (acao === 'cancelar_nao_conformidade') return mockPodeCancelar;
      return true;
    },
    bloquearSeNaoPode: () => true,
    loading: false,
  }),
}));

const NC_ABERTA = {
  id: 7, numero: 'NC-2026-0007', origem: 'RECEBIMENTO', referencia_tipo: 'RECEBIMENTO_ITEM',
  referencia_id: 41, tipo: 'QUANTIDADE', status: 'ABERTA',
  material_id: 10, material_codigo: 'ALM-0010', material_nome: 'Eixo Retificado 10mm',
  recebimento_id: 55, recebimento_numero: 'REC-2026-055', nota_fiscal: 'NF-777',
  quantidade_esperada: 100, quantidade_recebida: 92, divergencia: -8,
  descricao: 'Faltaram 8 pecas na conferencia', decisao: null, justificativa: null,
  aberto_por_nome: null, aberto_automaticamente: 1,
  decidido_por_nome: null, decidido_em: null, motivo_cancelamento: null, cancelado_em: null,
  created_at: '2026-09-27 11:00:00', updated_at: '2026-09-27 11:00:00',
  // Etapa 45: NC ainda não decidida não tem estado de execução — e `null` aqui NÃO é o mesmo que
  // "pendente". Ver o cenário (22).
  execucao_estado: null, execucao_em: null, execucao_por_nome: null,
  execucao_observacoes: null, execucao_movimentacao_id: null,
};

const NC_DECIDIDA = {
  id: 8, numero: 'NC-2026-0008', origem: 'INSPECAO', referencia_tipo: 'INSPECAO',
  referencia_id: 3, tipo: 'DIMENSIONAL', status: 'DECIDIDA',
  material_id: 11, material_codigo: 'ALM-0011', material_nome: 'Flange 2pol',
  recebimento_id: 56, recebimento_numero: 'REC-2026-056', nota_fiscal: 'NF-778',
  quantidade_esperada: null, quantidade_recebida: null, divergencia: null,
  descricao: 'Reprovada por divergencia dimensional', decisao: 'ACEITAR_SOB_DESVIO',
  justificativa: 'Desvio de 0,02mm aceito pela engenharia',
  aberto_por_nome: 'Carlos Lima', aberto_automaticamente: 1,
  decidido_por_nome: 'Ana Souza', decidido_em: '2026-09-27 15:30:00',
  motivo_cancelamento: null, cancelado_em: null,
  created_at: '2026-09-27 12:00:00', updated_at: '2026-09-27 15:30:00',
  // As duas decisões de ACEITAÇÃO já se executaram no clique da decisão (Etapa 44) — nasceram
  // `NAO_SE_APLICA` (`nonConformityService.js:732`). Não há ato externo a confirmar.
  execucao_estado: 'NAO_SE_APLICA', execucao_em: null, execucao_por_nome: null,
  execucao_observacoes: null, execucao_movimentacao_id: null,
};

/**
 * Etapa 45 — as duas linhas que a etapa inteira existe para distinguir: a mesma decisão
 * (`DEVOLVER`), uma esperando alguém embalar e outra já embarcada.
 */
const NC_A_EXECUTAR = {
  ...NC_DECIDIDA,
  id: 21, numero: 'NC-2026-0021', decisao: 'DEVOLVER',
  material_id: 12, material_codigo: 'ALM-0012', material_nome: 'Parafuso M8',
  justificativa: 'Fora de especificacao, volta ao fornecedor',
  execucao_estado: 'PENDENTE', execucao_em: null, execucao_por_nome: null,
};

const NC_EXECUTADA = {
  ...NC_DECIDIDA,
  id: 22, numero: 'NC-2026-0022', decisao: 'DEVOLVER',
  material_id: 13, material_codigo: 'ALM-0013', material_nome: 'Bucha Bronze',
  justificativa: 'Fora de especificacao, volta ao fornecedor',
  execucao_estado: 'EXECUTADA', execucao_em: '2026-09-29 08:15:00',
  execucao_por_nome: 'Marina Prado', execucao_observacoes: 'NF de devolucao 9012',
  execucao_movimentacao_id: 777,
};

/**
 * Etapa 46 — a linha que só existe depois desta etapa, e o motivo do achado 5: o servidor
 * PRESERVA `execucao_estado = 'PENDENTE'` ao cancelar (RN-06 — quem exclui a cancelada da fila é
 * o `status`), então esta linha carrega, ao mesmo tempo, status CANCELADA e execução PENDENTE. É
 * exatamente a combinação que fazia a coluna Execução mentir. Ver (39).
 */
const NC_CANCELADA_APOS_DECISAO = {
  ...NC_A_EXECUTAR,
  id: 24, numero: 'NC-2026-0024', status: 'CANCELADA',
  motivo_cancelamento: 'Fornecedor assumiu a troca em campo, devolucao cancelada',
  cancelado_em: '2026-09-29 17:00:00', cancelado_por_id: 91, cancelado_por_nome: 'Ana Souza',
  execucao_estado: 'PENDENTE', execucao_em: null, execucao_por_nome: null,
};

let container;
let root;
let ncDoBanco;
let falharCarga;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  ncDoBanco = [NC_ABERTA, NC_DECIDIDA];
  falharCarga = null;
  mockPodeExecutar = true;
  mockPodeCancelar = true;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só o
  // primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/nao-conformidades') {
      if (falharCarga) return Promise.reject(falharCarga);
      return Promise.resolve({ data: { itens: ncDoBanco } });
    }
    // O bloco AnexosDocumento consulta esta rota ao expandir a linha (Etapa 32).
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 7, status: 'DECIDIDA' } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><NaoConformidadesAlmoxarifado /></MemoryRouter>);
  });
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')]
  .filter((tr) => tr.dataset.testid?.startsWith('nc-linha-'));

const chamadasLista = () => api.get.mock.calls.filter(([u]) => u === '/almoxarifado/nao-conformidades');

const filtroStatus = () => container.querySelector('select[aria-label="Filtrar por status"]');

const filtroOrigem = () => container.querySelector('select[aria-label="Filtrar por origem"]');

const botaoDecidir = (linha) => [...linha.querySelectorAll('.almox-btn-icon')]
  .find((b) => b.getAttribute('title')?.includes('Decidir'));

const filtroExecucao = () => container.querySelector('select[aria-label="Filtrar por execução"]');

const botaoExecutar = (linha) => [...linha.querySelectorAll('.almox-btn-icon')]
  .find((b) => b.getAttribute('title')?.includes('Registrar execução'));

const botaoCancelar = (linha) => [...linha.querySelectorAll('.almox-btn-icon')]
  .find((b) => b.getAttribute('title')?.includes('Cancelar'));

const botaoDetalhes = (linha) => [...linha.querySelectorAll('.almox-btn-icon')]
  .find((b) => b.getAttribute('title')?.includes('Detalhes'));

/** A célula da coluna Execução — 8ª das nove (Número…Decisão, Execução, Ações). */
const celulaExecucao = (linha) => linha.querySelectorAll('td')[7];
// Etapa 46, fechamento: as duas colunas vizinhas, por indice como a de execucao. O `td[5]` e o
// STATUS (onde o autor do cancelamento mora) e o `td[6]` e a DECISAO — a confusao entre as duas
// foi o achado que criou o cenario (44).
const celulaStatus = (linha) => linha.querySelectorAll('td')[5];
const celulaDecisao = (linha) => linha.querySelectorAll('td')[6];

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : elemento.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
};

/** Campo do modal aberto, localizado pelo texto do <label>. */
function campoPorLabel(rotulo) {
  const grupo = [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.replace('*', '').trim() === rotulo);
  return grupo ? grupo.querySelector('input, textarea, select') : null;
}

const botaoModal = (texto) => [...container.querySelectorAll('.almox-modal-footer button')]
  .find((b) => b.textContent.trim() === texto);

async function clicarBotaoModal(texto) {
  await clicar(botaoModal(texto));
}

describe('NaoConformidadesAlmoxarifado — lista e filtro', () => {
  test('(1) a lista renderiza o que veio: número, material, origem, tipo e o FATO congelado', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(2);
    const texto = linhas()[0].textContent;
    expect(texto).toContain('NC-2026-0007');
    expect(texto).toContain('Eixo Retificado 10mm');
    expect(texto).toContain('ALM-0010');
    expect(texto).toContain('REC-2026-055');
    expect(texto).toContain('Recebimento');
    expect(texto).toContain('Quantidade');
    // O fato é o que o servidor congelou — a tela NÃO recalcula `recebida − esperada` (B60).
    expect(texto).toContain('Esperada 100');
    expect(texto).toContain('Recebida 92');
    expect(texto).toContain('Divergência -8');
    expect(texto).toContain('Aberta');
    // E a segunda linha traz a decisão gravada, com autor.
    const decidida = linhas()[1].textContent;
    expect(decidida).toContain('NC-2026-0008');
    expect(decidida).toContain('Aceitar sob desvio');
    expect(decidida).toContain('Ana Souza');
  });

  test('(2) a carga inicial pede `limite` (NUNCA `limit`) e o status do filtro', async () => {
    await renderizar();
    expect(chamadasLista()).toHaveLength(1);
    const params = chamadasLista()[0][1].params;
    expect(params).toEqual({ limite: 200, status: 'ABERTA' });
    // A metade que prova que a asserção sabe o que procura: `limit` seria ignorado em silêncio
    // pelo serviço, então a AUSÊNCIA dele é parte do contrato.
    expect(params.limit).toBeUndefined();
  });

  test('(3) trocar o filtro refaz a chamada com o status novo, e "Todos" não manda status nenhum', async () => {
    await renderizar();
    preencher(filtroStatus(), 'DECIDIDA');
    await act(async () => {});
    expect(chamadasLista()).toHaveLength(2);
    expect(chamadasLista()[1][1].params).toEqual({ limite: 200, status: 'DECIDIDA' });

    preencher(filtroStatus(), '');
    await act(async () => {});
    expect(chamadasLista()).toHaveLength(3);
    // Sem status: a query leva só o `limite`. Mandar `status: ''` faria o serviço filtrar por
    // string vazia? Não — ele testa `if (filtros[campo])` —, mas o contrato da tela é não mandar.
    expect(chamadasLista()[2][1].params).toEqual({ limite: 200 });
  });

  test('(4) lista vazia mostra o estado vazio do módulo, e não o painel de erro', async () => {
    ncDoBanco = [];
    await renderizar();
    expect(container.querySelector('.almox-empty')).not.toBeNull();
    expect(container.querySelector('[data-testid="nc-erro-carga"]')).toBeNull();
  });

  // Achado 12 da revisão adversarial: o serviço sempre aceitou `origem` e a tela NUNCA a enviava
  // — o roteiro de teste manual mandava "filtre por origem Inspeção" e não havia onde clicar. O
  // filtro existe agora, e este cenário é o que impede que ele vire decoração: o que importa não
  // é o `<select>` estar na tela, é o parâmetro SAIR na query.
  test('(15) o filtro de origem manda `origem` na query, e "Todas" volta a não mandar nada', async () => {
    await renderizar();
    // Positiva: o filtro existe e oferece as duas origens do enum do servidor.
    expect([...filtroOrigem().querySelectorAll('option')].map((o) => o.value))
      .toEqual(['', 'RECEBIMENTO', 'INSPECAO']);
    expect(chamadasLista()).toHaveLength(1);

    preencher(filtroOrigem(), 'INSPECAO');
    await act(async () => {});
    expect(chamadasLista()).toHaveLength(2);
    // O status escolhido continua junto: os dois filtros somam, não se substituem.
    expect(chamadasLista()[1][1].params).toEqual({ limite: 200, status: 'ABERTA', origem: 'INSPECAO' });

    preencher(filtroOrigem(), '');
    await act(async () => {});
    expect(chamadasLista()).toHaveLength(3);
    expect(chamadasLista()[2][1].params).toEqual({ limite: 200, status: 'ABERTA' });
  });
});

describe('NaoConformidadesAlmoxarifado — o botão de decidir e o STATUS', () => {
  test('(5) NC já decidida NÃO ganha botão de decidir; a aberta ao lado ganha', async () => {
    await renderizar();
    // A metade POSITIVA, no mesmo teste: sem ela, este cenário passaria com a tabela vazia.
    expect(linhas()).toHaveLength(2);
    expect(linhas()[0].textContent).toContain('NC-2026-0007');
    expect(botaoDecidir(linhas()[0])).toBeDefined();
    // E a negativa: a decidida (mesma tabela, linha vizinha) não tem o botão.
    expect(linhas()[1].textContent).toContain('NC-2026-0008');
    expect(botaoDecidir(linhas()[1])).toBeUndefined();
  });

  test('(6) NC cancelada também não ganha botão — encerrada é encerrada (RN-06)', async () => {
    ncDoBanco = [{
      ...NC_ABERTA, id: 9, numero: 'NC-2026-0009', status: 'CANCELADA',
      motivo_cancelamento: 'Divergencia corrigida na reconferencia', cancelado_em: '2026-09-27 16:00:00',
    }];
    await renderizar();
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0].textContent).toContain('NC-2026-0009');   // positiva
    expect(botaoDecidir(linhas()[0])).toBeUndefined();           // negativa
  });
});

describe('NaoConformidadesAlmoxarifado — modal de decisão', () => {
  async function abrirModalDaAberta() {
    await renderizar();
    await clicar(botaoDecidir(linhas()[0]));
  }

  test('(7) justificativa vazia NÃO manda o POST — e o modal continua aberto para corrigir', async () => {
    await abrirModalDaAberta();
    // Positiva: o modal está aberto e a decisão foi escolhida — só a justificativa falta.
    expect(container.querySelector('.almox-modal')).not.toBeNull();
    preencher(campoPorLabel('Decisão'), 'DEVOLVER');
    expect(campoPorLabel('Decisão').value).toBe('DEVOLVER');
    preencher(campoPorLabel('Justificativa'), '    ');   // só espaços
    await clicarBotaoModal('Registrar decisão');
    // Negativa: nada saiu. Sem a metade positiva acima, isto passaria com o modal fechado.
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Justificativa é obrigatória para decidir a não conformidade');
    expect(container.querySelector('.almox-modal')).not.toBeNull();
  });

  test('(8) decisão vazia também não manda o POST, mesmo com justificativa preenchida', async () => {
    // Isola a regra da DECISÃO da regra da JUSTIFICATIVA: sem preencher a justificativa, os dois
    // guardas bloqueariam o mesmo clique e um bug no primeiro passaria despercebido (foi o que o
    // controle positivo pegou no molde irmão, InspecoesAlmoxarifado.test.js:187).
    await abrirModalDaAberta();
    preencher(campoPorLabel('Justificativa'), 'material fora de especificacao');
    expect(campoPorLabel('Justificativa').value).toBe('material fora de especificacao');
    await clicarBotaoModal('Registrar decisão');
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Escolha a decisão');
  });

  test('(9) com os dois preenchidos, o POST leva `decisao` e `justificativa` para o id certo', async () => {
    await abrirModalDaAberta();
    preencher(campoPorLabel('Decisão'), 'ACEITAR_SOB_DESVIO');
    preencher(campoPorLabel('Justificativa'), '  falta de 8 pecas aceita, saldo do pedido segue em aberto  ');
    await clicarBotaoModal('Registrar decisão');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/nao-conformidades/7/decidir', {
      decisao: 'ACEITAR_SOB_DESVIO',
      justificativa: 'falta de 8 pecas aceita, saldo do pedido segue em aberto',
    });
    // Decidida, a lista recarrega: sem isso a NC continuaria ABERTA na tela até um F5.
    expect(chamadasLista().length).toBeGreaterThanOrEqual(2);
  });

  test('(10) o select oferece os SEIS valores do enum, com os rótulos em português', async () => {
    await abrirModalDaAberta();
    const valores = [...campoPorLabel('Decisão').querySelectorAll('option')]
      .map((o) => o.value).filter(Boolean);
    expect(valores).toEqual([
      'ACEITAR', 'ACEITAR_SOB_DESVIO', 'DEVOLVER', 'SUBSTITUICAO', 'ANALISE_ENGENHARIA', 'SUCATEAR',
    ]);
    expect(container.querySelector('.almox-modal').textContent).toContain('Análise da Engenharia');
  });

  test('(11) recusa do servidor vai literal ao toast e o modal continua aberto', async () => {
    await abrirModalDaAberta();
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Esta não conformidade já foi encerrada' } } });
    preencher(campoPorLabel('Decisão'), 'ACEITAR');
    preencher(campoPorLabel('Justificativa'), 'aceito');
    await clicarBotaoModal('Registrar decisão');
    expect(toast.error).toHaveBeenCalledWith('Esta não conformidade já foi encerrada');
    expect(container.querySelector('.almox-modal')).not.toBeNull();
  });

  // A tradução de 403 de PERFIL mora AQUI, e não na carga da lista: o `requirePermission(
  // 'decidir_nao_conformidade')` está só no POST (`extended.js:1097`), e é dele que sai o corpo
  // com `acao` e `perfil` (`permissions.js:229`). É o 403 que ALMOXARIFE e COMPRAS recebem — os
  // dois abrem a tela e o documento, e não decidem (D8).
  test('(16) 403 de perfil no POST vira a frase traduzida, com a ação e o perfil por extenso', async () => {
    await abrirModalDaAberta();
    api.post.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { error: 'Sem permissão para esta operação', acao: 'decidir_nao_conformidade', perfil: 'COMPRAS' },
      },
    });
    preencher(campoPorLabel('Decisão'), 'DEVOLVER');
    preencher(campoPorLabel('Justificativa'), 'material fora de especificacao');
    await clicarBotaoModal('Registrar decisão');
    expect(toast.error).toHaveBeenCalledWith(
      'Sem permissão para decidir não conformidade — seu perfil é Compras. Solicite acesso a um administrador.',
    );
    // O modal fica aberto: a recusa é de perfil, não do que foi digitado.
    expect(container.querySelector('.almox-modal')).not.toBeNull();
  });

  // Achado 11 da revisão adversarial: com o filtro em "Abertas" (o padrão), a NC recém decidida
  // deixava de casar o filtro e a linha SUMIA junto com o toast — a pessoa decidia e a tabela
  // ficava vazia. Num documento cujo valor é justamente FICAR, isso é o pior desfecho possível.
  test('(17) decidir com o filtro em "Abertas" NÃO esconde a linha — a recarga larga o status', async () => {
    // O mock passa a respeitar o filtro, como o serviço faz. Sem isto o cenário provaria NADA:
    // a lista voltaria igual com ou sem `status` na query, e a sabotagem ficaria verde.
    api.get.mockImplementation((url, config) => {
      if (url === '/almoxarifado/nao-conformidades') {
        const status = config?.params?.status;
        const itens = status ? ncDoBanco.filter((nc) => nc.status === status) : ncDoBanco;
        return Promise.resolve({ data: { itens } });
      }
      if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    // Ponto de partida: o filtro padrão é "Abertas" e só a NC 7 casa.
    expect(chamadasLista()[0][1].params).toEqual({ limite: 200, status: 'ABERTA' });
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0].textContent).toContain('NC-2026-0007');

    await clicar(botaoDecidir(linhas()[0]));
    preencher(campoPorLabel('Decisão'), 'ACEITAR');
    preencher(campoPorLabel('Justificativa'), 'falta de 8 pecas aceita');
    // O servidor gravou: a NC 7 não é mais ABERTA.
    ncDoBanco = ncDoBanco.map((nc) => (nc.id === 7 ? {
      ...nc, status: 'DECIDIDA', decisao: 'ACEITAR',
      justificativa: 'falta de 8 pecas aceita',
      decidido_por_nome: 'Ana Souza', decidido_em: '2026-09-28 09:00:00',
    } : nc));
    await clicarBotaoModal('Registrar decisão');
    await act(async () => {});

    expect(api.post).toHaveBeenCalled();
    // A metade positiva, e é ela que carrega o cenário: a recarga saiu SEM `status`.
    const ultima = chamadasLista()[chamadasLista().length - 1][1].params;
    expect(ultima).toEqual({ limite: 200 });
    expect(filtroStatus().value).toBe('');
    // E o desfecho que o usuário vê: a linha decidida continua na tela, com a decisão gravada.
    expect(linhas().length).toBeGreaterThanOrEqual(1);
    expect(container.textContent).toContain('NC-2026-0007');
    expect(container.textContent).toContain('Aceitar');
    expect(container.querySelector('.almox-empty')).toBeNull();
  });
});

describe('NaoConformidadesAlmoxarifado — falha de carga', () => {
  test('(12) falha mostra o painel de erro e NÃO deixa a lista velha na tela', async () => {
    await renderizar();
    // Positiva: a lista carregou de verdade antes da falha — sem isto, o "sumiu" abaixo seria
    // verdade trivial (nunca houve lista) e o cenário provaria nada.
    expect(linhas()).toHaveLength(2);
    expect(container.textContent).toContain('NC-2026-0007');

    falharCarga = { response: { status: 500, data: { error: 'Banco indisponivel' } } };
    await clicar([...container.querySelectorAll('.almox-header-actions button')]
      .find((b) => b.textContent.includes('Atualizar')));

    // A negativa PRIMEIRO, de propósito: é a que a Etapa 35 pagou, e é a que uma sabotagem do
    // `catch` (só `toast.error`, como a tela irmã da Etapa 5 ainda faz) tem de derrubar NOMEANDO
    // a lista velha — não o painel. Nem a lista anterior, nem o estado vazio (que seria a tela
    // AFIRMANDO que não há não conformidade quando na verdade ela não sabe).
    expect(linhas()).toHaveLength(0);
    expect(container.textContent).not.toContain('NC-2026-0007');
    expect(container.querySelector('.almox-empty')).toBeNull();
    expect(container.querySelector('[data-testid="nc-erro-carga"]')).not.toBeNull();
    expect(container.textContent).toContain('Banco indisponivel');
  });

  // ⚠️ Este cenário media um 403 que NÃO EXISTE nesta rota (achado 5 da revisão adversarial):
  // injetava `{ acao, perfil }` na carga da LISTA. Mas `GET /api/almoxarifado/nao-conformidades`
  // (`routes/almoxarifado/extended.js:1073`) é só `auth` — não tem `requirePermission`. O único
  // 403 alcançável ali é o de MÓDULO, do `app.use('/api/almoxarifado', ...)`
  // (`routes/almoxarifado.js:282-285` → `index.js:2933`), cujo corpo é
  // `{ error: 'Acesso negado ao módulo', modulo: 'almoxarifado' }` — sem `acao` e sem `perfil`.
  // A tradução de 403 de PERFIL continua testada, no lugar onde ela de fato acontece: o POST de
  // decidir, cenário (16). ⚠️ Esta referência dizia "cenário (15)" e ficou ERRADA quando a Etapa
  // 44 acrescentou três cenários reusando os números (15)-(17); apontava para dois testes, e
  // nenhum deles era o do 403. Os novos foram renumerados para (18)-(20) e esta linha, corrigida.

  test('(13) 403 de MÓDULO na carga vira o painel de erro, não "nenhuma não conformidade"', async () => {
    falharCarga = {
      response: { status: 403, data: { error: 'Acesso negado ao módulo', modulo: 'almoxarifado' } },
    };
    await renderizar();
    const painel = container.querySelector('[data-testid="nc-erro-carga"]');
    expect(painel).not.toBeNull();
    // `formatarErroPermissao` devolve null sem `acao`/`perfil`, então o que aparece é o `error`
    // literal do servidor — e NÃO a frase de perfil, que aqui seria invenção da tela.
    expect(painel.textContent).toContain('Acesso negado ao módulo');
    expect(painel.textContent).not.toContain('seu perfil é');
    // E a negativa que é a razão do cenário: nada de "não há não conformidade".
    expect(container.querySelector('.almox-empty')).toBeNull();
    expect(linhas()).toHaveLength(0);
  });
});

describe('NaoConformidadesAlmoxarifado — anexos do documento', () => {
  test('(14) expandir a linha monta o bloco de anexos com a entidade `nao_conformidade` e o id da NC', async () => {
    await renderizar();
    const detalhes = [...linhas()[0].querySelectorAll('.almox-btn-icon')]
      .find((b) => b.getAttribute('title')?.includes('Detalhes'));
    await clicar(detalhes);
    expect(container.querySelector('[data-testid="nc-detalhe-7"]')).not.toBeNull();
    const chamadaAnexos = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/anexos');
    expect(chamadaAnexos).toHaveLength(1);
    // A entidade é contrato congelado do plano. O mapa do servidor
    // (`anexoService.ENTIDADES_ANEXO`) a recebe pela T4 — até lá o GET responde 400 "Entidade
    // inválida para anexo", que o próprio AnexosDocumento mostra à vista. Inventar outra
    // entidade aqui para "funcionar" seria pendurar o anexo no registro errado.
    expect(chamadaAnexos[0][1]).toEqual({ params: { entidade: 'nao_conformidade', entidade_id: 7 } });
    // E a descrição congelada do fato aparece no painel.
    expect(container.querySelector('[data-testid="nc-detalhe-7"]').textContent)
      .toContain('Faltaram 8 pecas na conferencia');
  });
});

/**
 * Etapa 44, T3 — A TELA DIZ O QUE ACONTECEU COM O SALDO.
 *
 * Por que estes cenários existem: até a Etapa 44, decidir "aceito sob desvio" e decidir "devolver"
 * produziam o MESMO feedback na tela — a linha virava DECIDIDA e pronto. Uma das duas liberava
 * material bloqueado e a outra não, e quem clicava não tinha como saber. Foi esse silêncio que
 * virou o furo C57.
 *
 * A mensagem vem PRONTA do servidor (contrato congelado na seção 5 do design da etapa). Estes
 * cenários provam que a tela a RETRANSMITE — e que ela não inventa nada quando o campo não vem.
 */
describe('NaoConformidadesAlmoxarifado — o efeito da decisão no saldo', () => {
  async function decidirCom(liberacao) {
    api.post.mockResolvedValueOnce({ data: { id: 7, status: 'DECIDIDA', ...(liberacao ? { liberacao } : {}) } });
    await renderizar();
    await clicar(botaoDecidir(linhas()[0]));
    preencher(campoPorLabel('Decisão'), 'ACEITAR_SOB_DESVIO');
    preencher(campoPorLabel('Justificativa'), 'laudo da engenharia anexo');
    await clicarBotaoModal('Registrar decisão');
  }

  test('(18) LIBERADA: o toast diz quanto saiu do bloqueio, com a literal do servidor', async () => {
    await decidirCom({ efeito: 'LIBERADA', quantidade: 3, material_id: 12, mensagem: '3 liberado(s) do bloqueio' });
    expect(toast.success).toHaveBeenCalledWith('Não conformidade NC-2026-0007 decidida! 3 liberado(s) do bloqueio');
  });

  test('(19) os outros três efeitos também aparecem — NENHUMA não pode virar silêncio', async () => {
    // O ponto do cenário: `NENHUMA` é uma INFORMAÇÃO ("esta decisão não altera o saldo"), não a
    // ausência de informação. Se a tela só falasse no caso que libera, o usuário voltaria a não
    // distinguir "não mexeu" de "não avisou" — que é o C57 renascendo pela metade.
    const casos = [
      ['NENHUMA', 'Esta decisão não altera o saldo'],
      ['JA_LIBERADA', 'O material desta inspeção já havia sido liberado'],
      ['SEM_BLOQUEIO', 'Não conformidade aberta manualmente não libera saldo'],
    ];
    for (const [efeito, mensagem] of casos) {
      jest.clearAllMocks();
      await decidirCom({ efeito, quantidade: null, material_id: null, mensagem });
      expect(toast.success).toHaveBeenCalledWith(`Não conformidade NC-2026-0007 decidida! ${mensagem}`);
    }
  });

  test('(20) resposta SEM o campo `liberacao` não mostra `undefined` — e o toast continua saindo', async () => {
    // Servidor anterior a esta versão, ou resposta truncada: concatenar `undefined` mostraria
    // "decidida! undefined" no lugar do aviso, que é pior que não avisar nada.
    await decidirCom(null);
    expect(toast.success).toHaveBeenCalledWith('Não conformidade NC-2026-0007 decidida!');
    const dito = toast.success.mock.calls.map(([m]) => m).join(' | ');
    expect(dito).not.toContain('undefined');
  });
});

/**
 * Etapa 44, fix-round — O TEXTO DO MODAL, que a revisão adversarial pegou.
 *
 * Achado CRITICAL, e o modo de falha vale escrever: a Etapa 44 corrigiu o comentário de cabeçalho
 * do componente (que afirmava "não move estoque") e **deixou intacto o parágrafo visível dentro do
 * modal**, que dizia *"O material reprovado continua bloqueado até alguém com ajustar_estoque
 * desbloqueá-lo"* — o enunciado literal do furo que a etapa fechou, exibido na tela no passo do
 * roteiro em que o apresentador afirma que ele foi resolvido.
 *
 * Comentário de código corrigido não corrige a tela. Este cenário prende a frase.
 */
describe('NaoConformidadesAlmoxarifado — o aviso do modal acompanha a regra', () => {
  test('(21) o modal diz que aceitar libera, e NÃO afirma mais que o material continua bloqueado', async () => {
    await renderizar();
    await clicar(botaoDecidir(linhas()[0]));
    const modal = container.querySelector('.almox-modal');
    expect(modal).not.toBeNull();
    const texto = modal.textContent;

    // A metade POSITIVA: o modal explica o efeito das duas decisões de aceitação.
    expect(texto).toContain('Aceitar sob desvio');
    expect(texto).toContain('liberam o material');
    expect(texto).toContain('não mexem no saldo');

    // E a negativa, que é o achado: a frase antiga não pode voltar, em nenhuma das formas em que
    // ela já apareceu.
    expect(texto).not.toContain('continua bloqueado');
    expect(texto).not.toContain('ajustar_estoque');
  });
});

/**
 * Etapa 45, T4 — INTENÇÃO E FATO SÃO DUAS COISAS, E A TELA TEM DE MOSTRAR AS DUAS.
 *
 * Até aqui, uma NC decidida `DEVOLVER` há três semanas e uma decidida há cinco minutos eram a
 * MESMA linha na tabela: "Decidida · Devolver ao fornecedor". A pergunta que o módulo existe para
 * responder — *o material já voltou ao fornecedor?* — não tinha resposta na tela, e quem quisesse
 * saber teria de perguntar a Compras por e-mail.
 *
 * O que estes cenários protegem:
 *
 * - a coluna **Execução** distingue os QUATRO casos, e o quarto é o vazio: NC ainda não decidida
 *   não tem execução pendente. Igualar vazio a "pendente" inflaria a fila de Compras com
 *   documento que ninguém decidiu;
 * - o filtro **Pendentes de execução** manda `?execucao=PENDENTE` **e** acerta o status junto —
 *   o servidor soma `AND status = 'DECIDIDA'` a esse filtro, então a combinação com o padrão
 *   "Abertas" devolveria lista vazia SEMPRE, e a tela afirmaria "não há nada pendente" sem ter
 *   medido nada (é a regra 2 do cabeçalho entrando pela porta do filtro);
 * - o botão só aparece onde a rota pode dizer sim, e some para quem não tem a ação — este é o
 *   único botão desta tela que some por PERFIL, porque a plateia dele (COMPRAS) não é a de quem
 *   decide (QUALIDADE);
 * - o toast repete a literal de `execucao.mensagem` do servidor. Ela carrega os desfechos que NÃO
 *   movem saldo e mesmo assim registram execução ("O material já havia saído do bloqueio…"), que
 *   é a informação que ninguém consegue deduzir da tela.
 */
describe('NaoConformidadesAlmoxarifado — o estado de execução do encaminhamento', () => {
  test('(22) a coluna Execução distingue pendente, executada (com autor e data) e não se aplica — e o vazio da NC não decidida', async () => {
    ncDoBanco = [NC_ABERTA, NC_DECIDIDA, NC_A_EXECUTAR, NC_EXECUTADA];
    await renderizar();
    // A metade positiva que carrega o cenário: a coluna existe no cabeçalho e as quatro linhas
    // vieram. Sem isto, "a célula não diz Pendente" passaria com a tabela vazia.
    expect([...container.querySelectorAll('.almox-table thead th')].map((t) => t.textContent))
      .toEqual(['Número', 'Material', 'Origem', 'Tipo', 'O fato', 'Status', 'Decisão', 'Execução', 'Ações']);
    expect(linhas()).toHaveLength(4);

    // ABERTA: não foi decidida, então não há execução — e "—" NÃO é "pendente".
    expect(linhas()[0].textContent).toContain('NC-2026-0007');
    expect(celulaExecucao(linhas()[0]).textContent).toBe('—');

    // ACEITAR_SOB_DESVIO: já se executou no clique da decisão (Etapa 44).
    expect(linhas()[1].textContent).toContain('NC-2026-0008');
    expect(celulaExecucao(linhas()[1]).textContent).toContain('Não se aplica');

    // DEVOLVER esperando alguém embalar: é a fila de Compras.
    expect(linhas()[2].textContent).toContain('NC-2026-0021');
    expect(celulaExecucao(linhas()[2]).textContent).toContain('Pendente');

    // DEVOLVER já embarcada: quem registrou e quando, que é o que o auditor pergunta.
    expect(linhas()[3].textContent).toContain('NC-2026-0022');
    const executada = celulaExecucao(linhas()[3]).textContent;
    expect(executada).toContain('Executada');
    expect(executada).toContain('Marina Prado');
    expect(executada).toContain('29/09/26');   // 08:15 UTC continua dia 29 em pt-BR (UTC-3)
    // E a negativa que é o ponto da etapa: a linha executada não diz "Pendente".
    expect(executada).not.toContain('Pendente');
  });

  test('(23) o filtro "Pendentes de execução" manda `execucao` e leva o status junto — e trocar o status larga a fila', async () => {
    await renderizar();
    // Positiva: o filtro existe e oferece os estados do servidor.
    expect([...filtroExecucao().querySelectorAll('option')].map((o) => o.value))
      .toEqual(['', 'PENDENTE', 'EXECUTADA', 'NAO_SE_APLICA']);
    expect(chamadasLista()[0][1].params).toEqual({ limite: 200, status: 'ABERTA' });

    preencher(filtroExecucao(), 'PENDENTE');
    await act(async () => {});
    // A query sai com os dois, e o status VISÍVEL acompanha. Sem esta sincronia o servidor
    // aplicaria `status='ABERTA' AND status='DECIDIDA'` e a fila de Compras seria vazia sempre.
    expect(chamadasLista()).toHaveLength(2);
    expect(chamadasLista()[1][1].params).toEqual({ limite: 200, status: 'DECIDIDA', execucao: 'PENDENTE' });
    expect(filtroStatus().value).toBe('DECIDIDA');

    // E o caminho de volta: pedir "Abertas" desfaz a fila em vez de deixar a combinação impossível.
    preencher(filtroStatus(), 'ABERTA');
    await act(async () => {});
    expect(chamadasLista()).toHaveLength(3);
    expect(chamadasLista()[2][1].params).toEqual({ limite: 200, status: 'ABERTA' });
    expect(filtroExecucao().value).toBe('');
  });

  test('(24) o botão "Registrar execução" só aparece em DECIDIDA+PENDENTE — e some sem `executar_encaminhamento`', async () => {
    ncDoBanco = [NC_ABERTA, NC_DECIDIDA, NC_A_EXECUTAR, NC_EXECUTADA];
    await renderizar();
    expect(linhas()).toHaveLength(4);
    // A positiva: a pendente tem o botão.
    expect(linhas()[2].textContent).toContain('NC-2026-0021');
    expect(botaoExecutar(linhas()[2])).toBeDefined();
    // As três negativas, cada uma por uma razão diferente na rota:
    //   aberta -> 400 "só é possível registrar a execução de uma não conformidade decidida"
    //   aceitação -> 400 "esta decisão não tem execução a registrar"
    //   já executada -> 409 "a execução desta não conformidade já foi registrada"
    // Botão com erro garantido é armadilha, não gate.
    expect(botaoExecutar(linhas()[0])).toBeUndefined();
    expect(botaoExecutar(linhas()[1])).toBeUndefined();
    expect(botaoExecutar(linhas()[3])).toBeUndefined();

    // Agora sem a ação. Este é o único botão desta tela que some por PERFIL — e continua falhando
    // ABERTO, porque `pode()` devolve true enquanto as permissões não voltaram (ver o hook).
    mockPodeExecutar = false;
    await act(async () => { root.render(<MemoryRouter><NaoConformidadesAlmoxarifado /></MemoryRouter>); });
    expect(linhas()).toHaveLength(4);
    expect(botaoExecutar(linhas()[2])).toBeUndefined();
    // A metade positiva do "some": a MESMA linha continua ali, e o botão de detalhes também —
    // sem isto, o cenário passaria com a tabela sumida.
    expect(linhas()[2].textContent).toContain('NC-2026-0021');
    expect(celulaExecucao(linhas()[2]).textContent).toContain('Pendente');
    expect([...linhas()[2].querySelectorAll('.almox-btn-icon')]
      .find((b) => b.getAttribute('title')?.includes('Detalhes'))).toBeDefined();
  });
});

describe('NaoConformidadesAlmoxarifado — registrar a execução', () => {
  async function abrirExecucao() {
    ncDoBanco = [NC_A_EXECUTAR];
    await renderizar();
    await clicar(botaoExecutar(linhas()[0]));
  }

  test('(25) o POST vai para `/executar` do id certo, com as observações aparadas', async () => {
    await abrirExecucao();
    expect(container.querySelector('.almox-modal')).not.toBeNull();
    preencher(campoPorLabel('Observações'), '  NF de devolucao 9012, transportadora Rapido  ');
    await clicarBotaoModal('Registrar execução');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/nao-conformidades/21/executar', {
      observacoes: 'NF de devolucao 9012, transportadora Rapido',
    });
    // A lista recarrega: sem isso a linha continuaria "Pendente" na tela até um F5.
    expect(chamadasLista().length).toBeGreaterThanOrEqual(2);
  });

  test('(26) observação é OPCIONAL: sem texto o POST sai com corpo vazio, e sai', async () => {
    // O contrário do modal de decisão, e de propósito: aqui se declara um FATO do mundo físico
    // ("mandei de volta"). Exigir justificativa para registrar um fato só produziria "ok".
    await abrirExecucao();
    preencher(campoPorLabel('Observações'), '   ');
    await clicarBotaoModal('Registrar execução');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/nao-conformidades/21/executar', {});
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('(27) o toast repete a literal de `execucao.mensagem` — os cinco efeitos, inclusive os que NÃO movem saldo', async () => {
    // O ponto: `SEM_SALDO` e `NENHUMA` NÃO são erro — a execução fica registrada, e a mensagem é
    // o único lugar que diz por que o saldo não mudou. Calar neles faria "devolvi e o estoque não
    // baixou" parecer bug silencioso, que é o furo C57 um andar acima.
    const casos = [
      ['BAIXADA', '8 devolvido(s) ao fornecedor'],
      ['JA_DEVOLVIDA', 'O material desta inspeção já havia sido devolvido'],
      ['SEM_SALDO', 'O material já havia saído do bloqueio — a execução foi registrada sem mover saldo'],
      ['NENHUMA', 'Esta execução não altera o saldo'],
      ['NENHUMA', 'Só a não conformidade aberta pela reprovação da inspeção devolve material'],
    ];
    for (const [efeito, mensagem] of casos) {
      jest.clearAllMocks();
      api.post.mockResolvedValueOnce({
        data: { id: 21, execucao: { efeito, quantidade: null, material_id: null, mensagem } },
      });
      await abrirExecucao();
      await clicarBotaoModal('Registrar execução');
      expect(toast.success).toHaveBeenCalledWith(`Execução de NC-2026-0021 registrada! ${mensagem}`);
      await act(async () => { root.unmount(); });
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }
  });

  test('(28) resposta sem o campo `execucao` não mostra `undefined` — e o toast continua saindo', async () => {
    // Servidor anterior a esta versão, ou resposta truncada. Mesma lição do cenário (20).
    api.post.mockResolvedValueOnce({ data: { id: 21, status: 'DECIDIDA' } });
    await abrirExecucao();
    await clicarBotaoModal('Registrar execução');
    expect(toast.success).toHaveBeenCalledWith('Execução de NC-2026-0021 registrada!');
    expect(toast.success.mock.calls.map(([m]) => m).join(' | ')).not.toContain('undefined');
  });

  test('(29) 409 do servidor vai LITERAL ao toast, e o modal continua aberto', async () => {
    await abrirExecucao();
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'A execução desta não conformidade já foi registrada' } },
    });
    await clicarBotaoModal('Registrar execução');
    expect(toast.error).toHaveBeenCalledWith('A execução desta não conformidade já foi registrada');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).not.toBeNull();
  });

  test('(30) 403 de perfil vira a frase traduzida — a ação nova TEM rótulo próprio', async () => {
    // `executar_encaminhamento` entrou em ACAO_PERFIS na T2 (servidor) e deixou
    // `permissaoErro.test.js` vermelho na suíte do CLIENT — medido no início da T4. O rótulo foi
    // acrescentado no mesmo commit desta tela; este cenário é o que prova que ele CHEGA à tela, e
    // não só ao mapa.
    await abrirExecucao();
    api.post.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { error: 'Sem permissão para esta operação', acao: 'executar_encaminhamento', perfil: 'ALMOXARIFE' },
      },
    });
    await clicarBotaoModal('Registrar execução');
    expect(toast.error).toHaveBeenCalledWith(
      'Sem permissão para registrar a execução do encaminhamento — seu perfil é Almoxarife. Solicite acesso a um administrador.',
    );
  });

  // Irmão do achado 11 da Etapa 43, no filtro novo: com a fila "Pendentes de execução" ligada, a
  // NC recém executada deixa de casar o filtro e a linha SOME junto com o toast. Quem acabou de
  // registrar quer VER o registro com o próprio nome — é a razão de o documento existir.
  test('(31) executar com a fila ligada NÃO esconde a linha — a recarga larga o `execucao=PENDENTE`', async () => {
    // O mock respeita os filtros, como o serviço faz. Sem isto o cenário provaria NADA: a lista
    // voltaria igual com ou sem `execucao` na query, e a sabotagem ficaria verde.
    ncDoBanco = [NC_A_EXECUTAR];
    api.get.mockImplementation((url, config) => {
      if (url === '/almoxarifado/nao-conformidades') {
        const { status, execucao } = config?.params || {};
        const itens = ncDoBanco.filter((nc) => (!status || nc.status === status)
          && (!execucao || (nc.execucao_estado === execucao && nc.status === 'DECIDIDA')));
        return Promise.resolve({ data: { itens } });
      }
      if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    preencher(filtroExecucao(), 'PENDENTE');
    await act(async () => {});
    expect(linhas()).toHaveLength(1);
    expect(linhas()[0].textContent).toContain('NC-2026-0021');

    await clicar(botaoExecutar(linhas()[0]));
    // O servidor gravou: a NC 21 não está mais pendente de execução.
    ncDoBanco = ncDoBanco.map((nc) => (nc.id === 21 ? {
      ...nc, execucao_estado: 'EXECUTADA', execucao_em: '2026-09-29 10:00:00',
      execucao_por_nome: 'Marina Prado',
    } : nc));
    await clicarBotaoModal('Registrar execução');
    await act(async () => {});

    expect(api.post).toHaveBeenCalled();
    // A metade positiva, e é ela que carrega o cenário: a recarga saiu SEM `execucao`.
    expect(chamadasLista()[chamadasLista().length - 1][1].params)
      .toEqual({ limite: 200, status: 'DECIDIDA' });
    expect(filtroExecucao().value).toBe('');
    // E o desfecho que o usuário vê: a linha continua na tela, agora executada.
    expect(container.textContent).toContain('NC-2026-0021');
    expect(celulaExecucao(linhas()[0]).textContent).toContain('Marina Prado');
    expect(container.querySelector('.almox-empty')).toBeNull();
  });
});

/**
 * Etapa 45 — O PARÁGRAFO DO MODAL DE DECISÃO, PELA SEGUNDA VEZ ATRÁS DA REGRA.
 *
 * O cenário (21) existe porque a Etapa 44 corrigiu o comentário de código e deixou o texto da tela
 * afirmando o contrário do que o sistema fazia. A Etapa 45 cria exatamente a mesma armadilha um
 * degrau adiante: o parágrafo dizia *"devolver não cria a devolução"*, verdade até a T3 e mentira
 * depois dela.
 *
 * ⚠️ E a redação NATURAL da correção — *"o material continua bloqueado até a execução"* — derruba
 * as duas negativas do (21), que são a proteção contra o C57 voltar. Elas continuam de pé aqui, de
 * propósito e repetidas: o texto novo tem de dizer a mesma coisa SEM essas palavras.
 */
describe('NaoConformidadesAlmoxarifado — o modal de decisão fala do segundo gesto', () => {
  test('(32) o modal diz que Devolver espera o registro da execução — sem ressuscitar a frase do C57', async () => {
    await renderizar();
    await clicar(botaoDecidir(linhas()[0]));
    const texto = container.querySelector('.almox-modal').textContent;

    // A positiva nova: a decisão que hoje TEM segundo gesto é nomeada, e o gesto também.
    expect(texto).toContain('Devolver ao fornecedor');
    expect(texto).toContain('execução');
    expect(texto).toContain('segue retido');

    // O que o (21) já guardava, repetido aqui porque é a frase que este texto quase reintroduziu.
    expect(texto).toContain('liberam o material');
    expect(texto).toContain('não mexem no saldo');
    expect(texto).not.toContain('continua bloqueado');
    expect(texto).not.toContain('ajustar_estoque');
    // E a afirmação que virou mentira na T3 não pode sobreviver em lugar nenhum da tela.
    expect(texto).not.toContain('não cria a devolução');
  });

  test('(33) o modal de execução muda o texto conforme a decisão — só DEVOLVER move saldo', async () => {
    ncDoBanco = [NC_A_EXECUTAR, { ...NC_A_EXECUTAR, id: 23, numero: 'NC-2026-0023', decisao: 'SUCATEAR' }];
    await renderizar();

    await clicar(botaoExecutar(linhas()[0]));
    const devolver = container.querySelector('.almox-modal').textContent;
    expect(devolver).toContain('Registrar execução de NC-2026-0021');
    expect(devolver).toContain('Devolver ao fornecedor');
    expect(devolver).toContain('dá a baixa no estoque');
    await clicarBotaoModal('Cancelar');

    // E o sucateamento: mesmo botão, texto OPOSTO. Dizer a mesma frase nos dois faria "registrei a
    // execução do sucateamento" parecer que o estoque baixou.
    await clicar(botaoExecutar(linhas()[1]));
    const sucatear = container.querySelector('.almox-modal').textContent;
    expect(sucatear).toContain('Registrar execução de NC-2026-0023');
    expect(sucatear).toContain('não movimenta estoque');
    expect(sucatear).not.toContain('dá a baixa no estoque');
  });
});

/**
 * Etapa 46, T4 — A SAÍDA DO DOCUMENTO PRESO, NA TELA.
 *
 * O problema que a etapa resolve: um documento decidido `DEVOLVER` em material com série é
 * recusado pela execução (400, e a recusa é fatal de propósito) — então ele fica DECIDIDA +
 * PENDENTE para sempre, cobrando uma execução que ninguém consegue registrar. O cancelamento é a
 * porta de saída: ele encerra a COBRANÇA sem apagar a decisão.
 *
 * O que estes cenários protegem, e cada um nasceu de um achado medido na Fase 2:
 *
 * - o botão aparece só onde a rota pode dizer sim (`ABERTA`, ou `DECIDIDA` com execução
 *   `PENDENTE`) — nas outras três combinações o servidor recusa com 409, e botão de erro garantido
 *   é armadilha, não gate;
 * - o botão SOME por perfil, como o de execução e pela mesma razão: quem não pode cancelar não
 *   deve ver um convite a uma recusa;
 * - motivo curto NÃO viaja: o servidor exige 5 caracteres (400 literal), e entregar esse 400 ao
 *   usuário quando a tela já sabe a régua é viagem perdida;
 * - **a coluna Execução não pode dizer "Pendente" na linha cancelada** (achado 5). O servidor
 *   PRESERVA `execucao_estado` ao cancelar (RN-06), então sem tratar `status` a linha ficaria com
 *   badge Cancelada ao lado de execução Pendente — contradizendo o toast que acabou de dizer que a
 *   execução deixa de ser cobrada;
 * - **os DOIS filtros são largados** (achado 8). `trocarExecucao` FORÇA o status em `DECIDIDA` ao
 *   ligar a fila, e o padrão do status é `ABERTA` — nas duas situações a NC cancelada deixa de
 *   casar o filtro e a linha SOME junto com o toast. É a TERCEIRA aparição deste padrão nesta base
 *   (achado 11 da Etapa 43, no filtro de status; T4 da Etapa 45, no filtro de execução).
 */
describe('NaoConformidadesAlmoxarifado — cancelar o documento', () => {
  async function abrirCancelamentoDa(indice) {
    await renderizar();
    await clicar(botaoCancelar(linhas()[indice]));
  }

  test('(34) o botão Cancelar aparece SÓ em DECIDIDA+PENDENTE — e em nenhum dos outros quatro', async () => {
    // ⚠️ ESTE CENÁRIO MUDOU NO FIX-ROUND DA FASE 5, e a mudança é de ESCOPO: a RN-01 (cancelar NC
    // `ABERTA`) MORREU. Duas lentes mediram, por sonda, que ela silenciava divergência VIVA — o
    // documento morria sem decisão, o item saía do cartão e o gancho não reabria. Cancelar `ABERTA`
    // agora é 409 no servidor, com a literal que ensina o caminho (decidir, ou corrigir a
    // quantidade), e a tela não oferece o botão que produziria essa recusa.
    ncDoBanco = [NC_ABERTA, NC_A_EXECUTAR, NC_DECIDIDA, NC_EXECUTADA, NC_CANCELADA_APOS_DECISAO];
    await renderizar();
    expect(linhas()).toHaveLength(5);

    // A POSITIVA — é ela que carrega o cenário: sem ela, as negativas abaixo passariam com a
    // tabela vazia (a forma de teste vazio que esta base já pagou três vezes).
    expect(linhas()[1].textContent).toContain('NC-2026-0021');   // DECIDIDA + PENDENTE
    expect(botaoCancelar(linhas()[1])).toBeDefined();

    // As QUATRO negativas, cada uma com uma recusa DIFERENTE do servidor:
    //   ABERTA                   -> 409 "Só é possível cancelar uma não conformidade já decidida…"
    //   DECIDIDA + NAO_SE_APLICA -> 409 "Esta decisão não deixou execução pendente…"
    //   DECIDIDA + EXECUTADA     -> 409 "A execução desta não conformidade já foi registrada…"
    //   CANCELADA                -> 409 "Esta não conformidade já está cancelada"
    expect(linhas()[0].textContent).toContain('NC-2026-0007');
    expect(botaoCancelar(linhas()[0])).toBeUndefined();
    expect(linhas()[2].textContent).toContain('NC-2026-0008');
    expect(botaoCancelar(linhas()[2])).toBeUndefined();
    expect(linhas()[3].textContent).toContain('NC-2026-0022');
    expect(botaoCancelar(linhas()[3])).toBeUndefined();
    expect(linhas()[4].textContent).toContain('NC-2026-0024');
    expect(botaoCancelar(linhas()[4])).toBeUndefined();
  });

  test('(35) sem `cancelar_nao_conformidade` o botão SOME — e os outros da mesma linha ficam', async () => {
    // ⚠️ Asserção negativa sobre permissão não fica vermelha na rodada TDD: `pode()` com a ação
    // inexistente já devolveria o que o mock manda. O controle positivo desta é sabotar
    // CONCEDENDO a permissão (tirar o `pode(...)` do gate) e ver este cenário cair NOMEANDO a
    // ação — foi o que se fez.
    mockPodeCancelar = false;
    ncDoBanco = [NC_ABERTA, NC_A_EXECUTAR];
    await renderizar();
    expect(linhas()).toHaveLength(2);

    // A negativa: nenhuma das duas linhas elegíveis oferece o cancelamento.
    expect(botaoCancelar(linhas()[0])).toBeUndefined();
    expect(botaoCancelar(linhas()[1])).toBeUndefined();

    // A metade POSITIVA no mesmo teste: o que ele CONTINUA vendo. Sem isto, o cenário passaria
    // com a tabela sumida — e não provaria que o gate é da AÇÃO, e não da tela toda.
    expect(linhas()[0].textContent).toContain('NC-2026-0007');
    expect(botaoDecidir(linhas()[0])).toBeDefined();
    expect(botaoDetalhes(linhas()[0])).toBeDefined();
    expect(linhas()[1].textContent).toContain('NC-2026-0021');
    expect(botaoExecutar(linhas()[1])).toBeDefined();
  });

  test('(36) motivo curto NÃO chama a API, o botão fica desabilitado e o modal continua aberto', async () => {
    // A linha 0 tem de ser a DECIDIDA+PENDENTE: depois do corte de escopo do fix-round, a
    // `ABERTA` (o padrao do `beforeEach`) nao tem botao de cancelar.
    ncDoBanco = [NC_A_EXECUTAR];
    await abrirCancelamentoDa(0);
    // Positiva: o modal abriu no documento certo e o campo existe.
    expect(container.querySelector('.almox-modal')).not.toBeNull();
    expect(container.querySelector('.almox-modal').textContent).toContain('Cancelar NC-2026-0021');
    expect(campoPorLabel('Motivo')).not.toBeNull();

    // ⚠️ A ORDEM DAS ASSERÇÕES AQUI É DE PROPÓSITO, e foi corrigida no controle positivo: com as
    // asserções de `disabled` antes desta, o jest parava nelas e a de "não chamou a API" NUNCA
    // chegava a ser executada numa sabotagem — ela guardaria o achado no papel e não na prática.
    // A tentativa de POST com motivo curto vem PRIMEIRO.
    preencher(campoPorLabel('Motivo'), 'erro');   // quatro caracteres; a régua é `>= 5`
    expect(campoPorLabel('Motivo').value).toBe('erro');
    await clicarBotaoModal('Cancelar documento');
    expect(api.post).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).not.toBeNull();

    // E o motivo de a API não ter sido chamada: o botão está desabilitado. O 400 do servidor
    // (`O motivo do cancelamento deve ter pelo menos 5 caracteres`) é evitável, e entregá-lo
    // seria a tela sabendo a régua e não a aplicando.
    expect(botaoModal('Cancelar documento').disabled).toBe(true);

    // Vazio também nasce desabilitado.
    preencher(campoPorLabel('Motivo'), '');
    expect(botaoModal('Cancelar documento').disabled).toBe(true);

    // Seis espaços: `trim()` derruba — a mesma régua do servidor, que apara antes de contar.
    preencher(campoPorLabel('Motivo'), '      ');
    expect(botaoModal('Cancelar documento').disabled).toBe(true);

    // E a virada: cinco caracteres soltam o botão. Sem esta metade, "fica desabilitado" passaria
    // com um botão desabilitado para sempre.
    preencher(campoPorLabel('Motivo'), 'duplicada da NC-2026-0003');
    expect(botaoModal('Cancelar documento').disabled).toBe(false);
  });

  test('(37) o POST vai para `/cancelar` do id certo, com `{ motivo }` aparado', async () => {
    ncDoBanco = [NC_A_EXECUTAR];
    await renderizar();
    await clicar(botaoCancelar(linhas()[0]));
    preencher(campoPorLabel('Motivo'), '  material serializado, devolucao tratada por RMA  ');
    await clicarBotaoModal('Cancelar documento');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/nao-conformidades/21/cancelar', {
      motivo: 'material serializado, devolucao tratada por RMA',
    });
    // A lista recarrega: sem isso a linha continuaria DECIDIDA na tela até um F5.
    expect(chamadasLista().length).toBeGreaterThanOrEqual(2);
  });

  test('(38) o toast concatena a literal de `cancelamento.mensagem` — as duas, e sem `undefined`', async () => {
    // A mensagem vem PRONTA do servidor, como em `liberacao` (Etapa 44) e `execucao` (Etapa 45):
    // qual era o estado anterior e o que deixou de ser cobrado é régua do serviço, e uma segunda
    // cópia dela aqui divergiria no dia em que a primeira mudasse.
    const casos = [
      ['ABERTA', 'Documento cancelado — ele não estava decidido, e nada foi executado'],
      ['DECIDIDA', 'Documento cancelado — a decisão fica registrada, e a execução deixa de ser cobrada'],
    ];
    for (const [estadoAnterior, mensagem] of casos) {
      jest.clearAllMocks();
      api.post.mockResolvedValueOnce({
        data: {
          id: 21,
          status: 'CANCELADA',
          cancelamento: { estado_anterior: estadoAnterior, execucao_estado_anterior: 'PENDENTE', mensagem },
        },
      });
      ncDoBanco = [NC_A_EXECUTAR];
      await renderizar();
      await clicar(botaoCancelar(linhas()[0]));
      preencher(campoPorLabel('Motivo'), 'duplicada da NC-2026-0003');
      await clicarBotaoModal('Cancelar documento');
      expect(toast.success).toHaveBeenCalledWith(`Não conformidade NC-2026-0021 cancelada! ${mensagem}`);
      await act(async () => { root.unmount(); });
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);
    }

    // E o servidor anterior a esta versão, ou a resposta truncada: "cancelada! undefined" é pior
    // que não avisar nada (mesma lição dos cenários (20) e (28)).
    jest.clearAllMocks();
    api.post.mockResolvedValueOnce({ data: { id: 21, status: 'CANCELADA' } });
    ncDoBanco = [NC_A_EXECUTAR];
    await renderizar();
    await clicar(botaoCancelar(linhas()[0]));
    preencher(campoPorLabel('Motivo'), 'duplicada da NC-2026-0003');
    await clicarBotaoModal('Cancelar documento');
    expect(toast.success).toHaveBeenCalledWith('Não conformidade NC-2026-0021 cancelada!');
    expect(toast.success.mock.calls.map(([m]) => m).join(' | ')).not.toContain('undefined');
  });

  // 🔴 Achado 5 da Fase 2. O servidor preserva `execucao_estado = 'PENDENTE'` na linha cancelada
  // de propósito (RN-06: quem exclui a cancelada da fila é o `status`), então a coluna Execução
  // TEM de olhar o `status` — senão ela contradiz o toast que acabou de dizer que a execução
  // deixa de ser cobrada, na mesma tela e no mesmo segundo.
  test('(39) a linha CANCELADA não diz "Pendente" na coluna Execução — e a decidida ao lado diz', async () => {
    ncDoBanco = [NC_A_EXECUTAR, NC_CANCELADA_APOS_DECISAO];
    await renderizar();
    expect(linhas()).toHaveLength(2);

    // A metade POSITIVA, e ela é dupla: a linha que DEVE cobrar continua cobrando (senão o
    // conserto teria apagado a fila de Compras inteira), e a cancelada carrega, sim,
    // `execucao_estado = 'PENDENTE'` no dado — é a tela que não o mostra.
    expect(linhas()[0].textContent).toContain('NC-2026-0021');
    expect(celulaExecucao(linhas()[0]).textContent).toContain('Pendente');
    expect(NC_CANCELADA_APOS_DECISAO.execucao_estado).toBe('PENDENTE');

    // A negativa que é o achado.
    expect(linhas()[1].textContent).toContain('NC-2026-0024');
    expect(linhas()[1].textContent).toContain('Cancelada');            // o badge de status fica
    expect(celulaExecucao(linhas()[1]).textContent).not.toContain('Pendente');
    // E o que a célula diz no lugar: ela ECOA o toast ("a execução deixa de ser cobrada") em vez
    // de deixar a célula igual à da NC nunca decidida — ver o comentário da coluna no componente.
    expect(celulaExecucao(linhas()[1]).textContent).toContain('cobrada');

  });


  test('(39b) a CANCELADA que nunca foi decidida mostra `—`, não "Deixou de ser cobrada"', async () => {
    // ⚠️ NASCEU DO FIX-ROUND DA FASE 5, e sem ele o conserto do (39) ficava largo: uma lente mediu
    // que a célula dizia "Deixou de ser cobrada" TAMBÉM na NC cancelada que NUNCA foi decidida — o
    // cancelamento AUTOMÁTICO da reconferência, que deixa `execucao_estado` NULL. Ali não havia
    // cobrança nenhuma para deixar de existir, e antes desta etapa a célula mostrava `—`. É para
    // lá que ela volta. O `(39)` sozinho passava verde com a contradição viva.
    ncDoBanco = [NC_A_EXECUTAR, {
      ...NC_ABERTA, id: 26, numero: 'NC-2026-0026', status: 'CANCELADA',
      cancelado_em: '2026-09-30 11:00:00', motivo_cancelamento: 'Divergência corrigida na reconferência',
      execucao_estado: null, cancelado_por_id: null, cancelado_por_nome: null,
    }];
    await renderizar();
    expect(linhas()).toHaveLength(2);

    // Metade POSITIVA: a linha que cobra continua cobrando.
    expect(linhas()[0].textContent).toContain('NC-2026-0021');
    expect(celulaExecucao(linhas()[0]).textContent).toContain('Pendente');

    // A negativa, que é o achado.
    expect(linhas()[1].textContent).toContain('NC-2026-0026');
    expect(linhas()[1].textContent).toContain('Cancelada');            // o badge de status fica
    expect(celulaExecucao(linhas()[1]).textContent).not.toContain('cobrada');
    expect(celulaExecucao(linhas()[1]).textContent).not.toContain('Pendente');
    expect(celulaExecucao(linhas()[1]).textContent.trim()).toBe('—');
  });
  // 🔴 Achado 8 da Fase 2, e a TERCEIRA aparição deste padrão nesta base.
  test('(40) cancelar com a fila ligada larga OS DOIS filtros — a linha não some junto com o toast', async () => {
    // O mock respeita os filtros, como o serviço faz. Sem isto o cenário provaria NADA: a lista
    // voltaria igual com ou sem filtro na query, e a sabotagem ficaria verde.
    ncDoBanco = [NC_A_EXECUTAR];
    api.get.mockImplementation((url, config) => {
      if (url === '/almoxarifado/nao-conformidades') {
        const { status, execucao } = config?.params || {};
        const itens = ncDoBanco.filter((nc) => (!status || nc.status === status)
          && (!execucao || (nc.execucao_estado === execucao && nc.status === 'DECIDIDA')));
        return Promise.resolve({ data: { itens } });
      }
      if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    preencher(filtroExecucao(), 'PENDENTE');
    await act(async () => {});
    // Ponto de partida: a fila ligada FORÇA o status em DECIDIDA (`trocarExecucao`), e é por isso
    // que largar só o filtro de execução não devolveria a linha — a cancelada não casa DECIDIDA.
    expect(filtroStatus().value).toBe('DECIDIDA');
    expect(linhas()).toHaveLength(1);

    await clicar(botaoCancelar(linhas()[0]));
    preencher(campoPorLabel('Motivo'), 'material serializado, devolucao tratada por RMA');
    // O servidor gravou: a NC 21 está CANCELADA, com o `PENDENTE` conservado (RN-06).
    ncDoBanco = ncDoBanco.map((nc) => (nc.id === 21 ? {
      ...nc, status: 'CANCELADA', cancelado_em: '2026-09-30 09:00:00',
      motivo_cancelamento: 'material serializado, devolucao tratada por RMA',
    } : nc));
    await clicarBotaoModal('Cancelar documento');
    await act(async () => {});

    expect(api.post).toHaveBeenCalled();
    // A metade positiva que carrega o cenário: a recarga saiu sem status E sem execução.
    expect(chamadasLista()[chamadasLista().length - 1][1].params).toEqual({ limite: 200 });
    expect(filtroExecucao().value).toBe('');
    expect(filtroStatus().value).toBe('');
    // E o desfecho que o usuário vê: a linha continua na tela, agora cancelada.
    expect(linhas()).toHaveLength(1);
    expect(container.textContent).toContain('NC-2026-0021');
    expect(linhas()[0].textContent).toContain('Cancelada');
    expect(container.querySelector('.almox-empty')).toBeNull();
  });

  test('(41) o motivo NÃO vaza de um documento para o outro — o campo nasce vazio a cada abertura', async () => {
    // ⚠️ ESTE CENÁRIO SUBSTITUIU o antigo (41) ("cancelar uma ABERTA com o filtro padrão também
    // larga o status"), que morreu com o corte de escopo: cancelar `ABERTA` deixou de existir.
    //
    // E ele vem de um achado de lente da Fase 5, provado por execução: removendo o reset do campo,
    // os 43 cenários continuavam VERDES. O defeito é alcançável e caro — abrir o modal da NC A,
    // digitar o motivo, clicar Voltar, abrir o modal da NC B: o campo vem pré-preenchido com o
    // motivo de A, JÁ com 5+ caracteres, logo com o botão HABILITADO. Um clique cancela a NC B
    // com o motivo de outra NC, e o motivo é o único registro de POR QUE o documento morreu.
    ncDoBanco = [NC_A_EXECUTAR, { ...NC_A_EXECUTAR, id: 25, numero: 'NC-2026-0025' }];
    await renderizar();
    expect(linhas()).toHaveLength(2);

    await clicar(botaoCancelar(linhas()[0]));
    expect(container.querySelector('.almox-modal').textContent).toContain('Cancelar NC-2026-0021');
    preencher(campoPorLabel('Motivo'), 'motivo que pertence SO a NC-2026-0021');
    expect(campoPorLabel('Motivo').value).toBe('motivo que pertence SO a NC-2026-0021');
    await clicarBotaoModal('Voltar');
    expect(container.querySelector('.almox-modal')).toBeNull();

    // O SEGUNDO documento: o campo tem de nascer vazio, e o botão desabilitado com ele.
    await clicar(botaoCancelar(linhas()[1]));
    expect(container.querySelector('.almox-modal').textContent).toContain('Cancelar NC-2026-0025');
    expect(campoPorLabel('Motivo').value).toBe('');
    expect(botaoModal('Cancelar documento').disabled).toBe(true);

    // E a metade POSITIVA: com motivo próprio, o POST vai com o motivo DESTE documento e para o id
    // DESTE documento. Sem ela o cenário passaria com um modal que não escreve nada.
    preencher(campoPorLabel('Motivo'), 'motivo proprio da NC-2026-0025');
    await clicarBotaoModal('Cancelar documento');
    await act(async () => {});
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/nao-conformidades/25/cancelar',
      { motivo: 'motivo proprio da NC-2026-0025' });
  });

  test('(42) o modal avisa que a decisão NÃO é apagada, e que o que acaba é a cobrança da execução', async () => {
    // O aviso é o único lugar onde quem clica descobre o que o cancelamento faz com a decisão —
    // e o modo de falha desta tela já é conhecido (cenários (21) e (32)): texto visível que
    // afirma o contrário da regra. Aqui a regra é a RN-06: a decisão, o autor e a data FICAM.
    ncDoBanco = [NC_A_EXECUTAR];
    await renderizar();
    await clicar(botaoCancelar(linhas()[0]));
    const texto = container.querySelector('.almox-modal').textContent;

    expect(texto).toContain('Cancelar NC-2026-0021');
    expect(texto).toContain('não apaga a decisão');
    expect(texto).toContain('quem decidiu');
    expect(texto).toContain('deixa de ser cobrada');
    // E a negativa: o modal não pode convidar a redecidir no lugar de cancelar — redecidir está
    // fora de escopo declarado (seção 8 do desenho: cancela-se e abre-se outro documento).
    expect(texto).not.toContain('decidir de novo');
  });


  test('(44) a linha cancelada diz QUEM cancelou — na coluna de STATUS, não na de Decisão', async () => {
    // ⚠️ ACHADO DO FECHAMENTO, e ele é do tipo mais traiçoeiro: o autor do cancelamento esteve na
    // coluna **Decisão** por algumas horas e era **INERTE**. Aquele ramo só é alcançado quando
    // `nc.decisao` é nulo, e depois do corte de escopo **só documento DECIDIDO cancela** — ou seja,
    // o campo entrou na projeção, o componente "mostrava" o autor, e o caminho que produz um
    // documento cancelado nunca passava por ali. Quem mediu foi o executor do guia de usuário,
    // tentando escrever o passo do roteiro: ele foi ver na tela e não achou.
    ncDoBanco = [NC_A_EXECUTAR, NC_CANCELADA_APOS_DECISAO];
    await renderizar();
    expect(linhas()).toHaveLength(2);

    const cancelada = linhas()[1];
    expect(cancelada.textContent).toContain('NC-2026-0024');
    // O badge de status continua, e o quem/quando entra ABAIXO dele.
    expect(celulaStatus(cancelada).textContent).toContain('Cancelada');
    expect(celulaStatus(cancelada).textContent).toContain('Ana Souza');
    // E a coluna Decisão continua sendo da DECISÃO — quem decidiu, não quem cancelou.
    expect(celulaDecisao(cancelada).textContent).toContain('Devolver ao fornecedor');

    // Metade POSITIVA: a linha NÃO cancelada não ganha nada na coluna de status além do badge.
    expect(celulaStatus(linhas()[0]).textContent).toContain('Decidida');
    expect(celulaStatus(linhas()[0]).textContent).not.toContain('Ana Souza');
  });
  test('(43) recusa do servidor vai LITERAL ao toast e o modal continua aberto', async () => {
    ncDoBanco = [NC_A_EXECUTAR];
    await renderizar();
    await clicar(botaoCancelar(linhas()[0]));
    api.post.mockRejectedValueOnce({
      response: {
        status: 409,
        data: { error: 'A execução desta não conformidade já foi registrada — o documento não pode ser cancelado' },
      },
    });
    preencher(campoPorLabel('Motivo'), 'duplicada da NC-2026-0003');
    await clicarBotaoModal('Cancelar documento');
    expect(toast.error).toHaveBeenCalledWith(
      'A execução desta não conformidade já foi registrada — o documento não pode ser cancelado',
    );
    expect(toast.success).not.toHaveBeenCalled();
    // Fica aberto: a recusa é do estado do documento, não do que foi digitado — e a corrida com
    // `/executar` é exatamente o caso em que a linha mudou por baixo de quem olha.
    expect(container.querySelector('.almox-modal')).not.toBeNull();
  });
});
