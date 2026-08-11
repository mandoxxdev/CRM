/**
 * Tela de lotes (Etapa 6 — Task 9, origem: review da Task 8).
 *
 * A Etapa 6 entregou tres rotas sem NENHUM consumidor no cliente: mudar status do lote,
 * liberar vencimento e anexar certificado. O caso critico e `controle_certificado`: o lote
 * nasce BLOQUEADO e so um POST de certificado o libera — sem esta tela, ligar a flag inutiliza
 * o material pela interface (so um desenvolvedor destrava, via API). Estes testes cobrem cada
 * acao que a tela expoe e as regras de UX que o design desta task marca como essenciais:
 * justificativa obrigatoria ANTES do servidor recusar, "liberar vencimento" so para lote
 * vencido, e vencido-com-liberacao visualmente distinto de vencido-sem.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/LotesAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LotesAlmoxarifado from './LotesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas: o alvo aqui é o comportamento da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const MATERIAL = { id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' };
const MATERIAL_2 = { id: 11, codigo: 'MAT-2', nome: 'Perfil L', unidade: 'PC' };

// Ordem de propósito NÃO ordenada por validade/elegibilidade — se a tela reordenasse (por
// validade, por elegível-primeiro como o servidor já faz), a ordem do DOM divergiria da ordem
// deste array e o teste 1 pegaria.
const LOTE_VENC_LIBERADO = {
  id: 201, codigo: 'L-VENC-LIB', status: 'ATIVO', status_motivo: null,
  data_validade: '2020-01-01', vencido: true, vencimento_liberado: true,
  vencimento_liberado_por: 7, vencimento_liberado_motivo: 'Uso emergencial aprovado pela engenharia',
  corrida: 'COR-2', fornecedor_nome: 'Fornecedor B', nota_fiscal: 'NF-2', saldo: 8, elegivel: true,
};
const LOTE_ATIVO = {
  id: 200, codigo: 'L-ATIVO', status: 'ATIVO', status_motivo: null,
  data_validade: '2030-01-01', vencido: false, vencimento_liberado: false,
  corrida: 'COR-1', fornecedor_nome: 'Fornecedor A', nota_fiscal: 'NF-1', saldo: 40, elegivel: true,
};
const LOTE_VENC_BLOQUEADO = {
  id: 202, codigo: 'L-VENC-BLOQ', status: 'ATIVO', status_motivo: null,
  data_validade: '2019-01-01', vencido: true, vencimento_liberado: false,
  corrida: 'COR-3', fornecedor_nome: 'Fornecedor C', nota_fiscal: 'NF-3', saldo: 3, elegivel: false,
};
const LOTE_REPROVADO = {
  id: 203, codigo: 'L-REPROVADO', status: 'REPROVADO', status_motivo: 'Ensaio reprovou dimensional',
  data_validade: '2029-01-01', vencido: false, vencimento_liberado: false,
  corrida: 'COR-4', fornecedor_nome: 'Fornecedor D', nota_fiscal: 'NF-4', saldo: 12, elegivel: false,
};

let container;
let root;
let lotesDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  lotesDoBanco = [LOTE_VENC_LIBERADO, LOTE_ATIVO, LOTE_VENC_BLOQUEADO, LOTE_REPROVADO];
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
    if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return Promise.resolve({ data: lotesDoBanco });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { success: true } });
  api.post.mockResolvedValue({ data: { success: true } });
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
    root.render(<MemoryRouter><LotesAlmoxarifado /></MemoryRouter>);
  });
}

/** Um "tick" de macrotarefa: garante que a cadeia de microtarefas do fetch de lotes já rodou. */
async function esperarEfeitos() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function selecionarMaterial(id = MATERIAL.id) {
  const select = container.querySelector('.almox-filters select.almox-select');
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setValue.call(select, String(id));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await esperarEfeitos();
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];

