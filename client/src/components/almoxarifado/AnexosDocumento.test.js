/**
 * Anexos de documento — componente genérico (Etapa 32, Task 3).
 *
 * O que estes sete cenários existem para segurar, e por que cada um é escrito assim:
 *
 * 1. `@testing-library/react` NÃO está instalado nesta base (medido: não está no
 *    `client/package.json`, não está em `client/node_modules`, não está hoisted na raiz —
 *    `LoteSeletor.test.js:10-12` já documenta a pegadinha). O molde é `createRoot` +
 *    `act`, copiado de `PlanoInspecaoModal.test.js:23-25` e `RelatoriosAlmoxarifado.test.js`.
 * 2. O mock de `api.get` é PARAMS-AWARE (Global Constraint 8): com `mockResolvedValue` simples
 *    o cenário (1) passaria mesmo que o componente chamasse a rota SEM `params`, ou com a
 *    entidade trocada — que é exatamente o defeito que um componente genérico por props pode
 *    ter sem ninguém perceber.
 * 3. Todo cenário negativo carrega a metade positiva NO MESMO teste (Global Constraint 9):
 *    "não chamou a API" passa idêntico com o componente devolvendo `null`, e "escondeu o botão"
 *    passa idêntico com o botão nunca escrito.
 * 4. jsdom NÃO implementa `URL.createObjectURL` nem `URL.revokeObjectURL` (medido: `undefined`).
 *    Sem o stub do `beforeEach`, o handler de download lança no meio e o `catch` engole — e o
 *    cenário (5), que só olha `api.get`, passaria com o download quebrado.
 *
 * ⚠️ DIVERGÊNCIA MEDIDA CONTRA O PLANO — o `Blob` do jsdom não representa o do navegador.
 * O plano mandava montar o corpo de erro do cenário (6) com `new Blob([JSON.stringify(...)])`
 * cru. Medido aqui: **jsdom 16.7 não implementa `Blob.prototype.text` nem `.arrayBuffer`**
 * (`typeof === 'undefined'` nos dois; só `FileReader` existe). Com o Blob cru, o `catch` correto
 * do componente — o de `RelatoriosAlmoxarifado.js:325-340`, que testa
 * `typeof bruto.text === 'function'` — cairia no ramo do fallback e o cenário (6) ficaria
 * VERMELHO com a implementação CERTA, além de não distinguir mais nada da sabotagem 3.
 * A correção é o polyfill abaixo: ele repõe, via `FileReader`, a API que todo navegador tem e
 * que o axios usa de verdade. Sem ele o teste não representa o axios.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false AnexosDocumento
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import AnexosDocumento from './AnexosDocumento';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Ver o bloco ⚠️ do cabeçalho: repõe a API que o jsdom não tem e o navegador tem.
if (typeof Blob.prototype.text !== 'function') {
  // eslint-disable-next-line no-extend-native
  Blob.prototype.text = function lerTexto() {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(leitor.error);
      leitor.readAsText(this);
    });
  };
}

const ANEXO_A = {
  id: 5, entidade: 'inspecao', entidade_id: 7, tipo: 'CERTIFICADO',
  descricao: 'Certificado do fornecedor', nome_original: 'certificado.pdf',
  tamanho_bytes: 2048, mime_type: 'application/pdf',
  uploaded_by: 1, uploaded_by_nome: 'Ana Souza', created_at: '2026-09-02 10:00:00',
};
const ANEXO_B = {
  id: 6, entidade: 'inspecao', entidade_id: 7, tipo: 'RELATORIO_DIMENSIONAL',
  descricao: null, nome_original: 'dimensional.png',
  tamanho_bytes: 40960, mime_type: 'image/png',
  uploaded_by: 2, uploaded_by_nome: 'Bruno Lima', created_at: '2026-09-01 08:30:00',
};
// NÃO é da entidade sob teste: existe só para provar que o mock params-aware discrimina.
const ANEXO_DE_OUTRA_ENTIDADE = {
  ...ANEXO_A, id: 9, entidade: 'material', entidade_id: 7,
  nome_original: 'de-outra-entidade.pdf',
};

const URL_LISTA = '/almoxarifado/anexos';

let container;
let root;
let anexosDoBanco;

/**
 * PARAMS-AWARE de propósito (GC 8): filtra por `entidade` E por `entidade_id`, como a rota faz.
 * Um componente que chamasse `api.get(URL_LISTA)` sem params, ou com a entidade fixa errada,
 * receberia lista VAZIA aqui — e o cenário (1) ficaria vermelho, que é o ponto.
 */
