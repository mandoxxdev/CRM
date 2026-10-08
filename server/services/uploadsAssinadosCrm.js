/**
 * Etapa 82 (RN-82.02/04/05) — URL assinada para as fotos da proposta e os avatares.
 *
 * Ate a 81 `/api/uploads/proposta-fotos` e `/api/uploads/avatares` eram `express.static` publicos:
 * deslogado, com o nome na mao, qualquer um baixava a foto de equipamento de uma proposta ou o
 * rosto de um funcionario. Agora as duas pastas so servem com `?exp=&sig=` (assinador da T1,
 * `services/almoxarifado/urlUpload.js`), com DOMINIO proprio por pasta — a assinatura de uma nao
 * vale na outra, nem no chat, nem no almoxarifado.
 *
 * Validade pela vida da tela que mostra a imagem (decisao B37):
 *  - fotos da proposta: 12 h (sessao longa de edicao do preview e o "Imprimir"), balde de 1 h;
 *  - avatares: 24 h (a vida do JWT; o usuario fica no localStorage e e renovado no /auth/me).
 *
 * O banco NAO muda: `proposta_fotos.arquivo` e `usuarios.foto_url` continuam guardando o nome; a
 * assinatura e feita na SAIDA, aqui. Modulo puro (segredo injetado) para ser testado de verdade —
 * o index.js nao esta no harness.
 */
const path = require('path');
const { criarAssinadorUpload } = require('./almoxarifado/urlUpload');

const PASTAS = Object.freeze({
  fotoProposta: Object.freeze({
    prefixo: '/api/uploads/proposta-fotos', dominio: 'proposta-fotos-v1', minutos: 720, baldeMinutos: 60,
  }),
  avatares: Object.freeze({
    prefixo: '/api/uploads/avatares', dominio: 'avatares-v1', minutos: 1440, baldeMinutos: 60,
  }),
});

// So o nome: o valor gravado e o nome do arquivo, mas um valor legado com caminho (ou com `..`)
// nao pode virar assinatura de outra coisa — o middleware recusa `/` de qualquer jeito.
function nomeDoArquivo(valor) {
  const v = String(valor == null ? '' : valor).trim();
  if (!v) return '';
  return path.basename(v.replace(/\\/g, '/'));
}

function criarAssinadoresCrm(segredoRaiz) {
  const fotoProposta = criarAssinadorUpload(segredoRaiz, PASTAS.fotoProposta);
  const avatares = criarAssinadorUpload(segredoRaiz, PASTAS.avatares);

  /** URL RELATIVA assinada (`/api/uploads/proposta-fotos/<nome>?exp=&sig=`), ou null sem nome. */
  function assinarFotoProposta(arquivo) {
    const nome = nomeDoArquivo(arquivo);
    return nome ? fotoProposta.assinar(nome) : null;
  }

  /** Linha de `proposta_fotos` (ou a resposta montada) + `url` assinada. */
  function comUrlFotoProposta(foto) {
    if (!foto) return foto;
    return { ...foto, url: assinarFotoProposta(foto.arquivo) };
  }

  /**
   * `foto_src` do avatar: SEMPRE uma chave (null sem foto). Se faltasse, o `mergeUserPermissions`
   * do client manteria o `foto_src` velho do localStorage depois de remover a foto.
   */
  function fotoSrcAvatar(fotoUrl) {
    const nome = nomeDoArquivo(fotoUrl);
    return nome ? avatares.assinar(nome) : null;
  }

  return { fotoProposta, avatares, assinarFotoProposta, comUrlFotoProposta, fotoSrcAvatar };
}

module.exports = { criarAssinadoresCrm, PASTAS };