/** Clica um botão de ação da linha pelo title. */
async function clicarAcao(indiceLinha, tituloParcial) {
  const botao = [...linhas()[indiceLinha].querySelectorAll('.almox-btn-icon')]
    .find((b) => b.getAttribute('title')?.includes(tituloParcial));
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

/** Campo do modal aberto, localizado pelo texto do <label>. */
function campoPorLabel(rotulo) {
  const grupo = [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.replace('*', '').trim() === rotulo);
  return grupo.querySelector('input, textarea, select');
}

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

/** Anexa um arquivo a um <input type="file"> — não dá pra setar `.value`, então sobrescreve `.files`. */
function selecionarArquivo(elemento, arquivo) {
  Object.defineProperty(elemento, 'files', { value: [arquivo], configurable: true });
  act(() => { elemento.dispatchEvent(new Event('change', { bubbles: true })); });
}

/** Botão do rodapé do modal pelo texto. */
async function clicarBotaoModal(texto) {
  const botao = [...container.querySelectorAll('.almox-modal-footer button')]
    .find((b) => b.textContent.trim() === texto);
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

/** Troca de aba (Lotes/Séries) pelo texto do botão. */
async function clicarAba(texto) {
  const botao = [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}

describe('LotesAlmoxarifado', () => {
  test('lista os lotes do material selecionado, na ordem que a API devolveu', async () => {
    await renderizar();
    await selecionarMaterial();
    const codigos = linhas().map((tr) => tr.querySelector('td').textContent.trim());
    expect(codigos).toEqual(['L-VENC-LIB', 'L-ATIVO', 'L-VENC-BLOQ', 'L-REPROVADO']);
  });

  test('lote não elegível continua aparecendo na lista (não filtra fora)', async () => {
    await renderizar();
    await selecionarMaterial();
    expect(linhas()).toHaveLength(4);
    expect(linhas().some((tr) => tr.textContent.includes('L-REPROVADO'))).toBe(true);
  });

  test('lote vencido COM liberação aparece distinto de vencido SEM liberação', async () => {
    await renderizar();
    await selecionarMaterial();
    const linhaLiberado = linhas().find((tr) => tr.textContent.includes('L-VENC-LIB'));
    const linhaBloqueado = linhas().find((tr) => tr.textContent.includes('L-VENC-BLOQ'));
    const badgeVencido = (tr) => [...tr.querySelectorAll('.almox-badge')]
      .find((b) => /vencid/i.test(b.textContent));
    expect(badgeVencido(linhaLiberado).className).not.toBe(badgeVencido(linhaBloqueado).className);
    // O motivo/quem liberou (que a API devolve) precisa aparecer — senão o operador não entende
    // por que aquele vencido específico está liberado.
    expect(linhaLiberado.textContent).toMatch(/emergencial aprovado pela engenharia/);
  });

  test('botão de confirmar mudança de status fica desabilitado com justificativa vazia', async () => {
    await renderizar();
    await selecionarMaterial();
    await clicarAcao(1, 'Mudar status'); // linha 1 = L-ATIVO
    const confirmar = [...container.querySelectorAll('.almox-modal-footer button')]
      .find((b) => b.textContent.trim() === 'Confirmar');
    expect(confirmar.disabled).toBe(true);
    preencher(campoPorLabel('Justificativa'), 'Avaria encontrada');
    expect(confirmar.disabled).toBe(false);
  });

  test('mudar status chama PUT /lotes/:id/status com o corpo certo', async () => {
    await renderizar();
    await selecionarMaterial();
    await clicarAcao(1, 'Mudar status'); // L-ATIVO, id 200
    preencher(campoPorLabel('Novo status'), 'BLOQUEADO');
    preencher(campoPorLabel('Justificativa'), 'Avaria encontrada na prateleira');
    await clicarBotaoModal('Confirmar');
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/lotes/200/status', {
      status: 'BLOQUEADO', justificativa: 'Avaria encontrada na prateleira',
    });
  });

  test('"liberar vencimento" não é oferecido para lote não vencido', async () => {
    await renderizar();
    await selecionarMaterial();
    const linhaAtiva = linhas()[1]; // L-ATIVO, não vencido
    const botaoLiberar = [...linhaAtiva.querySelectorAll('.almox-btn-icon')]
      .find((b) => b.getAttribute('title')?.toLowerCase().includes('vencimento'));
    expect(botaoLiberar).toBeUndefined();
  });

  test('liberar vencimento chama a rota certa com a justificativa', async () => {
    await renderizar();
    await selecionarMaterial();
    await clicarAcao(2, 'Liberar vencimento'); // linha 2 = L-VENC-BLOQ, id 202
    preencher(campoPorLabel('Justificativa'), 'Uso autorizado pela engenharia');
    await clicarBotaoModal('Confirmar');
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/lotes/202/liberar-vencimento', {
      justificativa: 'Uso autorizado pela engenharia',
    });
  });

  test('anexar certificado envia multipart para a rota certa', async () => {
    await renderizar();
    await selecionarMaterial();
    await clicarAcao(1, 'Anexar certificado'); // L-ATIVO, id 200
    const arquivo = new File(['conteudo'], 'certificado.pdf', { type: 'application/pdf' });
    selecionarArquivo(campoPorLabel('Arquivo (PDF ou imagem)'), arquivo);
    await clicarBotaoModal('Anexar');

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, corpo, config] = api.post.mock.calls[0];
    expect(url).toBe('/almoxarifado/lotes/200/certificado');
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('certificado')).toBe(arquivo);
    expect(config.headers['Content-Type']).toBe('multipart/form-data');
  });

  test('lote bloqueado por falta de certificado avisa isso no modal de anexar', async () => {
    lotesDoBanco = [{
      ...LOTE_ATIVO, id: 300, codigo: 'L-SEM-CERT', status: 'BLOQUEADO',
      status_motivo: 'Certificado do fornecedor nao anexado',
    }];
    await renderizar();
    await selecionarMaterial();
    await clicarAcao(0, 'Anexar certificado');
    const modal = container.querySelector('.almox-modal').textContent;
    expect(modal).toMatch(/falta de certificado/i);
  });

  test('erro 403 da API vira mensagem legível na tela', async () => {
    const { toast } = require('react-toastify');
    api.put.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { error: 'Sem permissão para inspecionar material — seu perfil é Produção. Solicite acesso a um administrador.' },
      },
    });
    await renderizar();
    await selecionarMaterial();
    await clicarAcao(1, 'Mudar status');
    preencher(campoPorLabel('Novo status'), 'BLOQUEADO');
    preencher(campoPorLabel('Justificativa'), 'Tentativa sem perfil');
    await clicarBotaoModal('Confirmar');
    expect(toast.error).toHaveBeenCalledWith(
      'Sem permissão para inspecionar material — seu perfil é Produção. Solicite acesso a um administrador.'
    );
  });

  // Fix round 1: a tabela ignorava certificado_arquivo/certificado_em, que ja vem no SELECT l.*
  // do servidor — o operador nao distinguia "sem certificado" de "ja anexado" antes de abrir o
  // modal.
  // Review final da Etapa 6: nao basta AFIRMAR que ha certificado — ele tem de ser abrivel. Antes
  // o arquivo era gravado e nunca visualizavel: a tela so o lia como booleano.
  test('lote com certificado ja anexado oferece um link para abrir o arquivo', async () => {
    lotesDoBanco = [{
      ...LOTE_ATIVO, certificado_arquivo: 'certificado-123.pdf', certificado_em: '2026-08-01T10:00:00Z',
    }];
    await renderizar();
    await selecionarMaterial();
    expect(linhas()[0].textContent).toMatch(/anexado em/i);

    const link = linhas()[0].querySelector('a[href*="certificado-123.pdf"]');
    expect(link).toBeTruthy();
    expect(link.getAttribute('href')).toBe('/api/uploads/almoxarifado/certificado-123.pdf');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  test('lote sem certificado nao afirma ter um anexado', async () => {
    await renderizar();
    await selecionarMaterial();
    // LOTE_ATIVO (linha 1) nao tem certificado_arquivo no fixture.
    expect(linhas()[1].textContent).not.toMatch(/certificado/i);
    expect(linhas()[1].querySelector('a[href*="uploads/almoxarifado"]')).toBeNull();
  });

  // Review final da Etapa 6: `data_fabricacao` era coluna sem escritor E sem leitor. O escritor
  // e o campo "Fabricacao" do item no recebimento; este e o leitor.
  test('data de fabricacao do lote aparece na tabela', async () => {
    lotesDoBanco = [{ ...LOTE_ATIVO, data_fabricacao: '2026-02-10' }];
    await renderizar();
    await selecionarMaterial();
    expect(linhas()[0].textContent).toMatch(/Fabricado em 10\/02\/2026/);
  });

  test('lote sem data de fabricacao nao inventa a linha', async () => {
    await renderizar();
    await selecionarMaterial();
    expect(linhas()[1].textContent).not.toMatch(/Fabricado em/);
  });
});

