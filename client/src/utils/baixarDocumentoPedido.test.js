/**
 * Etapa 78 (RN-78.06) — o download do documento impresso do pedido de compra.
 *
 * O util e UM para as duas telas (lista `Compras.js` e formulario `PedidoCompraForm.js`): sem ele
 * cada tela montaria o nome, o link e o parse do erro por conta propria — e e exatamente assim
 * que o nome do PDF da proposta divergiu em cinco lugares (`nomeArquivoPdf.js`, cabecalho).
 *
 * Tres coisas que so este arquivo mede, e por que:
 *  - o NOME vem do cabecalho `Content-Disposition` quando ele chega, e do FALLBACK
 *    `pedido-compra-<numero>.pdf` quando nao chega. O fallback nao e luxo: sem o `exposedHeaders`
 *    do CORS (dev por IP) o axios NAO ENXERGA o header e o arquivo baixaria sem nome;
 *  - o ERRO chega como `Blob` (a chamada e `responseType: 'blob'`, entao o axios embrulha ate o
 *    JSON do 404). `e.response.data.error` e `undefined` nesse caminho — o util le o texto do
 *    blob e tira o `.error` de dentro para o toast dizer "Pedido de compra não encontrado";
 *  - o jsdom 16.7 (o do react-scripts 5) NAO implementa `Blob.prototype.text()` (medido: o
 *    `Blob-impl.js` nao tem o metodo); o navegador implementa. O util le por `.text()` quando
 *    existe e por `FileReader` quando nao — os dois caminhos estao cobertos abaixo.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false src/utils/baixarDocumentoPedido
 */
import { baixarDocumentoPedido, mensagemDoErroEmBlob } from './baixarDocumentoPedido';

const LITERAL_404 = 'Pedido de compra não encontrado';
const LITERAL_GENERICA = 'Não foi possível gerar o documento do pedido.';

let cliques;
beforeEach(() => {
  // jsdom nao implementa URL.createObjectURL/revokeObjectURL (medido: undefined).
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = jest.fn();
  // O `<a download>` e capturado no `click()`: um spy em `document.createElement` quebraria o
  // proprio React. `this.download` e a propriedade que o navegador usa como nome do arquivo.
  cliques = [];
  jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function registrar() {
    cliques.push({ download: this.download, href: this.getAttribute('href') });
  });
});
afterEach(() => { jest.restoreAllMocks(); });

const apiQueDevolve = (headers) => ({
  get: jest.fn(() => Promise.resolve({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), headers })),
});

test('(a) GET com responseType blob e o nome do cabecalho Content-Disposition', async () => {
  const api = apiQueDevolve({ 'content-disposition': 'attachment; filename="pedido-compra-PC-2026-418.pdf"' });

  const resultado = await baixarDocumentoPedido(api, { id: 418, numero: 'PC-2026-418' });

  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/compras/pedidos/418/documento.pdf', { responseType: 'blob' });
  expect(resultado).toEqual({ nome: 'pedido-compra-PC-2026-418.pdf' });
  expect(cliques).toEqual([{ download: 'pedido-compra-PC-2026-418.pdf', href: 'blob:mock-url' }]);
  // Revogar a URL no mesmo tique do click() aborta o download em alguns navegadores: o revoke e
  // ADIADO (setTimeout 0) — nao pode ter acontecido ainda, e acontece no proximo tique.
  expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
});

test('(b) sem o cabecalho (CORS sem exposedHeaders) o nome e o fallback com o numero da tela', async () => {
  const api = apiQueDevolve({});

  const resultado = await baixarDocumentoPedido(api, { id: 418, numero: 'PC-2026-418' });

  expect(resultado.nome).toBe('pedido-compra-PC-2026-418.pdf');
  expect(cliques[0].download).toBe('pedido-compra-PC-2026-418.pdf');
});

test('(b2) o cabecalho, quando vem, VENCE o numero da tela — e o servidor quem nomeia', async () => {
  const api = apiQueDevolve({ 'content-disposition': 'attachment; filename="pedido-compra-PC-2026-999.pdf"' });

  const resultado = await baixarDocumentoPedido(api, { id: 418, numero: 'PC-2026-418' });

  expect(resultado.nome).toBe('pedido-compra-PC-2026-999.pdf');
});

test('(b3) sem cabecalho E sem numero o fallback usa o id; barra e dois-pontos no numero viram hifen', async () => {
  expect((await baixarDocumentoPedido(apiQueDevolve(undefined), { id: 7 })).nome).toBe('pedido-compra-7.pdf');
  expect((await baixarDocumentoPedido(apiQueDevolve(undefined), { id: 7, numero: 'PC/2026:7' })).nome)
    .toBe('pedido-compra-PC-2026-7.pdf');
});

test('(c) o erro em blob (404 com JSON dentro) vira a literal do servidor, e a promessa REJEITA', async () => {
  const erro = new Error('Request failed with status code 404');
  erro.response = { status: 404, data: new Blob([JSON.stringify({ error: LITERAL_404 })], { type: 'application/json' }) };
  const api = { get: jest.fn(() => Promise.reject(erro)) };

  await expect(baixarDocumentoPedido(api, { id: 999, numero: 'PC-2026-999' })).rejects.toThrow(LITERAL_404);
  expect(cliques).toHaveLength(0); // nada foi "baixado"
});

test('(c2) mensagemDoErroEmBlob le por Blob.text() quando o blob tem o metodo (o caminho do navegador)', async () => {
  const text = jest.fn(() => Promise.resolve(JSON.stringify({ error: 'Geração de PDF indisponível' })));
  const erro = { response: { status: 503, data: { text } } };

  expect(await mensagemDoErroEmBlob(erro, LITERAL_GENERICA)).toBe('Geração de PDF indisponível');
  expect(text).toHaveBeenCalledTimes(1);
});

test('(d) erro sem JSON (HTML de proxy, blob vazio, sem response) vira a generica', async () => {
  const comHtml = { response: { status: 502, data: new Blob(['<html>Bad Gateway</html>']) } };
  const vazio = { response: { status: 500, data: new Blob([]) } };
  const semResposta = new Error('Network Error');
  const jsonSemError = { response: { status: 500, data: new Blob([JSON.stringify({ message: 'x' })]) } };

  expect(await mensagemDoErroEmBlob(comHtml, LITERAL_GENERICA)).toBe(LITERAL_GENERICA);
  expect(await mensagemDoErroEmBlob(vazio, LITERAL_GENERICA)).toBe(LITERAL_GENERICA);
  expect(await mensagemDoErroEmBlob(semResposta, LITERAL_GENERICA)).toBe(LITERAL_GENERICA);
  expect(await mensagemDoErroEmBlob(jsonSemError, LITERAL_GENERICA)).toBe(LITERAL_GENERICA);
});

test('(d2) erro cujo data JA e objeto JSON (chamada sem blob) tambem e lido', async () => {
  const erro = { response: { status: 403, data: { error: 'Sem permissão para o módulo' } } };
  expect(await mensagemDoErroEmBlob(erro, LITERAL_GENERICA)).toBe('Sem permissão para o módulo');
});
