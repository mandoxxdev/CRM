/**
 * Etapa 81 (RN-81.05) — arquivo que so sai por rota AUTENTICADA (PDF da OS e contrato anexo).
 *
 * Ate a Etapa 81 esses arquivos eram servidos por `express.static` sem login
 * (`/uploads/ordens-servico`, `/api/uploads/contrato`) e a tela abria por `<a href>`/`window.open`
 * cru — inclusive com `:5000` fixo na OS. A autenticacao deste app e Bearer no header (interceptor
 * de `services/api.js`), que uma navegacao crua nao envia; por isso baixamos por `api.get(...,
 * { responseType: 'blob' })` e entregamos o arquivo por `URL.createObjectURL` (o mesmo caminho de
 * `baixarDocumentoPedido.js`, Etapa 78). Nada de `?token=` na URL (vazaria em historico/logs).
 *
 * Erro: o parse do JSON de dentro do Blob e o de `mensagemDoErroEmBlob` (Etapa 78), com a mensagem
 * padrao propria de cada chamador — a padrao daquela util e a do pedido de compra.
 */
import { mensagemDoErroEmBlob } from './baixarDocumentoPedido';
import { nomeArquivoDoCabecalho } from './nomeArquivoPdf';

export const LITERAL_ERRO_PDF_OS = 'Não foi possível abrir o PDF da OS.';
export const LITERAL_ERRO_CONTRATO = 'Não foi possível baixar o contrato.';

/** Quanto tempo a URL `blob:` de uma aba aberta continua valida (a aba ja carregou bem antes). */
const REVOGAR_ABA_MS = 60000;

async function buscarBlob(api, url, mensagemPadrao) {
  try {
    return await api.get(url, { responseType: 'blob' });
  } catch (e) {
    throw new Error(await mensagemDoErroEmBlob(e, mensagemPadrao));
  }
}

/**
 * Baixa `url` e oferece como arquivo (`<a download>`). O nome vem do `Content-Disposition` do
 * servidor; sem ele (CORS sem `exposedHeaders` em dev por IP), `nomeFallback`. Resolve `{ nome }`
 * e REJEITA com `Error` cuja `message` ja e a frase para o usuario.
 */
export async function baixarArquivoProtegido(api, url, { nomeFallback, mensagemPadrao } = {}) {
  const resposta = await buscarBlob(api, url, mensagemPadrao);
  const nome = nomeArquivoDoCabecalho(resposta && resposta.headers) || nomeFallback || 'arquivo';
  const dado = resposta.data instanceof Blob ? resposta.data : new Blob([resposta.data]);
  const blobUrl = URL.createObjectURL(dado);
  try {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Adiado: revogar no mesmo tique do click() aborta o download em alguns navegadores.
    setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
  }
  return { nome };
}

/**
 * O contrato anexo do template de proposta (`contrato_anexo_url` guarda so o nome do arquivo).
 * Usado por `ConfigTemplateProposta.js` e `PreviewPropostaEditavel.js` — uma URL so, para as
 * duas telas nao divergirem. O servidor tambem faz `basename`; aqui e para nao mandar barra.
 */
export function baixarContratoAnexo(api, arquivo) {
  const nome = String(arquivo == null ? '' : arquivo).split(/[\\/]/).pop();
  return baixarArquivoProtegido(api, `/proposta-template/contrato-anexo/${encodeURIComponent(nome)}`, {
    nomeFallback: nome,
    mensagemPadrao: LITERAL_ERRO_CONTRATO,
  });
}

/**
 * Baixa o PDF de `url` e o mostra na aba `janela`, que o CHAMADOR abriu com
 * `window.open('', '_blank')` no proprio clique, ANTES de qualquer `await`: aberta so depois da
 * espera (a geracao do PDF da OS leva de 2 s a dezenas de segundos), a aba cai fora da janela de
 * ativacao do navegador e o bloqueador de pop-up a engole. REJEITA com `Error` ja com a frase; quem
 * chama fecha a `janela` no erro.
 */
export async function abrirPdfProtegidoNaJanela(api, url, janela, { mensagemPadrao } = {}) {
  const resposta = await buscarBlob(api, url, mensagemPadrao);
  const blobUrl = URL.createObjectURL(new Blob([resposta.data], { type: 'application/pdf' }));
  janela.location.href = blobUrl;
  setTimeout(() => URL.revokeObjectURL(blobUrl), REVOGAR_ABA_MS);
}