describe('LotesAlmoxarifado — troca rapida de material nao deixa resposta atrasada pintar a lista errada', () => {
  test('resposta de um GET anterior, resolvida depois de trocar o material, e descartada', async () => {
    let resolveMaterial1;
    let resolveMaterial2;
    const promiseMaterial1 = new Promise((resolve) => { resolveMaterial1 = resolve; });
    const promiseMaterial2 = new Promise((resolve) => { resolveMaterial2 = resolve; });

    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL, MATERIAL_2] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return promiseMaterial1;
      if (url === `/almoxarifado/materiais/${MATERIAL_2.id}/lotes`) return promiseMaterial2;
      return Promise.resolve({ data: [] });
    });

    await renderizar();
    // Seleciona o material 1 (o GET dele fica pendente) e troca para o material 2 ANTES de
    // resolver — é a corrida real: usuário troca de material rápido, enquanto a primeira
    // requisição ainda está no ar.
    await selecionarMaterial(MATERIAL.id);
    await selecionarMaterial(MATERIAL_2.id);

    // Resolve a resposta do material 2 (o selecionado agora) PRIMEIRO, e só depois a do
    // material 1 (a atrasada). Se a tela não descartar a resposta velha, ela chega por ÚLTIMO e
    // sobrescreve a lista certa com o lote do material errado — é assim que o teste pega a
    // ausência do cancelamento (resolver na ordem "certa primeiro" mascararia o bug, porque a
    // última chamada de setLotes seria sempre a certa por coincidência de ordem).
    await act(async () => { resolveMaterial2({ data: [LOTE_VENC_LIBERADO] }); await Promise.resolve(); });
    await act(async () => { resolveMaterial1({ data: [LOTE_ATIVO] }); await Promise.resolve(); });

    const codigos = linhas().map((tr) => tr.querySelector('td').textContent.trim());
    expect(codigos).toEqual(['L-VENC-LIB']); // só o lote do material 2, que é o selecionado agora
  });
});

