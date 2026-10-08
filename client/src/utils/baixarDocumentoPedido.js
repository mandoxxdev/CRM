/**
 * Etapa 78 (RN-78.06) — baixa o documento impresso do pedido de compra
 * (`GET /compras/pedidos/:id/documento.pdf`).
 *
 * UM util para as duas telas (a lista `Compras.js` e o formulário `compras/PedidoCompraForm.js`),
 * porque o nome do PDF da proposta divergiu quando cada tela montava o seu (`nomeArquivoPdf.js`).
 *
 * Por que blob + `<a download>` e não `window.open`/`?token=`: a autenticação deste app é por
 * Bearer no header (interceptor de `services/api.js`), que uma navegação crua não envia. O servidor
 * até aceita `?token=` como fallback, mas isso vazaria o token em URL/histórico/logs — e nenhum
 * outro download do app faz isso (`RelatoriosAlmoxarifado.js`, `PropostasList.js`). B27 do plano.
 *
 * Quem nomeia o arquivo é o SERVIDOR (`Content-Disposition`); o fallback existe porque em dev por
 * IP (cross-origin) o header só chega ao axios com `exposedHeaders` no CORS — sem ele, `headers`
 * não traz `content-disposition` e o arquivo baixaria sem nome.
 *
 * Erro: com `responseType: 'blob'` o axios embrulha ATÉ o JSON do 404 num `Blob`, então
 * `e.response.data.error` é `undefined`. Lemos o texto do blob e tiramos o `.error` de dentro.
 * `Blob.prototype.text()` existe no navegador mas NÃO no jsdom 16.7 do react-scripts 5 (medido),
 * por isso o `FileReader` como segundo caminho.
 */
import { nomeArquivoDoCabecalho } from './nomeArquivoPdf';

export const LITERAL_ERRO_DOCUMENTO = 'Não foi possível gerar o documento do pedido.';

/** `pedido-compra-<numero>.pdf`, com o número saneado para nome de arquivo; sem número, o id. */
export function nomeArquivoDocumentoPedido(numero, id) {
  const limpar = (v) => String(v == null ? '' : v).replace(/[\\/:*?"<>|\r\n]+/g, '-').trim();
  const base = limpar(numero) || limpar(id) || 'sem-numero';
  return `pedido-compra-${base}.pdf`;
}

async function textoDoDado(dado) {
  if (dado == null) return '';
  if (typeof dado === 'string') return dado;
  if (typeof dado.text === 'function') return dado.text();
  if (typeof FileReader !== 'undefined' && typeof Blob !== 'undefined' && dado instanceof Blob) {
    return new Promise((resolve) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result || ''));
      leitor.onerror = () => resolve('');
      leitor.readAsText(dado);
    });
  }
  // Objeto já desserializado (chamada sem blob): o JSON.parse abaixo não se aplica.
  return dado;
}

/**
 * A mensagem do servidor (`{ error }`) de dentro de um erro do axios, mesmo quando o corpo veio
 * como Blob. Qualquer coisa que não seja JSON com `.error` (HTML de proxy, blob vazio, erro de
 * rede) vira a `generica`.
 */
export async function mensagemDoErroEmBlob(e, generica = LITERAL_ERRO_DOCUMENTO) {
  try {
    const dado = e && e.response ? e.response.data : null;
    if (dado == null) return generica;
    const texto = await textoDoDado(dado);
    const corpo = typeof texto === 'string' ? JSON.parse(texto) : texto;
    return corpo && typeof corpo.error === 'string' && corpo.error ? corpo.error : generica;
  } catch (_) {
    return generica;
  }
}

/**
 * Baixa o PDF do pedido `id`. Resolve `{ nome }` (o nome com que o arquivo foi oferecido) e
 * REJEITA com um `Error` cuja `message` já é a frase para o toast.
 */
export async function baixarDocumentoPedido(api, { id, numero }) {
  let resposta;
  try {
    resposta = await api.get(`/compras/pedidos/${id}/documento.pdf`, { responseType: 'blob' });
  } catch (e) {
    throw new Error(await mensagemDoErroEmBlob(e));
  }
  const nome = nomeArquivoDoCabecalho(resposta && resposta.headers)
    || nomeArquivoDocumentoPedido(numero, id);
  const url = URL.createObjectURL(new Blob([resposta.data], { type: 'application/pdf' }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return { nome };
}
