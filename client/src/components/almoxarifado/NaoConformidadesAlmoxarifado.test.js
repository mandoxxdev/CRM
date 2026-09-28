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
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'QUALIDADE', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
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
};

let container;
let root;
let ncDoBanco;
let falharCarga;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  ncDoBanco = [NC_ABERTA, NC_DECIDIDA];
  falharCarga = null;
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

async function clicarBotaoModal(texto) {
  const botao = [...container.querySelectorAll('.almox-modal-footer button')]
    .find((b) => b.textContent.trim() === texto);
  await clicar(botao);
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
  // decidir, cenário (15).
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

  test('(15) LIBERADA: o toast diz quanto saiu do bloqueio, com a literal do servidor', async () => {
    await decidirCom({ efeito: 'LIBERADA', quantidade: 3, material_id: 12, mensagem: '3 liberado(s) do bloqueio' });
    expect(toast.success).toHaveBeenCalledWith('Não conformidade NC-2026-0007 decidida! 3 liberado(s) do bloqueio');
  });

  test('(16) os outros três efeitos também aparecem — NENHUMA não pode virar silêncio', async () => {
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

  test('(17) resposta SEM o campo `liberacao` não mostra `undefined` — e o toast continua saindo', async () => {
    // Servidor anterior a esta versão, ou resposta truncada: concatenar `undefined` mostraria
    // "decidida! undefined" no lugar do aviso, que é pior que não avisar nada.
    await decidirCom(null);
    expect(toast.success).toHaveBeenCalledWith('Não conformidade NC-2026-0007 decidida!');
    const dito = toast.success.mock.calls.map(([m]) => m).join(' | ');
    expect(dito).not.toContain('undefined');
  });
});