// Task 10 (Etapa 6b): aba Séries na mesma tela — rastreabilidade por número de série e
// bloqueio/desbloqueio avulso, molde do modal de status de lote acima.
const SERIE_EM_ESTOQUE = {
  id: 501, numero: 'SN-001', status: 'EM_ESTOQUE', lote_id: 200, lote_codigo: 'L-ATIVO',
  localizacao_descricao: 'Prateleira A1', updated_at: '2026-08-01T10:00:00Z',
};
const SERIE_BLOQUEADA = {
  id: 502, numero: 'SN-002', status: 'BLOQUEADA', lote_id: 200, lote_codigo: 'L-ATIVO',
  localizacao_descricao: 'Prateleira A2', updated_at: '2026-08-01T10:00:00Z',
};
const SERIE_ENTREGUE = {
  id: 503, numero: 'SN-003', status: 'ENTREGUE', lote_id: null, lote_codigo: null,
  localizacao_descricao: null, updated_at: '2026-08-01T10:00:00Z',
};

describe('LotesAlmoxarifado — aba Séries', () => {
  test('aba Series lista numero/status/lote e badge por status', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return Promise.resolve({ data: [] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/series`) {
        return Promise.resolve({ data: [SERIE_EM_ESTOQUE, SERIE_BLOQUEADA, SERIE_ENTREGUE] });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await selecionarMaterial();
    await clicarAba('Séries');

    const linhasSeries = linhas();
    expect(linhasSeries).toHaveLength(3);

    expect(linhasSeries[0].textContent).toMatch(/SN-001/);
    expect(linhasSeries[0].textContent).toMatch(/L-ATIVO/);
    expect(linhasSeries[0].querySelector('.almox-badge').className).toMatch(/almox-badge-ok/);

    expect(linhasSeries[1].querySelector('.almox-badge').className).toMatch(/almox-badge-critico/);

    expect(linhasSeries[2].querySelector('.almox-badge').className).toMatch(/almox-badge-concluido/);
  });

  test('bloquear serie exige justificativa (nao chama a API sem motivo)', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return Promise.resolve({ data: [] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/series`) return Promise.resolve({ data: [SERIE_EM_ESTOQUE] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await selecionarMaterial();
    await clicarAba('Séries');

    await clicarAcao(0, 'Bloquear');
    const confirmar = [...container.querySelectorAll('.almox-modal-footer button')]
      .find((b) => b.textContent.trim() === 'Confirmar');
    expect(confirmar.disabled).toBe(true);

    await clicarBotaoModal('Confirmar');
    expect(api.put).not.toHaveBeenCalled();
  });

  test('bloquear com justificativa chama PUT /almoxarifado/series/:id/status', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return Promise.resolve({ data: [] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/series`) return Promise.resolve({ data: [SERIE_EM_ESTOQUE] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await selecionarMaterial();
    await clicarAba('Séries');

    await clicarAcao(0, 'Bloquear');
    preencher(campoPorLabel('Justificativa'), 'Serie avariada na conferencia');
    await clicarBotaoModal('Confirmar');

    expect(api.put).toHaveBeenCalledWith('/almoxarifado/series/501/status', {
      status: 'BLOQUEADA', justificativa: 'Serie avariada na conferencia',
    });
  });

  test('desbloquear serie oferece a acao inversa e chama a API com EM_ESTOQUE', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return Promise.resolve({ data: [] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/series`) return Promise.resolve({ data: [SERIE_BLOQUEADA] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await selecionarMaterial();
    await clicarAba('Séries');

    await clicarAcao(0, 'Desbloquear');
    preencher(campoPorLabel('Justificativa'), 'Inspecao concluida, liberado');
    await clicarBotaoModal('Confirmar');

    expect(api.put).toHaveBeenCalledWith('/almoxarifado/series/502/status', {
      status: 'EM_ESTOQUE', justificativa: 'Inspecao concluida, liberado',
    });
  });
});

describe('LotesAlmoxarifado — aba Series: resposta atrasada da aba anterior nao vaza para a atual', () => {
  test('resposta atrasada da aba anterior nao vaza para a aba atual (corrida)', async () => {
    let resolveSeries1;
    let resolveSeries2;
    const promiseSeries1 = new Promise((resolve) => { resolveSeries1 = resolve; });
    const promiseSeries2 = new Promise((resolve) => { resolveSeries2 = resolve; });
    let chamadasSeries = 0;

    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return Promise.resolve({ data: [] });
      if (url === `/almoxarifado/materiais/${MATERIAL.id}/series`) {
        chamadasSeries += 1;
        return chamadasSeries === 1 ? promiseSeries1 : promiseSeries2;
      }
      return Promise.resolve({ data: [] });
    });

    await renderizar();
    await selecionarMaterial();
    // Entra na aba Series (1a chamada do GET de series, fica pendente).
    await clicarAba('Séries');
    // Sai para a aba Lotes ANTES da resposta chegar — o efeito de Series é limpo (cancelado).
    await clicarAba('Lotes');
    // Volta para Series — dispara a 2a chamada.
    await clicarAba('Séries');

    // Resolve a 2a (atual) primeiro, e só depois a 1a (atrasada) — se a tela não tivesse
    // descartado a resposta velha, ela chegaria por último e pisaria na lista certa.
    await act(async () => { resolveSeries2({ data: [SERIE_BLOQUEADA] }); await Promise.resolve(); });
    await act(async () => { resolveSeries1({ data: [SERIE_EM_ESTOQUE] }); await Promise.resolve(); });

    const linhasSeries = linhas();
    expect(linhasSeries).toHaveLength(1);
    expect(linhasSeries[0].textContent).toMatch(/SN-002/);
  });
});