function mockarListagem() {
  api.get.mockImplementation((url, cfg) => {
    if (url === URL_LISTA) {
      return Promise.resolve({
        data: anexosDoBanco.filter((a) => a.entidade === cfg?.params?.entidade
          && a.entidade_id === cfg?.params?.entidade_id),
      });
    }
    if (/^\/almoxarifado\/anexos\/\d+\/arquivo$/.test(url)) {
      return Promise.resolve({ data: new Blob(['%PDF-1.4 conteudo']) });
    }
    return Promise.reject(new Error(`URL inesperada no mock: ${url}`));
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  anexosDoBanco = [ANEXO_A, ANEXO_B, ANEXO_DE_OUTRA_ENTIDADE];
  mockarListagem();
  api.post.mockImplementation(() => Promise.resolve({ data: { ...ANEXO_A, id: 77 } }));
  api.delete.mockResolvedValue({ data: { ok: true } });
  // jsdom NÃO implementa nenhum dos dois (ver item 4 do cabeçalho).
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const esperarEfeitos = async () => {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

async function renderizar(props = {}) {
  await act(async () => {
    root.render(<AnexosDocumento entidade="inspecao" entidadeId={7} {...props} />);
  });
  await esperarEfeitos();
}

const texto = () => container.textContent;
const inputArquivo = () => container.querySelector('[data-testid="anexo-arquivo"]');
const selectTipo = () => container.querySelector('[data-testid="anexo-tipo"]');
const botaoEnviar = () => container.querySelector('[data-testid="anexo-enviar"]');
const linha = (id) => container.querySelector(`[data-testid="anexo-linha-${id}"]`);
const botaoBaixar = (id) => container.querySelector(`[data-testid="anexo-baixar-${id}"]`);
const botaoRemover = (id) => container.querySelector(`[data-testid="anexo-remover-${id}"]`);
const erro = () => container.querySelector('[data-testid="anexo-erro"]');

/** Molde de `LotesAlmoxarifado.test.js:146-149` — dispara `change` sem `fireEvent`. */
function selecionarArquivo(elemento, arquivo) {
  Object.defineProperty(elemento, 'files', { value: [arquivo], configurable: true });
  act(() => { elemento.dispatchEvent(new Event('change', { bubbles: true })); });
}

function escolher(elemento, valor) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

const clicar = async (el) => {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
};

describe('AnexosDocumento — listagem', () => {
  test('(1) lista o que o GET devolveu, e chama a rota com entidade e entidade_id', async () => {
    await renderizar();

    // Params-aware: a asserção da CHAMADA e a asserção do RENDER se apoiam uma na outra.
    expect(api.get).toHaveBeenCalledWith(URL_LISTA, {
      params: { entidade: 'inspecao', entidade_id: 7 },
    });
    expect(linha(5)).not.toBeNull();
    expect(linha(6)).not.toBeNull();
    expect(texto()).toContain('certificado.pdf');
    expect(texto()).toContain('dimensional.png');
    expect(texto()).toContain('Ana Souza');
    // O anexo de OUTRA entidade, com o mesmo entidade_id, não pode aparecer.
    expect(linha(9)).toBeNull();
    expect(texto()).not.toContain('de-outra-entidade.pdf');
  });

  test('(2) sem entidadeId não chama a API — e com entidadeId chama, no mesmo teste', async () => {
    // Metade negativa: `entidadeId` falsy (undefined e 0, os dois casos reais de "ainda não sei
    // o id"): nenhuma requisição pode sair.
    await renderizar({ entidadeId: undefined });
    expect(api.get).not.toHaveBeenCalled();

    await renderizar({ entidadeId: 0 });
    expect(api.get).not.toHaveBeenCalled();

    // Metade positiva NO MESMO TESTE (GC 9): sem ela, este cenário passaria idêntico com o
    // componente devolvendo `null` sempre, ou com o `useEffect` nunca escrito.
    await renderizar({ entidadeId: 7 });
    expect(api.get).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledWith(URL_LISTA, {
      params: { entidade: 'inspecao', entidade_id: 7 },
    });
  });
});

describe('AnexosDocumento — upload', () => {
  test('(3) upload manda FormData com entidade, entidade_id, tipo e arquivo', async () => {
    await renderizar();

    const arquivo = new File(['%PDF-1.4'], 'certificado.pdf', { type: 'application/pdf' });
    selecionarArquivo(inputArquivo(), arquivo);
    escolher(selectTipo(), 'CERTIFICADO');
    await clicar(botaoEnviar());

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, corpo, config] = api.post.mock.calls[0];
    expect(url).toBe(URL_LISTA);
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('entidade')).toBe('inspecao');
    expect(corpo.get('entidade_id')).toBe('7');
    expect(corpo.get('tipo')).toBe('CERTIFICADO');
    expect(corpo.get('arquivo')).toBe(arquivo);
    // `Content-Type` manual quebra o boundary do multipart: o interceptor de
    // `services/api.js:43-49` REMOVE o header de propósito quando o corpo é FormData.
    expect(config?.headers?.['Content-Type']).toBeUndefined();
    // Sem cache de módulo: o anexo recém-enviado tem de aparecer sem reload.
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  test('(4) erro do post aparece na tela com a mensagem literal do servidor', async () => {
    api.post.mockRejectedValue({
      response: { data: { error: 'Anexo deve ser PDF ou imagem' } },
    });
    await renderizar();

    const arquivo = new File(['x'], 'planilha.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    selecionarArquivo(inputArquivo(), arquivo);
    await clicar(botaoEnviar());

    expect(erro()).not.toBeNull();
    expect(texto()).toContain('Anexo deve ser PDF ou imagem');
  });
});

describe('AnexosDocumento — download autenticado', () => {
  test('(5) baixa por blob pela rota autenticada, e revoga a URL depois', async () => {
    await renderizar();

    await clicar(botaoBaixar(5));

    // A régua que impede alguém de "simplificar" para `<a href>`: aquilo sai sem o
    // `Authorization` do interceptor e toma 401.
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos/5/arquivo', { responseType: 'blob' });
    expect(window.URL.createObjectURL).toHaveBeenCalledTimes(1);
    // Sem revogar, cada download vaza o blob até o reload.
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  test('(6) erro do download vem do corpo do Blob, não de response.data.error', async () => {
    api.get.mockImplementation((url, cfg) => {
      if (url === URL_LISTA) return Promise.resolve({ data: [ANEXO_A] });
      // É ASSIM que o axios entrega o erro com `responseType: 'blob'`: o CORPO também vem
      // como Blob, então `e.response.data.error` é SEMPRE `undefined`. Ver o cabeçalho.
      return Promise.reject({
        response: {
          data: new Blob([JSON.stringify({ error: 'Arquivo do anexo não encontrado' })]),
        },
      });
    });
    await renderizar();

    await clicar(botaoBaixar(5));
    await esperarEfeitos();

    expect(erro()).not.toBeNull();
    // O 404 próprio da rota existe para o usuário distinguir "sumiu do disco" de "sem
    // permissão". Com o `catch` ingênuo, os dois viram a mesma frase genérica.
    expect(texto()).toContain('Arquivo do anexo não encontrado');
    expect(texto()).not.toContain('Erro ao baixar o anexo');
  });
});

describe('AnexosDocumento — somenteLeitura', () => {
  test('(7) somenteLeitura esconde upload e remoção — e a metade positiva no mesmo teste', async () => {
    // Metade positiva primeiro: se estes quatro não existissem, o negativo abaixo passaria
    // sozinho com um componente que nunca desenhou botão nenhum (GC 9).
    await renderizar({ somenteLeitura: false });
    expect(inputArquivo()).not.toBeNull();
    expect(selectTipo()).not.toBeNull();
    expect(botaoEnviar()).not.toBeNull();
    expect(botaoRemover(5)).not.toBeNull();
    // E o download continua disponível nos dois modos.
    expect(botaoBaixar(5)).not.toBeNull();

    await renderizar({ somenteLeitura: true });
    expect(inputArquivo()).toBeNull();
    expect(selectTipo()).toBeNull();
    expect(botaoEnviar()).toBeNull();
    expect(botaoRemover(5)).toBeNull();
    expect(botaoBaixar(5)).not.toBeNull();
  });
});
